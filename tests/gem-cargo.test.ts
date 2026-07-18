import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseClasses,
  gemName,
  questRowToSource,
  vendorRowToSource,
  buildSources,
  mergeGemData,
  type CargoRow,
  type GemsFile
} from '../scripts/gem-cargo.ts'

test('parseClasses keeps only the 7 classes and dedupes', () => {
  assert.deepEqual(parseClasses('Witch, Shadow'), ['Witch', 'Shadow'])
  assert.deepEqual(parseClasses('Witch;Witch;Shadow'), ['Witch', 'Shadow'])
  // unknown tokens are dropped
  assert.deepEqual(parseClasses('Witch, Necromancer, Elementalist'), ['Witch'])
})

test('parseClasses collapses "all classes" and empty to undefined', () => {
  assert.equal(parseClasses(''), undefined)
  assert.equal(parseClasses(null), undefined)
  assert.equal(parseClasses('  '), undefined)
  // all 7 present = every class = undefined
  assert.equal(
    parseClasses('Marauder, Ranger, Witch, Duelist, Templar, Shadow, Scion'),
    undefined
  )
  // no recognised token = undefined (not an empty array)
  assert.equal(parseClasses('Necromancer'), undefined)
})

test('parseClasses accepts several list delimiters', () => {
  assert.deepEqual(parseClasses('Witch / Shadow'), ['Witch', 'Shadow'])
  assert.deepEqual(parseClasses('Witch|Shadow'), ['Witch', 'Shadow'])
})

test('gemName prefers reward, then page name, then reward_id', () => {
  assert.equal(gemName({ reward: 'Fireball', _pageName: 'Fireball (gem)' }), 'Fireball')
  assert.equal(gemName({ _pageName: 'Fireball' }), 'Fireball')
  assert.equal(gemName({ reward_id: 'Metadata/Fireball' }), 'Metadata/Fireball')
  assert.equal(gemName({}), undefined)
})

test('questRowToSource maps a valid row and rejects an invalid one', () => {
  const row: CargoRow = { reward: 'Fireball', act: '1', quest: 'Enemy at the Gate', classes: 'Witch' }
  assert.deepEqual(questRowToSource(row), {
    gem: 'Fireball',
    source: { kind: 'quest', act: 1, quest: 'Enemy at the Gate', classes: ['Witch'] }
  })
  // no act -> rejected
  assert.equal(questRowToSource({ reward: 'Fireball' }), null)
  // out-of-range act -> rejected
  assert.equal(questRowToSource({ reward: 'Fireball', act: '99' }), null)
  // no gem -> rejected
  assert.equal(questRowToSource({ act: '1' }), null)
})

test('vendorRowToSource carries the npc and unlocking quest', () => {
  const row: CargoRow = {
    reward: 'Fireball',
    act: 1,
    npc: 'Nessa',
    quest: 'Enemy at the Gate',
    classes: 'Marauder, Ranger, Duelist, Templar, Shadow, Scion, Witch'
  }
  assert.deepEqual(vendorRowToSource(row), {
    gem: 'Fireball',
    source: { kind: 'vendor', act: 1, npc: 'Nessa', quest: 'Enemy at the Gate', classes: undefined }
  })
})

test('buildSources groups per gem, dedupes, and sorts act then quest-before-vendor', () => {
  const quests: CargoRow[] = [
    { reward: 'Fireball', act: '3', quest: 'Lost in Love', classes: 'Witch' },
    { reward: 'Fireball', act: '1', quest: 'Enemy at the Gate', classes: 'Witch' },
    // exact duplicate of the act-1 quest row -> collapses
    { reward: 'Fireball', act: 1, quest: 'Enemy at the Gate', classes: 'Witch' }
  ]
  const vendors: CargoRow[] = [{ reward: 'Fireball', act: '1', npc: 'Nessa', classes: 'Witch' }]

  const out = buildSources(quests, vendors)
  assert.deepEqual(out['Fireball'], [
    { kind: 'quest', act: 1, quest: 'Enemy at the Gate', classes: ['Witch'] },
    { kind: 'vendor', act: 1, npc: 'Nessa', quest: undefined, classes: ['Witch'] },
    { kind: 'quest', act: 3, quest: 'Lost in Love', classes: ['Witch'] }
  ])
})

test('buildSources keeps per-class rows distinct', () => {
  const quests: CargoRow[] = [
    { reward: 'Frostbolt', act: '1', quest: 'Enemy at the Gate', classes: 'Witch' },
    { reward: 'Frostbolt', act: '1', quest: 'Enemy at the Gate', classes: 'Shadow' }
  ]
  const out = buildSources(quests, [])
  assert.equal(out['Frostbolt'].length, 2)
})

test('mergeGemData fills sources while preserving attributes and other gems', () => {
  const existing: GemsFile = {
    _note: 'keep me',
    gems: {
      Fireball: { attr: 'int' },
      'Ground Slam': { attr: 'str' }
    }
  }
  const sources = {
    Fireball: [{ kind: 'quest' as const, act: 1, quest: 'Enemy at the Gate' }]
  }
  const merged = mergeGemData(existing, sources)

  // attr preserved, sources added
  assert.deepEqual(merged.gems.Fireball, {
    attr: 'int',
    sources: [{ kind: 'quest', act: 1, quest: 'Enemy at the Gate' }]
  })
  // untouched gem still there
  assert.deepEqual(merged.gems['Ground Slam'], { attr: 'str' })
  // top-level note preserved
  assert.equal(merged._note, 'keep me')
  // input not mutated
  assert.equal(existing.gems.Fireball.sources, undefined)
})

test('mergeGemData adds a gem that is only in the fetched data', () => {
  const existing: GemsFile = { gems: {} }
  const merged = mergeGemData(existing, {
    Fireball: [{ kind: 'quest' as const, act: 1 }]
  })
  assert.deepEqual(merged.gems.Fireball, { sources: [{ kind: 'quest', act: 1 }] })
})
