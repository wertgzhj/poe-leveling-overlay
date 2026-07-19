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

test('entering a trial zone hints it — it is NOT auto-completed', () => {
  const e = new TrialsEngine()
  assert.equal(e.applyZone('The Lower Prison'), true)
  const snap = e.snapshot()
  assert.equal(snap.currentZoneTrialId, 't-a1-lower-prison')
  // Owner feedback: walking the zone must not check the trial off.
  assert.equal(snap.seenCount, 0)
  assert.equal(snap.trials.find((t) => t.id === 't-a1-lower-prison')?.seen, false)
})

test('zone matching is case-insensitive and prefix-tolerant', () => {
  const e = new TrialsEngine()
  assert.equal(e.matchZone('the crypt level 1')?.id, 't-a2-crypt')
  assert.equal(e.matchZone('The Crypt Level 1 (some suffix)')?.id, 't-a2-crypt')
  assert.equal(e.matchZone('The Coast'), null)
})

test('leaving for a non-trial zone clears the hint', () => {
  const e = new TrialsEngine()
  assert.equal(e.applyZone("Lioneye's Watch"), false) // nothing -> nothing
  assert.equal(e.applyZone('The Crematorium'), true) // hint on
  assert.equal(e.snapshot().currentZoneTrialId, 't-a3-crematorium')
  assert.equal(e.applyZone('The Coast'), true) // hint off
  assert.equal(e.snapshot().currentZoneTrialId, null)
})

test('re-entering the same trial zone is not a change', () => {
  const e = new TrialsEngine()
  assert.equal(e.applyZone('The Crematorium'), true)
  assert.equal(e.applyZone('The Crematorium'), false)
})

test('the hint still shows for an already-completed trial zone', () => {
  const e = new TrialsEngine(['t-a3-crematorium'])
  assert.equal(e.applyZone('The Crematorium'), true)
  // The UI decides to hide it when seen; the engine just reports location.
  assert.equal(e.snapshot().currentZoneTrialId, 't-a3-crematorium')
})

test('manual toggle corrects both directions; reset clears', () => {
  const e = new TrialsEngine()
  assert.equal(e.toggle('t-a3-imperial-gardens'), true)
  assert.equal(e.snapshot().seenCount, 1)
  assert.equal(e.toggle('t-a3-imperial-gardens'), true)
  assert.equal(e.snapshot().seenCount, 0)
  assert.equal(e.toggle('not-a-trial'), false)

  e.toggle('t-a1-lower-prison')
  e.reset()
  assert.equal(e.snapshot().seenCount, 0)
})

test('seen state hydrates from persisted ids (ignoring unknown ids)', () => {
  const e = new TrialsEngine(['t-a1-lower-prison', 'bogus'])
  assert.equal(e.snapshot().seenCount, 1)
  assert.deepEqual(e.seenIds(), ['t-a1-lower-prison'])
})
