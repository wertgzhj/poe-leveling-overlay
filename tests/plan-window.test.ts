import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseProfile } from '../electron/profile/profile.ts'
import { GemData, type GemSourceInfo } from '../electron/profile/gems.ts'
import { acquisitionsForStage, linkChanges, planWindow, type AcquisitionContext } from '../electron/profile/engine.ts'
import { ACT_START_LEVEL, actAtLevel, actsOfLevels } from '../electron/profile/acts.ts'

// The shopping list's scenarios, as agreed with the owner: a stage lists what
// you can get from the acts you've reached — now, or for later — and a stage
// paged to shows its own acts. One test per scenario, numbered as agreed.

const q = (act: number, quest: string): GemSourceInfo => ({ kind: 'quest', act, quest, classes: ['Marauder'] })
const gems = new GemData({
  'A1 Now': { attr: 'str', requiredLevel: 1, sources: [q(1, 'Enemy at the Gate')] },
  'A1 Later': { attr: 'str', requiredLevel: 8, sources: [q(1, "The Siren's Cadence")] },
  'A2 Buy': { attr: 'str', requiredLevel: 10, sources: [{ kind: 'vendor', act: 2, npc: 'Yeena' }] },
  'A2 Reward': { attr: 'str', requiredLevel: 12, sources: [q(2, 'Intruders in Black')] },
  'A2 Later': { attr: 'str', requiredLevel: 16, sources: [q(2, 'Sharp and Cruel')] },
  'A3 Later': { attr: 'str', requiredLevel: 24, sources: [q(3, 'Lost in Love')] }
})
const STAGES: Array<[[number, number], string[]]> = [
  [[1, 4], ['A1 Now']], // Act 1
  [[5, 11], ['A1 Now', 'A2 Buy']], // Act 1, wants an Act 2 gem already
  [[12, 21], ['A1 Now', 'A2 Buy', 'A2 Reward']], // Act 2
  [[22, 31], ['A1 Now', 'A2 Buy', 'A2 Reward', 'A1 Later', 'A2 Later', 'A3 Later']] // Act 3
]
const all = [...new Set(STAGES.flatMap(([, g]) => g))]
const profile = parseProfile(
  JSON.stringify({
    meta: { name: 'scenarios', class: 'Marauder' },
    stages: STAGES.map(([range, g]) => ({ range, socketGroups: [{ gems: g }] })),
    gemPlan: all.map((gem) => ({ gem }))
  })
).profile!

/** Every gem the stage's to-do list names, rewards and buys alike. */
function listed(stage: number, ctx: AcquisitionContext): string[] {
  return acquisitionsForStage(profile, stage, gems, ctx)
    .plan.flatMap((it) => (it.kind === 'reward' ? it.group.gems.map((g) => g.gem) : [it.entry.gem]))
    .sort()
}

test('the act table: which act a level is in, which acts a range covers', () => {
  assert.equal(actAtLevel(1), 1)
  assert.equal(actAtLevel(11), 1)
  assert.equal(actAtLevel(12), 2)
  assert.equal(actAtLevel(70), 10)
  assert.deepEqual(actsOfLevels([1, 4]), [1, 1])
  assert.deepEqual(actsOfLevels([22, 31]), [3, 3])
  assert.deepEqual(actsOfLevels([5, 40]), [1, 5])
  // Strictly rising, or a level would sit in two acts.
  for (let a = 2; a <= 10; a++) assert.ok(ACT_START_LEVEL[a] > ACT_START_LEVEL[a - 1])
})

test('1 · a new character in Act 1: Act 1 for now and later, nothing from Act 2 on', () => {
  assert.deepEqual(listed(0, { playerLevel: 2, actReached: 1, liveIndex: 0 }), ['A1 Later', 'A1 Now'])
})

test('2 · reaching Act 2 brings its quests in; an Act 1 pick only for later stays behind', () => {
  // Live on the Act 2 stage: its own Act 2 reward, and Act 2's pick for later.
  const got = listed(2, { playerLevel: 13, actReached: 2, liveIndex: 2 })
  assert.ok(got.includes('A2 Reward'))
  assert.ok(got.includes('A2 Later'))
  // Decision A2: an Act 1 pick that's only for later isn't on an Act 2 stage.
  assert.ok(!got.includes('A1 Later'))
  assert.ok(!got.includes('A3 Later'))
})

