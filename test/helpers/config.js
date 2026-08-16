import { configHandler } from '../../utils/config-handler.js'

/**
 * A config built the same way a real install builds one, then pointed at the
 * throwaway broker. Written to a temp file because readConfigFile is the entry
 * point users go through, so the defaults it fills in are part of what we test.
 */
export const testConfig = function (port, overrides) {
  const config = configHandler.readConfigFile(new URL('./test.config.yaml', import.meta.url).pathname)
  config.mqtt.port = port
  config.mqtt.host = '127.0.0.1'
  config.verbose = false
  if (overrides) {
    Object.assign(config.server, overrides.server || {})
    Object.assign(config.hadiscovery, overrides.hadiscovery || {})
  }
  return config
}

export const testZones = [
  { id: 1, name: 'Finestra Cucina', typeId: 2, type: 'Perimetrale' },
  { id: 6, name: 'Bagno', typeId: 3, type: 'Interna' }
]

export const testDeviceInfo = { mac: 'AA:BB:CC:DD:EE:FF', name: 'iAlarm' }
