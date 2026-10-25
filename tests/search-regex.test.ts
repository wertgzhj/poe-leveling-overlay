import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSearchRegex } from '../electron/search-regex.ts'

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
