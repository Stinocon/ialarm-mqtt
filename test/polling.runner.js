// Entry point for the polling suite, run in its own process: it replaces the
// "ialarm" module, which the other suites need for real.
import suite from './polling.test.js'

const { failures } = await suite()
process.exit(failures.length > 0 ? 1 : 0)
