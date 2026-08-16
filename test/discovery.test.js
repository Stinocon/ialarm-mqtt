import IAlarmHaDiscovery from '../utils/mqtt-hadiscovery.js'
import { configHandler } from '../utils/config-handler.js'
import { Diagnostics } from '../utils/diagnostics.js'
import { Checks } from './helpers/assert.js'
import { testZones as zones, testDeviceInfo as deviceInfo } from './helpers/config.js'

/**
 * The discovery payloads are where this fork has broken itself before: every
 * change to entity naming shifted unique_id and silently dropped the user's
 * manual renames. These checks pin the identifiers down.
 */
export default async function () {
  const t = new Checks('discovery payloads')
  const config = configHandler.readHassOsOptions(new URL('../templates/hassos.options.json', import.meta.url).pathname)
  // that sample options file turns verbose on, which buries the results
  config.verbose = false
  const messages = (cfg, reset) => new IAlarmHaDiscovery(cfg, zones, reset, deviceInfo).createMessages()

  t.section('config defaults')
  t.check('diagnostics feature on by default', config.server.features.includes('diagnostics'), config.server.features)
  t.check('polling_diagnostics defaults to 60s', config.server.polling_diagnostics === 60000, config.server.polling_diagnostics)
  t.check('resetOnStart defaults to off', config.hadiscovery.resetOnStart === false, config.hadiscovery.resetOnStart)
  t.check('diagnostics topic comes from the template', config.topics.diagnostics === 'ialarm/alarm/diagnostics', config.topics.diagnostics)

  t.section('entities published')
  const on = messages(config, false)
  const diagTopics = [
    'homeassistant/sensor/ialarm/diagnostics/config',
    'homeassistant/sensor/ialarm/last_poll/config',
    'homeassistant/sensor/ialarm/connection_errors/config',
    'homeassistant/sensor/ialarm/panel_disconnections/config'
  ]
  diagTopics.forEach(topic => t.check(`publishes ${topic}`, on.some(m => m.topic === topic)))

  const diag = on.find(m => m.topic === diagTopics[0]).payload
  const lastPoll = on.find(m => m.topic === diagTopics[1]).payload
  const errors = on.find(m => m.topic === diagTopics[2]).payload

  t.check('health reads the diagnostics topic', diag.state_topic === 'ialarm/alarm/diagnostics', diag.state_topic)
  t.check('health carries the payload as attributes', diag.json_attributes_template === '{{ value_json | tojson }}')
  t.check('health sits on the alarm device', diag.device.identifiers === 'alarm_mqtt_AABBCCDDEEFF_ialarmv2', diag.device.identifiers)
  t.check('diagnostics have no availability block', diag.availability === undefined && lastPoll.availability === undefined)
  t.check('last poll is a timestamp', lastPoll.device_class === 'timestamp')
  t.check('last poll template survives a missing value',
    lastPoll.value_template === "{{ value_json.lastPollOkAt if value_json.lastPollOkAt is defined else '' }}", lastPoll.value_template)
  t.check('counters are statistics-friendly', errors.state_class === 'total_increasing')

  t.section('identifiers are stable (renames depend on them)')
  const zoneFault = on.find(m => m.topic === 'homeassistant/binary_sensor/ialarm_zone_6/fault/config')
  t.check('zone fault unique_id unchanged', zoneFault && zoneFault.payload.unique_id === 'ialarm_sicurezza_bagno_fault_6_v12', zoneFault && zoneFault.payload.unique_id)
  const zoneId = on.find(m => m.topic === 'homeassistant/sensor/ialarm_zone_6/id/config')
  t.check('zone id entity_id unchanged', zoneId && zoneId.payload.default_entity_id === 'sensor.sicurezza_bagno_ialarm_id_zona', zoneId && zoneId.payload.default_entity_id)
  const panel = on.find(m => m.topic === 'homeassistant/alarm_control_panel/ialarm_1/config')
  t.check('alarm panel unique_id unchanged', panel && panel.payload.unique_id === 'alarm_mqtt_AABBCCDDEEFF_ialarmv2_unit', panel && panel.payload.unique_id)
  const uniqueIds = on.filter(m => m.payload && m.payload.unique_id).map(m => m.payload.unique_id)
  t.check('no duplicate unique_id', new Set(uniqueIds).size === uniqueIds.length)

  t.section('reset and feature flag')
  const reset = messages(config, true)
  diagTopics.forEach(topic => {
    const m = reset.find(x => x.topic === topic)
    t.check(`reset clears ${topic.split('/').slice(-2)[0]}`, m && m.payload === '')
  })
  const off = JSON.parse(JSON.stringify(config))
  off.server.features = off.server.features.filter(f => f !== 'diagnostics')
  const without = messages(off, false)
  t.check('feature off removes exactly the four sensors', without.length === on.length - 4, { off: without.length, on: on.length })

  t.section('diagnostics payload')
  const d = new Diagnostics(config)
  let payload = d.payload()
  t.check('starts offline', payload.health === 'offline', payload.health)
  t.check('no lastPollOkAt before the first read', !('lastPollOkAt' in JSON.parse(JSON.stringify(payload))))
  t.check('no credentials in the payload', !JSON.stringify(payload).includes(config.server.password))

  d.onPanelConnected()
  d.onError(new Error('boom'))
  d.onPanelDisconnected()
  d.setZonesLoaded(18)
  d.onPollAttempt()
  d.onPollSuccess()
  d.onReconnectScheduled(5000)
  payload = d.payload()
  t.check('counts errors', payload.errorCount === 1, payload.errorCount)
  t.check('counts connections and disconnections', payload.connections === 1 && payload.disconnections === 1)
  t.check('records a successful read', payload.pollOkCount === 1 && typeof payload.lastPollOkAt === 'string')
  t.check('records the queued reconnection', payload.reconnectAttempts === 1 && typeof payload.nextReconnectAt === 'string', payload.nextReconnectAt)
  t.check('timestamps are ISO8601 with a zone', /Z$/.test(payload.lastUpdated))

  return t.result()
}
