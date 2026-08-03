import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { GemData } from '../electron/profile/gems.ts'
import { findCharacter, socketGroupsOf, slotName, type ApiCharacter } from '../electron/ggg/parse.ts'
import { checkCharacter, gemKey, strictKey } from '../electron/ggg/diff.ts'
import { repoPath } from './helpers.ts'

// Everything here runs against a HAND-AUTHORED fixture — no part of this has met
// GGG's API (docs/GGG-API.md). These tests pin the logic, not the schema.

function fixture(): ApiCharacter {
  return JSON.parse(readFileSync(repoPath('tests/fixtures/ggg-character.json'), 'utf8'))
}

const GEMS = new GemData({
  'Freezing Pulse': { attr: 'int' },
  'Added Cold Damage Support': { attr: 'int' },
  'Inspiration Support': { attr: 'int' },
  'Herald of Ice': { attr: 'int' },
  'Herald of Thunder': { attr: 'int' },
  'Storm Call': { attr: 'int' },
  'Vaal Storm Call': { attr: 'int' },
  'Arcane Surge Support': { attr: 'int' },
  Frostbite: { attr: 'int' },
  Clarity: { attr: 'int' },
  'Frost Bomb': { attr: 'int' },
  'Orb of Storms': { attr: 'int' },
  Barrage: { attr: 'dex' },
  'Barrage Support': { attr: 'dex' }
})

const isGem = (name: string): boolean => GEMS.info(name) != null
const key = gemKey(GEMS)

const groups = (): ReturnType<typeof socketGroupsOf> => socketGroupsOf(fixture(), isGem)

test('socket groups come out of the equipment, one per link group', () => {
  const found = groups()
  assert.deepEqual(
    found.map((g) => [g.slot, g.gems.map((x) => x.name)]),
    [
      ['Body', ['Freezing Pulse', 'Added Cold Damage Support', 'Inspiration Support']],
      ['Body', ['Herald of Ice']],
      ['Weapon', ['Vaal Storm Call', 'Arcane Surge Support']],
      ['Helmet', ['Frostbite', 'Clarity']],
      ['Gloves', ['Frost Bomb']]
    ]
  )
})

test('what is socketed but not a gem never reaches the plan', () => {
  const names = groups().flatMap((g) => g.gems.map((x) => x.name))
  // An abyss jewel is a socketed item like any other, and a plain jewel is only
  // distinguishable by not being in the gem data at all.
  assert.ok(!names.includes('Ghastly Eye Jewel'))
  assert.ok(!names.includes('Cobalt Jewel'))
  // A socket index the item doesn't have means we've misread the shape. Drop the
  // gem rather than invent a group — the fixture's Gloves claim a socket 5.
  assert.ok(!names.includes('Orb of Storms'))
})

test('level and quality survive being display strings', () => {
  const body = groups()[0]
  assert.equal(body?.gems[0]?.level, 12)
  assert.equal(body?.gems[0]?.quality, 8) // "+8%"
  assert.equal(body?.gems[1]?.level, 11)
  assert.equal(body?.gems[2]?.level, undefined) // no properties at all
  const weapon = groups()[2]
  assert.equal(weapon?.gems[1]?.level, 20) // "20 (Max)"
})

test('slots read the way a player would say them', () => {
  assert.equal(slotName('BodyArmour'), 'Body')
  assert.equal(slotName('Weapon2'), 'Weapon (swap)')
  // An id we don't know should look odd, not disappear.
  assert.equal(slotName('Trinket'), 'Trinket')
  assert.equal(slotName(undefined), 'Equipment')
})

test('the character is found the way people type it', () => {
  const list = [{ name: 'FixtureCharacter' }, { name: 'Other' }]
  assert.equal(findCharacter(list, 'fixturecharacter')?.name, 'FixtureCharacter')
  assert.equal(findCharacter(list, '  FixtureCharacter ')?.name, 'FixtureCharacter')
  // A name the account doesn't have is not the first character in the list.
  assert.equal(findCharacter(list, 'Someone'), null)
  assert.equal(findCharacter(list, null), null)
})

test('a group that matches the plan says nothing else', () => {
  const check = checkCharacter(
    [{ gems: ['Freezing Pulse', 'Added Cold Damage Support', 'Inspiration Support'] }],
    groups(),
    key
  )
  const first = check.groups[0]
  assert.equal(first?.state, 'ok')
  assert.equal(first?.slot, 'Body')
  assert.equal(first?.missing.length, 0)
  assert.equal(first?.extra.length, 0)
})

test('a gem socketed in the wrong item is not the same as a missing one', () => {
  const check = checkCharacter(
    [{ gems: ['Freezing Pulse', 'Added Cold Damage Support', 'Frostbite'] }],
    groups(),
    key
  )
  const first = check.groups[0]
  assert.equal(first?.state, 'incomplete')
  assert.deepEqual(first?.elsewhere, [{ gem: 'Frostbite', slot: 'Helmet' }])
  assert.equal(first?.missing.length, 0, 'it is on the character — just not here')
})

test('a gem on nobody is missing, and the group it should be in is named', () => {
  const check = checkCharacter([{ gems: ['Freezing Pulse', 'Cyclone'] }], groups(), key)
  assert.deepEqual(check.groups[0]?.missing, ['Cyclone'])
  assert.equal(check.groups[0]?.state, 'incomplete')
})

test('a planned group with nothing of it equipped reads as unequipped', () => {
  const check = checkCharacter([{ gems: ['Cyclone', 'Ruthless Support'] }], groups(), key)
  assert.equal(check.groups[0]?.state, 'unequipped')
  assert.equal(check.groups[0]?.slot, null)
  assert.deepEqual(check.groups[0]?.missing, ['Cyclone', 'Ruthless Support'])
})

