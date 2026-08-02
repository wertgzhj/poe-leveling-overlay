import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MUTED,
  SOURCE_ALIAS,
  SOURCE_TONE,
  sourceMark,
  sourceName,
  sourceTone
} from '../src/lib/sources.ts'

test('a renamed source keeps its colour wherever it is read', () => {
  // The bug this file exists for: the tone was wired into the purchase branch
  // and not the reward one, so Gravicius — a QUEST — stayed grey on the link
  // rows, which is the one place you actually read him.
  const gravicius = sourceMark({ bucket: 'reward', act: 3, quest: 'Sever the Right Hand' })
  assert.equal(gravicius?.label, 'A3 · Gravicius')
  assert.equal(gravicius?.tone, SOURCE_TONE.Gravicius)

  const library = sourceMark({ bucket: 'purchase', act: 3, npc: 'Siosa', cost: 'Chance' })
  assert.equal(library?.label, 'A3 · Library')
  assert.equal(library?.tone, SOURCE_TONE.Library)

  // Everything not in the table stays muted, in both branches.
  assert.equal(sourceMark({ bucket: 'reward', act: 1, quest: 'Mercy Mission' })?.tone, MUTED)
  assert.equal(sourceMark({ bucket: 'purchase', act: 1, npc: 'Nessa' })?.tone, MUTED)
})

test('every alias has a colour and every colour an alias', () => {
  // Two tables that only make sense together: a rename nobody can spot, or a
  // colour on a name that never appears, is a half-finished edit.
  for (const named of Object.values(SOURCE_ALIAS)) {
    assert.ok(SOURCE_TONE[named], `"${named}" is renamed but has no colour`)
  }
  for (const named of Object.keys(SOURCE_TONE)) {
    assert.ok(
      Object.values(SOURCE_ALIAS).includes(named),
      `"${named}" has a colour but nothing renames to it`
    )
  }
  // The tone table is keyed by the alias, not the raw name.
  assert.equal(sourceTone(sourceName('Siosa')), SOURCE_TONE.Library)
  assert.equal(sourceTone('Siosa'), MUTED, 'the raw name must not carry the colour')
})

test('the source mark says the most useful thing first', () => {
  // A starting gem is not shopping.
  assert.equal(sourceMark({ bucket: 'other', starting: true })?.label, '✓ start')

  // Muling beats the vendor: an alt hands it over for nothing, so quoting a
  // price next to it is the one thing this row must not do.
  const mule = sourceMark({ bucket: 'purchase', act: 3, npc: 'Siosa', cost: 'Chance', mule: ['Ranger'] })
  assert.equal(mule?.label, 'Mule · Ranger')
  assert.match(mule?.title ?? '', /Roll a level-1 Ranger/)
  assert.match(mule?.title ?? '', /Otherwise Siosa in Act 3 sells it for Chance/)

  // No source at all falls back to something honest rather than a blank.
  assert.equal(sourceMark({ bucket: 'other' })?.label, 'drop/trade')
  assert.equal(sourceMark({ bucket: 'other', note: 'corruption only' })?.label, 'corruption only')
  assert.equal(sourceMark(undefined), null)
})

test('the act prefix is dropped rather than faked when there is no act', () => {
  assert.equal(sourceMark({ bucket: 'purchase', npc: 'Nessa' })?.label, 'Nessa')
  assert.equal(sourceMark({ bucket: 'reward', quest: 'Mercy Mission' })?.label, 'Mercy Mission')
  // And the broad-vendor caveat only shows where it applies.
  assert.match(
    sourceMark({ bucket: 'purchase', act: 3, npc: 'Siosa', fallback: true })?.title ?? '',
    /general vendor/
  )
  assert.doesNotMatch(
    sourceMark({ bucket: 'purchase', act: 1, npc: 'Nessa' })?.title ?? '',
    /general vendor/
  )
})
