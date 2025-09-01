/* eslint-disable no-template-curly-in-string */

import { MeianLogger } from 'ialarm'
import { configHandler }  from './config-handler.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const pkgPath = path.resolve(__dirname, '../package.json')
const pjson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

export default function (config, zonesToConfig, reset, deviceInfo) {
  const logger = MeianLogger(config.verbose ? 'debug' : 'info')

  const uniqueSuffix = (config.branding && config.branding.uniqueIdSuffix) ? String(config.branding.uniqueIdSuffix) : ''
  const alarmId = `alarm_mqtt_${(deviceInfo && deviceInfo.mac && deviceInfo.mac.split(':').join('')) || 'meian'}${uniqueSuffix}`
  logger.info(`Generated alarmId: ${alarmId}`)

  /**
   * Get device type from zone name for more sensible naming
   * @param {string} zoneName - The cleaned zone name
   * @returns {string} - More sensible device name
   */
  function getDeviceTypeFromZoneName(zoneName) {
    const lower = zoneName.toLowerCase()
    
    // Mapping per nomi più sensati
    const deviceTypes = {
      'cucina_tavolo': 'sicurezza_cucina',
      'sala_tavolo': 'sicurezza_sala',
      'tavolo': 'sicurezza',
      'cucina': 'sicurezza_cucina',
      'sala': 'sicurezza_sala',
      'corridoio': 'pir_corridoio',
      'ingresso': 'sicurezza_ingresso',
      'bagno': 'sicurezza_bagno',
      'camera': 'sicurezza_camera',
      'studio': 'sicurezza_studio',
      'garage': 'sicurezza_garage',
      'cantina': 'sicurezza_cantina'
    }
    
    return deviceTypes[lower] || zoneName
  }

  /**
   * Clean zone name - REMOVES zone prefix and duplications for clean Entity IDs
   * @param {string} zoneName - Original zone name like "zona_2_finestra_cucina_finestra_cucina"
   * @returns {string} - Clean name like "finestra_cucina"
   */
  function cleanZoneName(zoneName) {
    logger.debug(`cleanZoneName INPUT: "${zoneName}"`)
    
    if (!zoneName) {
      logger.debug('cleanZoneName: Invalid input, returning empty string')
      return ''
    }
    
    let cleaned = zoneName.toLowerCase()
    
    // Step 1: Remove zone prefixes (zona_2_, zone_15_, etc.)
    cleaned = cleaned.replace(/^zona?_\d+_/, '')
    logger.debug(`cleanZoneName: After prefix removal: "${cleaned}"`)
    
    // Step 2: Fix duplicazioni: word1_word2_word1_word2 -> word1_word2
    const parts = cleaned.split('_')
    if (parts.length >= 2) {
      const half = Math.floor(parts.length / 2)
      const firstHalf = parts.slice(0, half).join('_')
      const secondHalf = parts.slice(half).join('_')
      
      if (firstHalf === secondHalf && firstHalf.length > 0) {
        cleaned = firstHalf
        logger.debug(`cleanZoneName: Removed full duplication: "${cleaned}"`)
      }
    }
    
    // Step 3: Fix pattern singoli dopo aver fixato le duplicazioni
    cleaned = cleaned.replace(/^(\w+)_\1$/, '$1')
    logger.debug(`cleanZoneName: After single word duplication fix: "${cleaned}"`)
    
    // Step 4: Fix specifici per nomi italiani
    const nameMap = {
      'finestra_ingress': 'finestra_ingresso',
      'finestra_sx_sala': 'finestra_sinistra_sala',
      'finestra_dx_sala': 'finestra_destra_sala',
      'porta_ingress': 'porta_ingresso',
      'porta_sx_sala': 'porta_sinistra_sala',
      'porta_dx_sala': 'porta_destra_sala'
    }
    
    cleaned = nameMap[cleaned] || cleaned
    
    // Step 5: Applica mapping per nomi più sensati
    cleaned = getDeviceTypeFromZoneName(cleaned)
    
    logger.debug(`cleanZoneName: FINAL RESULT: "${zoneName}" -> "${cleaned}"`)
    return cleaned
  }

  /**
   * Get clean device name for display (readable format)
   * @param {string} zoneName - The original zone name
   * @returns {string} - Clean display name like "Finestra Ingresso"
   */
  function getCleanDeviceName(zoneName) {
    const cleaned = cleanZoneName(zoneName)
    
    if (!cleaned) {
      return 'Unknown Device'
    }
    
    const result = cleaned
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
      .replace(/Pir/g, 'PIR')
    
    logger.debug(`getCleanDeviceName: "${zoneName}" -> "${result}"`)
    return result
  }

  /**
   * Get display name for sensors (decent format)
   * @param {string} cleanName - The cleaned zone name
   * @param {string} sensorType - The sensor type
   * @returns {string} - Display name like "Finestra Cucina Batteria"
   */
  function getDisplayName(cleanName, sensorType) {
    const displayBase = cleanName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
      .replace(/Pir/g, 'PIR')
    
    const suffixes = {
      fault: ' Stato',
      battery: ' Batteria', 
      connectivity: ' Connessione',
      alarm: '',
      bypass: ' Bypass'
    }
    
    const result = displayBase + (suffixes[sensorType] || '')
    logger.debug(`getDisplayName: "${cleanName}" (${sensorType}) -> "${result}"`)
    return result
  }

  /**
   * Create elegant name for DISPLAY (no dashes, proper format)
   * @param {string} zoneName - The original zone name
   * @param {string} type - The sensor type  
   * @returns {string} - Format: "Porta Studio Batteria"
   */
  function createElegantName(zoneName, type) {
    const cleanName = cleanZoneName(zoneName)
    return getDisplayName(cleanName, type)
  }

  /**
   * Get type display name in Italian
   * @param {string} type - The sensor type
   * @returns {string} - Italian display name
   */
  function getTypeDisplayName(type) {
    const typeMap = {
      'battery': 'Batteria',
      'bypass': 'Bypass', 
      'fault': 'Stato',
      'alarm': '', // No suffix for main alarm sensor
      'connectivity': 'Connessione',
      'motion': 'Movimento'
    }
    
    return typeMap[type.toLowerCase()] || ''
  }

  /**
   * Generate clean unique ID for entities
   * @param {string} zoneName - The zone name
   * @param {string} type - The sensor type
   * @param {number} zoneId - The zone ID
   * @returns {string} - Clean unique ID like "ialarm_sicurezza_cucina_battery_4_v12"
   */
  function generateCleanUniqueId(zoneName, type, zoneId) {
    const cleanBase = cleanZoneName(zoneName).replace(/[^a-z0-9_]/g, '')
    
    // Map types to English for unique ID
    const typeMap = {
      'battery': 'battery',
      'bypass': 'bypass',
      'fault': 'fault',
      'alarm': 'alarm',
      'connectivity': 'connectivity',
      'motion': 'motion'
    }
    
    const cleanType = typeMap[type.toLowerCase()] || type.toLowerCase()
    const result = `ialarm_${cleanBase}_${cleanType}_${zoneId}_v12`
    
    logger.debug(`generateCleanUniqueId: "${zoneName}" (${type}, ${zoneId}) -> "${result}"`)
    return result
  }

  const deviceConfig = {
    identifiers: `${alarmId}`,
    manufacturer: (config.branding && config.branding.manufacturer) || 'Meian',
    model: deviceInfo.name,
    // Use a more specific device name to avoid entity name collisions with HA rules (entity name cannot equal or start with device name)
    name: `${(config.name || deviceInfo.name || 'iAlarm Security Panel')}${(config.branding && config.branding.deviceNameSuffix) || ''}`,
    sw_version: `ialarm-mqtt ${pjson.version}`
  }
  /*
  causes in validate_mapping raise er.MultipleInvalid(errors) voluptuous.error.MultipleInvalid: expected a list @ data['device']['connections'][0]
  if(deviceInfo.mac){
    deviceConfig.connections = ['mac', deviceInfo.mac.toLowerCase()]
  }*/

  function getZoneDevice (zone) {
    return {
      ...deviceConfig,
      identifiers: [`${alarmId}_zone_${zone.id}`],
      // Use clean device name for display
      name: getCleanDeviceName(zone.name),  // "Finestra Ingresso"
      model: zone.type || 'Binary Sensor'
    }
  }

  function getAvailability () {
    return [
      {
        topic: config.topics.availability,
        payload_available: config.payloads.alarmAvailable,
        payload_not_available: config.payloads.alarmNotvailable
      }
    ]
  }

  const _getTopic = function (topicTemplate, data) {
    if (!data) {
      data = {}
    }
    data.discoveryPrefix = config.hadiscovery.discoveryPrefix || 'homeassistant'
    let topic = topicTemplate
    for (const key in data) {
      const value = data[key]
      // ${key}
      topic = topic.replace('${' + key + '}', value)
    }
    return topic
  }

  /**
     * binary sensor for "fault" property
     * @param {*} zone
     * @param {*} i
     * @param {*} battery
     * @returns
     */
  const configSensorFault = function (zone, i) {
    const cleanName = cleanZoneName(zone.name)  // "sicurezza_cucina"
    const entityName = `zone_${zone.id}_${cleanName}_stato`     // "zone_4_sicurezza_cucina_stato"
    const displayName = getDisplayName(cleanName, 'fault')  // "Sicurezza Cucina Stato"
    
    logger.debug(`configSensorFault: Zone ${zone.id}, entity name: "${entityName}", display: "${displayName}"`)
    
    const message = configBinarySensors(zone, i, 'Motion', 'safety', 'fault', 
      config.hadiscovery.topics.sensorConfig, false, entityName)
    
    if (!reset) {
      const zoneName = config.hadiscovery.zoneName

      // optional
      let icon
      let deviceClass
      // priority to zone config
      const zoneConfig = configHandler.getZoneOverride(config, zone.id, zone.typeId)
      if (zoneConfig) {
        icon = zoneConfig.icon
        deviceClass = zoneConfig.device_class
      }

      const payload = {
        ...message.payload,
        // Use decent display name
        name: displayName,
        // Use clean unique ID
        unique_id: generateCleanUniqueId(zone.name, 'fault', zone.id)
      }

      // icon is not supported on binary sensor, only switches, light, sensor, etc
      if (payload.state_topic.indexOf('/binary_sensor/') === -1) {
        payload.icon = icon
      }
      payload.device_class = deviceClass || 'safety' // default

      message.payload = payload
    }
    return message
  }

  /**
     * binary sensor for "lowbat" property
     * @param {*} zone
     * @param {*} i
     * @returns
     */
  const configSensorBattery = function (zone, i) {
    const cleanName = cleanZoneName(zone.name)  // "sicurezza_cucina"
    const entityName = `zone_${zone.id}_${cleanName}_batteria`  // "zone_4_sicurezza_cucina_batteria"
    const displayName = getDisplayName(cleanName, 'battery')  // "Sicurezza Cucina Batteria"
    
    logger.debug(`configSensorBattery: Zone ${zone.id}, entity name: "${entityName}", display: "${displayName}"`)
    
    const message = configBinarySensors(zone, i, 'Battery', 'battery', 'lowbat', 
      config.hadiscovery.topics.sensorBatteryConfig, false, entityName)
    
    if (!reset) {
      message.payload.name = displayName
      message.payload.unique_id = generateCleanUniqueId(zone.name, 'battery', zone.id)
    }
    return message
  }

  /**
     * binary sensor for "wirelessLoss" property
     * @param {*} zone
     * @param {*} i
     * @returns
     */
  const configSensorConnectivity = function (zone, i) {
    const cleanName = cleanZoneName(zone.name)      // "sicurezza_cucina"
    const entityName = `zone_${zone.id}_${cleanName}_connessione`   // "zone_4_sicurezza_cucina_connessione"  
    const displayName = getDisplayName(cleanName, 'connectivity')  // "Sicurezza Cucina Connessione"
    
    logger.debug(`configSensorConnectivity: Zone ${zone.id}, entity name: "${entityName}", display: "${displayName}"`)
    
    const message = configBinarySensors(zone, i, 'Connectivity', 'connectivity', 'wirelessLoss', 
      config.hadiscovery.topics.sensorConnectivityConfig, true, entityName)
    
    if (!reset) {
      message.payload.name = displayName
      message.payload.unique_id = generateCleanUniqueId(zone.name, 'connectivity', zone.id)
    }
    return message
  }

  /**
     * binary sensor for "alarm" property
     * @param {*} zone
     * @param {*} i
     * @returns
     */
  const configSensorAlarm = function (zone, i) {
    const cleanName = cleanZoneName(zone.name)  // "sicurezza_cucina"
    const entityName = `zone_${zone.id}_${cleanName}`               // "zone_4_sicurezza_cucina" (no suffix for main)
    const displayName = getDisplayName(cleanName, 'alarm')  // "Sicurezza Cucina"
    
    logger.debug(`configSensorAlarm: Zone ${zone.id}, entity name: "${entityName}", display: "${displayName}"`)
    
    const message = configBinarySensors(zone, i, 'Alarm', 'safety', 'alarm', 
      config.hadiscovery.topics.sensorAlarmConfig, false, entityName)
    
    if (!reset) {
      message.payload.name = displayName
      message.payload.unique_id = generateCleanUniqueId(zone.name, 'alarm', zone.id)
    }
    return message
  }

  /**
     * Binary sensors based on alarm booleans
     * @param {*} zone
     * @param {*} i
     * @param {*} type
     * @param {*} device_class
     * @param {*} statusProperty
     * @param {*} topic
     * @param {*} defaultOn
     * @returns
     */
  const configBinarySensors = function (zone, index, type, deviceClass, statusProperty, topic, defaultOn, entityName) {
    let payload = ''
    const zoneId = zone.id
    if (!reset) {
      let zoneName = config.hadiscovery.zoneName
      if (!zoneName) {
        zoneName = 'Zone'
      }
      let valueTemplate = `{{ '${config.payloads.sensorOn}' if value_json.${statusProperty} else '${config.payloads.sensorOff}' }}`
      if (defaultOn) {
        valueTemplate = `{{  '${config.payloads.sensorOff}' if value_json.${statusProperty} else '${config.payloads.sensorOn}' }}`
      }

      const stateTopic = _getTopic(config.topics.sensors.zone.state, {
        zoneId: zoneId
      })

      payload = {
        // Use elegant name for display (passed from calling function)
        name: entityName,
        availability: getAvailability(),
        device_class: deviceClass,
        value_template: valueTemplate,
        payload_on: config.payloads.sensorOn,
        payload_off: config.payloads.sensorOff,
        json_attributes_topic: stateTopic,
        json_attributes_template: '{{ value_json | tojson }}',
        state_topic: stateTopic,
        // unique_id will be overridden by calling functions
        unique_id: `${alarmId}_zone_${zone.id}_${type.toLowerCase()}_temp`,
        device: getZoneDevice(zone),
        qos: config.hadiscovery.sensors_qos
      }
      logger.info(`Zone unique_id: ${payload.unique_id}`)
    }
    return {
      topic: _getTopic(topic, {
        zoneId: zoneId
      }),
      payload
    }
  }

  /**
     * Log event (last)
     * @returns
     */
  const configSensorEvents = function () {
    let payload = ''
    if (!reset) {
      payload = {
        name: config.hadiscovery.events.name
          ? config.hadiscovery.events.name
          : `${deviceConfig.name} last event`,
        availability: getAvailability(),
        state_topic: config.topics.alarm.event,
        value_template: '{{value_json.description}}',
        json_attributes_topic: config.topics.alarm.event,
        json_attributes_template: '{{ value_json | tojson }}',
        unique_id: `${alarmId}_events`,
        icon: config.hadiscovery.events.icon,
        device: deviceConfig,
        qos: config.hadiscovery.sensors_qos
      }
    }
    return {
      topic: _getTopic(config.hadiscovery.topics.eventsConfig),
      payload
    }
  }

  /**
     * Error log
     * @returns
     */
  const configConnectionStatus = function () {
    let payload = ''
    if (!reset) {
      payload = {
        name: `${deviceConfig.name} comunication status`,
        availability: getAvailability(),
        state_topic: config.topics.alarm.configStatus,
        value_template: '{{value_json.connectionStatus.connected}}',
        payload_on: true,
        payload_off: false,
        json_attributes_topic: config.topics.alarm.configStatus,
        json_attributes_template: '{{ value_json.connectionStatus | tojson }}',
        unique_id: `${alarmId}_connection_status`,
        icon: 'mdi:alert-circle',
        device: deviceConfig,
        qos: config.hadiscovery.sensors_qos
      }
    }
    return {
      topic: _getTopic(config.hadiscovery.topics.connectionConfig),
      payload
    }
  }

  /**
     * Bypass switch
     * @param {*} zone
     * @param {*} i
     * @returns
     */
  const configSwitchBypass = function (zone, index) {
    const zoneName = config.hadiscovery.zoneName || 'Zone'
    const bypassName = config.hadiscovery.bypass.name || 'Bypass'
    let payload = ''
    const zoneId = zone.id
    if (!reset) {
      const stateTopic = _getTopic(config.topics.sensors.zone.state, {
        zoneId: zoneId
      })

      const cleanName = cleanZoneName(zone.name)  // "sicurezza_cucina"
      const entityName = `zone_${zone.id}_${cleanName}_bypass`    // "zone_4_sicurezza_cucina_bypass"
      const displayName = getDisplayName(cleanName, 'bypass')  // "Sicurezza Cucina Bypass"
      
      logger.debug(`configSwitchBypass: Zone ${zone.id}, entity name: "${entityName}", display: "${displayName}"`)
      
      payload = {
        name: displayName,  // Use decent display name
        availability: getAvailability(),
        state_topic: stateTopic,
        value_template: `{{ '${config.payloads.sensorOn}' if value_json.bypass else '${config.payloads.sensorOff}' }}`,
        payload_on: config.payloads.sensorOn,
        payload_off: config.payloads.sensorOff,
        command_topic: _getTopic(config.topics.alarm.bypass, {
          zoneId: zoneId
        }),
        unique_id: generateCleanUniqueId(zone.name, 'bypass', zone.id),
        icon: config.hadiscovery.bypass.icon,
        device: getZoneDevice(zone),
        qos: config.hadiscovery.sensors_qos
      }
    }
    return {
      topic: _getTopic(config.hadiscovery.topics.bypassConfig, {
        zoneId: zoneId
      }),
      payload
    }
  }

  /**
    * switch to clear cached values
    * @param {*} zone
    * @param {*} i
    * @returns
    */
  const configSwitchClearCache = function () {
    let payload = ''
    if (!reset) {
      payload = {
        // Avoid device name prefix to comply with HA 2024.2.0 naming rules
        name: 'Cache Reset',
        availability: getAvailability(),
        state_topic: config.topics.alarm.configStatus,
        value_template: '{{ value_json.cacheClear }}',
        command_topic: config.topics.alarm.resetCache,
        payload_on: 'ON',
        payload_off: 'OFF',
        unique_id: `${alarmId}_clear_cache`,
        icon: 'mdi:reload-alert',
        device: deviceConfig,
        qos: config.hadiscovery.sensors_qos
      }
    }
    return {
      topic: _getTopic(config.hadiscovery.topics.clearCacheConfig),
      payload
    }
  }

  /**
    * switch to clear discovery
    * @param {*} zone
    * @param {*} i
    * @returns
    */
  const configSwitchClearDiscovery = function () {
    let payload = ''
    if (!reset) {
      payload = {
        // Avoid device name prefix to comply with HA 2024.2.0 naming rules
        name: 'Discovery Reset',
        availability: getAvailability(),
        state_topic: config.topics.alarm.configStatus,
        value_template: '{{ value_json.discoveryClear }}',
        command_topic: config.topics.alarm.discovery,
        payload_on: 'ON',
        payload_off: 'OFF',
        unique_id: `${alarmId}_clear_discovery`,
        icon: 'mdi:refresh',
        device: deviceConfig,
        qos: config.hadiscovery.sensors_qos
      }
    }
    return {
      topic: _getTopic(config.hadiscovery.topics.clearDiscoveryConfig),
      payload
    }
  }

  /**
     * switch to cancel triggered sensors alarms
     * @param {*} zone
     * @param {*} i
     * @returns
     */
  const configSwitchCancelTriggered = function (areaId) {
    let payload = ''
    if (!reset) {
      // only 1 switch for all areas?
      const commandTopic = _getTopic(config.topics.alarm.command, {
        areaId: areaId
      })
      payload = {
        // Avoid device name prefix to comply with HA 2024.2.0 naming rules
        name: 'Clear Triggered',
        availability: getAvailability(),
        state_topic: config.topics.alarm.configStatus,
        value_template: '{{ value_json.cancel }}',
        command_topic: commandTopic,
        payload_on: 'cancel',
        payload_off: 'OFF',
        unique_id: `${alarmId}_cancel_trigger`,
        icon: 'mdi:alarm-light',
        device: deviceConfig,
        qos: config.hadiscovery.sensors_qos
      }
    }
    return {
      topic: _getTopic(config.hadiscovery.topics.clearTriggeredConfig),
      payload
    }
  }

  const configIAlarm = function (areaId) {
    let payload = ''
    if (!reset) {
      const commandTopic = _getTopic(config.topics.alarm.command, {
        areaId: areaId
      })
      payload = {
        // Keep a friendly alarm name but avoid generic device name repetition in entities
        name: `${deviceConfig.name}${config.server.areas > 1 ? ' Area ' + areaId : ''}`,
        unique_id: `${alarmId}_unit${config.server.areas > 1 ? '_area' + areaId : ''}`,
        device: deviceConfig,
        availability: getAvailability(),
        state_topic: config.topics.alarm.state,
        value_template: `{{ value_json.status_${areaId} }}`,
        command_topic: commandTopic,
        payload_disarm: config.payloads.alarm.disarm,
        payload_arm_home: config.payloads.alarm.armHome,
        payload_arm_away: config.payloads.alarm.armAway,
        payload_available: config.payloads.alarmAvailable,
        payload_not_available: config.payloads.alarmNotvailable,
        qos: config.hadiscovery.alarm_qos
      }
      // optional
      if (config.hadiscovery.code) {
        payload.code = config.hadiscovery.code
      }
    }
    return {
      topic: _getTopic(config.hadiscovery.topics.alarmConfig, {
        areaId: areaId
      }),
      payload
    }
  }

  function configCleanup (topic, zone) {
    return {
      topic: _getTopic(topic, {
        zoneId: zone && zone.id,
        discoveryPrefix: config.hadiscovery.discoveryPrefix
      }),
      payload: ''
    }
  }

  this.createMessages = function () {
    const messages = []
    const zones = zonesToConfig // Fix: assign zonesToConfig to zones variable
    logger.info(`IAlarmHaDiscovery.createMessages called: reset=${reset}, zones=${zones.length}`)

    // cleanup old topics structures
    if (reset) {
      logger.info('Creating reset cleanup messages...')
      messages.push(configCleanup('${discoveryPrefix}/alarm_control_panel/ialarm/config'))
      messages.push(configCleanup('${discoveryPrefix}/sensor/ialarm/error/config'))
      messages.push(configCleanup('ialarm/alarm/error')) 
      logger.info(`Created ${messages.length} reset cleanup messages`)
    }

    //iterating all 128 zones
    const maxZones = configHandler.getMaxZones()
    const zonesArray = Array.isArray(zones) ? zones : []
    
    logger.info(`Starting zone iteration: maxZones=${maxZones}, zones.length=${zonesArray.length}`)
    
    for (let i = 0; i < maxZones; i++) {
      if (i % 10 === 0) {
        logger.info(`Processing zone ${i}/${maxZones}...`)
      }
      
      let zone
      
      try {
        if (reset) {
          zone = { id: i + 1, name: `Zone_${i + 1}` }
        } else {
          zone = zonesArray[i]
          
          if (!zone) {
            logger.debug(`HA discovery config: ignoring zone ${i} (GetZone did not return any info on this zone)`)
            continue
          }
          
          if (typeof zone.id === 'undefined') {
            zone.id = i + 1
          }
          
          if (typeof zone.name === 'undefined' || zone.name === null) {
            logger.warn(`Zone ${zone.id} has no name, using default`)
            zone.name = `Zone_${zone.id}`
          }
          
          if (zone.typeId === 0) {
            logger.debug(`HA discovery config: ignoring unused zone ${zone.id} (typeId = 0)`)
            continue
          }
        }

        if (!zone || !zone.id) {
          logger.warn(`Invalid zone at index ${i}, skipping`)
          continue
        }

      // cleanup old topics structures
      if (reset) {
        messages.push(configCleanup('${discoveryPrefix}/binary_sensor/ialarm/${zoneId}/config', zone))
        messages.push(configCleanup('${discoveryPrefix}/sensor/ialarm${zoneId}/battery/config', zone))
        // messages.push(configCleanup("${discoveryPrefix}/sensor/${zoneId}/battery/config", zone));
      }

      // binary sensors
      if (reset || configHandler.isFeatureEnabled(config, 'sensors')) {
        messages.push(configSensorFault(zone, i))
        messages.push(configSensorBattery(zone, i))
        messages.push(configSensorAlarm(zone, i))
        messages.push(configSensorConnectivity(zone, i))
      }

      // bypass switches
      if (reset || configHandler.isFeatureEnabled(config, 'bypass')) {
        messages.push(configSwitchBypass(zone, i))
      }
      
      } catch (error) {
        logger.error(`Error processing zone ${i}: ${error.message}`)
        continue // ✅ FIX: Continua con la prossima zona invece di fallire tutto
      }
    }

    // switch to clear cache and discovery configs
    messages.push(configSwitchClearCache())
    messages.push(configSwitchClearDiscovery())

    // ok/errors
    messages.push(configConnectionStatus())

    if (reset || configHandler.isFeatureEnabled(config, 'armDisarm')) {
    // cancel alarm triggered ( TODO multiple switch for all areas?)
      messages.push(configSwitchCancelTriggered(1))

      // multiple alarm state for multiple area
      for (let areaId = 1; areaId <= config.server.areas; areaId++) {
        messages.push(configIAlarm(areaId))
      }
    }

    // last event
    if (reset || configHandler.isFeatureEnabled(config, 'events')) {
      messages.push(configSensorEvents())
    }

    // ✅ FIX: Filtra messaggi null/undefined
    const validMessages = messages.filter(msg => msg && msg.topic)

    logger.info(`IAlarmHaDiscovery.createMessages completed: created ${validMessages.length} valid messages out of ${messages.length} total`)

    if (validMessages.length !== messages.length) {
      logger.warn(`Filtered out ${messages.length - validMessages.length} invalid messages`)
    }

    return validMessages
  }
}

