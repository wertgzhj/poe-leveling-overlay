import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SHOW_ALL } from '../electron/show-rules.ts'
import { STRIP_LINES, stripModel, townAct, townGems, type StripInput } from '../electron/strip.ts'
import type { AcquisitionEntry, AcquisitionItem } from '../electron/profile/engine/types.ts'

const entry = (gem: string, act: number, more: Partial<AcquisitionEntry> = {}): AcquisitionEntry => ({
  gem,
  bucket: 'purchase',
  act,
  ...more
})
const buy = (gem: string, act: number, npc = 'Nessa', later = false): AcquisitionItem => ({
  kind: 'buy',
  entry: entry(gem, act, { npc }),
  later
})
const reward = (gems: string[], act: number, quest: string, later = false): AcquisitionItem => ({
  kind: 'reward',
  group: { quest, act, pickOne: gems.length > 1, gems: gems.map((g) => entry(g, act, { bucket: 'reward', quest })) },
  later
})

const base: StripInput = {
  areaId: '1_2_town',
  show: SHOW_ALL,
  choice: null,
  lab: null,
  trial: null,
  god: null,
  plan: [],
  passive: { name: 'Life and Armour', points: 9, total: 26 },
  respec: null
}

test('a town is known by its area id, and so is its act', () => {
  assert.equal(townAct('1_1_town'), 1)
  assert.equal(townAct('1_2_town'), 2)
  assert.equal(townAct('2_6_town'), 6)
  assert.equal(townAct('1_2_7'), null, 'a zone')
  assert.equal(townAct('HideoutWorldTurtle'), null)
  assert.equal(townAct('2_11_endgame_town'), null, 'Karui Shores is no campaign act')
  assert.equal(townAct(null), null)
})

test("the town's list: this act's rewards and buys that are due now", () => {
  const plan = [
    reward(['Ruthless'], 1, 'The Caged Brute'),
    buy('Cleave', 1),
    reward(['Herald of Ash'], 2, 'Intruders in Black'),
    reward(['Cruelty', 'Melee Physical Damage'], 2, 'Sharp and Cruel'),
    buy('Blood Rage', 2, 'Yeena'),
    buy('Cyclone', 2, 'Yeena', true)
  ]
  assert.deepEqual(
    townGems(plan, 2).map((g) => [g.how, g.gems.map((x) => x.name).join(' / '), g.from]),
    [
      ['take', 'Herald of Ash', 'Intruders in Black'],
      ['pick', 'Cruelty / Melee Physical Damage', 'Sharp and Cruel'],
      ['buy', 'Blood Rage', 'Yeena']
    ]
  )
  assert.equal(townGems(plan, 3).length, 0)
})

test('a reward names the NPC who hands it over, when the data has one', () => {
  const withNpc: AcquisitionItem = {
    kind: 'reward',
    group: {
      quest: 'Intruders in Black',
      act: 2,
      pickOne: false,
      gems: [entry('Herald of Ash', 2, { bucket: 'reward', quest: 'Intruders in Black', npc: 'Greust' })]
    },
    later: false
  }
  assert.equal(townGems([withNpc], 2)[0].from, 'Greust')
  assert.equal(townGems([reward(['Herald of Ash'], 2, 'Intruders in Black')], 2)[0].from, 'Intruders in Black')
})

test('in a zone: the reminder and the passive, no gems', () => {
  const m = stripModel({ ...base, areaId: '1_2_7', trial: 'chamber', plan: [buy('Cleave', 2)] })
  assert.deepEqual(m.notice, { kind: 'trial', id: 'chamber' })
  assert.deepEqual(m.gems, [])
  assert.equal(m.passive?.name, 'Life and Armour')
})

test('one reminder, the most costly to miss, and only the ones switched on', () => {
  const all = {
    ...base,
    choice: { id: 'bandit' as const, wants: 'help Alira' },
    lab: 'normal' as const,
    trial: 'chamber',
    god: { soul: 'Soul of Shakari' }
  }
  assert.equal(stripModel(all).notice?.kind, 'choice')
  assert.equal(stripModel({ ...all, show: { ...SHOW_ALL, bandit: false } }).notice?.kind, 'lab')
  assert.equal(stripModel({ ...all, choice: null, lab: null }).notice?.kind, 'trial')
  // a respec: after a trial here, before a god
  const respec = { key: 'respec:2:5', names: ['INT'], after: null }
  assert.equal(stripModel({ ...all, choice: null, lab: null, respec }).notice?.kind, 'trial')
  assert.equal(stripModel({ ...all, choice: null, lab: null, trial: null, respec }).notice?.kind, 'respec')
  assert.equal(
    stripModel({ ...all, choice: null, lab: null, trial: null, respec, show: { ...SHOW_ALL, respec: false } }).notice?.kind,
    'god'
  )
  const godOnly = { ...base, god: { soul: 'Soul of Shakari' } }
  assert.equal(stripModel(godOnly).notice?.kind, 'god')
  assert.equal(stripModel({ ...godOnly, show: { ...SHOW_ALL, pantheon: false } }).notice, null)
})

test('it never grows past four lines: the passive steps aside, then "+N more"', () => {
  const two = [buy('Cleave', 2), buy('Blood Rage', 2)]
  const lines = (m: ReturnType<typeof stripModel>): number =>
    (m.notice ? 1 : 0) + m.gems.length + (m.more ? 1 : 0) + (m.passive ? 1 : 0)

  // two gems and the passive: all of it
  const calm = stripModel({ ...base, plan: two })
  assert.deepEqual([calm.gems.length, calm.more, calm.passive != null], [2, 0, true])

  // four gems: the passive goes, the gems stay
  const four = stripModel({ ...base, plan: [...two, buy('Onslaught', 2), buy('Sunder', 2)] })
  assert.deepEqual([four.gems.length, four.more, four.passive], [4, 0, null])

  // five gems: three and "+2 more"
  const five = stripModel({ ...base, plan: [...two, buy('Onslaught', 2), buy('Sunder', 2), buy('Leap Slam', 2)] })
  assert.deepEqual([five.gems.length, five.more, five.passive], [3, 2, null])

  // a reminder takes a line from them
  const busy = stripModel({ ...base, lab: 'normal', plan: [...two, buy('Onslaught', 2), buy('Sunder', 2)] })
  assert.deepEqual([busy.gems.length, busy.more], [2, 2])

  for (const m of [calm, four, five, busy]) assert.ok(lines(m) <= STRIP_LINES, `${lines(m)} lines`)
})

test('switched off for the strip: no gems, no passive', () => {
  const m = stripModel({ ...base, plan: [buy('Cleave', 2)], show: { ...SHOW_ALL, gemsToGet: false, passive: false } })
  assert.deepEqual([m.gems, m.passive], [[], null])
})
