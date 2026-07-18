import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  moveItem,
  genStepId,
  addStepAfter,
  updateStep,
  deleteStep,
  moveStep,
  serializeRoute,
  blankStage,
  type RouteDraft
} from '../editor/model.ts'
import { validateRoute } from '../electron/guide/route.ts'

function route(): RouteDraft {
  return {
    act: 3,
    name: 'Act 3',
    steps: [
      { id: 'a3-1', type: 'town', zone: 'The Sarn Encampment', text: 'town' },
      { id: 'a3-2', type: 'kill', zone: 'The Slums', text: 'fight' },
      { id: 'a3-3', type: 'boss', zone: 'The Sceptre of God', text: 'Dominus' }
    ]
  }
}

test('moveItem reorders immutably and clamps out-of-range targets', () => {
  const arr = ['a', 'b', 'c', 'd']
  assert.deepEqual(moveItem(arr, 0, 2), ['b', 'c', 'a', 'd'])
  assert.deepEqual(moveItem(arr, 3, 0), ['d', 'a', 'b', 'c'])
  assert.deepEqual(moveItem(arr, 1, 99), ['a', 'c', 'd', 'b']) // clamped to end
  assert.deepEqual(moveItem(arr, 5, 0), ['a', 'b', 'c', 'd']) // bad source: no-op
  assert.deepEqual(arr, ['a', 'b', 'c', 'd']) // original untouched
})

test('genStepId is unique for the act, even with gaps', () => {
  const r = route()
  // a3-1..a3-3 used -> next is a3-4
  assert.equal(genStepId(r), 'a3-4')
  r.steps.push({ id: 'a3-4', type: 'hint', text: '' })
  assert.equal(genStepId(r), 'a3-5')
  // A custom id doesn't block the numeric scheme.
  r.steps.push({ id: 'a3-boss-final', type: 'boss', text: '' })
  assert.equal(genStepId(r), 'a3-5')
})

test('addStepAfter inserts a blank step with a fresh id at the right spot', () => {
  const r = addStepAfter(route(), 0)
  assert.equal(r.steps.length, 4)
  assert.equal(r.steps[1].id, 'a3-4')
  assert.equal(r.steps[1].type, 'hint')
  assert.equal(r.steps[0].id, 'a3-1') // unchanged before
  // index < 0 appends
  assert.equal(addStepAfter(route(), -1).steps[3].id, 'a3-4')
})

test('updateStep / deleteStep / moveStep are immutable and correct', () => {
  const base = route()
  const updated = updateStep(base, 1, { text: 'new text', areaId: '3_1_2' })
  assert.equal(updated.steps[1].text, 'new text')
  assert.equal(updated.steps[1].areaId, '3_1_2')
  assert.equal(base.steps[1].text, 'fight') // original untouched

  assert.deepEqual(
    deleteStep(base, 0).steps.map((s) => s.id),
    ['a3-2', 'a3-3']
  )
  assert.deepEqual(
    moveStep(base, 2, 0).steps.map((s) => s.id),
    ['a3-3', 'a3-1', 'a3-2']
  )
})

test('serializeRoute drops empty optionals and the result validates', () => {
  const draft = addStepAfter(route(), 2) // adds a blank hint step (no zone/area)
  const withText = updateStep(draft, 3, { text: 'placeholder note' })
  const json = serializeRoute(withText)
  // The serialized step has no empty areaId/zone/hints keys.
  const raw = json as { steps: Record<string, unknown>[] }
  assert.ok(!('areaId' in raw.steps[3]))
  assert.ok(!('hints' in raw.steps[3]))
  // And it passes the real route validator.
  const { route: valid, errors } = validateRoute(json)
  assert.deepEqual(errors, [])
  assert.ok(valid)
})

test('an invalid draft is caught by the validator on serialize', () => {
  const bad = route()
  bad.steps[1] = { id: '', type: 'kill', text: '' } // missing id + text
  const { errors } = validateRoute(serializeRoute(bad))
  assert.ok(errors.length >= 1)
})

test('blankStage produces a sane, non-overlapping starting range', () => {
  const s = blankStage(12)
  assert.deepEqual(s.range, [12, 22])
  assert.equal(s.socketGroups.length, 1)
})
