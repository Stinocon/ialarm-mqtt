/**
 * Minimal check helper: enough to report which expectation failed and why,
 * without pulling a test framework into a project with three dependencies.
 */
export const Checks = function (title) {
  let passed = 0
  const failures = []

  console.log(`\n=== ${title} ===`)

  this.check = function (label, condition, detail) {
    if (condition) {
      passed++
      console.log(`  ok   ${label}`)
    } else {
      failures.push(label)
      console.log(`  FAIL ${label}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`)
    }
  }

  this.section = function (name) {
    console.log(`  -- ${name}`)
  }

  this.result = function () {
    console.log(`  ${passed} ok, ${failures.length} failed`)
    return { passed, failures }
  }
}

export const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
