import { MeianLogger } from 'ialarm'
import IAlarmHaDiscovery from './mqtt-hadiscovery.js'
import { configHandler } from './config-handler.js'
import mqtt from 'mqtt'
import { MessageCompare } from './message-compare.js'

export const MqttPublisher = function (config) {
  const logger = MeianLogger(config.verbose ? 'debug' : 'info')

  let client

  // Discovery guard to prevent duplicate HA discovery publications across restarts or quick re-triggers
  let discoveryInProgress = false
  let lastDiscoveryCompletedAt = 0
  let discoveryStartTime = 0
  const DISCOVERY_COOLDOWN_MS = 15000

  const _cache = {
    data: {},
    enabled: config.mqtt.cache !== undefined,
    time: (function () {
      const expr = config.mqtt.cache
      if (expr) {
        let molt = 0

        if (expr.endsWith('s')) {
          molt = 1000
        } else if (expr.endsWith('m')) {
          molt = 60000
        } else if (expr.endsWith('h')) {
          molt = 60000 * 60
        } else if (expr.endsWith('d')) {
          molt = 60000 * 60 * 24
        } else {
          logger.info('Using default cache: 5m')
          // default 5 min
          return 5 * 60000
        }
        return expr.substring(0, expr.length - 1) * molt
      }
      return 0
    }())
  }

  const _resetCache = function (topic) {
    if (topic) {
      _cache.data[topic].lastChecked = 0
    } else if (_cache.data) {
      for (const key in _cache.data) {
        const item = _cache.data[key]
        if (item) {
          item.lastChecked = 0
        }
      }
    } else {
      _cache.data = {}
    }
  }

  this.resetCache = _resetCache

  const _decodeStatus = function (status) {
    try {
      const currentStatus = status.toLowerCase()
      const values = config.payloads.alarmDecoder
      if (values && currentStatus) {
        for (const key in values) {
          if (Object.prototype.hasOwnProperty.call(values, key)) {
            const item = values[key]
            if (Array.isArray(item)) {
              for (let index = 0; index < item.length; index++) {
                const element = item[index]
                if (element.toLowerCase() === currentStatus) {
                  return key
                }
              }
            } else {
              if (item.toLowerCase() === currentStatus) {
                return key
              }
            }
          }
        }
      }
    } catch (error) {
      logger.error(`error decoding status: ${error && error.message} on ${JSON.stringify(status)}`)
    }
    return status
  }

  const _publishAndLog = function (topic, data, options) {
    _publish(topic, data, options, true)
  }

  const _cacheExpireDate = function (date) {
    return new Date(date.getTime() + _cache.time)
  }

  const getMessageDiffs = function (topic, obj2) {
    // HA config topic
    if (topic.endsWith('/config')) {
      // needs republishing
      return ['config']
    }

    // cache empty or expired
    const expired = !_cache.enabled ||
      !_cache.data[topic] ||
      !_cache.data[topic].lastChecked ||
      // cache expired
      new Date() > _cacheExpireDate(_cache.data[topic].lastChecked)
    if (expired) {
      // needs republishing
      return ['expired']
    }

    // deep check
    const obj1 = _cache.data[topic].payload
    return MessageCompare(obj1, obj2)
  }

  const _publish = function (topic, data, options, verboseLog) {
    const differences = getMessageDiffs(topic, data)

    let dataLog
    if (verboseLog) {
      if (data) {
        if (config.verbose) {
          dataLog = JSON.stringify(data)
        } else if (typeof data === 'string') {
          dataLog = data
        } else if (Array.isArray(data)) {
          dataLog = 'Array of ' + data.length + ' elements'
        } else {
          dataLog = 'Object with ' + Object.keys(data).length + ' keys'
        }
      } else {
        dataLog = data
      }
    }

    if (!differences || differences.length <= 0) {
      // if (verboseLog) {
      //   const expire = _cache.data[topic] ? _cacheExpireDate(_cache.data[topic] && _cache.data[topic].lastChecked) : 0
      //   logger.debug(`Ignored ${topic} (expire ${expire}): same data as previous message - ${JSON.stringify(data)}`)
      // }
      return
    }

    if (client) {
      options = options || {}
      options.retain = config.mqtt.retain || false

      let payload = data
      if (typeof data !== 'string') {
        payload = JSON.stringify(data)
      }
      client.publish(topic, payload, options)
      // cache the original data, ignoring config
      if (!topic.endsWith('/config')) {
        _cache.data[topic] = { payload: data, lastChecked: (data && data.lastChecked) || new Date() }
        const expire = _cacheExpireDate(_cache.data[topic].lastChecked)
        logger.info(`Caching ${topic} until ${expire}`)
      }

      logger.info(`sending topic '${topic}' (changed: ${JSON.stringify(differences)}): ${dataLog}`)
    } else {
      logger.error(topic + ' - error publishing...not connected')
    }
  }

  this.connectAndSubscribe = function (alarmCommands, onConnected, onDisconnected) {
    const clientId = config.mqtt.clientId || 'ialarm-mqtt-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    logger.info(`MQTT connecting to broker ${config.mqtt.host}:${config.mqtt.port} with cliendId ${clientId}`)
    client = mqtt.connect('mqtt://' + config.mqtt.host + ':' + config.mqtt.port, {
      username: config.mqtt.username,
      password: config.mqtt.password,
      clientId,
      will: { topic: config.topics.availability, payload: config.payloads.alarmNotvailable }
    })

    client.on('connect', function () {
      logger.info(`MQTT connected to broker ${config.mqtt.host}:${config.mqtt.port} with cliendId ${clientId}`)
      const topicsToSubscribe = [
        config.topics.alarm.discovery,
        config.topics.alarm.resetCache
      ]
      // arm/disarm/cancel
      if (configHandler.isFeatureEnabled(config, 'armDisarm')) {
        topicsToSubscribe.push(getAreaTopic(config.topics.alarm.command, '+'))
      }
      // bypass
      if (configHandler.isFeatureEnabled(config, 'bypass')) {
        topicsToSubscribe.push(getZoneTopic(config.topics.alarm.bypass, '+'))
      }

      if (topicsToSubscribe.length > 0) {
        logger.info(`subscribing to ${JSON.stringify(topicsToSubscribe)}`)
        client.subscribe(topicsToSubscribe, function (err) {
          if (err) {
            logger.error('Error subscribing' + err.toString())
          }
          _resetCache()
        })
      } else {
        logger.info('No topic to subscribe to')
      }

      onConnected()
    })

    client.on('message', function (topic, message) {
      let command
      try {
        command = message.toString()
      } catch (error) {
        command = message
      }
      logger.info("received topic '" + topic + "' : ", command)

      if (topic === config.topics.alarm.discovery) { // any payload
        logger.info('Requested new HA discovery...')
        if (alarmCommands.discovery && command) {
          const on = command && (command.toLowerCase() === 'on' || command === 1 || command === 'true' || command === true)
          alarmCommands.discovery(on)
        }
        _publish(config.topics.alarm.configStatus, {
          cacheClear: 'OFF',
          discoveryClear: 'OFF',
          cancel: 'OFF'
        })
      } else if (topic === config.topics.alarm.resetCache) { // any payload
        if (alarmCommands.resetCache) {
          alarmCommands.resetCache()
        }
        _publish(config.topics.alarm.configStatus, {
          cacheClear: 'OFF',
          discoveryClear: 'OFF',
          cancel: 'OFF'
        })
      } else {
        // arm/disarm topic
        const armRegex = new RegExp(config.topics.alarm.command
          .replace('/', '/')
          /* eslint-disable-next-line no-template-curly-in-string */
          .replace('${areaId}', '(\\d{1,2})'), 'gm')
        const armMatch = armRegex.exec(topic)
        if (armMatch) {
          const numArea = armMatch[1]
          logger.info('Alarm arm/disarm/cancel: area ' + numArea + ' (' + command + ')')
          const ialarmCommand = _decodeStatus(command)
          if (alarmCommands.armDisarm) {
            alarmCommands.armDisarm(ialarmCommand, numArea)
            logger.info('Executed: ' + ialarmCommand + ' (' + command + ')')
            return
          }
        }

        // bypass topic
        // "ialarm\/alarm\/zone\/(\\d{1,2})\/bypass"
        const topicRegex = new RegExp(config.topics.alarm.bypass
          .replace('/', '/')
          /* eslint-disable-next-line no-template-curly-in-string */
          .replace('${zoneId}', '(\\d{1,2})'), 'gm')
        const match = topicRegex.exec(topic)
        if (match) {
          const zoneNumber = match[1]
          logger.info('Alarm bypass: zone ' + zoneNumber + ' (' + command + ')')

          const accepted = ['1', '0', 'true', 'false', 'on', 'off']
          let knownCommand = false
          for (let index = 0; index < accepted.length; index++) {
            const cmd = accepted[index]
            if (cmd === command.toLowerCase()) {
              knownCommand = true
              break
            }
          }
          if (!knownCommand) {
            logger.error(
              'Alarm bypass zone ' +
              zoneNumber +
              ' ignored invalid command: ' +
              command
            )
            return
          }
          const bypass =
            command === '1' ||
            command.toLowerCase() === 'true' ||
            command.toLowerCase() === 'on'
          if (bypass) {
            logger.info('Alarm bypass zone ' + zoneNumber)
          } else {
            logger.info('Alarm bypass removed from zone ' + zoneNumber)
          }
          if (alarmCommands.bypassZone) {
            alarmCommands.bypassZone(zoneNumber, bypass)
          }
        }
      }
    })

    client.on('error', function (err) {
      logger.error(`Error connecting to MQTT broker: ${err && err.message}`)
      if (onDisconnected) {
        onDisconnected()
      }
      client.end()
    })
  }

  function getSensorTopic (zoneId) {
    return getZoneTopic(config.topics.sensors.zone.state, zoneId)
  }

  function getZoneTopic (topic, zoneId) {
    // eslint-disable-next-line no-template-curly-in-string
    return topic && topic.replace('${zoneId}', zoneId)
  }

  function getAreaTopic (topic, areaId) {
    // eslint-disable-next-line no-template-curly-in-string
    return topic && topic.replace('${areaId}', areaId)
  }

  this.publishStateSensor = function (zones) {
    if (!zones) {
      logger.info('No zone found to publish')
      return
    }

    if (!config.topics.sensors) {
      // don't publish sensors
      logger.warn("config file has no 'config.topics.sensors' configured. Skipping.")
      return
    }

    const configuredZones = zones.length

    // one payload with all sensors data (sensors attrs)
    if (!config.topics.sensors.topicType || config.topics.sensors.topicType === 'state') {
      // legacy state: array of zones
      _publishAndLog(config.topics.sensors.state, zones)
    }

    // multiple payload with single sensor data based on zone.id to avoid misplaced index
    if (config.hadiscovery) {
      for (let i = 0; i < configuredZones; i++) {
        const zone = zones[i]
        // full zone status (only if changed)
        this.publishSensor(zone)
      }
    }

    // publishing also as object based on zone.id to avoid misplaced index
    if (zones.length > 0 && (!config.topics.sensors.topicType || config.topics.sensors.topicType === 'zone')) {
      logger.debug("sending topic '" + config.topics.sensors.zone.alarm + "' for " + configuredZones + ' zones')
      logger.debug("sending topic '" + config.topics.sensors.zone.active + "' for " + configuredZones + ' zones')
      logger.debug("sending topic '" + config.topics.sensors.zone.lowBattery + "' for " + configuredZones + ' zones')
      logger.debug("sending topic '" + config.topics.sensors.zone.fault + "' for " + configuredZones + ' zones')

      for (let i = 0; i < configuredZones; i++) {
        const zone = zones[i]
        let pub = _publish
        if (config.verbose) {
          pub = _publishAndLog
        }

        // single zone properties
        pub(getZoneTopic(config.topics.sensors.zone.alarm, zone.id), zone.alarm ? config.payloads.sensorOn : config.payloads.sensorOff)
        pub(getZoneTopic(config.topics.sensors.zone.active, zone.id), zone.bypass ? config.payloads.sensorOn : config.payloads.sensorOff)
        pub(getZoneTopic(config.topics.sensors.zone.lowBattery, zone.id), zone.lowbat ? config.payloads.sensorOn : config.payloads.sensorOff)
        pub(getZoneTopic(config.topics.sensors.zone.fault, zone.id), zone.fault ? config.payloads.sensorOn : config.payloads.sensorOff)
      }
    }
  }

  /**
   * publish single sensor state
   * @param {*} zone
   */
  this.publishSensor = function (zoneData) {
    _publishAndLog(getSensorTopic(zoneData.id), zoneData)
  }

  /**
   * publish single sensor state using cache and updating only changed properties (example: push notification)
   * @param {*} zoneId
   * @param {*} changed
   */
  this.updateStateSensor = function (zoneId, changed) {
    if (changed) {
      const topic = getSensorTopic(zoneId)
      const zoneData = (_cache.data[topic] || { payload: { id: zoneId } }).payload
      this.publishSensor({
        ...zoneData,
        ...changed
      })
      // allows next GetByWay to send full data
      _resetCache(topic)
    }
  }

  this.publishStateIAlarm = function (status) {
    const topic = config.topics.alarm.state
    if (status) {
      // merging old statuses (status_1, status_2, etc) and new status (status_1, status_3, etc)
      const oldStatus = (_cache.data[topic] || { payload: { } }).payload
      status = {
        ...oldStatus,
        ...status
      }
      for (const statusNumber in status) {
        // decode status
        const areaStatus = status[statusNumber]
        // if (!(areaStatus)) {
        //   logger.info(`******** DEBUG ******* No AREA STATUS on : ${statusNumber}=${JSON.stringify(areaStatus)}`)
        // }
        const alarmState = _decodeStatus(areaStatus)
        status[statusNumber] = (config.payloads.alarm && config.payloads.alarm[alarmState]) || areaStatus
      }
    }
    _publishAndLog(topic, status)
  }

  this.publishAvailable = function (presence) {
    const m = {}
    m.topic = config.topics.availability
    m.payload = presence ? config.payloads.alarmAvailable : config.payloads.alarmNotvailable
    _publish(m.topic, m.payload)
  }

  this.publishConnectionStatus = function (connected, errorMessage, stack) {
    if (errorMessage) {
      logger.debug(`Publishing connection status: ${errorMessage}`, stack)
    }

    _publish(config.topics.alarm.configStatus, {
      cacheClear: 'OFF',
      discoveryClear: 'OFF',
      cancel: 'OFF',
      connectionStatus: {
        // online if connected, auth, busy or ready
        connected,
        message: errorMessage || 'OK',
        stack: stack || '',
        date: new Date()
      }
    })
  }

  this.publishEvent = function (data) {
    const m = {}
    m.topic = config.topics.alarm.event
    m.payload = data
    _publish(m.topic, m.payload)
  }

  this.publishHomeAssistantMqttDiscovery = function (zones, on, deviceInfo) {
    const now = Date.now()
    logger.info(`Discovery called: on=${on}, zones=${zones ? zones.length : 0}, discoveryInProgress=${discoveryInProgress}`)
    
    if (discoveryInProgress) {
      const timeSinceStart = now - (lastDiscoveryCompletedAt || 0)
      if (timeSinceStart > 60000) {
        logger.warn(`Discovery stuck for ${timeSinceStart}ms, forcing reset...`)
        discoveryInProgress = false
        lastDiscoveryCompletedAt = 0
      } else {
        logger.warn(`Discovery already in progress, skipping... (stuck for ${timeSinceStart}ms)`)
        return
      }
    }
    
    if (now - lastDiscoveryCompletedAt < DISCOVERY_COOLDOWN_MS) {
      logger.info(`Discovery cooldown active (${DISCOVERY_COOLDOWN_MS}ms). Skipping.`)
      return
    }

    // ✅ FIX: Validazione input
    if (!zones || zones.length === 0) {
      logger.error('Discovery called with empty zones array, skipping...')
      return
    }

    discoveryInProgress = true
    discoveryStartTime = Date.now()
    logger.info(`Starting discovery process at ${new Date(discoveryStartTime).toISOString()}`)
    
    const safetyTimeout = setTimeout(() => {
      if (discoveryInProgress) {
        logger.warn('Discovery safety timeout reached, resetting discovery flag')
        discoveryInProgress = false
        lastDiscoveryCompletedAt = Date.now()
      }
    }, 30000)
    
    let resetMessages = []
    let discoveryMessages = []
    
    // ✅ FIX: Genera tutti i messaggi prima di pubblicare
    try {
      logger.info('Creating reset messages...')
      const discoveryInstanceReset = new IAlarmHaDiscovery(config, zones, true, deviceInfo)
      resetMessages = discoveryInstanceReset.createMessages()
      logger.info(`Created ${resetMessages.length} reset messages`)
      
      if (on) {
        logger.info('Creating discovery messages...')
        const discoveryInstanceMain = new IAlarmHaDiscovery(config, zones, false, deviceInfo)
        discoveryMessages = discoveryInstanceMain.createMessages()
        logger.info(`Created ${discoveryMessages.length} discovery messages`)
      }
    } catch (error) {
      logger.error(`ERROR in createMessages(): ${error.message}`)
      logger.error(`ERROR stack: ${error.stack}`)
      logger.warn('Discovery encountered errors but will continue with available messages')
      clearTimeout(safetyTimeout)
      discoveryInProgress = false
      lastDiscoveryCompletedAt = Date.now()
      return
    }

    // Fase 1: Pubblica reset messages
    logger.info(`Publishing HA discovery reset for ${resetMessages.length} topics`)
    for (let index = 0; index < resetMessages.length; index++) {
      const m = resetMessages[index]
      if (m && m.topic) {
        logger.debug && logger.debug(`Discovery RESET topic: ${m.topic}`)
        _publishAndLog(m.topic, m.payload, { retain: true })
      } else {
        logger.warn(`Invalid reset message at index ${index}:`, m)
      }
    }

    if (!on) {
      logger.info('HA discovery reset requested with discovery disabled. Skipping entity publish.')
      clearTimeout(safetyTimeout)
      discoveryInProgress = false
      lastDiscoveryCompletedAt = Date.now()
      return
    }

    // Fase 2: Pubblica discovery messages dopo delay
    logger.info('Setting up Home Assistant discovery...')
    setTimeout(function () {
      logger.info(`Publishing HA discovery entities for ${discoveryMessages.length} topics`)
      
      for (let index = 0; index < discoveryMessages.length; index++) {
        const m = discoveryMessages[index]
        if (m && m.topic) {
          logger.debug && logger.debug(`Discovery topic: ${m.topic}`)
          _publishAndLog(m.topic, m.payload, { retain: true })
        } else {
          logger.warn(`Invalid discovery message at index ${index}:`, m)
        }
      }
      
      clearTimeout(safetyTimeout)
      discoveryInProgress = false
      lastDiscoveryCompletedAt = Date.now()
      logger.info(`Discovery process completed successfully!`)
    }, 5000)
  }

  // Function to force reset discovery flag (useful for debugging)
  this.resetDiscoveryFlag = function () {
    logger.info('Manually resetting discovery flag')
    discoveryInProgress = false
    lastDiscoveryCompletedAt = 0
    discoveryStartTime = 0
  }
}
