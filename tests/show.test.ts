import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SHOW_ALL, SHOW_ITEMS, sanitizeShow } from '../electron/show-rules.ts'

test('everything is shown until switched off', () => {
  assert.deepEqual(sanitizeShow(undefined), SHOW_ALL)
  for (const k of SHOW_ITEMS) assert.equal(SHOW_ALL[k], true, k)
})

test('switches are made whole: wrong or missing ones keep what was there', () => {
  const s = sanitizeShow({ bandit: false, pantheon: 'no', bogus: false })
  assert.deepEqual(s, { ...SHOW_ALL, bandit: false })
  assert.equal('bogus' in s, false)
  // a patch over what's stored keeps the rest
  const stored = { ...SHOW_ALL, links: false }
  assert.deepEqual(sanitizeShow({ lab: false }, stored), { ...stored, lab: false })
  assert.deepEqual(sanitizeShow('nonsense', stored), stored)
})
