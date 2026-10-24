// When a Client.txt line was written, and by which game process. Pure (no
// Electron imports — unit-tested directly). Only the line's prefix is read:
// the timer takes the time from every line, its text from none but the ones
// the parser already matches.
//
//   2026/04/19 13:14:57 310104312 cffb06dd [INFO Client 33248] : You have entered …
//   └ wall clock, to the second  └ ms tick   └ ?    └ process id
//
// The wall clock only has whole seconds, which is too coarse for a loading
// screen. The tick next to it counts milliseconds (it moves 24 188 across the
// 24 s between two lines of act1-real.log), so within one game process the
// tick gives the time and the wall clock only anchors it.

export interface LineStamp {
  /** Local wall-clock time, ms since the epoch (whole seconds). */
  wall: number
  /** The millisecond tick, or null on a line without one. */
  tick: number | null
  /** The game's process id: one per launch, so a change means the game was
   *  restarted. null on a line without one. */
  session: string | null
  /** The "LOG FILE OPENING" banner the game writes on every launch. */
  opening: boolean
}

const STAMP = /^(\d{4})\/(\d\d)\/(\d\d) (\d\d):(\d\d):(\d\d)(?: (\d+) \S+ \[\w+ Client (\d+)\])?/

export function parseStamp(line: string): LineStamp | null {
  const m = STAMP.exec(line)
  if (!m) return null
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number)
  return {
    wall: new Date(y, mo - 1, d, h, mi, s).getTime(),
    tick: m[7] != null ? Number(m[7]) : null,
    session: m[8] ?? null,
    opening: line.includes('***** LOG FILE OPENING *****')
  }
}

/** Where the clock stands: the wall time a tick was seen at, per process. */
export interface ClockAnchor {
  session: string
  wall: number
  tick: number
}

/**
 * Turns stamps into one millisecond timeline. The first line of a game process
 * anchors its tick to the wall clock; every later line of that process is the
 * anchor plus its tick's distance — so a clock change (daylight saving) can't
 * stretch a zone by an hour, and a line read twice gets the same time both
 * times. A new process re-anchors. Lines without a tick fall back to the wall
 * clock.
 */
export class LogClock {
  anchor: ClockAnchor | null

  constructor(anchor: ClockAnchor | null = null) {
    this.anchor = anchor
  }

  time(stamp: LineStamp): number {
    if (stamp.tick == null || stamp.session == null) return stamp.wall
    const a = this.anchor
    if (a && a.session === stamp.session) {
      if (stamp.tick >= a.tick) return a.wall + (stamp.tick - a.tick)
      // An earlier line of the same process — the startup backscan replaying
      // what came before the saved anchor. Measured back from the anchor, so a
      // line gets the same time however often it's read. (A tick that went
      // backwards while the wall clock moved on is a reboot that reused the
      // process id: re-anchor below.)
      if (stamp.wall <= a.wall + 1000) return a.wall - (a.tick - stamp.tick)
    }
    this.anchor = { session: stamp.session, wall: stamp.wall, tick: stamp.tick }
    return stamp.wall
  }
}
