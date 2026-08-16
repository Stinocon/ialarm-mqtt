import { ialarmMqtt } from '../index.js'
import { Checks, wait } from './helpers/assert.js'
import { startBroker } from './helpers/broker.js'
import { testConfig } from './helpers/config.js'

/**
 * With the panel unreachable at start-up the bridge used to stop for good: the
 * retry was gated behind an error count that this exact scenario can never
 * reach. Here nothing listens on the panel port, so every attempt fails.
 */
export default async function () {
  const t = new Checks('reconnection to an unreachable panel')
  const broker = await startBroker()
  const started = Date.now()

  const snapshots = []
  const config = testConfig(broker.port)
  ialarmMqtt(config)

  // 40s covers the first four attempts: 5s, 10s, 20s, 40s
  const deadline = Date.now() + 40000
  while (Date.now() < deadline) {
    await wait(1000)
    const payload = broker.payloadOf(config.topics.diagnostics)
    if (!payload) {
      continue
    }
    const p = JSON.parse(payload)
    const last = snapshots[snapshots.length - 1]
    if (!last || last.attempts !== p.reconnectAttempts) {
      snapshots.push({
        at: Math.round((Date.now() - started) / 1000),
        health: p.health,
        attempts: p.reconnectAttempts,
        errors: p.errorCount,
        due: p.nextReconnectAt ? Math.round((new Date(p.nextReconnectAt) - Date.now()) / 1000) : null
      })
    }
  }
  // the broker stays up on purpose: the bridge exits the process when it loses
  // MQTT, which would take the whole run down with it
  snapshots.forEach(s => t.section(`t+${s.at}s ${s.health} · attempt ${s.attempts} · ${s.errors} errors · next in ${s.due}s`))

  const last = snapshots[snapshots.length - 1]
  t.check('it keeps retrying (it used to stop after one)', last && last.attempts > 2, last && last.attempts)
  t.check('errors keep being counted', last && last.errors > 2, last && last.errors)
  t.check('health never pretends to be ok', snapshots.every(s => ['offline', 'starting'].includes(s.health)), snapshots.map(s => s.health))
  t.check('attempts only ever go up', snapshots.every((s, i) => i === 0 || s.attempts >= snapshots[i - 1].attempts))
  t.check('the payload announces when the next attempt is due', snapshots.every(s => s.due === null || s.due >= 0), snapshots.map(s => s.due))
  t.check('the wait grows between attempts', snapshots.length >= 3 && snapshots[snapshots.length - 1].at - snapshots[snapshots.length - 2].at >
    snapshots[1].at - snapshots[0].at, snapshots.map(s => s.at))

  return t.result()
}
