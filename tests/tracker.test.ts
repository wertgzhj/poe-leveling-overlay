import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ProgressTracker, type AreaState, type LevelUpEvent } from '../electron/log/tracker.ts'
import { makeParser, loadAreaNames, loadFixtureLines } from './helpers.ts'

const parser = makeParser()

function makeTracker(bound: string | null = null) {
  const areas: AreaState[] = []
  const levels: LevelUpEvent[] = []
  const tracker = new ProgressTracker({
    areaNames: loadAreaNames(),
    boundCharacter: bound,
    callbacks: {
      onArea: (a) => areas.push(a),
      onLevelUp: (l) => levels.push(l)
    },
    now: () => 1000
  })
  return { tracker, areas, levels }
}

function feed(tracker: ProgressTracker, line: string): void {
  const ev = parser.parseLine(line)
  if (ev) tracker.handle(ev)
}

test('areaGenerated drives the area with mapped display name + monster level', () => {
  const { tracker, areas } = makeTracker()
  feed(tracker, '… [DEBUG Client 1] Generating level 1 area "1_1_town" with seed 7')
  assert.equal(areas.length, 1)
  assert.deepEqual(areas[0], { areaId: '1_1_town', name: "Lioneye's Watch", areaLevel: 1, ts: 1000 })
})

test('zoneEntered matching the current area is a silent confirmation', () => {
  const { tracker, areas } = makeTracker()
  feed(tracker, '… [DEBUG Client 1] Generating level 2 area "1_1_2" with seed 9')
  feed(tracker, '… [INFO Client 1] : You have entered The Mud Flats.')
  assert.equal(areas.length, 1)
})

test('zoneEntered without a Generating line falls back to reverse name lookup', () => {
  const { tracker, areas } = makeTracker()
  feed(tracker, '… [INFO Client 1] : You have entered The Ledge.')
  assert.equal(areas.length, 1)
  assert.equal(areas[0].areaId, '1_1_4')
  assert.equal(areas[0].areaLevel, null)
})

test('unknown areaId adopts the localized name from the follow-up line', () => {
  const { tracker, areas } = makeTracker()
  feed(tracker, '… [DEBUG Client 1] Generating level 33 area "2_6_7_1" with seed 1')
  assert.equal(areas[0].name, '2_6_7_1') // no mapping yet — id as placeholder
  feed(tracker, '… [INFO Client 1] : You have entered Prisoner\'s Gate.')
  assert.equal(areas.length, 2)
  assert.equal(areas[1].areaId, '2_6_7_1')
  assert.equal(areas[1].name, "Prisoner's Gate")
})

test('first live level-up adopts the character; party members stay unbound', () => {
  const { tracker, levels } = makeTracker()
  feed(tracker, '… [INFO Client 1] : MyExile (Marauder) is now level 2')
  feed(tracker, '… [INFO Client 1] : SomeFriend (Witch) is now level 3')
  feed(tracker, '… [INFO Client 1] : MyExile (Marauder) is now level 3')
  assert.deepEqual(levels.map((l) => l.isBound), [true, false, true])
  assert.equal(tracker.snapshot().character, 'MyExile')
  assert.equal(tracker.snapshot().level, 3)
  assert.equal(tracker.snapshot().charClass, 'Marauder')
})

test('explicit binding overrides adoption and survives party level-ups', () => {
  const { tracker, levels } = makeTracker('MyExile')
  feed(tracker, '… [INFO Client 1] : SomeFriend (Witch) is now level 9')
  feed(tracker, '… [INFO Client 1] : MyExile (Marauder) is now level 4')
  assert.deepEqual(levels.map((l) => l.isBound), [false, true])
  assert.equal(tracker.snapshot().level, 4)
})

test('backscan replays silently and resumes area + bound level', () => {
  const { tracker, areas, levels } = makeTracker()
  tracker.backscan(loadFixtureLines('act1-synthetic.log'), parser)
  assert.equal(areas.length, 0, 'backscan must not emit')
  assert.equal(levels.length, 0, 'backscan must not emit')

  const snap = tracker.snapshot()
  // Most frequent level-up name in the window is the character (2 vs 1).
  assert.equal(snap.character, 'MyExile')
  assert.equal(snap.level, 5)
  assert.equal(snap.charClass, 'Marauder')
  // Last area line is the town re-entry via the fallback path.
  assert.equal(snap.area?.areaId, '1_1_town')
  assert.equal(snap.area?.name, "Lioneye's Watch")
})

test('changing the explicit binding rebinds level from what was already seen', () => {
  const { tracker } = makeTracker()
  tracker.backscan(loadFixtureLines('act1-synthetic.log'), parser)
  tracker.setBoundCharacter('SomeFriend')
  const snap = tracker.snapshot()
  assert.equal(snap.character, 'SomeFriend')
  assert.equal(snap.level, 3)
  assert.equal(snap.charClass, 'Witch')
})

test('hydrate restores persisted state only where the log gave nothing', () => {
  const { tracker } = makeTracker()
  tracker.hydrate({
    area: { areaId: '1_1_3', name: 'The Submerged Passage', areaLevel: 5, ts: 1 },
    character: 'MyExile',
    charClass: 'Marauder',
    level: 7
  })
  const snap = tracker.snapshot()
  assert.equal(snap.area?.areaId, '1_1_3')
  assert.equal(snap.level, 7)

  // A live event then wins over hydrated state.
  feed(tracker, '… [INFO Client 1] : MyExile (Marauder) is now level 8')
  assert.equal(tracker.snapshot().level, 8)
})
