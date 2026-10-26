import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSearchRegex, regexForAct, sanitizeActRegexes } from '../electron/search-regex.ts'

test('a pasted regex loses its stray line break and nothing else', () => {
  // The case this exists for: copied from a web page with the newline attached,
  // which would sit invisibly in the game's one-line search box.
  assert.equal(normalizeSearchRegex('"-\\w-.-|nne|rint"\n'), '"-\\w-.-|nne|rint"')
  assert.equal(normalizeSearchRegex('\r\n  ho" r|r-r  \r\n'), 'ho" r|r-r')
})

test('inner spaces are part of the pattern and stay', () => {
  assert.equal(normalizeSearchRegex('"movement speed"'), '"movement speed"')
  assert.equal(normalizeSearchRegex('a  b'), 'a  b')
})

test('anything that is not a string clears the setting', () => {
  // The IPC handler gets whatever the renderer sends; a broken patch must not
  // store "undefined" as your regex.
  assert.equal(normalizeSearchRegex(undefined), '')
  assert.equal(normalizeSearchRegex(null), '')
  assert.equal(normalizeSearchRegex(42), '')
  assert.equal(normalizeSearchRegex('   '), '')
})

test('a per-act regex covers its acts; the general one the rest', () => {
  const perAct = [
    { from: 1, to: 3, regex: 'early' },
    { from: 3, to: 5, regex: 'later' }
  ]
  assert.equal(regexForAct('general', perAct, 1), 'early')
  assert.equal(regexForAct('general', perAct, 3), 'early') // the first match wins
  assert.equal(regexForAct('general', perAct, 4), 'later')
  assert.equal(regexForAct('general', perAct, 6), 'general')
  assert.equal(regexForAct('', perAct, 6), null)
  // no log yet, no act: the general one
  assert.equal(regexForAct('general', perAct, null), 'general')
  assert.equal(regexForAct('', perAct, null), null)
})

test('per-act entries are cleaned before they are stored', () => {
  assert.deepEqual(
    sanitizeActRegexes([
      { from: 4, to: 2, regex: ' "a|b"\n' }, // backwards, stray line break
      { from: 0, to: 12, regex: 'x' }, // outside 1-10
      { from: 1, to: 2, regex: '  ' }, // a row not filled in yet
      { from: 1.5, to: 2, regex: 'y' },
      null,
      'nonsense'
    ]),
    [
      { from: 2, to: 4, regex: '"a|b"' },
      { from: 1, to: 10, regex: 'x' }
    ]
  )
  assert.deepEqual(sanitizeActRegexes(undefined), [])
  assert.equal(sanitizeActRegexes(Array.from({ length: 50 }, () => ({ from: 1, to: 1, regex: 'r' }))).length, 20)
})
