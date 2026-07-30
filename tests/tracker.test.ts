import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ProgressTracker,
  zoneFit,
  type AreaState,
  type LevelUpEvent
} from '../electron/log/tracker.ts'
import { safeLevelRange } from '../electron/profile/gems.ts'
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

test('a new character (entering the Twilight Strand) rebinds in auto mode', () => {
  const { tracker, levels } = makeTracker() // no explicit binding
  feed(tracker, '… [INFO Client 1] : OldChar (Witch) is now level 20')
  assert.equal(tracker.snapshot().character, 'OldChar')

  // Start a fresh character: entering the Twilight Strand re-arms adoption...
  feed(tracker, '… [DEBUG Client 1] Generating level 1 area "1_1_1" with seed 5')
  assert.equal(tracker.snapshot().character, null) // binding released
  // ...and the new character's first level-up binds.
  feed(tracker, '… [INFO Client 1] : NewChar (Marauder) is now level 2')
  assert.equal(tracker.snapshot().character, 'NewChar')
  assert.equal(tracker.snapshot().level, 2)
  assert.equal(levels.at(-1)?.isBound, true)
})

test('an explicit binding is NOT overridden by entering the Twilight Strand', () => {
  const { tracker } = makeTracker('MyMain')
  feed(tracker, '… [DEBUG Client 1] Generating level 1 area "1_1_1" with seed 5')
  feed(tracker, '… [INFO Client 1] : SomeoneElse (Duelist) is now level 2')
  assert.equal(tracker.snapshot().character, 'MyMain') // still pinned
})

test('detect character locks onto the most recent level-up, even after switching', () => {
  const { tracker } = makeTracker() // auto mode
  assert.equal(tracker.detectCurrentCharacter(), null) // no level-up seen yet

  feed(tracker, '… [INFO Client 1] : Alpha (Witch) is now level 10')
  feed(tracker, '… [INFO Client 1] : Beta (Marauder) is now level 3')

  // Auto-adoption stuck on the first-seen character...
  assert.equal(tracker.snapshot().character, 'Alpha')
  // ...but detect jumps to whoever most recently levelled (you switched).
  const found = tracker.detectCurrentCharacter()
  assert.deepEqual(found, { name: 'Beta', charClass: 'Marauder', level: 3 })
  assert.equal(tracker.snapshot().character, 'Beta')
  assert.equal(tracker.snapshot().level, 3)
})

test('detect reports the log character but an explicit pin still wins tracking', () => {
  const { tracker } = makeTracker('Pinned')
  feed(tracker, '… [INFO Client 1] : Alpha (Witch) is now level 10')
  const found = tracker.detectCurrentCharacter()
  assert.deepEqual(found, { name: 'Alpha', charClass: 'Witch', level: 10 })
  // The explicit binding still governs tracking (party-play safety).
  assert.equal(tracker.snapshot().character, 'Pinned')
})

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

test('backscan counts per kind, exposing a non-English client', () => {
  // A real English window has all three kinds.
  const { tracker } = makeTracker()
  const real = tracker.backscan(loadFixtureLines('act1-real.log'), parser)
  assert.ok(real.areaGenerated > 0)
  assert.ok(real.zoneEntered > 0)
  assert.ok(real.levelUp > 0)

  // A localized client still emits the locale-independent "Generating level N
  // area" line, but neither "You have entered" nor the level-up line — that
  // asymmetry is what the overlay reports instead of silently never levelling.
  const german = makeTracker().tracker.backscan(
    [
      '2026/07/28 12:00:00 1 [DEBUG Client 1] Generating level 13 area "1_1_town" with seed 1',
      '2026/07/28 12:00:01 1 [INFO Client 1] : Du hast Lioneyes Wacht betreten.',
      '2026/07/28 12:00:02 1 [INFO Client 1] : MeinExilant (Hexe) ist jetzt Stufe 12'
    ],
    parser
  )
  assert.equal(german.areaGenerated, 1)
  assert.equal(german.zoneEntered, 0)
  assert.equal(german.levelUp, 0)
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

// ---------- zone level vs. character level ----------

const fit = (areaId: string | null, areaLevel: number | null, charLevel: number | null) =>
  zoneFit({ areaId, areaLevel }, charLevel, safeLevelRange(charLevel ?? 1))

test('a zone far above your level reports as underlevelled', () => {
  // At level 20 the safe range is 4 (3 + 20/16), so level 25 is one past it.
  assert.equal(fit('2_1_3', 24, 20), null, 'inside the safe range says nothing')
  assert.deepEqual(fit('2_1_3', 25, 20), { verdict: 'under', areaLevel: 25, by: 1 })
  assert.deepEqual(fit('2_1_3', 30, 20), { verdict: 'under', areaLevel: 30, by: 6 })
})

test('a zone far below your level reports as overlevelled', () => {
  assert.equal(fit('1_1_2', 16, 20), null)
  assert.deepEqual(fit('1_1_2', 15, 20), { verdict: 'over', areaLevel: 15, by: 1 })
  assert.deepEqual(fit('1_1_2', 2, 20), { verdict: 'over', areaLevel: 2, by: 14 })
})

test('the safe range widens with level, so the same gap stops mattering', () => {
  // Gap of 5: past the range at level 1 (safe 3), inside it at level 32 (safe 5).
  assert.equal(fit('1_1_2', 6, 1)?.verdict, 'under')
  assert.equal(fit('9_1_2', 37, 32), null)
})

test('towns, hideouts and nameless zones are excluded — the comparison would lie', () => {
  // Lioneye's Watch generates at monster level 13 regardless of your level, so
  // standing in it at level 5 is not "underlevelled", it is just standing in town.
  assert.equal(fit('1_1_town', 13, 5), null)
  assert.equal(fit('6_1_town', 45, 12), null)
  // Non-campaign instances use word ids and aren't part of the levelling curve.
  assert.equal(fit('HideoutWorldTurtle', 68, 20), null)
  assert.equal(fit('MapWorldsCitySquare', 78, 40), null)
  // The fallback zone path carries no monster level at all.
  assert.equal(fit('2_1_3', null, 20), null)
  assert.equal(fit(null, 40, 20), null)
  // No level tracked yet.
  assert.equal(fit('2_1_3', 40, null), null)
})
