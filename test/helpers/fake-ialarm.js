/**
 * Stand-in for the "ialarm" package: enough surface to drive index.js without
 * a panel. Installed over the real module by fake-ialarm-loader.js, so the
 * code under test is the real one, untouched.
 */
const counters = { fetch: 0, commands: [] }
let status = 0 // 0 disconnected, 4 ready
const cbs = {}

const ZONES = [
  { id: 1, name: 'Finestra Cucina', typeId: 2, type: 'Perimetrale' },
  { id: 6, name: 'Bagno', typeId: 3, type: 'Interna' }
]

export const MeianConstants = { listLimit: { GetByWay: 128 }, cid: {} }

export const MeianLogger = () => ({
  info: () => {}, debug: () => {}, warn: () => {}, error: () => {}, log: () => {}, warning: () => {}
})

export const MeianConnection = {
  status: {
    text: () => (status === 0 ? 'DISCONNECTED' : 'CONNECTED_READY'),
    isReady: () => status === 4,
    isPending: () => false,
    isDisconnected: () => status === 0
  }
}

export const MeianStatusDecoder = {
  fromStatusToTcpValue: (c) => c || 'AWAY_ARM',
  fromTcpValueToStatus: (v) => v
}

export const MeianDataHandler = {
  getZoneInfo: () => ZONES,
  getZoneStatus: () => ({ status: { status_1: 'DISARMED' }, zones: ZONES })
}

export const MeianSocket = function () {
  return {
    connect: () => { status = 4 },
    disconnect: () => { status = 0; cbs.disconnected && cbs.disconnected('error') },
    executeCommand: async (commands) => {
      const list = Array.isArray(commands) ? commands : [commands]
      counters.commands.push(list.join('+'))
      if (list.some(c => ['GetByWay', 'GetAlarmStatus', 'GetArea'].includes(c))) {
        counters.fetch++
      }
    },
    onConnected: (cb) => { cbs.connected = cb },
    onResponse: (cb) => { cbs.response = cb },
    onPush: (cb) => { cbs.push = cb },
    onDisconnected: (cb) => { cbs.disconnected = cb },
    onError: (cb) => { cbs.error = cb }
  }
}

/** Test-only handle to drive the fake panel */
export const __test = {
  connect: () => { status = 4; cbs.connected && cbs.connected('ok') },
  /** the panel answers with mac address and zone names: polling needs both */
  netAndZones: () => cbs.response && cbs.response({
    payloads: { data: { GetNet: { mac: 'AA:BB:CC:DD:EE:FF', name: 'iAlarm' }, GetZone: { zones: ZONES } } }
  }),
  /** the answer to an arm/disarm, which is what restarts the polling */
  commandResponse: () => cbs.response && cbs.response({
    payloads: { data: { SetAlarmStatus: 'ARMED_AWAY' } }
  }),
  counters: () => ({ fetch: counters.fetch, commands: counters.commands.slice(-3) }),
  resetCounters: () => { counters.fetch = 0; counters.commands = [] }
}
