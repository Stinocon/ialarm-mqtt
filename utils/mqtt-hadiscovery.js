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
   * Clean zone name - PRESERVES zone_X_ prefix and removes duplications
   * @param {string} zoneName - Original zone name like "zona_15_pir_sala_pir_sala"
   * @returns {string} - Clean name like "zone_15_pir_sala"
   */
  function cleanZoneName(zoneName) {
    logger.debug(`cleanZoneName INPUT: "${zoneName}"`)
    
    if (!zoneName || typeof zoneName !== 'string') {
      logger.debug('cleanZoneName: Invalid input, returning zone_0_unknown')
      return 'zone_0_unknown'
    }
    
    let cleaned = zoneName.toLowerCase().trim()
    if (cleaned === '') {
      logger.debug('cleanZoneName: Empty input, returning zone_0_unknown')
      return 'zone_0_unknown'
    }
    
    // Step 1: Extract zone number and create standardized prefix
    let zoneNumber = '0'
    let nameWithoutPrefix = cleaned
    
    // Match patterns like "zona_15_" or "zone_15_"
    const zoneMatch = cleaned.match(/^zona?_?(\d+)_?(.*)$/i)
    if (zoneMatch) {
      zoneNumber = zoneMatch[1]
      nameWithoutPrefix = zoneMatch[2] || ''
      logger.debug(`cleanZoneName: Found zone ${zoneNumber}, name part: "${nameWithoutPrefix}"`)
    } else {
      // If no zone prefix found, try to extract from zone ID or default to zone 0
      logger.debug(`cleanZoneName: No zone prefix found in "${cleaned}", using zone_0`)
    }
    
    const standardPrefix = `zone_${zoneNumber}_`
    logger.debug(`cleanZoneName: Standard prefix: "${standardPrefix}"`)
    
    // Step 2: Clean the name part (remove duplications)
    if (!nameWithoutPrefix || nameWithoutPrefix.trim() === '') {
      const result = `${standardPrefix}unknown`
      logger.debug(`cleanZoneName: Empty name part, result: "${result}"`)
      return result
    }
    
    // Split name part into words
    const parts = nameWithoutPrefix.split(/[_\s-]+/).filter(part => part.length > 0)
    logger.debug(`cleanZoneName: Name parts: [${parts.join(', ')}]`)
    
    // Remove complete duplication patterns
    let cleanedParts = parts
    const halfLength = Math.floor(parts.length / 2)
    
    // Check for full duplication: ["pir", "sala", "pir", "sala"] -> ["pir", "sala"]
    if (parts.length >= 2 && parts.length % 2 === 0 && halfLength > 0) {
      const firstHalf = parts.slice(0, halfLength)
      const secondHalf = parts.slice(halfLength)
      
      const isFullDuplication = firstHalf.every((part, index) => part === secondHalf[index])
      if (isFullDuplication) {
        cleanedParts = firstHalf
        logger.debug(`cleanZoneName: Removed full duplication, new parts: [${cleanedParts.join(', ')}]`)
      }
    }
    
    // Remove consecutive duplicates: ["camera", "camera", "sala"] -> ["camera", "sala"]
    const deduped = []
    for (let i = 0; i < cleanedParts.length; i++) {
      const currentPart = cleanedParts[i]
      if (i === 0 || currentPart !== cleanedParts[i - 1]) {
        deduped.push(currentPart)
      }
    }
    
    if (deduped.length !== cleanedParts.length) {
      logger.debug(`cleanZoneName: Removed consecutive duplicates: [${deduped.join(', ')}]`)
    }
    
    // Step 3: Build final result
    const cleanedNamePart = deduped.join('_')
    const result = `${standardPrefix}${cleanedNamePart}`
    
    logger.debug(`cleanZoneName: FINAL RESULT: "${zoneName}" -> "${result}"`)
    return result
  }

  /**
   * Create elegant name for DISPLAY (no dashes, proper format)
   * @param {string} zoneName - The original zone name
   * @param {string} type - The sensor type  
   * @returns {string} - Format: "Porta Studio Batteria"
   */
  function createElegantName(zoneName, type) {
    if (!zoneName || typeof zoneName !== 'string') {
      return 'Unknown Device'
    }
    
    let cleaned = zoneName.trim()
    if (cleaned === '') {
      return 'Unknown Device'
    }
    
    // Step 1: Remove zone prefix for display
    cleaned = cleaned.replace(/^zona?_?\d+_?/gi, '')
    
    // Step 2: Handle duplications  
    const parts = cleaned.split(/[_\s-]+/).filter(part => part.length > 0)
    
    // Remove complete duplication patterns
    const halfLength = Math.floor(parts.length / 2)
    if (parts.length % 2 === 0 && halfLength > 0) {
      const firstHalf = parts.slice(0, halfLength)
      const secondHalf = parts.slice(halfLength)
      if (firstHalf.every((part, index) => part.toLowerCase() === secondHalf[index].toLowerCase())) {
        const displayBase = firstHalf
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ')
        
        const typeDisplay = getTypeDisplayName(type)
        const result = typeDisplay ? `${displayBase} ${typeDisplay}` : displayBase
        logger.debug(`createElegantName: "${zoneName}" (${type}) -> "${result}"`)
        return result
      }
    }
    
    // Remove simple duplicates
    const deduped = []
    for (let i = 0; i < parts.length; i++) {
      const currentPart = parts[i]
      if (i === 0 || currentPart.toLowerCase() !== parts[i - 1].toLowerCase()) {
        deduped.push(currentPart)
      }
    }
    
    const displayBase = deduped
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
    
    const typeDisplay = getTypeDisplayName(type)
    const result = typeDisplay ? `${displayBase} ${typeDisplay}` : displayBase
    
    logger.debug(`createElegantName: "${zoneName}" (${type}) -> "${result}"`)
    return result || 'Unknown Device'
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
      // Use elegant name for device display  
      name: createElegantName(zone.name, ''),  // "Finestra Sx Sala"
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
    const cleanEntityBase = cleanZoneName(zone.name)  // "zone_15_pir_sala"
    const entityName = `${cleanEntityBase}_stato`     // "zone_15_pir_sala_stato"
    
    logger.debug(`configSensorFault: Zone ${zone.id}, entity name: "${entityName}"`)
    
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
        // Use entity name directly
        name: entityName,
        // Override unique_id to match entity name
        unique_id: `${alarmId}_${entityName}_v10`
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
    const cleanEntityBase = cleanZoneName(zone.name)  // "zone_15_pir_sala"  
    const entityName = `${cleanEntityBase}_batteria`  // "zone_15_pir_sala_batteria"
    
    logger.debug(`configSensorBattery: Zone ${zone.id}, entity name: "${entityName}"`)
    
    const message = configBinarySensors(zone, i, 'Battery', 'battery', 'lowbat', 
      config.hadiscovery.topics.sensorBatteryConfig, false, entityName)
    
    if (!reset) {
      message.payload.unique_id = `${alarmId}_${entityName}_v10`
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
    const cleanEntityBase = cleanZoneName(zone.name)      // "zone_15_pir_sala"
    const entityName = `${cleanEntityBase}_connessione`   // "zone_15_pir_sala_connessione"  
    
    logger.debug(`configSensorConnectivity: Zone ${zone.id}, entity name: "${entityName}"`)
    
    const message = configBinarySensors(zone, i, 'Connectivity', 'connectivity', 'wirelessLoss', 
      config.hadiscovery.topics.sensorConnectivityConfig, true, entityName)
    
    if (!reset) {
      message.payload.unique_id = `${alarmId}_${entityName}_v10`
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
    const cleanEntityBase = cleanZoneName(zone.name)  // "zone_15_pir_sala"
    const entityName = cleanEntityBase               // "zone_15_pir_sala" (no suffix for main)
    
    logger.debug(`configSensorAlarm: Zone ${zone.id}, entity name: "${entityName}"`)
    
    const message = configBinarySensors(zone, i, 'Alarm', 'safety', 'alarm', 
      config.hadiscovery.topics.sensorAlarmConfig, false, entityName)
    
    if (!reset) {
      message.payload.unique_id = `${alarmId}_${entityName}_v10`
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

      const cleanEntityBase = cleanZoneName(zone.name)  // "zone_15_pir_sala"
      const entityName = `${cleanEntityBase}_bypass`    // "zone_15_pir_sala_bypass"
      
      logger.debug(`configSwitchBypass: Zone ${zone.id}, entity name: "${entityName}"`)
      
      payload = {
        name: entityName,  // Use entity name directly
        availability: getAvailability(),
        state_topic: stateTopic,
        value_template: `{{ '${config.payloads.sensorOn}' if value_json.bypass else '${config.payloads.sensorOff}' }}`,
        payload_on: config.payloads.sensorOn,
        payload_off: config.payloads.sensorOff,
        command_topic: _getTopic(config.topics.alarm.bypass, {
          zoneId: zoneId
        }),
        unique_id: `${alarmId}_${entityName}_v10`,
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

