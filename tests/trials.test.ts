import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TrialsEngine, NORMAL_TRIALS } from '../electron/trials/engine.ts'

test('there are six normal trials across acts 1–3', () => {
  assert.equal(NORMAL_TRIALS.length, 6)
  assert.deepEqual(
    [...new Set(NORMAL_TRIALS.map((t) => t.act))].sort(),
    [1, 2, 3]
  )
})

test('entering a trial zone marks that trial (and only it)', () => {
  const e = new TrialsEngine()
  assert.equal(e.snapshot().seenCount, 0)
  assert.equal(e.applyZone('The Lower Prison'), true)
  const snap = e.snapshot()
  assert.equal(snap.seenCount, 1)
  assert.equal(snap.trials.find((t) => t.id === 't-a1-lower-prison')?.seen, true)
  assert.equal(snap.trials.find((t) => t.id === 't-a3-catacombs')?.seen, false)
})

test('zone matching is case-insensitive and prefix-tolerant', () => {
  const e = new TrialsEngine()
  // "The Crypt Level 1" trial zone should match an entered "The Crypt Level 1".
  assert.equal(e.applyZone('the crypt level 1'), true)
  assert.equal(e.snapshot().trials.find((t) => t.id === 't-a2-crypt')?.seen, true)
})

test('a non-trial zone changes nothing', () => {
  const e = new TrialsEngine()
  assert.equal(e.applyZone("Lioneye's Watch"), false)
  assert.equal(e.applyZone('The Coast'), false)
  assert.equal(e.snapshot().seenCount, 0)
})

test('re-entering an already-seen trial zone is not a change', () => {
  const e = new TrialsEngine()
  assert.equal(e.applyZone('The Crematorium'), true)
  assert.equal(e.applyZone('The Crematorium'), false)
})

test('manual toggle corrects both directions; reset clears', () => {
  const e = new TrialsEngine()
  assert.equal(e.toggle('t-a3-imperial-gardens'), true)
  assert.equal(e.snapshot().seenCount, 1)
  assert.equal(e.toggle('t-a3-imperial-gardens'), true)
  assert.equal(e.snapshot().seenCount, 0)
  assert.equal(e.toggle('not-a-trial'), false)

  e.applyZone('The Lower Prison')
  e.reset()
  assert.equal(e.snapshot().seenCount, 0)
})

test('seen state hydrates from persisted ids (ignoring unknown ids)', () => {
  const e = new TrialsEngine(['t-a1-lower-prison', 'bogus'])
  assert.equal(e.snapshot().seenCount, 1)
  assert.deepEqual(e.seenIds(), ['t-a1-lower-prison'])
})
