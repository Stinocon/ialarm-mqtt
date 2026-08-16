import { Checks, wait } from './helpers/assert.js'
import { startBroker } from './helpers/broker.js'

/**
 * The status polling has to pause while a command is in flight — the panel
 * accepts one TCP connection at a time — and resume afterwards. It is the
 * command's answer that resumes it, so a lost command needs a watchdog.
 *
 * Driven through a fake "ialarm" module so the real index.js runs without a
 * panel; the loader is installed by run.js before anything imports it.
 */
export default async function () {
  const t = new Checks('polling suspended by commands')

  const { ialarmMqtt } = await import('../index.js')
  const fake = await import('ialarm')
  if (!fake.__test) {
    t.check('the fake panel is installed (run through `npm test`)', false)
    return t.result()
  }

  const { testConfig } = await import('./helpers/config.js')
  const broker = await startBroker()
  const config = testConfig(broker.port)
  const commandTopic = config.topics.alarm.command.replace('${areaId}', '1')

  ialarmMqtt(config)
  await wait(1200)

  t.section('panel connected')
  fake.__test.resetCounters()
  fake.__test.connect()
  await wait(300)
  fake.__test.netAndZones()
  await wait(1500)
  t.check('the status polling runs', fake.__test.counters().fetch > 2, fake.__test.counters())

  t.section('while a command is in flight')
  broker.publish(commandTopic, 'armed_away')
  // let the command land before counting: the polling ticks every 300ms and a
  // tick can slip through in the milliseconds the command spends on MQTT
  await wait(600)
  fake.__test.resetCounters()
  const diagnosticsBefore = broker.topics('/alarm/diagnostics').length
  await wait(14000)
  t.check('the polling is actually suspended', fake.__test.counters().fetch === 0, fake.__test.counters())
  t.check('service timers keep running', broker.topics('/alarm/diagnostics').length > diagnosticsBefore,
    { before: diagnosticsBefore, after: broker.topics('/alarm/diagnostics').length })

  t.section('command answered')
  fake.__test.resetCounters()
  fake.__test.commandResponse()
  await wait(1500)
  t.check('the answer resumes the polling', fake.__test.counters().fetch > 2, fake.__test.counters())

  t.section('command never answered')
  broker.publish(commandTopic, 'armed_away')
  await wait(2000)
  fake.__test.resetCounters()
  await wait(3000)
  t.check('without an answer the polling stays down', fake.__test.counters().fetch === 0, fake.__test.counters())

  console.log('  -- waiting out the 30s watchdog...')
  await wait(30000)
  fake.__test.resetCounters()
  await wait(1500)
  t.check('the watchdog brings the polling back', fake.__test.counters().fetch > 2, fake.__test.counters())

  // same as the reconnection suite: the bridge is still running, so the broker
  // stays up and this process exits instead
  return t.result()
}
