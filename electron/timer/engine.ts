// The run timer: how long a campaign run takes, and where the time goes. Pure
// (no Electron imports — unit-tested directly). Fed one Client.txt line at a
// time — its time from the stamp (stamp.ts), its meaning from the parser — it
// keeps the run in progress zone by zone, and every finished one as a summary.
//
// A run starts on the Twilight Strand, which only a new character ever enters,
// and ends on the first load into Karui Shores, which only a character that
// has killed Kitava in Act 10 can reach. The time between is counted while
// the game runs: closing it (a new process id in the log) stops the clock
// until the next launch, and the login before the first zone counts as
// loading.

import { isCampaignAreaId } from '../log/areas.ts'
import { TWILIGHT_STRAND_ID } from '../log/tracker.ts'
import type { ParsedLogEvent } from '../log/parser.ts'
import { actFromAreaId } from '../profile/engine/stages.ts'
import { MULE_MAX_LEVEL } from '../profile/engine/mule.ts'
import type { LineStamp, ClockAnchor } from './stamp.ts'
import { LogClock } from './stamp.ts'

/** The epilogue town. Reached only after Kitava falls in Act 10 — so its
 *  first load ends the run, a few seconds after the kill itself. */
export const KARUI_SHORES_ID = '2_11_endgame_town'

/** The last act of the campaign. */
export const FINAL_ACT = 10

/** An unfinished run shorter than this is dropped rather than kept: a
 *  character rolled and deleted again — wrong class, a typo in the name — is
 *  not a run worth comparing. */
export const MIN_KEPT_MS = 5 * 60_000

/** How many past runs are kept. A league's worth, and then some. */
export const HISTORY_LIMIT = 50

export type TimeCategory = 'zone' | 'town' | 'hideout' | 'other' | 'loading'
export const TIME_CATEGORIES: TimeCategory[] = ['zone', 'town', 'hideout', 'other', 'loading']

export type CategoryTimes = Record<TimeCategory, number>

/** One instance loaded during a run. Times are on the LogClock timeline. */
export interface Visit {
  areaId: string | null
  name: string
  /** the Generating line — the loading screen starts (or, the first zone of a
   *  game launch, the launch itself: logging in counts as loading too) */
  gen: number
  /** the "You have entered" line — the loading screen ends; null until then */
  ready: number | null
  /** the next load, or the last line before the game closed; null = still here */
  end: number | null
  /** the furthest act the run had reached by then — where the time is booked.
   *  A trip back to an earlier town is spent on the act you're in. */
  act: number
}

interface LevelMark {
  t: number
  name: string
  level: number
}

/** A run still being recorded, with every visit. */
export interface LiveRun {
  id: string
  /** wall-clock start, for showing a date */
  startedAt: number
  character: string | null
  charClass: string | null
  visits: Visit[]
  levels: LevelMark[]
  maxAct: number
}

export interface ActSplit {
  act: number
  /** run time when the act was first entered */
  at: number
  /** time spent in the act so far */
  duration: number
  /** the character's level on entering it */
  level: number | null
  byCategory: CategoryTimes
}

export interface ZoneTime {
  areaId: string | null
  name: string
  act: number
  ms: number
  visits: number
}

export type RunStatus = 'running' | 'finished' | 'abandoned'

/** What is kept of a run: the numbers, not the visits. */
export interface RunSummary {
  id: string
  character: string | null
  charClass: string | null
  status: RunStatus
  startedAt: number
  /** wall-clock end; null while running */
  endedAt: number | null
  total: number
  byCategory: CategoryTimes
  acts: ActSplit[]
  zones: ZoneTime[]
  level: number | null
}

/** Where you are right now, for a clock that ticks between log lines. */
export interface CurrentVisit {
  name: string
  category: TimeCategory
  act: number
  /** time in this zone (loading excluded) as of `asOf` */
  ms: number
  /** still on the loading screen */
  loading: boolean
}