test('3 · paging back shows what the stage showed when it was live', () => {
  // Level 31, Act 4 reached, looking at the opening stage: Act 1 only.
  assert.deepEqual(listed(0, { playerLevel: 31, actReached: 4, liveIndex: 3 }), ['A1 Later', 'A1 Now'])
})

test('4 · paging forward previews everything the stage covers (decision B1)', () => {
  // Still in Act 1, peeking at the Act 3 stage: its Act 2 and Act 3 gems too.
  const got = listed(3, { playerLevel: 2, actReached: 1, liveIndex: 0 })
  assert.ok(got.includes('A2 Later'))
  assert.ok(got.includes('A3 Later'))
})

test('5 · a gem from an act you haven\'t reached waits in the links, off the list', () => {
  const acq = acquisitionsForStage(profile, 1, gems, { playerLevel: 6, actReached: 1, liveIndex: 1 })
  const names = acq.plan.flatMap((it) => (it.kind === 'reward' ? it.group.gems.map((g) => g.gem) : [it.entry.gem]))
  assert.ok(!names.includes('A2 Buy'))
  assert.equal(acq.linkMarks['a2 buy'], 'notYet', 'grey in the links, so it is not lost')
  // Entering Act 2 puts it on the list.
  assert.ok(listed(1, { playerLevel: 12, actReached: 2, liveIndex: 1 }).includes('A2 Buy'))
})

test('6 · the furthest act counts, not the town you stand in', () => {
  // The live stage reads actReached, which only moves forward (CharacterRuns);
  // the zone you're in doesn't enter into it at all.
  assert.deepEqual(planWindow(profile.stages[1], 1, 1, 3), { from: 1, to: 3 })
})

test('8 · with no act known yet, the stage\'s own acts stand in', () => {
  assert.deepEqual(listed(0, { playerLevel: 2 }), ['A1 Later', 'A1 Now'])
  assert.deepEqual(planWindow(profile.stages[3], 3, 3, null), { from: 3, to: 3 })
})

test('the window: live, back, forward, and an over-levelled character', () => {
  const s = profile.stages
  assert.deepEqual(planWindow(s[0], 0, 0, 1), { from: 1, to: 1 })
  assert.deepEqual(planWindow(s[0], 0, 3, 4), { from: 1, to: 1 }, 'back: its own acts')
  assert.deepEqual(planWindow(s[3], 3, 0, 1), { from: 3, to: 3 }, 'forward: its own acts')
  // Level 22 but only in Act 2: the live stage says Act 3, you're in Act 2.
  // The window must not turn inside out.
  assert.deepEqual(planWindow(s[3], 3, 3, 2), { from: 2, to: 2 })
})

test('two vendors in one act: the earlier quest\'s wins, not the data\'s order', () => {
  // Act 3 as the wiki lists it: Siosa (after A Fixture of Fate, in the
  // Library) before Clarissa (in town, after Lost in Love — half an act
  // earlier). The rewards are what place the two quests in the act.
  const data = new GemData({
    'Lost Reward': { attr: 'str', requiredLevel: 24, sources: [q(3, 'Lost in Love')] },
    'Fixture Reward': { attr: 'str', requiredLevel: 31, sources: [q(3, 'A Fixture of Fate')] },
    Vulnerability: {
      attr: 'int',
      requiredLevel: 24,
      sources: [
        { kind: 'vendor', act: 3, npc: 'Siosa', quest: 'A Fixture of Fate' },
        { kind: 'vendor', act: 3, npc: 'Clarissa', quest: 'Lost in Love' }
      ]
    }
  })
  assert.equal(data.earliestVendor('Vulnerability', 'Marauder')?.npc, 'Clarissa')
  assert.equal(data.earliestSource('Vulnerability', 'Marauder')?.npc, 'Clarissa')
})

