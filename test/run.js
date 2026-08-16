import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import messageCompare from './message-compare.test.js'
import discovery from './discovery.test.js'
import discoveryReset from './discovery-reset.test.js'
import reconnect from './reconnect.test.js'

/**
 * Suites that drive the real bridge over a throwaway MQTT broker. They take
 * around two minutes in total, most of it spent waiting out the reconnection
 * backoff and the polling watchdog, which are the behaviours worth having.
 */
const inProcess = [
  ['message comparison', messageCompare],
  ['discovery payloads', discovery],
  ['discovery reset', discoveryReset],
  ['reconnection', reconnect]
]

/** the polling suite swaps out the "ialarm" module, so it needs its own process */
const separate = () => new Promise(resolve => {
  const child = spawn(process.execPath, [
    '--import', fileURLToPath(new URL('./helpers/register-fake.js', import.meta.url)),
    fileURLToPath(new URL('./polling.runner.js', import.meta.url))
  ], { stdio: 'inherit' })
  child.on('exit', code => resolve(code === 0))
})

const failed = []
for (const [name, suite] of inProcess) {
  const { failures } = await suite()
  failures.forEach(f => failed.push(`${name}: ${f}`))
}
if (!await separate()) {
  failed.push('polling: see above')
}

console.log('\n========================================')
if (failed.length === 0) {
  console.log('all suites passed')
  process.exit(0)
}
console.log(`${failed.length} failed:`)
failed.forEach(f => console.log(`  - ${f}`))
process.exit(1)