export interface RunTimerSnapshot {
  live: RunSummary | null
  current: CurrentVisit | null
  /** A new character entered the Twilight Strand while a run was going: a
   *  mule, or a fresh start. Both are counted until it's clear which. */
  pending: { character: string | null; startedAt: number } | null
  /** wall-clock time of the last log line. The live clock adds the time
   *  since, up to `tickUntil`. */
  asOf: number | null
  /** when the live clock stops ticking without a newer line — the game was
   *  probably closed (see TICK_STALE_MS); null = not ticking at all */
  tickUntil: number | null
  history: RunSummary[]
  /** the fastest finished run's id — what the live run is compared against */
  bestId: string | null
}

/** Everything the timer persists. */
export interface RunTimerState {
  live: LiveRun | null
  candidate: LiveRun | null
  history: RunSummary[]
  /** the last line consumed — a backscan replays nothing before it */
  lastT: number | null
  /** what was read at lastT, so a replay of that millisecond is skipped too */
  atLast: string[]
  session: string | null
  anchor: ClockAnchor | null
}

export function emptyTimerState(): RunTimerState {
  return { live: null, candidate: null, history: [], lastT: null, atLast: [], session: null, anchor: null }
}

/** Without a log line for this long, the live clock stops ticking: the game
 *  was probably closed, and the log can't say so until it starts again. */
export const TICK_STALE_MS = 15 * 60_000

export function categoryOf(areaId: string | null): Exclude<TimeCategory, 'loading'> {
  if (!areaId) return 'other'
  if (/^Hideout/i.test(areaId)) return 'hideout'
  if (!isCampaignAreaId(areaId)) return 'other'
  return areaId.endsWith('_town') ? 'town' : 'zone'
}

export interface RunTimerOptions {
  saved?: RunTimerState | null
  /** areaId -> display name, until the "You have entered" line names it */
  areaNames?: Record<string, string>
  newId?: () => string
}

export class RunTimer {
  private state: RunTimerState
  private readonly clock: LogClock
  /** Set at a game launch: the next load starts there, not at its own line. */
  private launchedAt: number | null = null
  private readonly areaNames: Record<string, string>
  private readonly newId: () => string

  constructor(opts: RunTimerOptions = {}) {
    this.state = { ...emptyTimerState(), ...structuredClone(opts.saved ?? {}) }
    this.clock = new LogClock(this.state.anchor)
    this.areaNames = opts.areaNames ?? {}
    this.newId = opts.newId ?? defaultId
  }

  /** Persistable copy. */
  save(): RunTimerState {
    return structuredClone({ ...this.state, anchor: this.clock.anchor })
  }

  /**
   * Feed one line: its stamp, and the parser's reading of it (null for the
   * lines it doesn't match). Returns true when anything shown changed. Lines
   * already consumed are skipped, so the startup backscan can replay a window
   * that overlaps what was recorded live.
   */
  feed(stamp: LineStamp, ev: ParsedLogEvent | null): boolean {
    const t = this.clock.time(stamp)
    const s = this.state
    // Lines share a millisecond often enough (a level-up and the next load),
    // so the last one's time isn't enough to tell a replay: what was read at
    // that time is kept too. Identical events in one millisecond are one.
    const key = ev ? JSON.stringify(ev) : ''
    if (s.lastT != null && t < s.lastT) return false
    if (s.lastT != null && t === s.lastT) {
      if (s.atLast.includes(key)) return false
      s.atLast.push(key)
    } else {
      s.atLast = [key]
    }

    let changed = false
    const restarted =
      stamp.opening || (stamp.session != null && s.session != null && stamp.session !== s.session)
    if (restarted && s.lastT != null) {
      // The game closed after its last line: the zone ends there, and the
      // time until the next launch isn't the run's.
      changed = this.closeVisit(s.lastT) || changed
      this.launchedAt = t
    }
    s.lastT = t
    if (stamp.opening) s.session = null
    else if (stamp.session != null) s.session = stamp.session

    if (ev) changed = this.apply(t, stamp.wall, ev) || changed
    return changed
  }

  /** Drop a run: the live one by its id, or one from the history. */
  deleteRun(id: string): boolean {
    const s = this.state
    if (s.live?.id === id) {
      s.live = s.candidate
      s.candidate = null
      return true
    }
    if (s.candidate?.id === id) {
      s.candidate = null
      return true
    }
    const before = s.history.length
    s.history = s.history.filter((r) => r.id !== id)
    return s.history.length !== before
  }

