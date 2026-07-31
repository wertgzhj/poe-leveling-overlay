import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseProfile, baseClassOf, ASCENDANCIES, CLASSES, type Profile } from '../electron/profile/profile.ts'
import {
  GemData,
  vendorCostFor,
  safeLevelRange,
  normalizeGemName,
  BROAD_VENDOR_DATA_MIN,
  type GemSourceInfo
} from '../electron/profile/gems.ts'
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
  assert.equal(c.anyColor, undefined)
})

test('a gem with no attribute requirement is white on purpose, not for lack of data', () => {
  // Portal, Convocation and friends have no attribute requirement
  // in game, so they fit any socket. Flagging them "?" (= "not in gems.json")
  // made the overlay look broken on gems it knows perfectly well.
  const gems = new GemData({ Portal: { requiredLevel: 10 }, Fireball: { attr: 'int' } })
  const portal = gems.color('Portal')
  assert.equal(portal.color, 'W')
  assert.equal(portal.unknown, false, 'it IS in the data — do not flag it as a guess')
  assert.equal(portal.anyColor, true)

  // A gem with an attribute is unaffected, and so is a truly unknown one.
  assert.equal(gems.color('Fireball').anyColor, undefined)
  assert.equal(gems.color('Nonexistent Gem').unknown, true)
})

test('the shipped data has attribute-less gems, and none of them is flagged unknown', () => {
  const gems = exampleGems()
  // These are the real cases from data/gems.json that triggered the report.
  for (const gem of ['Portal', 'Convocation', 'Quickstep']) {
    const c = gems.color(gem)
    assert.equal(c.color, 'W', `${gem} has no attribute, so it fits any socket`)
    assert.equal(c.unknown, false, `${gem} is in the gem data — it must not show "?"`)
    assert.equal(c.anyColor, true)
  }
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

test('once the dataset lists Siosa stock, a sourceless gem is NOT attributed to her', () => {
  // The wiki fetch writes an explicit Siosa/Lilly row for every gem they sell,
  // so "no source" becomes an answer, not a data gap. Guessing here used to send
  // people shopping in Act 3 for Vaal/Awakened/Transfigured gems that only drop.
  const gems: Record<string, { attr: 'int'; sources?: object[] }> = {}
  for (let i = 0; i < BROAD_VENDOR_DATA_MIN; i++) {
    gems[`Sold Gem ${i}`] = {
      attr: 'int',
      sources: [{ kind: 'vendor', act: 3, npc: 'Siosa', quest: 'A Fixture of Fate' }]
    }
  }
  gems['Awakened Nonsense Support'] = { attr: 'int' } // in the data, sold by nobody
  const data = new GemData(gems as never)

  assert.equal(data.earliestSource('Sold Gem 0', 'Witch')?.npc, 'Siosa')
  assert.equal(data.earliestSource('Awakened Nonsense Support', 'Witch'), null)

  // One row below the threshold the dataset isn't trusted, so the guess returns.
  delete gems['Sold Gem 0']
  assert.equal(
    new GemData(gems as never).earliestSource('Awakened Nonsense Support', 'Witch')?.fallback,
    true
  )
})

test('gems.json is shipped as a resource, since it is no longer bundled', () => {
  // The profile service reads gems.json from process.resourcesPath at runtime
  // instead of importing it (halves the main bundle). That means the packaging
  // config is now load-bearing: drop this entry and the installed app starts
  // with no gem colours and no sources, which nothing else here would catch —
  // typecheck, tests and the bundle build all stay green.
  const builder = readFileSync(repoPath('electron-builder.yml'), 'utf8')
  assert.match(builder, /from:\s*data\/gems\.json/, 'electron-builder must ship data/gems.json')
  assert.match(builder, /to:\s*gems\.json/, 'it must land at resources/gems.json')

  // And the file the config points at has to be loadable in the shape the
  // service expects (`{ gems: { … } }`).
  const raw = JSON.parse(readFileSync(repoPath('data/gems.json'), 'utf8')) as { gems?: object }
  assert.ok(raw.gems && typeof raw.gems === 'object')
  assert.ok(Object.keys(raw.gems).length > 100, 'gem data looks truncated')
})

test('missing gem data degrades to unknown colours instead of throwing', () => {
  // What the loader falls back to when the resource can't be read. The Gems tab
  // reports the reason separately (gemDataError); the engine must stay usable.
  const empty = new GemData({})
  assert.equal(empty.color('Frostbolt').unknown, true)
  assert.equal(empty.earliestSource('Frostbolt', 'Witch'), null)
  assert.equal(empty.info('Frostbolt'), undefined)
})

test('the shipped gem data never sends you to a vendor for drop-only gems', () => {
  const gems = exampleGems()
  // Vaal (corrupted drops), Awakened (endgame drops) and Transfigured ("… of X",
  // Labyrinth drops) are not vendor stock — no source beats a wrong source.
  for (const gem of [
    'Vaal Arc',
    'Awakened Spell Echo Support',
    'Ice Nova of Frostbolts',
    'Empower Support'
  ]) {
    assert.ok(gems.info(gem), `${gem} should be present in gems.json`)
    assert.equal(gems.earliestSource(gem, 'Witch'), null, `${gem} must not resolve to a vendor`)
  }
  // Regular campaign gems still resolve, so the dataset is genuinely being read.
  assert.equal(gems.earliestSource('Frostbolt', 'Witch')?.act, 1)
  // Wiki scaffolding must never have landed in the gem list.
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(repoPath('data/gems.json'), 'utf8')).gems).filter((k) => k.includes(':')), [])
})

