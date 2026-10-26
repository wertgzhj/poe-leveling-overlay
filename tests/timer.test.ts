import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LogClock, parseStamp } from '../electron/timer/stamp.ts'
import { RunTimer, MIN_KEPT_MS, TICK_STALE_MS, partyOf, runKind, type RunTimerState } from '../electron/timer/engine.ts'
import { LogImporter } from '../electron/timer/import.ts'
import { makeParser, loadAreaNames, loadFixtureLines } from './helpers.ts'

const parser = makeParser()
const areaNames = loadAreaNames()

test('a stamp reads the wall clock, the tick and the process id', () => {
  const s = parseStamp('2026/04/19 13:14:57 310104312 cffb06dd [INFO Client 33248] : You have entered City Square.')
  assert.ok(s)
  assert.equal(s.wall, new Date(2026, 3, 19, 13, 14, 57).getTime())
  assert.equal(s.tick, 310104312)
  assert.equal(s.session, '33248')
  assert.equal(s.opening, false)

  const open = parseStamp('2026/04/19 13:10:00 ***** LOG FILE OPENING *****')
  assert.equal(open?.opening, true)
  assert.equal(open?.session, null)
  assert.equal(parseStamp('not a log line'), null)
})

test('within one process the tick gives milliseconds; a new process re-anchors', () => {
  const clock = new LogClock()
  const at = (line: string): number => clock.time(parseStamp(line)!)
  const t0 = at('2026/04/19 13:15:21 310128500 1186a886 [DEBUG Client 33248] Generating level 60 area "X" with seed 1')
  const t1 = at('2026/04/19 13:15:22 310129390 cffb06dd [INFO Client 33248] : You have entered Y.')
  assert.equal(t1 - t0, 890)
  // An earlier line read again (the backscan) gets the time it had before.
  assert.equal(at('2026/04/19 13:15:21 310128000 1186a886 [DEBUG Client 33248] x'), t0 - 500)
  const t2 = at('2026/04/20 19:44:54 419902062 1186a886 [DEBUG Client 30340] Generating level 13 area "1_1_town" with seed 1')
  assert.equal(t2, new Date(2026, 3, 20, 19, 44, 54).getTime())
})

/** A small log writer: one game process, a millisecond tick, wall time to match. */
class Log {
  lines: string[] = []
  private ms: number
  private tick = 1_000_000
  private pid: number

  constructor(start = new Date(2026, 9, 1, 20, 0, 0).getTime(), pid = 100) {
    this.ms = start
    this.pid = pid
  }

