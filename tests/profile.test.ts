import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseProfile, type Profile } from '../electron/profile/profile.ts'
import { GemData } from '../electron/profile/gems.ts'
import {
  activeStageIndex,
  resolveStage,
  acquisitionsForStage,
  rewardsForQuest
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

test('acquisitions split the active stage gems into rewards vs purchases', () => {
  const profile = exampleProfile()
  const acq = acquisitionsForStage(profile, 0) // stage 0 uses Frostbolt + Arcane Surge
  assert.deepEqual(acq.rewards.map((e) => e.gem), ['Frostbolt'])
  assert.deepEqual(acq.purchases.map((e) => e.gem), ['Arcane Surge Support'])
})

test('rewardsForQuest matches the route rewardHint join', () => {
  const profile = exampleProfile()
  assert.deepEqual(
    rewardsForQuest(profile, 'enemy-at-the-gate').map((e) => e.gem),
    ['Frostbolt']
  )
  assert.deepEqual(rewardsForQuest(profile, 'no-such-quest'), [])
})
