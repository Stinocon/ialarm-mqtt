
import { MeianSocket, MeianDataHandler, MeianLogger, MeianConnection, MeianStatusDecoder } from 'ialarm'
import { MqttPublisher } from './utils/mqtt-publisher.js'
import { configHandler } from './utils/config-handler.js'
import { Diagnostics } from './utils/diagnostics.js'

export const ialarmMqtt = (config) => {
  const logger = MeianLogger(config.debug ? 'debug' : 'info')

  if (!config) {
    console.error('Please provide a valid config.json')
    process.exit(1)
  }

  let errorCount = 0
  let discovered = false

  const publisher = new MqttPublisher(config)

  // health counters of the bridge itself (panel link, polling, errors)
  const diagnostics = new Diagnostics(config)
  // evaluated once: isFeatureEnabled logs a warning on every miss
  const diagnosticsEnabled = configHandler.isFeatureEnabled(config, 'diagnostics')
  // events can burst (an error storm retries 10 times): don't publish more
  // often than this, the timer keeps the payload fresh anyway
  const DIAGNOSTICS_MIN_INTERVAL_MS = 5000
  let lastDiagnosticsAt = 0

  /**
   * Publish the health payload, throttled.
   */
  function publishDiagnostics () {
    if (!diagnosticsEnabled) {
      return
    }
    const now = Date.now()
    if (now - lastDiagnosticsAt < DIAGNOSTICS_MIN_INTERVAL_MS) {
      return
    }
    lastDiagnosticsAt = now
    publisher.publishDiagnostics(diagnostics.payload())
  }

  // if we configured 17 zone, there is no need to call GetZone or GetByWay for all 40/128 default zones
  const maxZone = Math.max(...config.server.zones)
  const commandsLimits = {
    GetZone: maxZone,
    GetByWay: maxZone,
    GetLog: 10 // this is huge (512) and actually not used
  }

  // single connection for all messages
  const socket = new MeianSocket(
    config.server.host,
    config.server.port,
    config.server.username,
    config.server.password,
    config.verbose ? 'debug' : 'info',
    commandsLimits
  )

  function connectToAlarm () {
    logger.info('Starting TCP connection...')
    // connect
    socket.connect()
  }

  // Reconnection. It used to hang off `errorCount > 10`, which the panel being
  // unreachable at start-up can never reach: the first ECONNREFUSED is followed
  // by a disconnect that resets the counter, nothing else ever produces an
  // error, and the bridge sat there until someone restarted the add-on.
  const RECONNECT_MIN_MS = 5000
  const RECONNECT_MAX_MS = 60000
  let reconnectDelay = RECONNECT_MIN_MS
  let reconnectTimer

  /**
   * Ask for a reconnection attempt, unless one is already pending. Backs off up
   * to RECONNECT_MAX_MS so an unreachable panel is retried forever without
   * hammering it.
   * @param {*} reason for the log
   */
  function scheduleReconnect (reason) {
    if (reconnectTimer) {
      return
    }
    const delay = reconnectDelay
    logger.info(`Reconnecting to the panel in ${delay}ms (${reason})`)
    diagnostics.onReconnectScheduled(delay)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined

      // the connection recovered on its own in the meantime
      if (MeianConnection.status.isReady() || MeianConnection.status.isPending()) {
        logger.info('Panel connection is healthy, no reconnection needed')
        cancelReconnect()
        return
      }
      // still connecting or authenticating: check again later rather than
      // giving up, which is how the old code got stuck
      if (!MeianConnection.status.isDisconnected()) {
        scheduleReconnect(`connection is ${MeianConnection.status.text()}`)
        return
      }

      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS)
      connectToAlarm()
    }, delay)
  }

  function cancelReconnect () {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = undefined
    }
    reconnectDelay = RECONNECT_MIN_MS
  }

  function executeCommand (commands, args) {
    try {
      const delay = MeianConnection.status.isReady() ? 0 : 200
      // idle or autenticating
      const requestTime = new Date().getTime()
      const commandInterval = setInterval(async () => {
        const executionTime = new Date().getTime()
        // async command
        if (MeianConnection.status.isReady() || (executionTime - requestTime) > 10000) {
          clearInterval(commandInterval)
          await socket.executeCommand(commands, args)
        } else {
          logger.info(`A request is in progress...we will wait for response before sending ${JSON.stringify(commands)} (${JSON.stringify(args)})`)
        }
      },
      delay)
    } catch (error) {
      handleError(error)
    }
  }

  /**
   * ready to send commands
   */
  socket.onConnected(async (connectionResponse) => {
    logger.info(`logged in (${connectionResponse})`)

    logger.info('Setting up first TCP command to retrieve mac address...')
    // send commands
    executeCommand('GetNet')
    logger.info(`First connection OK: alarm panel responded ${JSON.stringify(config.deviceInfo)}`)
    logger.info('Retrieving zone info ...')
    if (configHandler.isFeatureEnabled(config, 'zoneNames')) {
      executeCommand('GetZone')
    }

    // availability
    publisher.publishAvailable(true)

    // we are in: stop retrying and reset the backoff
    cancelReconnect()

    diagnostics.onPanelConnected()
    publishDiagnostics()

    // we are ready to start tcp polling
    startPolling()
  })

  // command
  socket.onResponse(async (commandResponse) => {
    try {
      // formatted payload
      const payload = commandResponse.payloads?.data
      // mac address, ip, etc
      if (payload.GetNet) {
        parseNet(payload.GetNet)
      }

      // parse zone names and put them into cache
      if (payload.GetZone) {
        parseZones(payload.GetZone)
      }

      /* try {
        if (commandResponse.payloads?.rawData && commandResponse.payloads?.rawData?.SetArea) {
          logger.info(`******** DEBUG ******* SetArea RAW: ${JSON.stringify(commandResponse.payloads?.rawData?.SetArea)}`)
        }
        if (payload.SetArea) {
          logger.info(`******** DEBUG ******* SetArea formatted: ${JSON.stringify(payload.SetArea)}`)
        }
      } catch (error) {
        logger.info(`******** DEBUG ******* SetArea payload: ${JSON.stringify(commandResponse)}`)
      } */

      // status and sensors
      if ((payload.GetAlarmStatus || payload.GetArea) && payload.GetByWay) {
        parseStatusAndSensors(payload.GetAlarmStatus || payload.GetArea, payload.GetByWay, payload.GetZone || zonesCache.zones)
      }

      if (payload.SetByWay || payload.SetAlarmStatus || payload.SetArea) {
        if (payload.SetByWay) {
          // gets the latest state sensor from mqtt cache and updates only the submitted properties
          const zoneNumber = payload.SetByWay.zone + 1
          publisher.updateStateSensor(zoneNumber, { bypass: payload.SetByWay.bypass })
        }
        if (payload.SetAlarmStatus) {
          publisher.publishStateIAlarm({
            status_1: payload.SetAlarmStatus
          })
        }
        // TODO UNTESTED!!! SetArea
        if (payload.SetArea && payload.SetArea.status) {
          // { "area": 2, "status": "ARMED_HOME" }
          const areaStatus = {}
          const areaNum = (payload.SetArea.area || 1) + 1
          areaStatus[`status_${areaNum}`] = payload.SetArea.status
          publisher.publishStateIAlarm(areaStatus)
        }

        logger.debug(`Received response: ${JSON.stringify(commandResponse)}`)
        if (!isPolling()) {
          startPolling()
        }
      }

      Object.keys(commandResponse).forEach(command => {
        if (commandResponse[command] && (commandResponse[command].error || commandResponse[command].timeout)) {
          logger.log('error', `${command} responded with an error "${commandResponse[command].error}" or timed out ${commandResponse[command].timeout}`)
        }
      })

      // once received GetNet and GetZones we are ready to start discovery
      if (zonesCache.zones && !discovered) {
        // home assistant discovery (if enabled). No reset unless asked for:
        // clearing the configs deletes and recreates every entity, which shows
        // up as an "unknown" gap in their history at every restart.
        discovery(config.hadiscovery.enabled, config.hadiscovery.resetOnStart)
      }
    } catch (error) {
      handleError(error)
    }
  })

  function isResponseValid (response) {
    return response && !response.error
  }

  /**
   * Mac address, ip, etc
   * @param {*} GetNet
   */
  function parseNet (GetNet) {
    if (!isResponseValid(GetNet)) {
      return
    }
    config.deviceInfo = GetNet
  }

  /**
   * Zone Names
   * @param {*} GetZone
   */
  function parseZones (GetZone) {
    if (!isResponseValid(GetZone)) {
      return
    }

    let zoneNames = []
    // zone names disabled, building them
    if (!configHandler.isFeatureEnabled(config, 'zoneNames')) {
      // config check
      if (!Array.isArray(config.server.zones)) {
        throw new Error('config.server.zones must be an array')
      }

      for (let index = 0; index < config.server.zones.length; index++) {
        const zoneNumber = config.server.zones[index]
        zoneNames.push(
          {
            typeId: 2, // using Perimetrale as default
            type: 'Perimetrale',
            voiceId: 1,
            voiceName: 'Fisso',
            id: zoneNumber,
            zone: zoneNumber,
            name: 'Device'
          }
        )
      }
    } else if (GetZone) {
      zoneNames = MeianDataHandler.getZoneInfo(GetZone)
    }

    if (zoneNames && zoneNames.length > 0) {
      logger.info(`got ${Object.keys(zoneNames).length} ' zones info'`)
      // remove empty or disabled zones
      zonesCache.zones = removeDisabledZones(zoneNames, config.server.showUnnamedZones)
      zonesCache.caching = false
      diagnostics.setZonesLoaded(zonesCache.zones.length)
    }
  }

  /**
   * Alarm status and sensors data
   * @param {*} GetAlarmStatus
   * @param {*} GetByWay
   * @param {*} GetZone
   */
  function parseStatusAndSensors (GetAlarmStatus, GetByWay, GetZone) {
    // create stubs
    GetByWay = isResponseValid(GetByWay) ? GetByWay : { zones: [] }
    GetZone = isResponseValid(GetZone) ? GetZone : { zones: [] }

    // full response
    const zonesResponse = MeianDataHandler.getZoneStatus(
      GetAlarmStatus, // alarm status
      GetByWay, // sensor states
      GetZone, // zone names (cache or previous fetch)
      config.server.zones // configured zones
    )

    // mqtt
    publishFullState(zonesResponse.status, zonesResponse.zones || [])

    // alarm is responding
    if (zonesResponse.status && zonesResponse.zones) {
      publisher.publishConnectionStatus(!MeianConnection.status.isDisconnected(), 'OK')
      diagnostics.onPollSuccess()
    }
  }

  // push events
  socket.onPush(async (pushResponse) => {
    logger.debug(`Received push: ${JSON.stringify(pushResponse)}`)

    if (!configHandler.isFeatureEnabled(config, 'events')) {
      logger.debug('Events disabled in config file')
      return
    }

    try {
      const data = pushResponse.data
      if (data || !data.zone) {
        const zoneCache = getZoneCache(data.zone)
        if (zoneCache) {
          data.name = zoneCache.name || data.zoneName
          data.type = zoneCache.type
        }

        let description = data.zone
        if (data.name) {
          description = description + ' ' + data.name
        }
        description = data.content + ' (zone ' + description + ')'

        // publish only if changed or empty
        publisher.publishEvent({
          ...data,
          description,
          lastUpdated: new Date().toISOString()
        })
      } else {
        logger.warning(`Received an empty push event: ${JSON.stringify(data)}`)
      }
    } catch (error) {
      handleError(error)
    }
  })

  socket.onDisconnected(async (disconnectionResponse) => {
    logger.info(`disconnected (type: ${disconnectionResponse}, errorCount: ${errorCount})`)
    // availability
    publisher.publishAvailable(false)
    errorCount = 0

    diagnostics.onPanelDisconnected()
    // schedule first: the payload carries when the next attempt is due
    scheduleReconnect(`disconnected (${disconnectionResponse})`)
    publishDiagnostics()
  })

  socket.onError(async (error) => {
    errorCount++
    // clean errors
    publisher.publishConnectionStatus(!MeianConnection.status.isDisconnected(), error.message || 'Generic error')

    logger.info(`Error ${error.message} - ${JSON.stringify(error.stack)}`)

    diagnostics.onError(error)

    // stop
    stopPolling()

    // a connection that keeps failing while believing it is up: drop it so the
    // reconnection below starts from a clean state
    if (errorCount > 10) {
      errorCount = 0
      socket.disconnect('error')
    }

    // schedule first: the payload carries when the next attempt is due
    scheduleReconnect(`error: ${(error && error.message) || 'unknown'}`)
    publishDiagnostics()
  })

  let zonesCache = {}
  // status polling: suspended while a command is in flight
  const pollings = []
  // availability, diagnostics and the polling watchdog: never suspended
  const serviceTimers = []
  // how long the status polling may stay stopped with the panel connected
  const POLLING_WATCHDOG_MS = 30000
  // evaluated once: isFeatureEnabled logs a warning on every miss
  const statusPollingEnabled = configHandler.isFeatureEnabled(config, ['armDisarm', 'sensors', 'bypass'])

  function handleError (e) {
    let msg
    if (typeof e === 'string') {
      msg = e
    } else if (e.message) {
      msg = e.message
    }
    const stack = e.stack ? JSON.stringify(e.stack) : ''
    publisher.publishConnectionStatus(!MeianConnection.status.isDisconnected(), msg, stack)

    diagnostics.onError(msg)
    publishDiagnostics()
  }

  function getZoneCache (id) {
    if (zonesCache &&
            zonesCache.zones &&
            zonesCache.zones[id]) {
      return zonesCache.zones.find(z => z.id === id)
    }
    return undefined
  };

  /**
   * removes empty or disabled zones
   * @param {*} zones
   * @returns
   */
  function removeDisabledZones (zones, showUnnamedZones) {
    return zones.filter(z => {
      if (!z.typeId || z.typeId <= 0) {
        logger.debug(`removeDisabledZones: filtering out zone ${z.id} with typeId disabled`, z)
        return false
      }
      if (!showUnnamedZones && !z.name) {
        logger.debug(`removeDisabledZones: filtering out zone ${z.id} with empty name`, z)
        return false
      }
      return true
    })
  }

  /**
   * Read and publis state
   */
  async function fetchStatus () {
    try {
      if (!configHandler.isFeatureEnabled(config, ['armDisarm', 'sensors'])) {
        return
      }

      const commands = []
      if (configHandler.isFeatureEnabled(config, 'sensors')) {
        // sensor status with names, type, etc
        commands.push('GetByWay')
      }
      // if needed fetch zones
      if ((!zonesCache.zones || zonesCache.zones.length === 0) &&
        configHandler.isFeatureEnabled(config, 'zoneNames')) {
        commands.push('GetZone')
      }

      // if needed fetch alarm/area status
      if (configHandler.isFeatureEnabled(config, 'armDisarm')) {
        const command = config.server.areas > 1 ? 'GetArea' : 'GetAlarmStatus'
        commands.push(command)
      }

      // 1, 2 or 3 commands
      diagnostics.onPollAttempt()
      executeCommand(commands)
    } catch (error) {
      handleError(error)
    }
  }

  /**
     * publish received state and fetch new events
     * @param {*} param0
     */
  function publishFullState (status, zones) {
    // alarm
    publisher.publishStateIAlarm(status)

    // zone config override
    if (zones && config.zones) {
      config.zones.forEach(zoneConfig => {
        const zoneId = zoneConfig.number
        const zoneNumber = parseInt(zoneId)
        const zone = zones.find(z => z.id === zoneNumber)
        if (zone) {
          // normally open /normally closed (default closed)
          if (zoneConfig.contactType === 'NO') {
            const fault = zone[zoneConfig.statusProperty || 'fault']
            // invert open/problem data
            zone[zoneConfig.statusProperty || 'fault'] = !fault
          }
        }
      })
    }

    // publish sensors
    publisher.publishStateSensor(zones)
  }

  async function armDisarm (commandType, numArea) {
    if (!configHandler.isFeatureEnabled(config, 'armDisarm')) {
      return
    }
    try {
      const alarmStatusName = MeianStatusDecoder.fromStatusToTcpValue(commandType)
      if (!commandType || !alarmStatusName) {
        logger.error(`Received invalid alarm command: ${commandType}`)
      } else {
        logger.info(`Received alarm command: ${commandType}`)

        // stop polling
        stopPolling()

        // force publish on next round
        publisher.resetCache()
        // command
        const commandName = config.server.areas > 1 ? 'SetArea' : 'SetAlarmStatus'
        // area index is 0 based
        const commandArgs = config.server.areas > 1 ? [[parseInt(numArea) - 1, alarmStatusName]] : [[alarmStatusName]]
        executeCommand(commandName, commandArgs)

        if (config.debug) {
          logger.info('DEBUG MODE: IGNORING SET COMMAND RECEIVED for alarm.' + commandType + '()')
          logger.info('DEBUG MODE: FAKING SET COMMAND RECEIVED for alarm.' + commandType + '()')
          publisher.publishStateIAlarm(commandType)
        }
      }
    } catch (error) {
      handleError(error)
    }
  }

  async function bypassZone (zoneNumber, bypass) {
    if (!configHandler.isFeatureEnabled(config, 'bypass')) {
      return
    }

    try {
      /* if (config.server.zones && !config.server.zones.includes(zoneNumber)) {
        console.error('bypassZone: received not configured zone number: ' + zoneNumber)
        return
      } */
      const maxZones = configHandler.getMaxZones()
      if (!zoneNumber || zoneNumber > maxZones) {
        console.error('bypassZone: received invalid zone number: ' + zoneNumber)
        return
      }
      bypass = bypass || false

      // stop polling
      stopPolling()

      logger.info('Received bypass ' + bypass + ' for zone number ' + zoneNumber)

      // force publish on next round
      publisher.resetCache()

      // zone 0-indexed
      executeCommand('SetByWay', [[zoneNumber - 1, bypass]])
    } catch (error) {
      handleError(error)
    }
  }

  /**
   * @param {*} enabled publish the entity configs
   * @param {*} reset clear every /config topic first, deleting and recreating
   * the entities in Home Assistant. Off on start-up: it left a gap in the
   * entity history on every restart. See config.hadiscovery.resetOnStart.
   */
  function discovery (enabled, reset) {
    // clean errors
    publisher.publishConnectionStatus(!MeianConnection.status.isDisconnected(), 'OK')

    // home assistant mqtt discovery (if not enabled it will reset all /config topics)
    logger.info(`Calling discovery with enabled=${enabled}, reset=${!!reset}, zones=${Object.values(zonesCache.zones).length}`)
    publisher.publishHomeAssistantMqttDiscovery(Object.values(zonesCache.zones), enabled, config.deviceInfo, reset)
    if (!enabled) {
      logger.warn('Home assistant discovery disabled (empty config.hadiscovery)')
    }
    // publish the zone id -> name directory (retained) for the global directory sensor
    if (enabled && configHandler.isFeatureEnabled(config, 'zoneId')) {
      publisher.publishZoneDirectory(Object.values(zonesCache.zones))
    }
    discovered = true

    diagnostics.onDiscovery()
    publishDiagnostics()
  }

  function resetCache () {
    logger.warn('iAlarm cache cleared')
    publisher.resetCache()

    // sending fresh data
    fetchStatus()
  }

  /**
   * mqtt init
   */
  function startMqtt (onConnected, onDisconnected) {
    // mqtt init
    const commandHandler = {}
    commandHandler.armDisarm = armDisarm
    commandHandler.bypassZone = bypassZone
    commandHandler.discovery = discovery
    commandHandler.resetCache = resetCache
    publisher.connectAndSubscribe(
      commandHandler,
      // connected
      onConnected,
      // disconnected
      onDisconnected)
  }

  /**
   * Stop the status polling. Arm/disarm and bypass do this to free the single
   * TCP connection the panel allows while their command is in flight; it used
   * to be a no-op, because clearInterval was handed the array instead of the
   * timers inside it, and the array was never emptied.
   */
  function stopPolling () {
    if (pollings.length === 0) {
      return
    }
    while (pollings.length > 0) {
      clearInterval(pollings.pop())
    }
    logger.debug('Status polling stopped')
  }

  /**
   * Check if the status polling is currently running
   * @returns
   */
  function isPolling () {
    return pollings.length > 0
  }

  /**
   * Status polling: the only timer commands are allowed to suspend.
   * @returns
   */
  function startPolling () {
    if (!statusPollingEnabled) {
      logger.debug('Status disabled in config file')
      return
    }
    if (isPolling()) {
      return
    }

    logger.info(`Status polling every ${config.server.polling_status}ms`)
    pollings.push(setInterval(function () {
      if ((!zonesCache.zones || zonesCache.zones.length === 0) && !config.deviceInfo) {
        publisher.publishConnectionStatus(!MeianConnection.status.isDisconnected(), 'Missing network and zone infos')
        return
      }
      fetchStatus()
    }, config.server.polling_status))
  }

  /**
   * Availability and diagnostics: they don't talk to the panel, so a command
   * has no reason to suspend them. Started once and left alone — when they
   * lived in the same list as the status polling, every arm/disarm restarted
   * their interval from zero and a busy hour could starve them completely.
   */
  function startServiceTimers () {
    if (serviceTimers.length > 0) {
      return
    }

    // Only claim availability while the panel link is actually up: this timer
    // used to republish "online" every 5 minutes regardless, undoing the
    // "offline" that onDisconnected had just published.
    serviceTimers.push(setInterval(function () {
      if (MeianConnection.status.isDisconnected()) {
        return
      }
      publisher.publishAvailable(true)
    }, 300000))

    if (diagnosticsEnabled) {
      const diagnosticsInterval = config.server.polling_diagnostics || 60000
      logger.info(`Diagnostics publishing every ${diagnosticsInterval}ms`)
      serviceTimers.push(setInterval(function () {
        publishDiagnostics()
      }, diagnosticsInterval))
    }

    // Safety net for the status polling: it is onResponse that restarts it
    // after a command, so a command that never gets an answer would otherwise
    // leave the bridge alive but silent, with no error to trigger a reconnect.
    if (statusPollingEnabled) {
      serviceTimers.push(setInterval(function () {
        if (isPolling() || MeianConnection.status.isDisconnected()) {
          return
        }
        logger.warn(`Status polling has been stopped for over ${POLLING_WATCHDOG_MS}ms with the panel connected: restarting it`)
        startPolling()
      }, POLLING_WATCHDOG_MS))
    }
  }

  function stopAllTimers () {
    stopPolling()
    while (serviceTimers.length > 0) {
      clearInterval(serviceTimers.pop())
    }
  }

  // start loop
  function start () {
    logger.info('Starting up...')

    const host = config.server.host
    const port = config.server.port
    const username = config.server.username
    const password = config.server.password

    if (!host || !port || !username || !password) {
      throw new Error('Missing required configuration')
    }

    if (!zonesCache) {
      zonesCache = { zones: {}, caching: true }
    }

    // mqtt connection first
    startMqtt(
      // on connection start tcp polling
      () => {
        diagnostics.onMqttConnected(true)
        // reset timers
        stopPolling()
        // service timers start with MQTT, not with the panel: diagnostics have
        // to be published precisely when the panel cannot be reached
        startServiceTimers()
        connectToAlarm()
      },
      // on disconnection end polling and close app
      () => {
        diagnostics.onMqttConnected(false)
        stop()
      }
    )
  }

  function stop () {
    logger.info('Stopping...')
    // reset timers
    stopAllTimers()
    cancelReconnect()

    // exit ialarm-mqtt
    process.exit(1)
  }

  start()
}