  private stamp(): string {
    const d = new Date(this.ms)
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${this.tick} abc [INFO Client ${this.pid}]`
  }

  wait(ms: number): this {
    this.ms += ms
    this.tick += ms
    return this
  }

  /** Load into an area: the loading screen takes `loadMs`. */
  enter(areaId: string, loadMs = 1000): this {
    this.lines.push(`${this.stamp()} Generating level 1 area "${areaId}" with seed 1`)
    this.wait(loadMs)
    this.lines.push(`${this.stamp()} : You have entered ${areaNames[areaId] ?? areaId}.`)
    return this
  }

  /** A system message ("] : text"). */
  say(text: string): this {
    this.lines.push(`${this.stamp()} : ${text}`)
    return this
  }

  /** An NPC's voice line. */
  npc(name: string, text: string): this {
    this.lines.push(`${this.stamp()} ${name}: ${text}`)
    return this
  }

  /** Back to the login server: logout, character select. */
  logout(): this {
    this.lines.push(`${this.stamp()} Async connecting to lon01.login.pathofexile.com:20481`)
    return this
  }

  /** One zone per act, Act 2 to Act `to`, a minute each, levelling as it goes. */
  through(to: number, name = 'Racer'): this {
    for (let act = 2; act <= to; act++) {
      this.enter(act <= 5 ? `1_${act}_1` : `2_${act}_1`).wait(MIN).level(name, act * 7)
    }
    return this
  }

  /** A line as the game writes it, after the prefix. */
  raw(text: string): this {
    this.lines.push(`${this.stamp()} ${text}`)
    return this
  }

  /** Any other line: the game is still running, now. */
  mark(): this {
    this.lines.push(`${this.stamp()} Got Instance Details from login server`)
    return this
  }

  level(name: string, level: number, cls = 'Witch'): this {
    this.lines.push(`${this.stamp()} : ${name} (${cls}) is now level ${level}`)
    return this
  }

  /** Close the game; relaunch it later as a new process. */
  restart(awayMs: number): this {
    this.wait(awayMs)
    this.pid++
    const d = new Date(this.ms)
    const p = (n: number): string => String(n).padStart(2, '0')
    this.lines.push(`${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ***** LOG FILE OPENING *****`)
    this.tick = 5_000
    return this
  }
}

let ids = 0
function timer(saved: RunTimerState | null = null): RunTimer {
  return new RunTimer({ saved, areaNames, newId: () => `run${++ids}` })
}

function feed(t: RunTimer, lines: string[]): void {
  for (const line of lines) {
    const stamp = parseStamp(line)
    if (stamp) t.feed(stamp, parser.parseLine(line))
  }
}

const MIN = 60_000

test('a run starts on the Twilight Strand and splits time by kind of area and act', () => {
  const log = new Log()
    .enter('1_1_1', 3000) // the first loading screen comes before the start
    .wait(2 * MIN).level('Racer', 2)
    .wait(1 * MIN)
    .enter('1_1_town').wait(30_000)
    .enter('HideoutWorldTurtle', 2000).wait(20_000)
    .enter('1_1_2', 1500).wait(4 * MIN).mark()
  const t = timer()
  feed(t, log.lines)
  const snap = t.snapshot()
  const live = snap.live!
  assert.equal(live.character, 'Racer')
  assert.equal(live.status, 'running')
  assert.equal(live.byCategory.zone, 3 * MIN + 4 * MIN)
  assert.equal(live.byCategory.town, 30_000)
  assert.equal(live.byCategory.hideout, 20_000)
  assert.equal(live.byCategory.loading, 1000 + 2000 + 1500)
  assert.equal(live.total, 7 * MIN + 50_000 + 4500)
  assert.equal(live.acts.length, 1)
  assert.equal(live.acts[0].level, 1)
  assert.equal(snap.current?.name, 'The Coast')
  assert.equal(snap.current?.ms, 4 * MIN)
  const strand = live.zones.find((z) => z.areaId === '1_1_1')
  assert.equal(strand?.ms, 3 * MIN)
  assert.equal(strand?.name, 'The Twilight Strand')
})

test('acts split on first entry, and a trip back is booked on the act you are in', () => {
  const log = new Log()
    .enter('1_1_1').wait(10 * MIN).level('Racer', 2).level('Racer', 9)
    .enter('1_2_1').wait(5 * MIN).level('Racer', 13)
    .enter('1_1_town').wait(1 * MIN) // back to Lioneye's Watch for a gem
    .enter('1_2_town').wait(1 * MIN).mark()
  const t = timer()
  feed(t, log.lines)
  const acts = t.snapshot().live!.acts
  assert.deepEqual(acts.map((a) => a.act), [1, 2])
  assert.equal(acts[0].duration, 10 * MIN)
  assert.equal(acts[1].at, 10 * MIN)
  assert.equal(acts[1].level, 9)
  assert.equal(acts[1].byCategory.town, 2 * MIN)
})

test('closing the game stops the clock until the next zone loads', () => {
  const log = new Log()
    .enter('1_1_1').wait(2 * MIN).level('Racer', 2)
    .enter('1_1_town').wait(1 * MIN).mark()
    .wait(1 * MIN)
    .restart(60 * MIN) // an hour away
    .wait(20_000)      // the launcher, login, character select
    .enter('1_1_town', 2000).wait(1 * MIN).mark()
  const t = timer()
  feed(t, log.lines)
  const live = t.snapshot().live!
  // The minute after the last line before closing is lost: the log can't
  // say when the game went, only that its last line was then. The launcher
  // and character select aren't the run's either — nor are they in /played.
  assert.equal(live.byCategory.loading, 1000 + 2000)
  assert.equal(live.total, 2 * MIN + 1000 + 1 * MIN + 2000 + 1 * MIN)
})

test('a run ends as Kitava falls in Act 10, and becomes the best', () => {
  const log = new Log()
    .enter('1_1_1').wait(5 * MIN).level('Racer', 2)
    .through(10)
    .enter('2_10_6').wait(4 * MIN)
    .npc('Sin', 'May a new dawn arise!')
    .wait(14_000) // the penalty message follows the kill
    .say("You have been permanently weakened by Kitava's merciless affliction. You now have a total of -60% to all Resistances.")
    .enter('2_10_town')
  const t = timer()
  feed(t, log.lines)
  const snap = t.snapshot()
  assert.equal(snap.live, null)
  assert.equal(snap.history.length, 1)
  const run = snap.history[0]
  assert.equal(run.status, 'finished')
  // 5 min on the Strand, nine acts at a minute and a load each, 4 min to the kill
  assert.equal(run.total, 5 * MIN + 9 * (MIN + 1000) + 1000 + 4 * MIN)
  assert.equal(run.level, 70)
  assert.deepEqual(snap.best, { solo: run.id, party: null })
  assert.equal(run.acts.at(-1)?.act, 10)
})

test("Sin's line over Kitava elsewhere ends nothing; Karui Shores is the fallback", () => {
  const log = new Log()
    .enter('1_1_1').wait(5 * MIN).level('Racer', 2)
    .through(10)
    .npc('Sin', 'May a new dawn arise!') // not in The Feeding Trough
    .say("You have been permanently weakened by Kitava's cruel affliction. You now have -30% to all Resistances.")
    .mark()
  const t = timer()
  feed(t, log.lines)
  assert.equal(t.snapshot().history.length, 0)
  const n = log.lines.length
  feed(t, log.enter('2_11_endgame_town').lines.slice(n))
  assert.equal(t.snapshot().history[0]?.status, 'finished')
})

test('a mule rolled mid-run does not restart it, and its time is the run\'s, as mule time', () => {
  const log = new Log()
    .enter('1_1_1').wait(5 * MIN).level('Main', 2)
    .through(3, 'Main')
    .enter('1_3_town').wait(20 * MIN).level('Main', 30)
    // the mule: Strand, Hillock, Lioneye's Watch
    .logout().wait(10_000)
    .enter('1_1_1').wait(2 * MIN).level('Mule', 2, 'Ranger')
    .enter('1_1_town').wait(1 * MIN)
  const t = timer()
  feed(t, log.lines)
  let snap = t.snapshot()
  assert.equal(snap.pending?.character, 'Mule')
  assert.equal(snap.live?.character, 'Main')

  // back on the main, in Act 3: the mule was a mule
  const n = log.lines.length
  feed(t, log.logout().wait(10_000).enter('1_3_town').wait(1 * MIN).level('Main', 31).lines.slice(n))
  snap = t.snapshot()
  assert.equal(snap.pending, null)
  assert.equal(snap.live?.character, 'Main')
  assert.equal(snap.history.length, 0)
  // the mule's three minutes, its loads, and the two switches (10 s each)
  const mule = 10_000 + 1000 + 2 * MIN + 1000 + 1 * MIN + 10_000
  assert.equal(snap.live.byCategory.mule, mule)
  assert.equal(snap.live.total, 5 * MIN + 2 * (MIN + 1000) + 1000 + 20 * MIN + 1000 + 1 * MIN + mule)
  // and the zones list is the run's own
  assert.ok(!snap.live.zones.some((z) => z.areaId === '1_1_town' && z.act === 3))
})

test('a mule made before the run starts is the start of the run', () => {
  const log = new Log()
    .enter('1_1_1').wait(1 * MIN).level('Mule', 2, 'Ranger')
    .enter('1_1_town').wait(1 * MIN)
    .say('Trade accepted.')
    .logout().wait(30_000) // making the main
    .enter('1_1_1').wait(2 * MIN).level('Main', 2)
    .enter('1_1_town').wait(1 * MIN)
    .enter('1_1_2').wait(1 * MIN).mark()
  const t = timer()
  feed(t, log.lines)
  const snap = t.snapshot()
  assert.equal(snap.pending, null)
  assert.equal(snap.history.length, 0)
  const live = snap.live!
  assert.equal(live.character, 'Main')
  // the mule's Strand load comes before the start; its town load, its time
  // and the switch to the main are mule time
  assert.equal(live.byCategory.mule, 1 * MIN + 1000 + 1 * MIN + 30_000)
  assert.equal(live.total, live.byCategory.mule + 1000 + 2 * MIN + 1000 + 1 * MIN + 1000 + 1 * MIN)
  assert.equal(live.acts[0].at, 0)
})

test('a mule made long before the run stays out of it', () => {
  const log = new Log()
    .enter('1_1_1').wait(1 * MIN).level('Mule', 2, 'Ranger')
    .logout().wait(2 * 60 * MIN) // the main, two hours later
    .enter('1_1_1').wait(2 * MIN).level('Main', 2).mark()
  const t = timer()
  feed(t, log.lines)
  const live = t.snapshot().live!
  assert.equal(live.character, 'Main')
  assert.equal(live.byCategory.mule, 0)
  assert.equal(live.total, 2 * MIN)
})

test('a new character that keeps going ends the old run as abandoned', () => {
  const log = new Log()
    .enter('1_1_1').wait(5 * MIN).level('Old', 2)
    .through(4, 'Old')
    .enter('1_4_2').wait(20 * MIN).level('Old', 40)
    .enter('1_1_1').wait(2 * MIN).level('New', 2)
    .enter('1_1_town').wait(1 * MIN)
    .enter('1_1_2').wait(3 * MIN).mark() // the Coast: no mule goes there
  const t = timer()
  feed(t, log.lines)
  const snap = t.snapshot()
  assert.equal(snap.pending, null)
  assert.equal(snap.live?.character, 'New')
  assert.equal(snap.live?.total, 6 * MIN + 2000)
  assert.equal(snap.history.length, 1)
  assert.equal(snap.history[0].status, 'abandoned')
  assert.equal(snap.history[0].character, 'Old')
  assert.equal(snap.history[0].total, 5 * MIN + 3 * (MIN + 1000) + 20 * MIN + 1000)
})

test('in Act 1 the Coast proves nothing; levelling past a mule does', () => {
  const log = new Log()
    .enter('1_1_1').wait(4 * MIN).level('Old', 2).level('Old', 5)
    .enter('1_1_3').wait(4 * MIN)
    .enter('1_1_1').wait(2 * MIN).level('New', 2)
    .enter('1_1_2').wait(3 * MIN)
  const t = timer()
  feed(t, log.lines)
  assert.equal(t.snapshot().pending?.character, 'New')
  const n = log.lines.length
  feed(t, log.level('New', 4).lines.slice(n))
  const snap = t.snapshot()
  assert.equal(snap.pending, null)
  assert.equal(snap.live?.character, 'New')
  assert.equal(snap.history[0].character, 'Old')
})

test('a reroll within minutes leaves nothing in the history', () => {
  const log = new Log()
    .enter('1_1_1').wait(1 * MIN).level('Typo', 2)
    .enter('1_1_1').wait(1 * MIN).level('Right', 2)
  const t = timer()
  feed(t, log.lines)
  // no run in progress past Act 1, and the first is far below MIN_KEPT_MS
  const n = log.lines.length
  feed(t, log.level('Right', 4).lines.slice(n))
  const snap = t.snapshot()
  assert.ok(MIN_KEPT_MS > 2 * MIN)
  assert.equal(snap.live?.character, 'Right')
  assert.equal(snap.history.length, 0)
})

test('the saved state resumes, and a replayed backscan is not counted twice', () => {
  const log = new Log().enter('1_1_1').wait(2 * MIN).level('Racer', 2).enter('1_1_town').wait(1 * MIN).mark()
  const t = timer()
  feed(t, log.lines)
  const total = t.snapshot().live!.total
  const resumed = timer(t.save())
  feed(resumed, log.lines) // the startup backscan: the same tail again
  assert.equal(resumed.snapshot().live!.total, total)
  feed(resumed, log.wait(1 * MIN).enter('1_1_2').lines.slice(-2))
  assert.equal(resumed.snapshot().live!.total, total + 1 * MIN + 1000)
})

test('the live clock ticks for a while past the last line, and only with a run', () => {
  const log = new Log(Date.now() - 2 * MIN).enter('1_1_1').wait(1 * MIN).mark()
  const t = timer()
  feed(t, log.lines)
  const snap = t.snapshot()
  assert.equal(snap.tickUntil, snap.asOf! + TICK_STALE_MS)
  t.deleteRun(snap.live!.id)
  assert.equal(t.snapshot().tickUntil, null)
})

test('deleting a run drops it from the history', () => {
  const log = new Log().enter('1_1_1').wait(5 * MIN).level('A', 2).through(10, 'A').enter('2_11_endgame_town')
  const t = timer()
  feed(t, log.lines)
  const id = t.snapshot().history[0].id
  assert.equal(t.deleteRun(id), true)
  assert.equal(t.snapshot().history.length, 0)
  assert.deepEqual(t.snapshot().best, { solo: null, party: null })
})

test('another character in maps is not the run: it waits for its own to log back in', () => {
  const log = new Log()
    .enter('1_1_1').wait(5 * MIN).level('Racer', 2)
    .through(2)
    .logout().wait(30_000)
    .enter('HideoutWorldTurtle').wait(1 * MIN) // anyone's hideout: can't tell yet
    .enter('MapWorldsLavaLake').wait(30 * MIN) // a map: someone else is playing
    .enter('HideoutWorldTurtle').wait(5 * MIN)
    .mark()
  const t = timer()
  feed(t, log.lines)
  let snap = t.snapshot()
  assert.equal(snap.away, true)
  assert.equal(snap.current, null)
  assert.equal(snap.tickUntil, null)
  const before = snap.live!.total
  // logged in to a hideout, then a map: that login was someone else's
  assert.equal(before, 5 * MIN + MIN + 1000)
  const n = log.lines.length
  feed(t, log.logout().wait(20_000).enter('1_2_town').wait(1 * MIN).mark().lines.slice(n))
  snap = t.snapshot()
  assert.equal(snap.away, false)
  assert.equal(snap.live!.total, before + 1000 + 1 * MIN)
})

test('logging in to an act the run has not reached is someone else', () => {
  const log = new Log()
    .enter('1_1_1').wait(5 * MIN).level('Racer', 2)
    .through(2)
    .logout().wait(10_000)
    .enter('1_3_town').wait(10 * MIN) // an alt in Act 3
    .enter('HideoutWorldTurtle').wait(5 * MIN)
    .logout().wait(10_000)
    .enter('1_2_1').wait(2 * MIN).mark() // the run, back where it left
  const t = timer()
  feed(t, log.lines)
  const snap = t.snapshot()
  assert.equal(snap.away, false)
  assert.equal(snap.live!.total, 5 * MIN + MIN + 1000 + 1000 + 2 * MIN)
})

test("a town login that never reaches a zone was someone else's", () => {
  const log = new Log()
    .enter('1_1_1').wait(5 * MIN).level('Racer', 2)
    .through(3)
    .enter('1_3_town').wait(1 * MIN)
    .logout().wait(10_000)
    .enter('1_3_town').wait(1 * MIN) // an alt parked in the same town
    .enter('KalguuranSettlersLeague').wait(20 * MIN)
    .logout().wait(10_000)
    .enter('1_3_town').wait(1 * MIN)
    .enter('1_3_2').wait(1 * MIN).mark() // out into Act 3: the run after all
  const t = timer()
  feed(t, log.lines)
  assert.equal(t.snapshot().live!.total, 5 * MIN + 2 * (MIN + 1000) + 1000 + MIN + 1000 + MIN + 1000 + MIN)
})

test('a hideout login that a campaign zone follows was the run', () => {
  const log = new Log()
    .enter('1_1_1').wait(5 * MIN).level('Racer', 2)
    .through(2)
    .logout().wait(10_000)
    .enter('HideoutWorldTurtle').wait(1 * MIN)
    .enter('1_2_town').wait(1 * MIN).mark()
  const t = timer()
  feed(t, log.lines)
  assert.equal(t.snapshot().live!.total, 5 * MIN + MIN + 1000 + 1000 + MIN + 1000 + MIN)
})

test('closing the game, or being dropped by the server, stops the clock there and then', () => {
  for (const said of ['Closing game gracefully', 'Abnormal disconnect: An unexpected disconnection occurred.']) {
    const log = new Log()
      .enter('1_1_1').wait(2 * MIN).level('Racer', 2)
      .enter('1_1_2').wait(1 * MIN)
      .raw(said)
    const t = timer()
    feed(t, log.lines)
    const snap = t.snapshot()
    assert.equal(snap.current, null, said)
    assert.equal(snap.tickUntil, null, said)
    assert.equal(snap.live!.total, 2 * MIN + 1000 + 1 * MIN, said)
  }
})

test("the game's own loading-screen time moves load time out of the zones, not out of the run", () => {
  const log = new Log()
    .enter('1_1_1').wait(2 * MIN).level('Racer', 2)
    .enter('1_1_town', 900)
    .raw("[LOADING SCREEN] (Lioneye's Watch) Duration = 1.44 seconds")
    .wait(1 * MIN)
    .enter('1_1_2', 900) // an older client: no Duration line
    .wait(1 * MIN).mark()
  const t = timer()
  feed(t, log.lines)
  const snap = t.snapshot()
  const live = snap.live!
  assert.equal(live.byCategory.loading, 1440 + 900)
  assert.equal(live.byCategory.town, 900 + MIN - 1440)
  assert.equal(live.total, 2 * MIN + 900 + MIN + 900 + MIN)
  assert.equal(snap.current?.ms, MIN)
})

test('AFK time is kept apart, and a logout ends the zone', () => {
  const log = new Log()
    .enter('1_1_1').wait(2 * MIN).level('Racer', 2)
    .enter('1_1_town').wait(1 * MIN)
    .say('AFK mode is now ON. Autoreply "This player is AFK."').wait(10 * MIN)
    .say('AFK mode is now OFF.').wait(1 * MIN)
    .logout().wait(5 * MIN).mark()
  const t = timer()
  feed(t, log.lines)
  const live = t.snapshot().live!
  assert.equal(live.afk, 10 * MIN)
  assert.equal(live.byCategory.town, 2 * MIN)
  assert.equal(live.total, 2 * MIN + 1000 + 2 * MIN)
})

test('a run counts its deaths, quest points, Labyrinths and Pantheon gods', () => {
  const log = new Log()
    .enter('1_1_1').wait(2 * MIN).level('Racer', 2)
    .say('Hillock has been slain.')
    .say('Racer has been slain.')
    .enter('1_1_town')
    .say('You have received a Passive Skill Point.')
    .through(3)
    .enter('1_Labyrinth_boss_2_end').wait(1 * MIN)
    .npc('Izaro', 'I die for the Empire!')
    .through(6)
    .enter('2_6_5').wait(2 * MIN)
    .npc('Sin', 'Tukohama!')
    .npc('Sin', 'The soil wants for your blood no more.')
    .npc('Sin', 'At last your thirst is quenched.') // Abberath's, not in his zone
    .say('Racer has committed suicide.')
    .mark()
  const t = timer()
  feed(t, log.lines)
  const live = t.snapshot().live!
  assert.equal(live.deaths, 2)
  assert.equal(live.questPoints, 1)
  assert.deepEqual(live.labs, ['normal'])
  assert.deepEqual(live.gods, ['Soul of Tukohama'])
  assert.equal(live.byCategory.lab, 1 * MIN)
})

test('a Labyrinth beaten is a split of its own, from the Plaza to Izaro', () => {
  const log = new Log()
    .enter('1_1_1').wait(2 * MIN).level('Racer', 2)
    .through(3)
    .enter('1_3_town').wait(1 * MIN)
    .enter('Labyrinth_Airlock').wait(1 * MIN) // the Aspirants' Plaza
    .enter('1_Labyrinth_OH_straight').wait(5 * MIN)
    .enter('1_Labyrinth_boss_2_end').wait(2 * MIN)
    .npc('Izaro', 'I die for the Empire!')
    .wait(1 * MIN) // looting, ascending
    .enter('1_3_town').wait(1 * MIN).mark()
  const t = timer()
  feed(t, log.lines)
  const live = t.snapshot().live!
  assert.equal(live.labSplits?.length, 1)
  const lab = live.labSplits[0]
  assert.equal(lab.tier, 'normal')
  assert.equal(lab.act, 3)
  // three loads and eight minutes from the Plaza to Izaro's death
  assert.equal(lab.duration, 3 * 1000 + 8 * MIN)
  // the run before the lab: Strand, two acts, the town
  assert.equal(lab.at, 2 * MIN + 2 * (MIN + 1000) + 1000 + 1 * MIN + lab.duration)
  assert.equal(lab.level, 21)
})

test('ending a run by hand keeps it, however short, and the next Strand starts afresh', () => {
  const log = new Log()
    .enter('1_1_1').wait(2 * MIN).level('Racer', 2)
    .through(3)
    .enter('1_4_1').wait(1 * MIN).mark()
  const t = timer()
  feed(t, log.lines)
  assert.equal(t.endRun(), true)
  let snap = t.snapshot()
  assert.equal(snap.live, null)
  assert.equal(snap.history.length, 1)
  assert.equal(snap.history[0].status, 'abandoned')
  assert.equal(snap.history[0].acts.at(-1)?.act, 4)
  assert.equal(snap.history[0].total, 2 * MIN + 2 * (MIN + 1000) + 1000 + 1 * MIN)
  // still in Act 4 on the old character: nothing counts any more
  const n = log.lines.length
  feed(t, log.enter('1_4_2').wait(1 * MIN).enter('1_1_1').wait(1 * MIN).level('Next', 2).mark().lines.slice(n))
  snap = t.snapshot()
  assert.equal(snap.live?.character, 'Next')
  assert.equal(snap.history.length, 1)
  assert.equal(t.endRun(), true)
  assert.equal(t.endRun(), false)
})

test('party members are who shared the run\'s zones, whoever went to whom; a zone or two is still solo', () => {
  const log = new Log()
    .enter('1_1_1').wait(2 * MIN).level('Racer', 2)
    .enter('1_1_2').wait(MIN)
    .say('Friend has joined the area.').wait(1000) // comes to you
    .say('Friend has left the area.').wait(1000)
    .say('Friend has joined the area.').wait(1000) // the same zone: still one
    .enter('1_1_3').wait(MIN)
    .say('Friend has left the area.').wait(1000) // was here before you: you swirled to them
    .enter('1_1_4_1').wait(MIN)
    .level('Friend', 5, 'Ranger') // levelling where you are
    .enter('1_1_4_0').wait(MIN)
    .say('Friend has been slain.') // dying where you are: you joined them, and leave first
    .say('Hillock has been slain.') // a monster: never a partymate
    .enter('1_1_town')
    .say('Stranger has joined the area.').wait(1000) // a town: anyone passes through
    .enter('HideoutWorldTurtle')
    .say('Buyer has joined the area.').wait(1000) // a hideout: a trade
    .enter('1_1_5')
    .say('Courier has joined the area.') // one zone: a portal to hand something over
    .mark()
  const t = timer()
  feed(t, log.lines)
  const live = t.snapshot().live!
  assert.deepEqual(live.shared, { Friend: 4, Courier: 1 })
  assert.deepEqual(live.party, ['Friend'])
  assert.deepEqual(partyOf({ shared: { Courier: 2 } }), [])
  // zones in the order you entered them; the ones shared with the party say so
  const act1 = live.zones.filter((z) => z.act === 1).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  assert.deepEqual(act1.map((z) => z.areaId), ['1_1_1', '1_1_2', '1_1_3', '1_1_4_1', '1_1_4_0', '1_1_town', 'HideoutWorldTurtle', '1_1_5'])
  assert.deepEqual(act1.filter((z) => z.withParty).map((z) => z.areaId), ['1_1_2', '1_1_3', '1_1_4_1', '1_1_4_0'])
})

test('old runs read from a whole log: finished ones only, merged without doubling', () => {
  const log = new Log()
    .enter('1_1_1').wait(5 * MIN).level('Old', 2).through(10, 'Old')
    .enter('2_10_6').wait(MIN).npc('Sin', 'May a new dawn arise!')
    .say("You have been permanently weakened by Kitava's merciless affliction. You now have a total of -60% to all Resistances.")
    .logout().wait(MIN)
    .enter('1_1_1').wait(MIN).level('Quitter', 2).through(3, 'Quitter') // abandoned
    .logout().wait(MIN)
    .enter('1_1_1').wait(5 * MIN).level('Second', 2).through(10, 'Second')
    .enter('2_10_6').wait(MIN).npc('Sin', 'May a new dawn arise!')
    .mark()
  const importer = new LogImporter(parser, areaNames)
  for (const line of log.lines) importer.feed(line)
  const found = importer.finished()
  assert.deepEqual(found.map((r) => r.character), ['Old'])

  // The live timer recorded part of the same run (the overlay was closed for
  // the rest), and one of its own: the log's replaces the first, adds nothing else.
  const live = timer()
  const n = log.lines.findIndex((l) => l.includes('1_6_1') || l.includes('2_6_1'))
  feed(live, log.lines.slice(0, n))
  live.endRun()
  assert.equal(live.snapshot().history.length, 1)
  assert.deepEqual(live.mergeRuns(found), { added: 0, replaced: 1 })
  const history = live.snapshot().history
  assert.equal(history.length, 1)
  assert.equal(history[0].status, 'finished')
  assert.deepEqual(live.mergeRuns(found), { added: 0, replaced: 1 })
  assert.equal(live.snapshot().history.length, 1)
})

test('the best run is kept per kind: a solo run is never compared with a party one', () => {
  const finish = (log: Log): Log =>
    log
      .enter('2_10_6').wait(MIN).npc('Sin', 'May a new dawn arise!')
      .say("You have been permanently weakened by Kitava's merciless affliction. You now have a total of -60% to all Resistances.")
      .logout().wait(MIN)
  const log = new Log()
  // a fast party run
  log.enter('1_1_1').wait(MIN).level('Fast', 2).enter('1_1_2').wait(1000)
  for (let i = 0; i < 3; i++) log.say('Friend has joined the area.').wait(1000).enter(`1_1_${3 + i}`).wait(1000)
  finish(log.through(10, 'Fast'))
  // a slower solo run
  finish(log.enter('1_1_1').wait(5 * MIN).level('Slow', 2).through(10, 'Slow'))
  const t = timer()
  feed(t, log.lines)
  const snap = t.snapshot()
  const fast = snap.history.find((r) => r.character === 'Fast')!
  const slow = snap.history.find((r) => r.character === 'Slow')!
  assert.equal(runKind(fast), 'party')
  assert.equal(runKind(slow), 'solo')
  assert.ok(fast.total < slow.total)
  assert.deepEqual(snap.best, { solo: slow.id, party: fast.id })
  assert.equal(runKind({}), null) // kept before party play was counted
})

test('the real Act 1 capture: one run, all of it in Act 1', () => {
  const t = timer()
  feed(t, loadFixtureLines('act1-real.log'))
  const live = t.snapshot().live
  assert.ok(live, 'the capture enters the Twilight Strand')
  assert.deepEqual(live.acts.map((a) => a.act), [1])
  assert.ok(live.total > 0)
  assert.ok(live.byCategory.loading > 0)
})
