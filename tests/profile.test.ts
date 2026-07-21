import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseProfile, type Profile } from '../electron/profile/profile.ts'
import { GemData, vendorCostFor, normalizeGemName } from '../electron/profile/gems.ts'
import {
  actFromAreaId,
  activeStageIndex,
  stepStageView,
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
    requiredLevel: 12,
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
  // Level order: Ground Slam (lvl 1) before Onslaught Support (lvl 12).
  assert.deepEqual(
    acq.purchases.map((e) => `${e.gem}@${e.npc}`),
    ['Ground Slam@Siosa', 'Onslaught Support@Yeena']
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

test('vendor cost tier follows the gem level requirement (provisional table)', () => {
  assert.equal(vendorCostFor(1), 'Wisdom')
  assert.equal(vendorCostFor(8), 'Transmutation')
  assert.equal(vendorCostFor(12), 'Alteration')
  assert.equal(vendorCostFor(16), 'Chance')
  assert.equal(vendorCostFor(31), 'Alchemy')
  assert.equal(vendorCostFor(undefined), undefined)
})

test('purchase entries carry the cost tier when the gem level is known', () => {
  const profile = parseProfile(
    JSON.stringify({
      meta: { name: 'cost', class: 'Marauder' },
      stages: [{ range: [1, 20], socketGroups: [{ gems: ['Onslaught Support'] }] }],
      gemPlan: [{ gem: 'Onslaught Support' }]
    })
  ).profile!
  const acq = acquisitionsForStage(profile, 0, SOURCED_GEMS)
  assert.equal(acq.purchases[0]?.cost, 'Alteration') // requiredLevel 12
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

test('actFromAreaId reads the act from numeric ids and ignores word ids', () => {
  assert.equal(actFromAreaId('1_1_2'), 1)
  assert.equal(actFromAreaId('2_6_town'), 2)
  assert.equal(actFromAreaId('10_1_1'), 10)
  assert.equal(actFromAreaId('HideoutWorldTurtle'), null)
  assert.equal(actFromAreaId('MapWorldsCitySquare'), null)
  assert.equal(actFromAreaId(null), null)
  assert.equal(actFromAreaId('99_1'), null)
})

test('rewards and purchases sort by gem level requirement, then name', () => {
  const gems = new GemData({
    'Zealotry Late': { attr: 'int', requiredLevel: 12, sources: [{ kind: 'vendor', act: 2, npc: 'Yeena' }] },
    'Alpha Early': { attr: 'int', requiredLevel: 1, sources: [{ kind: 'vendor', act: 1, npc: 'Nessa' }] },
    'Beta Early': { attr: 'int', requiredLevel: 1, sources: [{ kind: 'vendor', act: 1, npc: 'Nessa' }] }
  })
  const profile = parseProfile(
    JSON.stringify({
      meta: { name: 'sort', class: 'Witch' },
      stages: [{ range: [1, 20], socketGroups: [{ gems: ['Zealotry Late', 'Beta Early', 'Alpha Early'] }] }],
      gemPlan: [{ gem: 'Zealotry Late' }, { gem: 'Beta Early' }, { gem: 'Alpha Early' }]
    })
  ).profile!
  const acq = acquisitionsForStage(profile, 0, gems)
  // Level 1 gems first (alphabetical between equals), the level-12 gem last.
  assert.deepEqual(acq.purchases.map((e) => e.gem), ['Alpha Early', 'Beta Early', 'Zealotry Late'])
})

test('upcoming is scoped to the current act', () => {
  const gems = new GemData({
    'Act One Gift': { attr: 'str', sources: [{ kind: 'quest', act: 1, quest: 'q1' }] },
    'Act Three Gift': { attr: 'str', sources: [{ kind: 'quest', act: 3, quest: 'q3' }] }
  })
  const profile = parseProfile(
    JSON.stringify({
      meta: { name: 'acts', class: 'Marauder' },
      stages: [
        { range: [1, 11], socketGroups: [{ gems: ['Ground Slam'] }] },
        { range: [12, 40], socketGroups: [{ gems: ['Act One Gift', 'Act Three Gift'] }] }
      ],
      gemPlan: [{ gem: 'Ground Slam' }, { gem: 'Act One Gift' }, { gem: 'Act Three Gift' }]
    })
  ).profile!

  // Standing in Act 1: only the Act 1 quest reward is worth showing.
  const inAct1 = acquisitionsForStage(profile, 0, gems, 1)
  assert.deepEqual(inAct1.upcoming.map((e) => e.gem), ['Act One Gift'])
  // Act 3 (or later): both.
  const inAct3 = acquisitionsForStage(profile, 0, gems, 3)
  assert.deepEqual(inAct3.upcoming.map((e) => e.gem), ['Act One Gift', 'Act Three Gift'])
  // Unknown act: no filter (each row shows its own context).
  const unknown = acquisitionsForStage(profile, 0, gems)
  assert.equal(unknown.upcoming.length, 2)
})

test('reward groups flag same-quest gems as a pick-one choice', () => {
  const gems = new GemData({
    'Freezing Pulse': { attr: 'int', sources: [{ kind: 'quest', act: 1, quest: 'Enemy at the Gate', classes: ['Witch'] }] },
    Frostbolt: { attr: 'int', sources: [{ kind: 'quest', act: 1, quest: 'Enemy at the Gate', classes: ['Witch'] }] },
    Fireball: { attr: 'int', sources: [{ kind: 'quest', act: 2, quest: 'Intruders in Black', classes: ['Witch'] }] }
  })
  const profile = parseProfile(
    JSON.stringify({
      meta: { name: 'grp', class: 'Witch' },
      stages: [{ range: [1, 20], socketGroups: [{ gems: ['Freezing Pulse', 'Frostbolt', 'Fireball'] }] }],
      gemPlan: [{ gem: 'Freezing Pulse' }, { gem: 'Frostbolt' }, { gem: 'Fireball' }]
    })
  ).profile!
  const g = acquisitionsForStage(profile, 0, gems).rewardGroups

  // Two gems share "Enemy at the Gate" -> one pick-one group (choices first).
  assert.equal(g[0].pickOne, true)
  assert.equal(g[0].quest, 'Enemy at the Gate')
  assert.equal(g[0].act, 1)
  assert.deepEqual(g[0].gems.map((e) => e.gem), ['Freezing Pulse', 'Frostbolt'])
  // The lone Act 2 reward is its own take-it group.
  assert.equal(g[1].pickOne, false)
  assert.deepEqual(g[1].gems.map((e) => e.gem), ['Fireball'])
})

test('purchases sort by cost tier, then act, then name', () => {
  const gems = new GemData({
    'Cheap A2': { attr: 'int', requiredLevel: 1, sources: [{ kind: 'vendor', act: 2, npc: 'Yeena' }] },
    'Cheap A1': { attr: 'int', requiredLevel: 1, sources: [{ kind: 'vendor', act: 1, npc: 'Nessa' }] },
    'Pricey A1': { attr: 'int', requiredLevel: 28, sources: [{ kind: 'vendor', act: 1, npc: 'Nessa' }] }
  })
  const profile = parseProfile(
    JSON.stringify({
      meta: { name: 'cost-sort', class: 'Witch' },
      stages: [{ range: [1, 40], socketGroups: [{ gems: ['Pricey A1', 'Cheap A2', 'Cheap A1'] }] }],
      gemPlan: [{ gem: 'Pricey A1' }, { gem: 'Cheap A2' }, { gem: 'Cheap A1' }]
    })
  ).profile!
  const acq = acquisitionsForStage(profile, 0, gems)
  // Wisdom (lvl 1) before Alchemy (lvl 28); within Wisdom, Act 1 before Act 2.
  assert.deepEqual(
    acq.purchases.map((e) => `${e.gem}/${e.cost}`),
    ['Cheap A1/Wisdom', 'Cheap A2/Wisdom', 'Pricey A1/Alchemy']
  )
})

test('acquisition plan interleaves rewards and buys by act, rewards first on ties', () => {
  const gems = new GemData({
    'Reward A1': { attr: 'int', sources: [{ kind: 'quest', act: 1, quest: 'Enemy at the Gate', classes: ['Witch'] }] },
    'Buy A1': { attr: 'int', requiredLevel: 1, sources: [{ kind: 'vendor', act: 1, npc: 'Nessa', classes: ['Witch'] }] },
    'Reward A2': { attr: 'int', sources: [{ kind: 'quest', act: 2, quest: 'Intruders in Black', classes: ['Witch'] }] },
    'Buy A2': { attr: 'int', requiredLevel: 1, sources: [{ kind: 'vendor', act: 2, npc: 'Yeena', classes: ['Witch'] }] }
  })
  const profile = parseProfile(
    JSON.stringify({
      meta: { name: 'plan', class: 'Witch' },
      // deliberately scrambled so the ordering has to do real work.
      stages: [{ range: [1, 20], socketGroups: [{ gems: ['Buy A2', 'Reward A2', 'Buy A1', 'Reward A1'] }] }],
      gemPlan: [{ gem: 'Buy A2' }, { gem: 'Reward A2' }, { gem: 'Buy A1' }, { gem: 'Reward A1' }]
    })
  ).profile!
  const plan = acquisitionsForStage(profile, 0, gems).plan

  // Chronological by act; within an act the free reward comes before the buy.
  const labels = plan.map((it) =>
    it.kind === 'reward' ? `take:${it.group.gems.map((g) => g.gem).join('+')}` : `buy:${it.entry.gem}`
  )
  assert.deepEqual(labels, ['take:Reward A1', 'buy:Buy A1', 'take:Reward A2', 'buy:Buy A2'])
})

test('the plan hides gems from acts you have not reached yet', () => {
  const gems = new GemData({
    'Buy A1': { attr: 'int', requiredLevel: 1, sources: [{ kind: 'vendor', act: 1, npc: 'Nessa', classes: ['Witch'] }] },
    'Buy A3': { attr: 'int', requiredLevel: 1, sources: [{ kind: 'vendor', act: 3, npc: 'Clarissa', classes: ['Witch'] }] }
  })
  const profile = parseProfile(
    JSON.stringify({
      meta: { name: 'act', class: 'Witch' },
      stages: [{ range: [1, 40], socketGroups: [{ gems: ['Buy A1', 'Buy A3'] }] }],
      gemPlan: [{ gem: 'Buy A1' }, { gem: 'Buy A3' }]
    })
  ).profile!
  const gemsOf = (acq: ReturnType<typeof acquisitionsForStage>): string[] =>
    acq.plan.map((it) => (it.kind === 'buy' ? it.entry.gem : ''))

  // In Act 1 the Act 3 buy isn't reachable yet, so it's kept off the plan...
  assert.deepEqual(gemsOf(acquisitionsForStage(profile, 0, gems, 1)), ['Buy A1'])
  // ...though the purchases list itself (drives the link tags) still has both.
  assert.deepEqual(
    acquisitionsForStage(profile, 0, gems, 1).purchases.map((e) => e.gem),
    ['Buy A1', 'Buy A3']
  )
  // Reaching Act 3 reveals it; unknown current act filters nothing.
  assert.deepEqual(gemsOf(acquisitionsForStage(profile, 0, gems, 3)), ['Buy A1', 'Buy A3'])
  assert.equal(acquisitionsForStage(profile, 0, gems).plan.length, 2)
})

test('the plan drops gems already required (socketed) in the previous stage', () => {
  const gems = new GemData({
    Main: { attr: 'int', requiredLevel: 1, sources: [{ kind: 'vendor', act: 1, npc: 'Nessa', classes: ['Witch'] }] },
    NewGem: { attr: 'int', requiredLevel: 1, sources: [{ kind: 'vendor', act: 1, npc: 'Nessa', classes: ['Witch'] }] }
  })
  const profile = parseProfile(
    JSON.stringify({
      meta: { name: 'dedup', class: 'Witch' },
      stages: [
        { range: [1, 5], socketGroups: [{ gems: ['Main'] }] },
        { range: [6, 12], socketGroups: [{ gems: ['Main', 'NewGem'] }] }
      ],
      gemPlan: [{ gem: 'Main' }, { gem: 'NewGem' }]
    })
  ).profile!
  const buys = (i: number): string[] =>
    acquisitionsForStage(profile, i, gems, 1).plan.map((it) => (it.kind === 'buy' ? it.entry.gem : ''))

  assert.deepEqual(buys(0), ['Main']) // stage 0: Main is new (nothing before it)
  assert.deepEqual(buys(1), ['NewGem']) // stage 1: Main carried over -> hidden
  // ...but the purchases list (which drives the link-overview tags) still has both.
  assert.deepEqual(
    acquisitionsForStage(profile, 1, gems, 1).purchases.map((e) => e.gem).sort(),
    ['Main', 'NewGem']
  )
})

test('stepStageView pages stages and snaps back to auto on the live one', () => {
  // Live stage is index 2 of 5; null = following the level.
  assert.equal(stepStageView(null, -1, 2, 5), 1) // step back pins stage 1
  assert.equal(stepStageView(1, -1, 2, 5), 0) // and again
  assert.equal(stepStageView(0, -1, 2, 5), 0) // clamped at the start
  assert.equal(stepStageView(1, 1, 2, 5), null) // stepping onto the live stage resumes auto
  assert.equal(stepStageView(3, 1, 2, 5), 4) // page forward past live
  assert.equal(stepStageView(4, 1, 2, 5), 4) // clamped at the end
  assert.equal(stepStageView(null, -1, 0, 0), null) // no stages
})

test('a class starting gem is marked and kept off the buy/reward lists', () => {
  const gems = new GemData({
    'Arcane Surge Support': { attr: 'int', requiredLevel: 1, sources: [{ kind: 'vendor', act: 1, npc: 'Nessa', classes: ['Witch'] }] },
    'Frost Bomb': { attr: 'int', sources: [{ kind: 'vendor', act: 1, npc: 'Nessa', classes: ['Witch'] }] }
  })
  const starting = new Set(['Arcane Surge Support'].map(normalizeGemName)) // Witch starter
  const profile = parseProfile(
    JSON.stringify({
      meta: { name: 'start', class: 'Witch' },
      stages: [{ range: [1, 12], socketGroups: [{ gems: ['Arcane Surge Support', 'Frost Bomb'] }] }],
      gemPlan: [{ gem: 'Arcane Surge Support' }, { gem: 'Frost Bomb' }]
    })
  ).profile!
  const acq = acquisitionsForStage(profile, 0, gems, null, starting)

  // Arcane Surge would resolve to Nessa, but you already start with it.
  const start = acq.other.find((e) => e.gem === 'Arcane Surge Support')
  assert.equal(start?.starting, true)
  assert.deepEqual(acq.purchases.map((e) => e.gem), ['Frost Bomb'])
  assert.equal(acq.rewards.length, 0)
  assert.equal(acq.rewardGroups.length, 0)
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
