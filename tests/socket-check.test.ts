import { test } from 'node:test'
import assert from 'node:assert/strict'
import { socketMark } from '../src/lib/socketCheck.ts'

test('not knowing is silence, not a prompt', () => {
  // The rule the whole feature hangs off: switched off, not connected, no
  // character matched and stale data all arrive here as nothing, and nothing is
  // what they must produce. The tab works without this feature and has to keep
  // looking like it.
  assert.equal(socketMark(undefined), null)
  assert.equal(socketMark(null), null)
})

test('a complete link is quiet', () => {
  const mark = socketMark({ state: 'ok', slot: 'Body' })
  assert.equal(mark?.label, 'ok')
  assert.match(mark?.title ?? '', /as planned in your Body/)
  assert.match(mark?.tone ?? '', /emerald/)
})

test('a missing gem is named while there is only one of them', () => {
  const one = socketMark({ state: 'incomplete', slot: 'Body', missing: ['Ruthless Support'] })
  assert.equal(one?.label, 'missing Ruthless Support')
  assert.match(one?.tone ?? '', /amber/)

  // Two names don't fit the column, so the row counts and the tooltip lists.
  const many = socketMark({
    state: 'incomplete',
    slot: 'Body',
    missing: ['Ruthless Support', 'Melee Physical Damage Support']
  })
  assert.equal(many?.label, 'missing 2')
  assert.match(many?.title ?? '', /Ruthless Support, Melee Physical Damage Support/)
})

test('"you have it, just not here" outranks nothing and is not a miss', () => {
  const mark = socketMark({
    state: 'incomplete',
    slot: 'Body',
    elsewhere: [{ gem: 'Frostbite', slot: 'Helmet' }]
  })
  assert.equal(mark?.label, 'Frostbite in Helmet')
  assert.match(mark?.title ?? '', /in another item/)
})

test('a missing gem is more urgent than a misplaced one', () => {
  // Both at once: buying the one you don't own comes before moving the one you
  // do, so that's what the row says.
  const mark = socketMark({
    state: 'incomplete',
    missing: ['Cyclone'],
    elsewhere: [{ gem: 'Frostbite', slot: 'Helmet' }]
  })
  assert.equal(mark?.label, 'missing Cyclone')
})

test('a variant is complete, and says what you actually have', () => {
  const mark = socketMark({
    state: 'ok',
    slot: 'Weapon',
    variants: [{ planned: 'Storm Call', socketed: 'Vaal Storm Call' }]
  })
  assert.equal(mark?.label, 'ok', 'the link is filled — this is not a warning')
  assert.match(mark?.title ?? '', /Vaal Storm Call for Storm Call/)
})

test('a link you have not set up yet is grey, not red', () => {
  // At level 12 the level-28 group is the future, not a mistake.
  const mark = socketMark({ state: 'unequipped', missing: ['Cyclone', 'Ruthless Support'] })
  assert.equal(mark?.label, 'not set up')
  assert.match(mark?.tone ?? '', /muted/)
})

test('spare gems in the link are not worth a word', () => {
  // The plan is a minimum. A fourth gem in a four-link the plan gave three for
  // is your call, and the row stays quiet about it.
  const mark = socketMark({ state: 'ok', slot: 'Body', extra: ['Clarity'] })
  assert.equal(mark?.label, 'ok')
})
