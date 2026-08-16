// Installs the fake "ialarm" module hook. Loaded with `node --import` so it is
// in place before index.js pulls the real package in.
import module from 'node:module'

const loader = new URL('./fake-ialarm-loader.js', import.meta.url).href

if (typeof module.registerHooks === 'function') {
  const hooks = await import(loader)
  module.registerHooks({ resolve: hooks.resolve })
} else {
  module.register(loader)
}
