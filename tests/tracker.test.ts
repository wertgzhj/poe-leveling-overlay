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
  feed(tracker, '… [INFO Client 1] : You have entered The Coast.')
  assert.equal(areas.length, 1)
})

test('zoneEntered without a Generating line falls back to reverse name lookup', () => {
  const { tracker, areas } = makeTracker()
  feed(tracker, '… [INFO Client 1] : You have entered The Coast.')
  assert.equal(areas.length, 1)
  assert.equal(areas[0].areaId, '1_1_2')
  assert.equal(areas[0].areaLevel, null)
})

test('word-id instances (hideouts/maps) adopt their localized names', () => {
  // Real lines from act1-real.log — non-campaign instances have word ids.
  const { tracker, areas } = makeTracker()
  feed(tracker, '2026/04/19 13:15:21 310128500 1186a886 [DEBUG Client 33248] Generating level 60 area "HideoutWorldTurtle" with seed 1')
  assert.equal(areas[0].name, 'HideoutWorldTurtle') // unmapped — id as placeholder
  feed(tracker, '2026/04/19 13:15:22 310129390 cffb06dd [INFO Client 33248] : You have entered Cosmic Turtle Hideout.')
  assert.equal(areas.length, 2)
  assert.equal(areas[1].areaId, 'HideoutWorldTurtle')
  assert.equal(areas[1].name, 'Cosmic Turtle Hideout')
  assert.equal(areas[1].areaLevel, 60)
})

test('a wrong display name in the area map self-heals from the entered line', () => {
  const { tracker, areas } = makeTracker()
  feed(tracker, '… [DEBUG Client 1] Generating level 2 area "1_1_2" with seed 9')
  feed(tracker, '… [INFO Client 1] : You have entered Some Renamed Coast.')
  assert.equal(areas.length, 2)
  assert.equal(areas[1].areaId, '1_1_2', 'id from the Generating line is kept')
  assert.equal(areas[1].name, 'Some Renamed Coast')
  assert.equal(areas[1].areaLevel, 2)
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

test('real capture: backscan resumes the fresh-character session correctly', () => {
  const { tracker, areas, levels } = makeTracker()
  tracker.backscan(loadFixtureLines('act1-real.log'), parser)
  assert.equal(areas.length, 0, 'backscan must not emit')
  assert.equal(levels.length, 0, 'backscan must not emit')

  const snap = tracker.snapshot()
  assert.equal(snap.character, 'Exile1')
  assert.equal(snap.level, 4)
  assert.equal(snap.charClass, 'Witch')
  assert.equal(snap.area?.areaId, '1_1_town')
  assert.equal(snap.area?.name, "Lioneye's Watch")
  assert.equal(snap.area?.areaLevel, 13)
})

test('hydrate restores persisted state only where the log gave nothing', () => {
  const { tracker } = makeTracker()
  tracker.hydrate({
    area: { areaId: '1_1_4_1', name: 'The Submerged Passage', areaLevel: 5, ts: 1 },
    character: 'MyExile',
    charClass: 'Marauder',
    level: 7
  })
  const snap = tracker.snapshot()
  assert.equal(snap.area?.areaId, '1_1_4_1')
  assert.equal(snap.level, 7)

  // A live event then wins over hydrated state.
  feed(tracker, '… [INFO Client 1] : MyExile (Marauder) is now level 8')
  assert.equal(tracker.snapshot().level, 8)
})
