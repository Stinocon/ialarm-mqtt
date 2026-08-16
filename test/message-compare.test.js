import { MessageCompare } from '../utils/message-compare.js'
import { Checks } from './helpers/assert.js'

/**
 * MessageCompare decides whether a payload is worth republishing. If it misses
 * a change, the topic goes stale until the cache expires — up to five minutes
 * of a Home Assistant entity showing the wrong thing.
 */
export default async function () {
  const t = new Checks('message comparison')

  t.section('flat payloads')
  t.check('spots a changed value', MessageCompare({ a: 1 }, { a: 2 }).length > 0)
  t.check('stays quiet on identical payloads', MessageCompare({ a: 1, b: 'x' }, { a: 1, b: 'x' }).length === 0)
  t.check('spots an added key', MessageCompare({ a: 1 }, { a: 1, b: 2 }).length > 0)
  t.check('spots a removed key', MessageCompare({ a: 1, b: 2 }, { a: 1 }).length > 0)
  t.check('spots a booleans flip', MessageCompare({ lowbat: false }, { lowbat: true }).length > 0)
  t.check('survives an empty side', MessageCompare(undefined, { a: 1 }).length > 0)

  t.section('nested payloads (connectionStatus lives one level down)')
  t.check('spots a change inside an object',
    MessageCompare({ s: { message: 'OK' } }, { s: { message: 'boom' } }).length > 0,
    MessageCompare({ s: { message: 'OK' } }, { s: { message: 'boom' } }))
  t.check('stays quiet on identical nested payloads',
    MessageCompare({ s: { message: 'OK', n: 1 } }, { s: { message: 'OK', n: 1 } }).length === 0)
  t.check('spots a change two levels down',
    MessageCompare({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } }).length > 0)
  t.check('spots a change inside an array',
    MessageCompare({ zones: [{ id: 1, ok: true }] }, { zones: [{ id: 1, ok: false }] }).length > 0)

  t.section('the payload this actually broke')
  const before = { cacheClear: 'OFF', connectionStatus: { connected: true, message: 'OK', date: '2026-08-16T10:00:00.000Z' } }
  const after = { cacheClear: 'OFF', connectionStatus: { connected: false, message: 'connect ECONNREFUSED', date: '2026-08-16T10:00:05.000Z' } }
  t.check('a lost panel connection is reported right away', MessageCompare(before, after).length > 0, MessageCompare(before, after))

  t.section('cache bookkeeping')
  t.check('lastChecked alone is not a change',
    MessageCompare({ a: 1, lastChecked: 1 }, { a: 1, lastChecked: 2 }).length === 0,
    MessageCompare({ a: 1, lastChecked: 1 }, { a: 1, lastChecked: 2 }))

  return t.result()
}
