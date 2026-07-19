import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseProfile, type Profile } from '../electron/profile/profile.ts'
import { GemData } from '../electron/profile/gems.ts'
import {
  activeStageIndex,
  resolveStage,
  acquisitionsForStage
} from '../electron/profile/engine.ts'
import { repoPath } from './helpers.ts'

function exampleProfile(): Profile {
  const { profile, errors } = parseProfile(readFileSync(repoPath('data/profiles/example.json'), 'utf8'))
  assert.deepEqual(errors, [], 'example profile must validate')
  assert.ok(profile)
  return profile
}

function exampleGems(): GemData {
  const json = JSON.parse(readFileSync(repoPath('data/gems.json'), 'utf8'))
  return new GemData(json.gems)
}

// ---------- validation ----------

test('the example profile and gem data load and agree', () => {
  const profile = exampleProfile()
  const gems = exampleGems()
  assert.equal(profile.meta.class, 'Witch')
  // Every gem referenced by a stage should have a colour in gems.json.
  for (const stage of profile.stages) {
    for (const group of stage.socketGroups) {
      for (const gem of group.gems) {
        assert.equal(gems.color(gem).unknown, false, `example gem "${gem}" missing from gems.json`)
      }
    }
  }
})

test('validation catches bad class, empty stages, overlaps, bad sources', () => {
  const bad = parseProfile(
    JSON.stringify({
      meta: { name: 'x', class: 'Necromancer' },
      stages: [
        { range: [1, 12], socketGroups: [{ gems: ['A'] }] },
        { range: [10, 20], socketGroups: [{ gems: ['B'] }] }
      ],
      gemPlan: [{ gem: 'A', source: { kind: 'craft' } }]
    })
  )
  assert.equal(bad.profile, null)
  assert.ok(bad.errors.some((e) => e.includes('meta.class must be one of')))
  assert.ok(bad.errors.some((e) => e.includes('overlap')))
  assert.ok(bad.errors.some((e) => e.includes('source.kind')))
})

test('missing required pieces are reported, not thrown', () => {
  assert.ok(parseProfile('{ nope').errors.length === 1)
  const noStages = parseProfile(JSON.stringify({ meta: { name: 'x', class: 'Witch' }, stages: [] }))
  assert.ok(noStages.errors.some((e) => e.includes('"stages" must be a non-empty array')))
})

// ---------- socket colours ----------

test('socket colours are computed from gem attributes', () => {
  const gems = new GemData({
    'Ground Slam': { attr: 'str' },
    'Split Arrow': { attr: 'dex' },
    Fireball: { attr: 'int' }
  })
  assert.equal(gems.color('Ground Slam').color, 'R')
  assert.equal(gems.color('Split Arrow').color, 'G')
  assert.equal(gems.color('Fireball').color, 'B')
})

test('unknown gems render neutral and are flagged', () => {
  const gems = new GemData({ Fireball: { attr: 'int' } })
  const c = gems.color('Mystery Gem')
  assert.equal(c.color, 'W')
  assert.equal(c.unknown, true)
})

test('gem matching ignores case and a trailing " Support"', () => {
  const gems = new GemData({ 'Arcane Surge Support': { attr: 'int' } })
  assert.equal(gems.color('arcane surge').unknown, false)
  assert.equal(gems.color('Arcane Surge').color, 'B')
})

// ---------- stage selection ----------

test('active stage tracks the character level and clamps at the ends', () => {
  const profile = exampleProfile()
  assert.equal(activeStageIndex(profile, 1), 0)
  assert.equal(activeStageIndex(profile, 11), 0)
  assert.equal(activeStageIndex(profile, 12), 1)
  assert.equal(activeStageIndex(profile, 90), 1, 'clamps above the last stage')
  assert.equal(activeStageIndex(profile, null), 0, 'no level yet -> first stage')
})

test('a level in a gap falls back to the nearest lower stage', () => {
  const profile = parseProfile(
    JSON.stringify({
      meta: { name: 'gap', class: 'Shadow' },
      stages: [
        { range: [1, 10], socketGroups: [{ gems: ['A'] }] },
        { range: [20, 30], socketGroups: [{ gems: ['B'] }] }
      ]
    })
  ).profile!
  assert.equal(activeStageIndex(profile, 15), 0)
})

test('resolveStage colours the active group', () => {
  const profile = exampleProfile()
  const gems = exampleGems()
  const stage = resolveStage(profile.stages[0], 0, gems)
  assert.equal(stage.label, 'Level 1–11')
  assert.deepEqual(
    stage.groups[0].gems.map((g) => g.color),
    ['B', 'B']
  )
})

// ---------- acquisition views ----------

test('acquisitions split the active stage gems into rewards vs purchases (authored)', () => {
  const profile = exampleProfile()
  const acq = acquisitionsForStage(profile, 0) // stage 0 uses Frostbolt + Arcane Surge
  assert.deepEqual(acq.rewards.map((e) => e.gem), ['Frostbolt'])
  assert.deepEqual(acq.purchases.map((e) => e.gem), ['Arcane Surge Support'])
})

// ---------- P5: class-aware gem sources ----------

const SOURCED_GEMS = new GemData({
  Frostbolt: {
    attr: 'int',
    sources: [
      { kind: 'quest', act: 1, quest: 'enemy-at-the-gate', classes: ['Witch', 'Shadow'] },
      { kind: 'vendor', act: 1, npc: 'Nessa', classes: ['Witch', 'Shadow', 'Templar'] }
    ]
  },
  'Onslaught Support': {
    attr: 'dex',
    sources: [{ kind: 'vendor', act: 2, npc: 'Yeena' }] // all classes
  },
  'Ground Slam': {
    attr: 'str',
    sources: [{ kind: 'quest', act: 1, quest: 'enemy-at-the-gate', classes: ['Marauder', 'Duelist'] }]
  }
})

