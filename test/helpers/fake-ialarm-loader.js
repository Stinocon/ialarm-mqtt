/**
 * Module hook that answers imports of "ialarm" with the fake above, so the
 * bridge can be driven without a panel. Registered by polling.test.js.
 */
const FAKE = new URL('./fake-ialarm.js', import.meta.url).href

export function resolve (specifier, context, next) {
  if (specifier === 'ialarm') {
    return { shortCircuit: true, url: FAKE }
  }
  return next(specifier, context)
}