test('the shipped gem data carries no HTML entities and no duplicate names', () => {
  const gems = JSON.parse(readFileSync(repoPath('data/gems.json'), 'utf8')).gems as Record<
    string,
    { sources?: Array<{ quest?: string; npc?: string }> }
  >
  const entity = /&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/
  const offenders: string[] = []
  const seen = new Map<string, string>()
  for (const [name, info] of Object.entries(gems)) {
    if (entity.test(name)) offenders.push(`gem name: ${name}`)
    for (const s of info.sources ?? []) {
      if (s.quest && entity.test(s.quest)) offenders.push(`${name} quest: ${s.quest}`)
      if (s.npc && entity.test(s.npc)) offenders.push(`${name} npc: ${s.npc}`)
    }
    // Gem lookup is case-insensitive, so two spellings of one name collide and
    // one silently wins — which is how the escaped duplicates hid.
    const key = name.toLowerCase()
    const prev = seen.get(key)
    if (prev) offenders.push(`duplicate: "${prev}" and "${name}"`)
    seen.set(key, name)
  }
  assert.deepEqual(offenders.slice(0, 10), [], 'run the fetch again after fixing scripts/gem-cargo.ts')

  // The quest that actually tripped this must be spelled the way the game does.
  const quests = new Set(
    Object.values(gems).flatMap((g) => (g.sources ?? []).map((s) => s.quest).filter(Boolean))
  )
  assert.ok(quests.has("The Siren's Cadence"))
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

test('upcoming rewards from later acts are dimmed by level, never hidden', () => {
  const gems = new GemData({
    'Act One Gift': { attr: 'str', requiredLevel: 4, sources: [{ kind: 'quest', act: 1, quest: 'q1' }] },
    'Act Three Gift': { attr: 'str', requiredLevel: 28, sources: [{ kind: 'quest', act: 3, quest: 'q3' }] }
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

  // Both are listed whatever act you're in: act detection lags behind reality,
  // and dropping a row is how gems went missing from the plan ("dim, don't
  // hide" — owner). The level does the gating instead.
  const acq = acquisitionsForStage(profile, 0, gems, { playerLevel: 5 })
  assert.deepEqual(acq.upcoming.map((e) => e.gem), ['Act One Gift', 'Act Three Gift'])

  // At level 5 the XP safe range is 3, so the level-4 gift is actionable now
  // and the level-28 one is shown dimmed with the level it comes online.
  const byGem = new Map(
    acq.plan.map((it) => [it.kind === 'reward' ? it.group.gems[0].gem : it.entry.gem, it])
  )
  assert.equal(byGem.get('Act One Gift')?.later, false)
  assert.equal(byGem.get('Act Three Gift')?.later, true)
  assert.equal(byGem.get('Act Three Gift')?.atLevel, 28)
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
  assert.equal(g[1].buyRest, undefined, 'nothing to buy when there is no choice')
})

test('a pick-one group prices the copies the quest does not give you', () => {
  const quest = (act: number, q: string): GemSourceInfo => ({
    kind: 'quest',
    act,
    quest: q,
    classes: ['Witch']
  })
  const gems = new GemData({
    // Four golems from one quest, same price tier (lvl 28+ -> Alchemy).
    Flame: { attr: 'int', requiredLevel: 34, sources: [quest(4, 'Breaking the Seal')] },
    Ice: { attr: 'int', requiredLevel: 34, sources: [quest(4, 'Breaking the Seal')] },
    Lightning: { attr: 'int', requiredLevel: 34, sources: [quest(4, 'Breaking the Seal')] },
    Stone: { attr: 'int', requiredLevel: 34, sources: [quest(4, 'Breaking the Seal')] },
    // Mixed tiers: Wisdom (lvl 1) and Alchemy (lvl 28).
    Cheap: { attr: 'int', requiredLevel: 1, sources: [quest(1, 'Mercy Mission')] },
    Dear: { attr: 'int', requiredLevel: 28, sources: [quest(1, 'Mercy Mission')] }
  })
  const names = ['Flame', 'Ice', 'Lightning', 'Stone', 'Cheap', 'Dear']
  const profile = parseProfile(
    JSON.stringify({
      meta: { name: 'pick', class: 'Witch' },
      stages: [{ range: [1, 60], socketGroups: [{ gems: names }] }],
      gemPlan: names.map((gem) => ({ gem }))
    })
  ).profile!
  const groups = acquisitionsForStage(profile, 0, gems).rewardGroups
  const byQuest = new Map(groups.map((g) => [g.quest, g]))

  // Four gems, one free: three buys at the shared tier.
  assert.deepEqual(byQuest.get('Breaking the Seal')?.buyRest, { count: 3, cost: 'Alchemy' })
  // Mixed tiers: you take the dearest free, so what is left is the cheap one.
  assert.deepEqual(byQuest.get('Mercy Mission')?.buyRest, { count: 1, cost: 'Wisdom' })
})

test('a pick-one group counts copies, not gems', () => {
  const gems = new GemData({
    Twice: {
      attr: 'int',
      requiredLevel: 12,
      sources: [{ kind: 'quest', act: 1, quest: 'Enemy at the Gate', classes: ['Witch'] }]
    },
    Once: {
      attr: 'int',
      requiredLevel: 12,
      sources: [{ kind: 'quest', act: 1, quest: 'Enemy at the Gate', classes: ['Witch'] }]
    }
  })
  const profile = parseProfile(
    JSON.stringify({
      meta: { name: 'copies', class: 'Witch' },
      // "Twice" sits in two links, so the build needs three copies in total.
      stages: [
        {
          range: [1, 20],
          socketGroups: [{ gems: ['Twice', 'Once'] }, { gems: ['Twice'] }]
        }
      ],
      gemPlan: [{ gem: 'Twice' }, { gem: 'Once' }]
    })
  ).profile!
  const g = acquisitionsForStage(profile, 0, gems).rewardGroups[0]
  assert.equal(g.pickOne, true)
  assert.deepEqual(g.buyRest, { count: 2, cost: 'Alteration' })
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

test('safeLevelRange grows by one every 16 levels', () => {
  assert.equal(safeLevelRange(1), 3)
  assert.equal(safeLevelRange(15), 3)
  assert.equal(safeLevelRange(16), 4)
  assert.equal(safeLevelRange(31), 4)
  assert.equal(safeLevelRange(32), 5)
})

test('the plan flags gems past the safe level range as coming up, without hiding them', () => {
  const gems = new GemData({
    Soon: { attr: 'int', requiredLevel: 10, sources: [{ kind: 'vendor', act: 1, npc: 'Nessa', classes: ['Witch'] }] },
    Later: { attr: 'int', requiredLevel: 31, sources: [{ kind: 'vendor', act: 3, npc: 'Clarissa', classes: ['Witch'] }] }
  })
  const profile = parseProfile(
    JSON.stringify({
      meta: { name: 'safezone', class: 'Witch' },
      stages: [{ range: [1, 40], socketGroups: [{ gems: ['Soon', 'Later'] }] }],
      gemPlan: [{ gem: 'Soon' }, { gem: 'Later' }]
    })
  ).profile!
  // At level 12 the safe range is 3 (threshold 15): Soon (lvl 10) is now,
  // Later (lvl 31) is coming up — but nothing is dropped.
  const plan = acquisitionsForStage(profile, 0, gems, { playerLevel: 12 }).plan
  assert.equal(plan.length, 2)
  const by = new Map(plan.map((it) => [it.kind === 'buy' ? it.entry.gem : '', it]))
  assert.equal(by.get('Soon')?.later, false)
  assert.equal(by.get('Later')?.later, true)
  assert.equal(by.get('Later')?.atLevel, 31)
  // Unknown player level flags nothing.
  assert.equal(acquisitionsForStage(profile, 0, gems).plan.every((it) => !it.later), true)
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
    acquisitionsForStage(profile, i, gems).plan.map((it) => (it.kind === 'buy' ? it.entry.gem : ''))

  assert.deepEqual(buys(0), ['Main']) // stage 0: Main is new (nothing before it)
  assert.deepEqual(buys(1), ['NewGem']) // stage 1: Main carried over -> hidden
  // ...but the purchases list (which drives the link-overview tags) still has both.
  assert.deepEqual(
    acquisitionsForStage(profile, 1, gems).purchases.map((e) => e.gem).sort(),
    ['Main', 'NewGem']
  )
})

test('quest rank is derived from gem levels and orders an act chronologically', () => {
  // Real Act 1 shape: each quest's gems scale with how far in it sits.
  const gems = new GemData({
    Early: { attr: 'int', requiredLevel: 1, sources: [{ kind: 'quest', act: 1, quest: 'Enemy at the Gate', classes: ['Witch'] }] },
    Mid: { attr: 'int', requiredLevel: 8, sources: [{ kind: 'quest', act: 1, quest: 'The Caged Brute', classes: ['Witch'] }] },
    Late: { attr: 'int', requiredLevel: 12, sources: [{ kind: 'quest', act: 1, quest: "The Siren's Cadence", classes: ['Witch'] }] }
  })
  // The rank orders the quests the way you actually play them...
  assert.ok(gems.questRank(1, 'Enemy at the Gate') < gems.questRank(1, 'The Caged Brute'))
  assert.ok(gems.questRank(1, 'The Caged Brute') < gems.questRank(1, "The Siren's Cadence"))
  assert.equal(gems.questRank(1, 'No Such Quest'), Number.MAX_SAFE_INTEGER) // unknown sorts last

  // A vendor's UNLOCK quest must not set the rank: "A Fixture of Fate" unlocks
  // Siosa, who sells level-1 gems — counting those would rank Act 3's latest
  // quest as its earliest (caught against real data).
  const withVendor = new GemData({
    Cheap: { attr: 'int', requiredLevel: 1, sources: [{ kind: 'vendor', act: 3, npc: 'Siosa', quest: 'A Fixture of Fate' }] },
    Reward: { attr: 'int', requiredLevel: 31, sources: [{ kind: 'quest', act: 3, quest: 'A Fixture of Fate', classes: ['Witch'] }] },
    Earlier: { attr: 'int', requiredLevel: 24, sources: [{ kind: 'quest', act: 3, quest: 'Lost in Love', classes: ['Witch'] }] }
  })
  assert.ok(withVendor.questRank(3, 'Lost in Love') < withVendor.questRank(3, 'A Fixture of Fate'))

  const profile = parseProfile(
    JSON.stringify({
      meta: { name: 'order', class: 'Witch' },
      // Listed in the WRONG order on purpose — the plan must fix it.
      stages: [{ range: [1, 20], socketGroups: [{ gems: ['Late', 'Mid', 'Early'] }] }],
      gemPlan: [{ gem: 'Late' }, { gem: 'Mid' }, { gem: 'Early' }]
    })
  ).profile!
  const plan = acquisitionsForStage(profile, 0, gems)
  assert.deepEqual(
    plan.plan.map((it) => (it.kind === 'reward' ? it.group.gems[0].gem : it.entry.gem)),
    ['Early', 'Mid', 'Late']
  )
})

test('a gem needed in two different links is counted (x2)', () => {
  const gems = new GemData({
    Twice: { attr: 'int', requiredLevel: 1, sources: [{ kind: 'vendor', act: 1, npc: 'Nessa', classes: ['Witch'] }] },
    Once: { attr: 'int', requiredLevel: 1, sources: [{ kind: 'vendor', act: 1, npc: 'Nessa', classes: ['Witch'] }] }
  })
  const profile = parseProfile(
    JSON.stringify({
      meta: { name: 'dupes', class: 'Witch' },
      stages: [
        {
          range: [1, 20],
          // "Twice" is socketed in BOTH links -> you need two copies.
          socketGroups: [{ gems: ['Twice', 'Once'] }, { gems: ['Twice'] }]
        }
      ],
      gemPlan: [{ gem: 'Twice' }, { gem: 'Once' }]
    })
  ).profile!
  const acq = acquisitionsForStage(profile, 0, gems)
  assert.equal(acq.purchases.find((e) => e.gem === 'Twice')?.count, 2)
  assert.equal(acq.purchases.find((e) => e.gem === 'Once')?.count, undefined)
})

test('a gem another class STARTS with is flagged as mulable', () => {
  const gems = new GemData({
    'Ruthless Support': { attr: 'str', requiredLevel: 1, sources: [{ kind: 'vendor', act: 3, npc: 'Siosa' }] },
    Fireball: { attr: 'int', requiredLevel: 1, sources: [{ kind: 'vendor', act: 1, npc: 'Nessa', classes: ['Witch'] }] }
  })
  // Marauder begins with Ruthless Support; the Witch begins with Fireball.
  const startingOwners = new Map([
    [normalizeGemName('Ruthless Support'), ['Marauder']],
    [normalizeGemName('Fireball'), ['Witch']]
  ])
  const starting = new Set([normalizeGemName('Fireball')]) // this Witch's own starter
  const profile = parseProfile(
    JSON.stringify({
      meta: { name: 'mule', class: 'Witch' },
      stages: [{ range: [1, 20], socketGroups: [{ gems: ['Ruthless Support', 'Fireball'] }] }],
      gemPlan: [{ gem: 'Ruthless Support' }, { gem: 'Fireball' }]
    })
  ).profile!
  const acq = acquisitionsForStage(profile, 0, gems, {
    startingGems: starting,
    playerLevel: 10,
    startingOwners
  })

  // A Witch can't quest Ruthless Support, but a level-1 Marauder starts with it.
  assert.deepEqual(acq.purchases.find((e) => e.gem === 'Ruthless Support')?.mule, ['Marauder'])
  // Your OWN starting gem is never a mule suggestion (you already have it).
  assert.equal(acq.other.find((e) => e.gem === 'Fireball')?.starting, true)
  assert.equal(acq.other.find((e) => e.gem === 'Fireball')?.mule, undefined)
})

test('mulable gems head the plan, whatever act their vendor sits in', () => {
  const gems = new GemData({
    // Sold in Act 3, but a level-1 Marauder hands it over before you start.
    'Ruthless Support': { attr: 'str', requiredLevel: 1, sources: [{ kind: 'vendor', act: 3, npc: 'Siosa' }] },
    'Buy A1': { attr: 'int', requiredLevel: 1, sources: [{ kind: 'vendor', act: 1, npc: 'Nessa', classes: ['Witch'] }] },
    'Reward A1': { attr: 'int', sources: [{ kind: 'quest', act: 1, quest: 'Enemy at the Gate', classes: ['Witch'] }] }
  })
  const profile = parseProfile(
    JSON.stringify({
      meta: { name: 'mule-order', class: 'Witch' },
      stages: [{ range: [1, 20], socketGroups: [{ gems: ['Reward A1', 'Buy A1', 'Ruthless Support'] }] }],
      gemPlan: [{ gem: 'Reward A1' }, { gem: 'Buy A1' }, { gem: 'Ruthless Support' }]
    })
  ).profile!
  const plan = acquisitionsForStage(profile, 0, gems, {
    playerLevel: 10,
    startingOwners: new Map([[normalizeGemName('Ruthless Support'), ['Marauder']]])
  }).plan

  assert.deepEqual(
    plan.map((it) => (it.kind === 'reward' ? it.group.gems[0].gem : it.entry.gem)),
    ['Ruthless Support', 'Reward A1', 'Buy A1']
  )
})

test('a choice lists the gem you need soonest first', () => {
  const quest = (): GemSourceInfo => ({
    kind: 'quest',
    act: 3,
    quest: 'Lost in Love',
    classes: ['Witch']
  })
  const gems = new GemData({
    Starter: { attr: 'int', requiredLevel: 1, sources: [{ kind: 'vendor', act: 1, npc: 'Nessa' }] },
    Discipline: { attr: 'int', requiredLevel: 24, sources: [quest()] },
    Frostbite: { attr: 'int', requiredLevel: 24, sources: [quest()] },
    Zealotry: { attr: 'int', requiredLevel: 24, sources: [quest()] }
  })
  const profile = parseProfile(
    JSON.stringify({
      meta: { name: 'soonest', class: 'Witch' },
      stages: [
        { range: [1, 31], socketGroups: [{ gems: ['Starter'] }] },
        // Frostbite is slotted at 32, the other two only at 62.
        { range: [32, 61], socketGroups: [{ gems: ['Starter', 'Frostbite'] }] },
        { range: [62, 90], socketGroups: [{ gems: ['Discipline', 'Frostbite', 'Zealotry'] }] }
      ],
      gemPlan: [{ gem: 'Starter' }, { gem: 'Discipline' }, { gem: 'Frostbite' }, { gem: 'Zealotry' }]
    })
  ).profile!
  // Viewed from stage 0, all three are upcoming — the order must follow when
  // you actually need them, not the alphabet.
  const g = acquisitionsForStage(profile, 0, gems).rewardGroups[0]
  assert.deepEqual(
    g.gems.map((e) => `${e.gem}@${e.fromLevel}`),
    ['Frostbite@32', 'Discipline@62', 'Zealotry@62']
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
  const acq = acquisitionsForStage(profile, 0, gems, { startingGems: starting })

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

test('an ascended character still counts as its base class', () => {
  // Client.txt reports the ascendancy after you ascend, so this is the exact
  // case that used to warn a Witch build about being played on a Witch.
  assert.equal(baseClassOf('Elementalist'), 'Witch')
  assert.equal(baseClassOf('Witch'), 'Witch')
  assert.equal(baseClassOf('Ascendant'), 'Scion')
  assert.equal(baseClassOf('juggernaut'), 'Marauder', 'case should not matter')
  // A name we can't place — a localized log, say — is not a mismatch claim.
  assert.equal(baseClassOf('Hexenmeisterin'), null)
  assert.equal(baseClassOf(''), null)
})

test('every ascendancy belongs to exactly one class', () => {
  const seen = new Map<string, string>()
  for (const cls of CLASSES) {
    assert.ok(ASCENDANCIES[cls].length > 0, `${cls} has no ascendancies`)
    for (const asc of ASCENDANCIES[cls]) {
      assert.equal(seen.get(asc), undefined, `${asc} is listed under two classes`)
      seen.set(asc, cls)
      assert.equal(baseClassOf(asc), cls)
    }
  }
  // No ascendancy shares a name with a base class, or the lookup would be
  // ambiguous and the base-class branch would silently win.
  for (const cls of CLASSES) assert.equal(seen.has(cls), false, `${cls} is also an ascendancy`)
})