test('earliestSource filters by class and prefers the earliest (act, quest first)', () => {
  assert.equal(SOURCED_GEMS.earliestSource('Frostbolt', 'Witch')?.kind, 'quest')
  // Templar isn't in the quest list, so the specific vendor source wins.
  const templarFrost = SOURCED_GEMS.earliestSource('Frostbolt', 'Templar')
  assert.equal(templarFrost?.kind, 'vendor')
  assert.equal(templarFrost?.fallback, undefined) // a real, gem-specific source
  // Marauder has neither Frostbolt-specific source -> broad-vendor fallback (Siosa).
  const marauderFrost = SOURCED_GEMS.earliestSource('Frostbolt', 'Marauder')
  assert.equal(marauderFrost?.npc, 'Siosa')
  assert.equal(marauderFrost?.fallback, true)
  // No class filter on Onslaught -> available to anyone.
  assert.equal(SOURCED_GEMS.earliestSource('Onslaught Support', 'Marauder')?.act, 2)
})

test('acquisitions resolve sources live from gem data when the plan omits them', () => {
  const profile = parseProfile(
    JSON.stringify({
      meta: { name: 'live', class: 'Witch' },
      stages: [
        {
          range: [1, 12],
          socketGroups: [{ gems: ['Frostbolt', 'Onslaught Support', 'Ground Slam'] }]
        }
      ],
      gemPlan: [{ gem: 'Frostbolt' }, { gem: 'Onslaught Support' }, { gem: 'Ground Slam' }]
    })
  ).profile!

  const acq = acquisitionsForStage(profile, 0, SOURCED_GEMS)
  assert.deepEqual(acq.rewards.map((e) => e.gem), ['Frostbolt']) // Witch quest reward
  // Onslaught has a specific vendor; Ground Slam has no Witch source, so it
  // falls back to Siosa (the broad vendor) rather than being misattributed.
  assert.deepEqual(
    acq.purchases.map((e) => `${e.gem}@${e.npc}`),
    ['Onslaught Support@Yeena', 'Ground Slam@Siosa']
  )
  assert.equal(acq.other.length, 0)
  assert.equal(acq.purchases.find((e) => e.gem === 'Ground Slam')?.fallback, true)
  assert.equal(acq.purchases.find((e) => e.gem === 'Onslaught Support')?.fallback, undefined)
})

test('known gems with no specific source fall back to the broad vendor (Siosa)', () => {
  // Controlled data: a curated gem with NO sources. (Not the shipped gems.json —
  // the "Fetch gem data" workflow fills that with real sources, which is exactly
  // when this fallback stops applying to real gems.)
  const gems = new GemData({ 'Sourceless Strike': { attr: 'str' } })
  const src = gems.earliestSource('Sourceless Strike', 'Witch')
  assert.equal(src?.npc, 'Siosa')
  assert.equal(src?.act, 3)
  assert.equal(src?.fallback, true)
  // An unknown name is not claimed to be sold by Siosa.
  assert.equal(gems.earliestSource('Totally Fake Gem', 'Witch'), null)
})

test('upcoming lists later-stage quest-reward gems with their start level', () => {
  const profile = parseProfile(
    JSON.stringify({
      meta: { name: 'up', class: 'Witch' },
      stages: [
        { range: [1, 11], socketGroups: [{ gems: ['Frostbolt'] }] },
        // Ground Slam has no Witch quest source -> not "take when offered".
        { range: [12, 24], socketGroups: [{ gems: ['Frostbolt', 'Onslaught Support', 'Ground Slam'] }] }
      ],
      gemPlan: [{ gem: 'Frostbolt' }, { gem: 'Onslaught Support' }, { gem: 'Ground Slam' }]
    })
  ).profile!

  const acq = acquisitionsForStage(profile, 0, SOURCED_GEMS)
  // Frostbolt is already in the active stage; Onslaught is vendor-only;
  // upcoming only lists NEW gems a quest actually rewards this class... none
  // here except via a quest — Onslaught is vendor, Ground Slam not for Witch.
  assert.deepEqual(acq.upcoming, [])

  const marauder = parseProfile(
    JSON.stringify({
      meta: { name: 'up2', class: 'Marauder' },
      stages: [
        { range: [1, 11], socketGroups: [{ gems: ['Onslaught Support'] }] },
        { range: [12, 24], socketGroups: [{ gems: ['Ground Slam'] }] }
      ],
      gemPlan: [{ gem: 'Onslaught Support' }, { gem: 'Ground Slam' }]
    })
  ).profile!
  const acq2 = acquisitionsForStage(marauder, 0, SOURCED_GEMS)
  assert.deepEqual(
    acq2.upcoming.map((e) => `${e.gem}@${e.fromLevel}`),
    ['Ground Slam@12'] // Marauder quest reward, first used in the level-12 stage
  )
})

test('an authored source overrides the live lookup', () => {
  const profile = parseProfile(
    JSON.stringify({
      meta: { name: 'override', class: 'Witch' },
      stages: [{ range: [1, 12], socketGroups: [{ gems: ['Frostbolt'] }] }],
      gemPlan: [{ gem: 'Frostbolt', source: { kind: 'drop', note: 'using a drop' } }]
    })
  ).profile!
  const acq = acquisitionsForStage(profile, 0, SOURCED_GEMS)
  assert.equal(acq.rewards.length, 0)
  assert.deepEqual(acq.other.map((e) => e.gem), ['Frostbolt'])
})