test('a Vaal version fills the link, and says which one you have', () => {
  const check = checkCharacter([{ gems: ['Storm Call', 'Arcane Surge Support'] }], groups(), key)
  const group = check.groups[0]
  assert.equal(group?.state, 'ok')
  assert.deepEqual(group?.variants, [{ planned: 'Storm Call', socketed: 'Vaal Storm Call' }])
  assert.deepEqual(group?.matched, ['Arcane Surge Support'])
})

test('a transfigured gem is a variant; two Heralds are not', () => {
  const equipped = [
    { slot: 'Body', gems: [{ name: 'Cold Snap of Power' }, { name: 'Herald of Thunder' }] }
  ]
  const check = checkCharacter([{ gems: ['Cold Snap', 'Herald of Ice'] }], equipped, strictKey)
  const group = check.groups[0]
  assert.deepEqual(group?.variants, [{ planned: 'Cold Snap', socketed: 'Cold Snap of Power' }])
  // The bug this guards: stripping " of …" turns both Heralds into "Herald" and
  // declares them interchangeable — which you would find out about in Act 6.
  assert.deepEqual(group?.missing, ['Herald of Ice'])
})

test('an exact name is not outbid by a variant of it', () => {
  const equipped = [{ slot: 'Body', gems: [{ name: 'Vaal Storm Call' }, { name: 'Storm Call' }] }]
  const check = checkCharacter([{ gems: ['Storm Call'] }], equipped, strictKey)
  assert.deepEqual(check.groups[0]?.matched, ['Storm Call'])
  assert.equal(check.groups[0]?.variants.length, 0)
  assert.deepEqual(check.groups[0]?.extra, ['Vaal Storm Call'])
})

test('the gem data decides what two spellings mean, not the string', () => {
  const planned = [{ gems: ['Added Cold Damage'] }]
  // Strict: the profile's shorthand and the API's full name are two strings.
  assert.deepEqual(checkCharacter(planned, groups(), strictKey).groups[0]?.missing, [
    'Added Cold Damage'
  ])
  // Backed by the dataset: the same gem.
  assert.deepEqual(checkCharacter(planned, groups(), key).groups[0]?.matched, ['Added Cold Damage'])

  // And the reason it goes through the dataset rather than just dropping
  // " Support": these are two different gems, and folding them together is the
  // collision gems.ts was fixed for.
  const barrage = [{ slot: 'Weapon', gems: [{ name: 'Barrage Support' }] }]
  const check = checkCharacter([{ gems: ['Barrage'] }], barrage, key)
  assert.deepEqual(check.groups[0]?.missing, ['Barrage'])
  // Nothing in common means the two were never paired up in the first place:
  // the bow skill is still owed, and the support is somebody else's link.
  assert.equal(check.groups[0]?.state, 'unequipped')
  assert.deepEqual(check.unplanned.map((g) => g.slot), ['Weapon'])
})

test('a planned group goes to the equipped group that looks most like it', () => {
  const equipped = [
    { slot: 'Boots', gems: [{ name: 'Freezing Pulse' }] },
    {
      slot: 'Body',
      gems: [
        { name: 'Freezing Pulse' },
        { name: 'Added Cold Damage Support' },
        { name: 'Inspiration Support' }
      ]
    }
  ]
  const check = checkCharacter(
    [{ gems: ['Freezing Pulse', 'Added Cold Damage Support', 'Inspiration Support'] }],
    equipped,
    key
  )
  assert.equal(check.groups[0]?.slot, 'Body', 'three of three beats one of three')
  // The one-gem group wasn't consumed, so it's reported as its own thing.
  assert.deepEqual(check.unplanned.map((g) => g.slot), ['Boots'])
})

test('one equipped group cannot satisfy two planned ones', () => {
  const equipped = [{ slot: 'Body', gems: [{ name: 'Freezing Pulse' }] }]
  const check = checkCharacter([{ gems: ['Freezing Pulse'] }, { gems: ['Freezing Pulse'] }], equipped, key)
  assert.equal(check.groups[0]?.state, 'ok')
  assert.equal(check.groups[1]?.state, 'unequipped', 'you own one copy, not two')
  assert.equal(check.unplanned.length, 0)
})

test('improvising is not an error', () => {
  const check = checkCharacter([{ gems: ['Freezing Pulse'] }], groups(), key)
  // Everything else on the character comes back as unplanned, not as a problem.
  assert.deepEqual(
    check.unplanned.map((g) => g.slot),
    ['Body', 'Weapon', 'Helmet', 'Gloves']
  )
  assert.equal(check.groups[0]?.state, 'ok')
})

test('gems in the matched group that the plan never asked for are named', () => {
  const check = checkCharacter([{ gems: ['Frostbite'] }], groups(), key)
  assert.equal(check.groups[0]?.slot, 'Helmet')
  assert.deepEqual(check.groups[0]?.extra, ['Clarity'])
  assert.equal(check.groups[0]?.state, 'ok', 'a spare socket is not a missing gem')
})

test('nothing equipped at all is answered, not crashed on', () => {
  assert.deepEqual(socketGroupsOf(null, isGem), [])
  assert.deepEqual(socketGroupsOf({ equipment: [] }, isGem), [])
  assert.deepEqual(socketGroupsOf({ equipment: [{ inventoryId: 'Ring' }] }, isGem), [])
  const check = checkCharacter([{ gems: ['Freezing Pulse'] }], [], key)
  assert.equal(check.groups[0]?.state, 'unequipped')
})
