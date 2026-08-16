import { MqttPublisher } from '../utils/mqtt-publisher.js'
import { Checks, wait } from './helpers/assert.js'
import { startBroker } from './helpers/broker.js'
import { testConfig, testZones as zones, testDeviceInfo as deviceInfo } from './helpers/config.js'

/**
 * Clearing every /config topic deletes and recreates the entities: Home
 * Assistant shows them unknown for a moment and their history gets a hole, so
 * it must only happen when it is asked for.
 */
const scenario = async function (t, label, { on, reset }) {
  const broker = await startBroker()
  const publisher = new MqttPublisher(testConfig(broker.port))
  await new Promise(resolve => publisher.connectAndSubscribe({}, resolve, () => {}))

  const started = Date.now()
  publisher.publishHomeAssistantMqttDiscovery(zones, on, deviceInfo, reset)
  await wait(7000)

  const configs = broker.messages.filter(m => m.topic.endsWith('/config'))
  const cleared = configs.filter(m => m.payload === '')
  const published = configs.filter(m => m.payload !== '')
  const firstEntity = broker.messages.find(m => m.topic.endsWith('/config') && m.payload !== '')
  await broker.stop()

  // the 5s pause before publishing the entities exists only to let Home
  // Assistant digest a cleanup: without one there is nothing to wait for
  const delay = firstEntity ? firstEntity.at - started : -1
  t.section(`${label} (on=${on}, reset=${reset}): ${cleared.length} cleared, ${published.length} published, first entity after ${delay}ms`)
  return { cleared: cleared.length, published: published.length, delay }
}

export default async function () {
  const t = new Checks('discovery reset is opt-in')

  const start = await scenario(t, 'normal start', { on: true, reset: false })
  t.check('start deletes nothing', start.cleared === 0, start.cleared)
  t.check('start publishes the entities', start.published > 0, start.published)
  t.check('start does not wait for a cleanup it never sent', start.delay >= 0 && start.delay < 1000, start.delay + 'ms')

  const explicit = await scenario(t, 'explicit reset', { on: true, reset: true })
  t.check('explicit reset clears the configs', explicit.cleared > 0, explicit.cleared)
  t.check('and republishes the same entities', explicit.published === start.published, { reset: explicit.published, start: start.published })
  t.check('the cleanup covers every addressable zone', explicit.cleared > explicit.published * 5, { cleared: explicit.cleared, published: explicit.published })
  t.check('with a cleanup it does wait before publishing', explicit.delay > 4500 && explicit.delay < 6500, explicit.delay + 'ms')

  const disabled = await scenario(t, 'discovery disabled', { on: false, reset: false })
  t.check('disabled discovery cleans up even without asking', disabled.cleared > 0, disabled.cleared)
  t.check('disabled discovery publishes nothing', disabled.published === 0, disabled.published)

  return t.result()
}
