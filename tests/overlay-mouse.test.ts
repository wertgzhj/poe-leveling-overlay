import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldIgnoreMouse } from '../electron/overlay-mouse.ts'

const base = { moveMode: false, clickThrough: false, settingsOpen: false, hoverUi: false }

test('move mode grabs the whole window (never passes through)', () => {
  assert.equal(shouldIgnoreMouse({ ...base, moveMode: true }), false)
  assert.equal(shouldIgnoreMouse({ ...base, moveMode: true, clickThrough: true }), false)
})

test('plain click-through passes everything to the game', () => {
  assert.equal(shouldIgnoreMouse({ ...base, clickThrough: true, hoverUi: false }), true)
  assert.equal(shouldIgnoreMouse({ ...base, clickThrough: true, hoverUi: true }), true)
})

test('settings stays interactive AND its empty area passes through (the bug)', () => {
  // Even when click-through is the user's default, an open Settings panel must
  // behave like interactive mode: over the panel -> captured (clickable); over
  // the transparent margin -> falls through to the game (previously the whole
  // window blocked the game whenever Settings was open).
  assert.equal(shouldIgnoreMouse({ ...base, clickThrough: true, settingsOpen: true, hoverUi: true }), false)
  assert.equal(shouldIgnoreMouse({ ...base, clickThrough: true, settingsOpen: true, hoverUi: false }), true)
})

test('interactive mode: the panel captures, the empty area passes through', () => {
  assert.equal(shouldIgnoreMouse({ ...base, hoverUi: true }), false)
  assert.equal(shouldIgnoreMouse({ ...base, hoverUi: false }), true)
})