  snapshot(): RunTimerSnapshot {
    const s = this.state
    const now = s.lastT ?? 0
    const live = s.live ? summarize(s.live, now, 'running') : null
    const last = s.live?.visits.at(-1)
    let current: CurrentVisit | null = null
    if (last && last.end == null) {
      const ready = last.ready ?? last.gen
      current = {
        name: last.name,
        category: categoryOf(last.areaId),
        act: last.act,
        ms: last.ready == null ? 0 : Math.max(0, now - ready),
        loading: last.ready == null
      }
    }
    const best = s.history
      .filter((r) => r.status === 'finished')
      .reduce<RunSummary | null>((a, r) => (a == null || r.total < a.total ? r : a), null)
    // lastT is on the log clock, which is the wall clock offset by under a
    // second (the anchor drops the milliseconds): close enough to tick on.
    const asOf = s.lastT
    return {
      live,
      current,
      pending: s.candidate && s.live ? { character: s.candidate.character, startedAt: s.candidate.startedAt } : null,
      asOf,
      tickUntil: live != null && current != null && asOf != null ? asOf + TICK_STALE_MS : null,
      history: [...s.history].reverse(),
      bestId: best?.id ?? null
    }
  }

  private apply(t: number, wall: number, ev: ParsedLogEvent): boolean {
    switch (ev.kind) {
      case 'areaGenerated':
        return this.onGenerated(t, wall, ev.areaId)
      case 'zoneEntered':
        return this.onEntered(t, ev.zoneName)
      case 'levelUp':
        return this.onLevelUp(t, ev.name, ev.charClass, ev.level)
      default:
        return false
    }
  }

  private onGenerated(t: number, wall: number, areaId: string): boolean {
    const s = this.state
    const gen = this.launchedAt ?? t
    this.launchedAt = null
    this.closeVisit(gen)

    if (areaId === TWILIGHT_STRAND_ID) {
      const run = this.startRun(wall)
      if (s.live) s.candidate = run // a mule, or a new run: see resolve
      else s.live = run
    } else if (s.candidate && s.live) {
      const act = actFromAreaId(areaId)
      if (act != null && act > 1) {
        // Somewhere a character from the Strand can't be yet: the run's own
        // character is back, and the new one was a mule.
        s.candidate = null
      } else if (act === 1 && areaId !== '1_1_town' && s.live.maxAct > 1) {
        // Out on the Coast: mules stay on the Strand and in Lioneye's Watch.
        // Only when the run is past Act 1 — otherwise it's its own character.
        this.confirmCandidate()
      }
    }

    if (areaId === KARUI_SHORES_ID && s.live) {
      s.candidate = null
      this.archive(s.live, gen, 'finished')
      s.live = null
      return true
    }

    for (const run of this.liveRuns()) {
      const act = actFromAreaId(areaId)
      if (act != null && act > run.maxAct && act <= FINAL_ACT) run.maxAct = act
      run.visits.push({ areaId, name: this.areaNames[areaId] ?? areaId, gen, ready: null, end: null, act: run.maxAct })
    }
    return s.live != null
  }

  private onEntered(t: number, name: string): boolean {
    let changed = false
    for (const run of this.liveRuns()) {
      const last = run.visits.at(-1)
      if (!last || last.end != null) continue
      if (last.ready == null) {
        last.ready = t
        last.name = name
        changed = true
      }
    }
    return changed
  }

  private onLevelUp(t: number, name: string, charClass: string, level: number): boolean {
    const s = this.state
    if (!s.live) return false
    const fresh = level <= 2
    if (s.candidate) {
      const c = s.candidate
      if (fresh && c.character == null) {
        c.character = name
        c.charClass = charClass
      } else if (!fresh && name === s.live.character) {
        s.candidate = null // the run's character levelled: it was a mule
      } else if (name === c.character && level > MULE_MAX_LEVEL) {
        this.confirmCandidate() // past where any mule stops: a real character
      }
    }
    const live = s.live
    if (live.character == null && (fresh || !s.candidate)) {
      live.character = name
      live.charClass = charClass
    }
    for (const run of this.liveRuns()) run.levels.push({ t, name, level })
    return true
  }