test("a stage counts its own copies, not the build's most", () => {
  // As a PoB import writes it: count 2, because the last stage slots the gem
  // in two links. The stage before slots it once and must say 1×.
  const data = new GemData({
    Autoexertion: { attr: 'str', requiredLevel: 24, sources: [{ kind: 'vendor', act: 3, npc: 'Clarissa' }] }
  })
  const build = parseProfile(
    JSON.stringify({
      meta: { name: 'copies', class: 'Marauder' },
      stages: [
        { range: [22, 31], socketGroups: [{ gems: ['Autoexertion'] }] },
        { range: [32, 40], socketGroups: [{ gems: ['Autoexertion'] }, { gems: ['Autoexertion'] }] }
      ],
      gemPlan: [{ gem: 'Autoexertion', count: 2 }]
    })
  ).profile!
  const countOn = (stage: number): number | undefined =>
    acquisitionsForStage(build, stage, data, { actReached: 3 }).purchases.find((e) => e.gem === 'Autoexertion')?.count
  assert.equal(countOn(0), undefined, 'one copy: no count')
  assert.equal(countOn(1), 2)
})

// ---------- what changed in the links ----------

test('a second copy is new: on the list, and NEW on the copy that is', () => {
  // After Crematorium slots Autoexertion once, Endgame twice (two links).
  const data = new GemData({
    Autoexertion: { attr: 'str', requiredLevel: 24, sources: [{ kind: 'vendor', act: 3, npc: 'Clarissa' }] },
    'Intimidating Cry': { attr: 'str', requiredLevel: 4, sources: [q(1, 'The Caged Brute')] },
    "Battlemage's Cry": { attr: 'str', requiredLevel: 24, sources: [{ kind: 'vendor', act: 3, npc: 'Clarissa' }] }
  })
  const build = parseProfile(
    JSON.stringify({
      meta: { name: 'copies', class: 'Marauder' },
      stages: [
        { range: [30, 50], socketGroups: [{ gems: ['Autoexertion', 'Intimidating Cry'] }] },
        {
          range: [51, 70],
          socketGroups: [{ gems: ['Autoexertion', 'Intimidating Cry'] }, { gems: ['Autoexertion', "Battlemage's Cry"] }]
        }
      ],
      gemPlan: [{ gem: 'Autoexertion', count: 2 }, { gem: 'Intimidating Cry' }, { gem: "Battlemage's Cry" }]
    })
  ).profile!
  const acq = acquisitionsForStage(build, 1, data, { actReached: 10, playerLevel: 60 })
  // The list asks for the one more copy — no "2×", that's the extra only.
  const buys = acq.plan.flatMap((it) => (it.kind === 'buy' ? [it.entry] : []))
  const auto = buys.filter((e) => e.gem === 'Autoexertion')
  assert.equal(auto.length, 1)
  assert.equal(auto[0].count, undefined)
  // NEW on the second link's copy, not on the one you already had.
  assert.deepEqual(acq.linkChanges.fresh, [
    [false, false],
    [true, true]
  ])
  // The first link is unchanged, the second wholly new: no RELINKED.
  assert.deepEqual(acq.linkChanges.relinked, [false, false])
})

test('RELINKED: a gem moved between links or one left — not a link that only grew', () => {
  const stage = (...groups: string[][]) => ({ range: [1, 10] as [number, number], socketGroups: groups.map((gems) => ({ gems })) })
  const prev = stage(['A', 'B', 'C'], ['D'])
  // Grew by a new gem: NEW explains it.
  assert.deepEqual(linkChanges(prev, stage(['A', 'B', 'C', 'E'], ['D'])).relinked, [false, false])
  // Lost a gem (C gone from the build): rearranged.
  assert.deepEqual(linkChanges(prev, stage(['A', 'B'], ['D'])).relinked, [true, false])
  // C moved to D's link: both changed.
  assert.deepEqual(linkChanges(prev, stage(['A', 'B'], ['D', 'C'])).relinked, [true, true])
  // Merged: one link of old gems that were apart.
  assert.deepEqual(linkChanges(prev, stage(['A', 'B', 'C', 'D'])).relinked, [true])
  // Order inside a link doesn't matter.
  assert.deepEqual(linkChanges(prev, stage(['C', 'A', 'B'], ['D'])).relinked, [false, false])
  // The first stage has nothing to compare with.
  assert.deepEqual(linkChanges(undefined, prev), { fresh: [[false, false, false], [false]], relinked: [false, false] })
})
