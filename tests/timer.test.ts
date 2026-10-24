import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LogClock, parseStamp } from '../electron/timer/stamp.ts'
import { RunTimer, MIN_KEPT_MS, TICK_STALE_MS, type RunTimerState } from '../electron/timer/engine.ts'
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

test('closing the game stops the clock; logging back in counts as loading', () => {
  const log = new Log()
    .enter('1_1_1').wait(2 * MIN).level('Racer', 2)
    .wait(1 * MIN)
    .restart(60 * MIN) // an hour away
    .wait(20_000)      // the launcher, login, character select
    .enter('1_1_1', 2000).wait(1 * MIN).mark()
  const t = timer()
  feed(t, log.lines)
  const live = t.snapshot().live!
  // The minute after the last line before closing is lost: the log can't
  // say when the game went, only that its last line was then.
  assert.equal(live.byCategory.loading, 22_000)
  assert.equal(live.total, 2 * MIN + 22_000 + 1 * MIN)
})

test('a run ends on the first load into Karui Shores and becomes the best', () => {
  const log = new Log()
    .enter('1_1_1').wait(5 * MIN).level('Racer', 2)
    .enter('2_10_9').wait(5 * MIN).level('Racer', 68)
    .enter('2_11_endgame_town', 2000)
  const t = timer()
  feed(t, log.lines)
  const snap = t.snapshot()
  assert.equal(snap.live, null)
  assert.equal(snap.history.length, 1)
  const run = snap.history[0]
  assert.equal(run.status, 'finished')
  assert.equal(run.total, 10 * MIN + 1000)
  assert.equal(run.level, 68)
  assert.equal(snap.bestId, run.id)
  assert.equal(run.acts.at(-1)?.act, 10)
})

test('a mule rolled mid-run does not restart it — its time stays in the run', () => {
  const log = new Log()
    .enter('1_1_1').wait(5 * MIN).level('Main', 2)
    .enter('1_3_town').wait(20 * MIN).level('Main', 30)
    // the mule: Strand, Hillock, Lioneye's Watch
    .enter('1_1_1').wait(2 * MIN).level('Mule', 2, 'Ranger')
    .enter('1_1_town').wait(1 * MIN)
  const t = timer()
  feed(t, log.lines)
  let snap = t.snapshot()
  assert.equal(snap.pending?.character, 'Mule')
  assert.equal(snap.live?.character, 'Main')

  // back on the main, in Act 3: the mule was a mule
  const n = log.lines.length
  feed(t, log.enter('1_3_town').wait(1 * MIN).level('Main', 31).lines.slice(n))
  snap = t.snapshot()
  assert.equal(snap.pending, null)
  assert.equal(snap.live?.character, 'Main')
  assert.equal(snap.history.length, 0)
  // the mule's three minutes are part of the run's wall-clock time
  assert.ok(snap.live!.total >= 5 * MIN + 20 * MIN + 3 * MIN)
})

test('a new character that keeps going ends the old run as abandoned', () => {
  const log = new Log()
    .enter('1_1_1').wait(5 * MIN).level('Old', 2)
    .enter('1_4_1').wait(20 * MIN).level('Old', 40)
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
  assert.equal(snap.history[0].total, 25 * MIN + 1000)
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
  const log = new Log().enter('1_1_1').wait(5 * MIN).level('A', 2).enter('2_11_endgame_town')
  const t = timer()
  feed(t, log.lines)
  const id = t.snapshot().history[0].id
  assert.equal(t.deleteRun(id), true)
  assert.equal(t.snapshot().history.length, 0)
  assert.equal(t.snapshot().bestId, null)
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