  /** The new character is real: the run before it ends where it started. */
  private confirmCandidate(): void {
    const s = this.state
    const next = s.candidate
    if (!next || !s.live) return
    const cut = next.visits[0]?.gen ?? 0
    const old = s.live
    old.visits = old.visits.filter((v) => v.gen < cut)
    const last = old.visits.at(-1)
    if (last && (last.end == null || last.end > cut)) last.end = cut
    old.levels = old.levels.filter((l) => l.t < cut)
    this.archive(old, cut, 'abandoned')
    s.live = next
    s.candidate = null
  }

  private startRun(wall: number): LiveRun {
    return {
      id: this.newId(),
      startedAt: wall,
      character: null,
      charClass: null,
      visits: [],
      levels: [],
      maxAct: 1
    }
  }

  private closeVisit(t: number): boolean {
    let changed = false
    for (const run of this.liveRuns()) {
      const last = run.visits.at(-1)
      if (last && last.end == null) {
        last.end = Math.max(t, last.ready ?? last.gen)
        changed = true
      }
    }
    return changed
  }

  private liveRuns(): LiveRun[] {
    const s = this.state
    return [s.live, s.candidate].filter((r): r is LiveRun => r != null)
  }

  private archive(run: LiveRun, end: number, status: RunStatus): void {
    const summary = summarize(run, end, status)
    if (status !== 'finished' && summary.total < MIN_KEPT_MS) return
    // The log clock is the wall clock, anchored to the millisecond tick.
    summary.endedAt = end
    this.state.history = [...this.state.history, summary].slice(-HISTORY_LIMIT)
  }
}

/**
 * A run's numbers as of `now` (the end of a visit still open). The first
 * visit's loading screen comes before the start, so it doesn't count.
 */
export function summarize(run: LiveRun, now: number, status: RunStatus): RunSummary {
  const byCategory = zeroTimes()
  const acts = new Map<number, ActSplit>()
  const zones = new Map<string, ZoneTime>()
  let total = 0
  const ownLevels = run.levels.filter((l) => l.name === run.character)

  run.visits.forEach((v, i) => {
    const ready = v.ready ?? v.gen
    const end = v.end ?? Math.max(now, ready)
    const loading = i === 0 ? 0 : Math.max(0, ready - v.gen)
    const stay = Math.max(0, end - ready)
    const category = categoryOf(v.areaId)

    let split = acts.get(v.act)
    if (!split) {
      split = { act: v.act, at: total, duration: 0, level: levelAt(ownLevels, v.gen), byCategory: zeroTimes() }
      acts.set(v.act, split)
    }
    split.duration += loading + stay
    split.byCategory.loading += loading
    split.byCategory[category] += stay
    byCategory.loading += loading
    byCategory[category] += stay
    total += loading + stay

    const key = `${v.areaId ?? v.name}@${v.act}`
    const zone = zones.get(key) ?? { areaId: v.areaId, name: v.name, act: v.act, ms: 0, visits: 0 }
    zone.ms += stay
    zone.visits++
    zones.set(key, zone)
  })

  return {
    id: run.id,
    character: run.character,
    charClass: run.charClass,
    status,
    startedAt: run.startedAt,
    endedAt: null,
    total,
    byCategory,
    acts: [...acts.values()].sort((a, b) => a.act - b.act),
    zones: [...zones.values()].sort((a, b) => b.ms - a.ms),
    level: ownLevels.at(-1)?.level ?? null
  }
}

/** The character's level at time t: the last level-up before it, or 1. */
function levelAt(levels: LevelMark[], t: number): number | null {
  if (levels.length === 0) return null
  let level = 1
  for (const l of levels) if (l.t <= t) level = l.level
  return level
}

function zeroTimes(): CategoryTimes {
  return { zone: 0, town: 0, hideout: 0, other: 0, loading: 0 }
}

function defaultId(): string {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
