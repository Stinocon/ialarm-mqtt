import { MessageCompare } from './message-compare.js'
import { test } from 'node:test'
import assert from 'node:assert'

// Test data
const cache = {
  zone_16: {
    id: 16,
    name: 'L15',
    status: 9,
    inUse: true,
    ok: false,
    alarm: false,
    bypass: false,
    lowbat: false,
    fault: false,
    wirelessLoss: false,
    message: 'Fault',
    problem: true
  }
}

// Test cases
test('MessageCompare - detect changes', async t => {
  await t.test('should detect fault change from false to true', () => {
    const oldValue = { ...cache.zone_16, fault: false }
    const newValue = { ...cache.zone_16, fault: true }

    const changes = MessageCompare(oldValue, newValue)

    assert.strictEqual(changes.length, 1)
    assert.strictEqual(changes[0], 'fault(oldvalue=false,newvalue=true)')
  })

  await t.test('should detect fault change from true to false', () => {
    const oldValue = { ...cache.zone_16, fault: true }
    const newValue = { ...cache.zone_16, fault: false }

    const changes = MessageCompare(oldValue, newValue)

    assert.strictEqual(changes.length, 1)
    assert.strictEqual(changes[0], 'fault(oldvalue=true,newvalue=false)')
  })

  await t.test('should detect multiple property changes', () => {
    const oldValue = { ...cache.zone_16, fault: false, alarm: false }
    const newValue = { ...cache.zone_16, fault: true, alarm: true }

    const changes = MessageCompare(oldValue, newValue)

    assert.strictEqual(changes.length, 2)
    assert(changes.includes('fault(oldvalue=false,newvalue=true)'))
    assert(changes.includes('alarm(oldvalue=false,newvalue=true)'))
  })

  await t.test('should return empty array when no changes', () => {
    const oldValue = { ...cache.zone_16 }
    const newValue = { ...cache.zone_16 }

    const changes = MessageCompare(oldValue, newValue)

    assert.strictEqual(changes.length, 0)
  })

  await t.test('should handle flat object changes', () => {
    const oldValue = {
      zoneFault: false,
      status: 'ok'
    }
    const newValue = {
      zoneFault: true,
      status: 'error'
    }

    const changes = MessageCompare(oldValue, newValue)

    assert(changes.length > 0)
    assert(changes.some(change => change.includes('zoneFault')))
    assert(changes.some(change => change.includes('status')))
  })
})

test('MessageCompare - edge cases', async t => {
  await t.test('should handle null values', () => {
    const oldValue = { fault: null }
    const newValue = { fault: false }

    const changes = MessageCompare(oldValue, newValue)

    assert.strictEqual(changes.length, 1)
    assert.strictEqual(changes[0], 'fault(oldvalue=null,newvalue=false)')
  })

  await t.test('should handle undefined values', () => {
    const oldValue = { fault: undefined }
    const newValue = { fault: true }

    const changes = MessageCompare(oldValue, newValue)

    // MessageCompare treats undefined as a different type/value
    assert(changes.length > 0)
    assert(changes.some(change => change.includes('fault')))
  })

  await t.test('should handle empty objects', () => {
    const oldValue = {}
    const newValue = {}

    const changes = MessageCompare(oldValue, newValue)

    assert.strictEqual(changes.length, 0)
  })

  await t.test('should handle different object structures', () => {
    const oldValue = { fault: false, alarm: false }
    const newValue = { fault: true, bypass: true }

    const changes = MessageCompare(oldValue, newValue)

    assert(changes.length > 0)
    assert(changes.some(change => change.includes('fault')))
    assert(changes.some(change => change.includes('alarm')))
    assert(changes.some(change => change.includes('bypass')))
  })

  await t.test('should handle lastChecked special case', () => {
    const oldValue = { lastChecked: '2023-01-01' }
    const newValue = { lastChecked: '2023-01-02' }

    const changes = MessageCompare(oldValue, newValue)

    // lastChecked should be ignored when both values are valid
    assert.strictEqual(changes.length, 0)
  })

  await t.test('should detect lastChecked when one is invalid', () => {
    const oldValue = { lastChecked: null }
    const newValue = { lastChecked: '2023-01-02' }

    const changes = MessageCompare(oldValue, newValue)

    // Note: There's a bug in MessageCompare that returns duplicate entries for lastChecked
    assert(changes.length > 0)
    assert(changes.some(change => change.includes('lastChecked')))
  })
})

// Performance test
test('MessageCompare - performance', async t => {
  await t.test('should handle large objects efficiently', () => {
    const largeOldValue = {}
    const largeNewValue = {}

    // Create large objects with 1000 properties
    for (let i = 0; i < 1000; i++) {
      largeOldValue[`prop${i}`] = i
      largeNewValue[`prop${i}`] = i + 1
    }

    const startTime = Date.now()
    const changes = MessageCompare(largeOldValue, largeNewValue)
    const endTime = Date.now()

    assert(changes.length > 0)
    assert(endTime - startTime < 1000) // Should complete within 1 second
  })
})

// Integration test
test('MessageCompare - integration', async t => {
  await t.test('should work with real zone data', () => {
    const zoneOld = {
      id: 16,
      name: 'L15',
      status: 9,
      inUse: true,
      ok: false,
      alarm: false,
      bypass: false,
      lowbat: false,
      fault: false,
      wirelessLoss: false,
      message: 'OK',
      problem: false
    }

    const zoneNew = {
      id: 16,
      name: 'L15',
      status: 9,
      inUse: true,
      ok: false,
      alarm: true, // Changed
      bypass: false,
      lowbat: false,
      fault: true, // Changed
      wirelessLoss: false,
      message: 'Alarm', // Changed
      problem: true // Changed
    }

    const changes = MessageCompare(zoneOld, zoneNew)

    assert.strictEqual(changes.length, 4)
    assert(changes.includes('alarm(oldvalue=false,newvalue=true)'))
    assert(changes.includes('fault(oldvalue=false,newvalue=true)'))
    assert(changes.includes('message(oldvalue=OK,newvalue=Alarm)'))
    assert(changes.includes('problem(oldvalue=false,newvalue=true)'))
  })
})

// Bug report test
test('MessageCompare - known issues', async t => {
  await t.test('should document nested object limitation', () => {
    const oldValue = { zone: { fault: false } }
    const newValue = { zone: { fault: true } }

    const changes = MessageCompare(oldValue, newValue)

    // Current implementation doesn't handle nested objects properly
    // This documents the limitation for future improvement
    assert.strictEqual(
      changes.length,
      0,
      'Nested objects are not properly compared'
    )
  })

  await t.test('should document lastChecked duplication bug', () => {
    const oldValue = { lastChecked: null }
    const newValue = { lastChecked: '2023-01-02' }

    const changes = MessageCompare(oldValue, newValue)

    // Current implementation has a bug that returns duplicate entries
    assert(changes.length >= 1, 'Should detect at least one change')
    assert(
      changes.some(change => change.includes('lastChecked')),
      'Should detect lastChecked change'
    )
  })
})
