// The run timer: how long a campaign run takes, and where the time goes. Pure
// (no Electron imports — unit-tested directly). Fed one Client.txt line at a
// time — its time from the stamp (stamp.ts), its meaning from the parser — it
// keeps the run in progress zone by zone, and every finished one as a summary.
//
// A run starts on the Twilight Strand, which only a new character ever enters,
// and ends when Kitava falls in Act 10: Sin's "May a new dawn arise!" in The
// Feeding Trough, confirmed seconds later by the merciless resistance penalty
// (the first load into Karui Shores, only reachable after it, is the fallback
// for a log that missed both). Time counts while the run's character is in the
// world: not after the game closes (said as it happens when it closes
// gracefully, else at the next launch) or goes back to the login server
// (logout, character select, a disconnect), not while the game says you're AFK, and not
// while another character plays. The log never names who logged in, so that
// is read from where they did: you log in where you logged out, so a campaign
// zone of an act the run has reached is the run's character, one beyond it is
// someone else, and a town, a hideout or a league area waits for the next
// clue — an alt can be parked in the same town. A map, at any time, is
// someone past the campaign. That is what the game's own
// /played counts, and the timer matches it to within minutes over whole runs.
// The one exception is a mule: its time is the run's too, booked as 'mule' —
// whether you make it first (it becomes the run's start) or mid-run.
//
// Every rule here is checked against two years of a real Client.txt, ten
// finished campaigns among them (2026-10-24, never committed).

import { isCampaignAreaId, isTownId } from '../log/areas.ts'
import { TWILIGHT_STRAND_ID } from '../log/tracker.ts'
import type { ParsedLogEvent } from '../log/parser.ts'
import { actFromAreaId } from '../profile/engine/stages.ts'
import { MULE_MAX_LEVEL } from '../profile/engine/mule.ts'
import { godsFallen } from '../profile/pantheon.ts'
import { IZARO_DEFEATED, labFinaleOf } from '../trials/engine.ts'
import type { LineStamp, ClockAnchor } from './stamp.ts'
import { LogClock } from './stamp.ts'

/** Where Act 10's Kitava is fought, and what Sin says as he falls. Sin says it
 *  again whenever Kitava dies in a map, so only here does it end a run. */
export const KITAVA_ARENA_ID = '2_10_6'
export const KITAVA_FALLS = 'May a new dawn arise!'

/** The epilogue town, reachable only after Kitava in Act 10: the run's end if
 *  the log somehow missed his death. */
export const KARUI_SHORES_ID = '2_11_endgame_town'

/** The last act of the campaign. */
export const FINAL_ACT = 10

/** An unfinished run shorter than this is dropped rather than kept: a
 *  character rolled and deleted again — wrong class, a typo in the name — is
 *  not a run worth comparing. */
export const MIN_KEPT_MS = 5 * 60_000

/** How many past runs are kept. A league's worth, and then some. */
export const HISTORY_LIMIT = 50

/** A character switch around a mule — logging out, making the mule, logging
 *  back in — counts with the mule when it's this short; a longer one was a
 *  break, not part of the run. */
export const MULE_SWITCH_MS = 5 * 60_000

/** A mule made this long before the next character starts was for another
 *  day: it stays out of the run. */
export const MULE_POOL_MS = 30 * 60_000

export type TimeCategory = 'zone' | 'town' | 'hideout' | 'lab' | 'mule' | 'other' | 'loading'
export const TIME_CATEGORIES: TimeCategory[] = ['zone', 'town', 'hideout', 'lab', 'mule', 'other', 'loading']

export type CategoryTimes = Record<TimeCategory, number>

/** One instance loaded during a run. Times are on the LogClock timeline. */
export interface Visit {
  areaId: string | null
  name: string
  /** the Generating line — the loading screen starts */
  gen: number
  /** the "You have entered" line — the loading screen ends; null until then */
  ready: number | null
  /** the next load, or the last moment the character was in the world (the
   *  game closed, a logout); null = still here */
  end: number | null
  /** the furthest act the run had reached by then — where the time is booked.
   *  A trip back to an earlier town is spent on the act you're in. */
  act: number
  /** time spent AFK here, which the run doesn't count */
  afk?: number
  /** other players met here (see RunTimer.metHere) */
  met?: string[]
  /** Time spent on a mule, or switching to or from one: the run's, but
   *  booked as 'mule' whatever the area. */
  mule?: boolean
  /** The loading screen as the game measured it. It starts before the
   *  Generating line (at the click on the exit) and ends after "You have
   *  entered", so it's longer than gen → ready: what the zones were given
   *  too much of. null on older logs, which don't write it. */
  loadMs?: number
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
  /** Another character is playing (see onGenerated): nothing counts until
   *  this one is back. */
  away?: boolean
  /** Logged in to a town, a hideout or a league area, which another
   *  character could be in too: the visits from this index on count only once
   *  a campaign zone (or the character's own level-up) says it was this one. */
  tentativeFrom?: number | null
  deaths?: number
  /** quest passive skill points handed over */
  questPoints?: number
  /** Labyrinths beaten ('normal', 'cruel', 'merciless') */
  labs?: string[]
  /** players met in the run's campaign zones: how many zones each shared */
  shared?: Record<string, number>
  /** when each was beaten: Izaro's death line */
  labDone?: Array<{ tier: string; t: number }>
  /** Pantheon powers whose god fell ("Soul of Tukohama") */
  gods?: string[]
  /** Sin's line over Kitava in Act 10: the moment of the kill, before the
   *  penalty message confirms it */
  dawnAt?: number
}

/** A Labyrinth beaten during the run — a split of its own, between the acts. */
export interface LabSplit {
  /** 'normal', 'cruel', 'merciless' */
  tier: string
  /** the act it was beaten in: its row goes after that act's */
  act: number
  /** run time when Izaro fell */
  at: number
  /** from walking into the Aspirants' Plaza to Izaro falling */
  duration: number
  level: number | null
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
  /** time spent in it, loading screens apart */
  ms: number
  visits: number
  /** when it was first entered, among the run's zones: 0, 1, 2… */
  order?: number
  /** a party member was in it with you at some point */
  withParty?: boolean
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
  /** AFK time, not part of the total */
  afk: number
  acts: ActSplit[]
  zones: ZoneTime[]
  level: number | null
  deaths: number
  questPoints: number
  labs: string[]
  /** missing on runs kept before Labyrinth splits existed */
  labSplits?: LabSplit[]
  /** Who was in the run's campaign zones with you, and in how many — only
   *  party members can be, whoever went to whom. Missing on runs kept before
   *  this was counted. */
  shared?: Record<string, number>
  /** Of those, who played the run with you (PARTY_MIN_ZONES); [] = solo. */
  party?: string[]
  gods: string[]
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
  /** another character is playing; the run waits */
  away: boolean
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
  /** The fastest finished run of each kind — a run is compared only with
   *  its own kind: solo with solo, party with party (see runKind). */
  best: { solo: string | null; party: string | null }
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
  /** AFK since; null = not AFK */
  afkFrom: number | null
  /** Back from the login server: the next area loaded is where a character
   *  logged in — the one clue to who it is. */
  freshLogin: boolean
  /** Mules made since the last run started, waiting to join the next one —
   *  you mule first, then roll the character the run is for. */
  mulePool: Visit[]
}

export function emptyTimerState(): RunTimerState {
  return {
    live: null,
    candidate: null,
    history: [],
    lastT: null,
    atLast: [],
    session: null,
    anchor: null,
    afkFrom: null,
    freshLogin: false,
    mulePool: []
  }
}

/** Without a log line for this long, the live clock stops ticking: the game
 *  was probably closed, and the log can't say so until it starts again. */
export const TICK_STALE_MS = 15 * 60_000

export function categoryOf(areaId: string | null): Exclude<TimeCategory, 'loading'> {
  if (!areaId) return 'other'
  if (/^Hideout/i.test(areaId)) return 'hideout'
  if (/^(?:\d_)?Labyrinth_/.test(areaId)) return 'lab'
  if (!isCampaignAreaId(areaId)) return 'other'
  return isTownId(areaId) ? 'town' : 'zone'
}

/**
 * Whether loading into an area says another character is playing, not the
 * run's: a map — only a character past the campaign gets one — or an act two
 * or more beyond the furthest the run has reached, which no waypoint reaches.
 * Hideouts and league areas (Kingsmarch, a Breach domain) are open to any
 * character and say nothing either way.
 */
export function isForeignArea(areaId: string, maxAct: number): boolean {
  if (/^MapWorlds/.test(areaId)) return true
  if (areaId.startsWith('2_11_')) return maxAct < FINAL_ACT
  const act = actFromAreaId(areaId)
  return act != null && act > maxAct + 1
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
    // The game closed after its last line: the zone ends there, and the time
    // until the next launch isn't the run's.
    if (restarted && s.lastT != null) changed = this.leaveWorld(s.lastT)
    s.lastT = t
    if (stamp.opening) s.session = null
    else if (stamp.session != null) s.session = stamp.session

    if (ev) changed = this.apply(t, stamp.wall, ev) || changed
    return changed
  }

  /**
   * End the run in progress by hand — you're stopping, and starting over. It
   * goes to the history as it stands, however short; the next Twilight
   * Strand starts a new run. (A new character would end it too, once it's
   * clearly not a mule; this doesn't wait for that.)
   */
  endRun(): boolean {
    const s = this.state
    const live = s.live
    if (!live) return false
    const end = s.lastT ?? live.visits.at(-1)?.gen ?? 0
    this.endAfk(end)
    this.closeVisit(end)
    this.archive(live, end, 'abandoned', true)
    s.live = s.candidate
    s.candidate = null
    return true
  }

  /**
   * Take in runs read from a whole log (see import.ts). One the history
   * already has — the same character, over the same time — is replaced: the
   * log's is whole, the one recorded live may have gaps from while the overlay
   * was closed. The rest are added, and the history stays in start order.
   */
  mergeRuns(runs: RunSummary[]): { added: number; replaced: number } {
    let added = 0
    let replaced = 0
    let history = [...this.state.history]
    for (const run of runs) {
      const same = history.findIndex((h) => isSameRun(h, run))
      if (same >= 0) {
        history[same] = run
        replaced++
      } else {
        history.push(run)
        added++
      }
    }
    history = history.sort((a, b) => a.startedAt - b.startedAt).slice(-HISTORY_LIMIT)
    this.state.history = history
    return { added, replaced }
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
    const live = s.live ? summarize(s.live, now, 'running', s.afkFrom) : null
    const last = s.live?.visits.at(-1)
    let current: CurrentVisit | null = null
    if (last && last.end == null && !s.live?.away) {
      const ready = last.ready ?? last.gen
      current = {
        name: last.name,
        category: categoryOf(last.areaId),
        act: last.act,
        ms:
          last.ready == null
            ? 0
            : Math.max(0, now - last.gen - (last.loadMs ?? ready - last.gen) - (last.afk ?? 0) - afkSoFar(s.afkFrom, now)),
        loading: last.ready == null
      }
    }
    const fastest = (kind: 'solo' | 'party'): string | null =>
      s.history
        .filter((r) => r.status === 'finished' && runKind(r) === kind)
        .reduce<RunSummary | null>((a, r) => (a == null || r.total < a.total ? r : a), null)?.id ?? null
    // lastT is on the log clock, which is the wall clock offset by under a
    // second (the anchor drops the milliseconds): close enough to tick on.
    const asOf = s.lastT
    const ticking = live != null && current != null && asOf != null && s.afkFrom == null
    return {
      live,
      current,
      away: !!s.live?.away,
      pending: s.candidate && s.live ? { character: s.candidate.character, startedAt: s.candidate.startedAt } : null,
      asOf,
      tickUntil: ticking ? asOf + TICK_STALE_MS : null,
      history: [...s.history].reverse(),
      best: { solo: fastest('solo'), party: fastest('party') }
    }
  }

  private apply(t: number, wall: number, ev: ParsedLogEvent): boolean {
    const s = this.state
    switch (ev.kind) {
      case 'areaGenerated':
        return this.onGenerated(t, wall, ev.areaId)
      case 'zoneEntered':
        return this.onEntered(t, ev.zoneName)
      case 'levelUp':
        return this.onLevelUp(t, ev.name, ev.charClass, ev.level)
      case 'loadingScreen': {
        let changed = false
        for (const run of this.liveRuns()) {
          const last = run.visits.at(-1)
          if (run.away || !last || last.end != null || last.loadMs != null) continue
          last.loadMs = ev.ms
          changed = true
        }
        return changed
      }
      case 'loginServer':
      case 'leftGame':
        return this.leaveWorld(t)
      case 'afk':
        if (ev.on) {
          if (s.afkFrom != null || !this.inWorld()) return false
          s.afkFrom = t
          return true
        }
        return this.endAfk(t)
      case 'sin':
        return this.onSin(t, ev.line)
      case 'kitava': {
        const live = s.live
        if (ev.tier !== 'merciless' || !live || live.away) return false
        s.candidate = null
        this.finish(live, live.dawnAt ?? t)
        return true
      }
      case 'passivePoint':
        return this.forEachPlaying((run) => {
          run.questPoints = (run.questPoints ?? 0) + 1
        })
      case 'areaPresence':
        // Coming in, or leaving without having come in — then they were
        // there before you: you went to them. Either way a zone shared.
        return this.metHere(ev.name)
      case 'slain': {
        // A partymate dying where you are: met here, like a level-up — the
        // game only says so for players in your instance (✓ log: never in a
        // town or hideout). Monsters die by name too ("Hillock has been
        // slain"), so only someone the run already knows as a player counts.
        const player = s.live?.shared?.[ev.name] != null || s.live?.levels.some((l) => l.name === ev.name)
        const met = ev.name !== s.live?.character && player ? this.metHere(ev.name) : false
        return (
          this.forEachPlaying((run) => {
            if (run.character === ev.name) run.deaths = (run.deaths ?? 0) + 1
          }) || met
        )
      }
      case 'izaro': {
        const tier = labFinaleOf(this.here())
        const said = ev.line.toLowerCase()
        if (!tier || !IZARO_DEFEATED.some((d) => said.includes(d.toLowerCase()))) return false
        return this.forEachPlaying((run) => {
          if ((run.labs ?? []).includes(tier)) return
          run.labs = [...(run.labs ?? []), tier]
          run.labDone = [...(run.labDone ?? []), { tier, t }]
        })
      }
      default:
        return false
    }
  }

  private onGenerated(t: number, wall: number, areaId: string): boolean {
    const s = this.state
    const fresh = s.freshLogin
    s.freshLogin = false
    this.closeVisit(t)

    let started: LiveRun | null = null
    if (areaId === TWILIGHT_STRAND_ID) {
      started = this.startRun(wall)
      // Another new character after one that never left the Strand and
      // Lioneye's Watch: that one was a mule, made for this run.
      if (s.candidate && isMuleLike(s.candidate)) this.pool(s.candidate)
      s.candidate = null
      if (s.live && isMuleLike(s.live)) {
        this.pool(s.live)
        s.live = null
      }
      if (s.live) {
        s.candidate = started // a mule, or a new run: see resolve
      } else {
        s.live = started
        this.takePool(started, t)
      }
    } else if (s.candidate && s.live) {
      const act = actFromAreaId(areaId)
      if (act != null && act > 1) {
        // Somewhere a character from the Strand can't be yet: the run's own
        // character is back, and the new one was a mule.
        this.mergeMule(s.live, s.candidate, t)
        s.candidate = null
      } else if (act === 1 && areaId !== '1_1_town' && s.live.maxAct > 1) {
        // Out on the Coast: mules stay on the Strand and in Lioneye's Watch.
        // Only when the run is past Act 1 — otherwise it's its own character.
        this.confirmCandidate()
      }
    }

    // Kitava's death went unlogged (the overlay wasn't running): the first
    // load into the epilogue still says the campaign is over.
    if (areaId === KARUI_SHORES_ID && s.live && !s.live.away && s.live.maxAct >= FINAL_ACT) {
      s.candidate = null
      this.finish(s.live, t)
      return true
    }

    for (const run of this.liveRuns()) {
      if (run !== started && (areaId === TWILIGHT_STRAND_ID || isForeignArea(areaId, run.maxAct))) {
        // A new character on the Strand, or one in a map: not this run's.
        this.goAway(run)
        continue
      }
      const campaign = isCampaignAreaId(areaId)
      const out = campaign && !isTownId(areaId) // a zone, not a town
      const act = actFromAreaId(areaId)
      if (run === started) {
        // the run's first zone
      } else if (fresh) {
        // Logged in where it logged out: somewhere the run has been, or not.
        // A town proves little — an alt can be parked in the same one — so
        // only a zone settles it; until then the time is on probation.
        if (campaign && act != null && act > run.maxAct) {
          this.goAway(run)
          continue
        }
        if (out) {
          run.away = false
          run.tentativeFrom = null
        } else if (campaign) {
          run.away = false
          run.tentativeFrom = run.visits.length
        } else {
          if (run.away) continue
          run.tentativeFrom = run.visits.length
        }
      } else {
        if (run.away) continue
        if (out) run.tentativeFrom = null
      }
      if (act != null && act > run.maxAct && act <= FINAL_ACT) run.maxAct = act
      run.visits.push({ areaId, name: this.areaNames[areaId] ?? areaId, gen: t, ready: null, end: null, act: run.maxAct })
    }
    return s.live != null
  }

  /** Another character is playing: what this run had on probation wasn't its. */
  private goAway(run: LiveRun): void {
    this.dropTentative(run)
    run.away = true
  }

  private dropTentative(run: LiveRun): void {
    if (run.tentativeFrom == null) return
    run.visits.splice(run.tentativeFrom)
    run.tentativeFrom = null
  }

  private onEntered(t: number, name: string): boolean {
    let changed = false
    for (const run of this.liveRuns()) {
      const last = run.visits.at(-1)
      if (run.away || !last || last.end != null) continue
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
        // the run's character levelled: it was a mule
        this.mergeMule(s.live, c, t)
        s.candidate = null
      } else if (name === c.character && level > MULE_MAX_LEVEL) {
        this.confirmCandidate() // past where any mule stops: a real character
      }
    }
    const live = s.live
    if (live.character == null && (fresh || !s.candidate)) {
      live.character = name
      live.charClass = charClass
    }
    // A partymate levelling where you are: met here too — the game only says
    // so for players in your instance, so it covers a zone you went to them
    // in and left first, which logs neither joined nor left.
    if (name !== s.live.character && name !== s.candidate?.character) this.metHere(name)
    for (const run of this.liveRuns()) {
      run.levels.push({ t, name, level })
      if (name === run.character) {
        // Its own level-up: the run's character is the one playing, whatever
        // the zones said. (Time it spent while thought away stays lost.)
        run.away = false
        run.tentativeFrom = null
      } else if (run.tentativeFrom != null && name !== s.candidate?.character && level > 2) {
        // Someone else levelling in the hideout the run was logged in to.
        this.goAway(run)
      }
    }
    return true
  }

  /** Another player in the zone you're in. Counted once per zone, and only
   *  in a campaign zone: a town has strangers passing through, a hideout
   *  trade visitors. */
  private metHere(name: string): boolean {
    const here = this.here()
    if (!here || categoryOf(here) !== 'zone') return false
    return this.forEachPlaying((run) => {
      const visit = run.visits.at(-1)
      if (!visit || visit.end != null || visit.met?.includes(name)) return
      visit.met = [...(visit.met ?? []), name]
      run.shared = { ...run.shared, [name]: (run.shared?.[name] ?? 0) + 1 }
    })
  }

  private onSin(t: number, line: string): boolean {
    const here = this.here()
    let changed = false
    for (const run of this.liveRuns()) {
      if (run.away) continue
      if (line === KITAVA_FALLS && here === KITAVA_ARENA_ID) {
        run.dawnAt = t
        changed = true
      }
      for (const god of godsFallen(line, here)) {
        if ((run.gods ?? []).includes(god.soul)) continue
        run.gods = [...(run.gods ?? []), god.soul]
        changed = true
      }
    }
    return changed
  }

  /** A mule's time, set aside until the run it was made for starts. */
  private pool(run: LiveRun): void {
    this.state.mulePool = [...this.state.mulePool, ...run.visits.map((v) => ({ ...v, mule: true, act: 1 }))]
  }

  /** A new run takes the mules made for it: they come first. */
  private takePool(run: LiveRun, t: number): void {
    const pool = this.state.mulePool
    this.state.mulePool = []
    const last = pool.at(-1)
    if (!last || t - (last.end ?? t) > MULE_POOL_MS) return
    run.visits = bridged([...pool], run.visits, t)
    run.startedAt = pool[0].gen
  }

  /** A mule made mid-run, now that the run's character is back: its time,
   *  and the switches to it and back, join the run at the act it's in. */
  private mergeMule(run: LiveRun, mule: LiveRun, t: number): void {
    // Any mule made before this one, in the same trip away, comes with it.
    const pool = this.state.mulePool
    this.state.mulePool = []
    const visits = [...pool, ...mule.visits]
      .filter((v) => v.gen >= (run.visits.at(-1)?.gen ?? 0))
      .map((v) => ({ ...v, mule: true, act: run.maxAct, end: v.end ?? t }))
    const before = run.visits.filter((v) => v.gen < (visits[0]?.gen ?? t))
    const after = run.visits.filter((v) => v.gen >= (visits[0]?.gen ?? t))
    run.visits = bridged(bridged(before, visits, visits[0]?.gen ?? t), after, after[0]?.gen ?? t)
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
    // Mules made while the old run was still going were made for this one.
    this.takePool(next, cut)
  }

  private finish(run: LiveRun, end: number): void {
    this.endAfk(end)
    this.closeVisit(end)
    this.archive(run, end, 'finished')
    if (this.state.live === run) this.state.live = null
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

  /** Out of the game world — closed, logged out, disconnected. A login that
   *  never got past a hideout says nothing for the run, and doesn't count. */
  private leaveWorld(t: number): boolean {
    const afk = this.endAfk(t)
    const closed = this.closeVisit(t)
    for (const run of this.liveRuns()) this.dropTentative(run)
    this.state.freshLogin = true
    return closed || afk
  }

  private endAfk(t: number): boolean {
    const s = this.state
    if (s.afkFrom == null) return false
    for (const run of this.liveRuns()) {
      const last = run.visits.at(-1)
      if (last && last.end == null) last.afk = (last.afk ?? 0) + Math.max(0, t - s.afkFrom)
    }
    s.afkFrom = null
    return true
  }

  private closeVisit(t: number): boolean {
    this.endAfk(t)
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

  /** The area the live run's character is in, while it's in the world. */
  private here(): string | null {
    const last = this.state.live?.visits.at(-1)
    return last && last.end == null && !this.state.live?.away ? last.areaId : null
  }

  private inWorld(): boolean {
    return this.liveRuns().some((run) => !run.away && run.visits.at(-1)?.end === null)
  }

  private forEachPlaying(fn: (run: LiveRun) => void): boolean {
    const runs = this.liveRuns().filter((run) => !run.away)
    runs.forEach(fn)
    return runs.length > 0
  }

  private liveRuns(): LiveRun[] {
    const s = this.state
    return [s.live, s.candidate].filter((r): r is LiveRun => r != null)
  }

  private archive(run: LiveRun, end: number, status: RunStatus, keepShort = false): void {
    const summary = summarize(run, end, status, null)
    if (status !== 'finished' && !keepShort && summary.total < MIN_KEPT_MS) return
    // The log clock is the wall clock, anchored to the millisecond tick.
    summary.endedAt = end
    this.state.history = [...this.state.history, summary].slice(-HISTORY_LIMIT)
  }
}

/**
 * A run's numbers as of `now` (the end of a visit still open, AFK since
 * `afkFrom`). The first visit's loading screen comes before the start, so it
 * doesn't count.
 */
export function summarize(run: LiveRun, now: number, status: RunStatus, afkFrom: number | null): RunSummary {
  const byCategory = zeroTimes()
  const acts = new Map<number, ActSplit>()
  const zones = new Map<string, ZoneTime>()
  let total = 0
  let afkTotal = 0
  const ownLevels = run.levels.filter((l) => l.name === run.character)
  const party = partyOf({ shared: run.shared })
  /** per visit: run time before it, and what it adds — to place a moment */
  const placed: Array<{ v: Visit; before: number; adds: number; lab: boolean }> = []

  run.visits.forEach((v, i) => {
    const ready = v.ready ?? v.gen
    const end = v.end ?? Math.max(now, ready)
    const afk = (v.afk ?? 0) + (v.end == null ? afkSoFar(afkFrom, now) : 0)
    // The game's own measure, when it wrote one, else the lines around the
    // load. Either way the visit's span is the same: what the loading screen
    // gets, the zone doesn't — so the total never depends on which it was.
    const span = Math.max(0, end - v.gen)
    const loading = i === 0 ? 0 : Math.min(span, v.loadMs ?? Math.max(0, ready - v.gen))
    const stay = i === 0 ? Math.max(0, end - ready - afk) : Math.max(0, span - loading - afk)
    const category = v.mule ? 'mule' : categoryOf(v.areaId)
    afkTotal += afk

    let split = acts.get(v.act)
    if (!split) {
      split = { act: v.act, at: total, duration: 0, level: levelAt(ownLevels, v.gen), byCategory: zeroTimes() }
      acts.set(v.act, split)
    }
    // A mule's load screens are mule time too.
    const loadAs = v.mule ? 'mule' : 'loading'
    placed.push({ v, before: total, adds: loading + stay, lab: category === 'lab' })
    split.duration += loading + stay
    split.byCategory[loadAs] += loading
    split.byCategory[category] += stay
    byCategory[loadAs] += loading
    byCategory[category] += stay
    total += loading + stay

    if (v.mule) return
    const key = `${v.areaId ?? v.name}@${v.act}`
    const zone = zones.get(key) ?? { areaId: v.areaId, name: v.name, act: v.act, ms: 0, visits: 0, order: zones.size }
    zone.ms += stay
    zone.visits++
    if (v.met?.some((name) => party.includes(name))) zone.withParty = true
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
    afk: afkTotal,
    acts: [...acts.values()].sort((a, b) => a.act - b.act),
    zones: [...zones.values()].sort((a, b) => b.ms - a.ms),
    level: ownLevels.at(-1)?.level ?? null,
    deaths: run.deaths ?? 0,
    questPoints: run.questPoints ?? 0,
    labs: run.labs ?? [],
    labSplits: (run.labDone ?? []).map(({ tier, t }) => labSplit(placed, ownLevels, tier, t)),
    shared: run.shared ?? {},
    party,
    gods: run.gods ?? []
  }
}

/** Run time at a moment: the time before its visit, plus as much of the
 *  visit as had passed. */
function runTimeAt(placed: Array<{ v: Visit; before: number; adds: number }>, t: number): number {
  let at = 0
  for (const p of placed) {
    if (p.v.gen > t) break
    at = p.before + Math.min(p.adds, t - p.v.gen)
  }
  return at
}

/** A beaten Labyrinth as a split: from the first lab area of the stretch it
 *  was beaten in (the Aspirants' Plaza) to Izaro's death. */
function labSplit(
  placed: Array<{ v: Visit; before: number; adds: number; lab: boolean }>,
  levels: LevelMark[],
  tier: string,
  t: number
): LabSplit {
  let i = -1
  placed.forEach((p, k) => {
    if (p.v.gen <= t) i = k
  })
  const act = placed[i]?.v.act ?? 1
  while (i > 0 && placed[i - 1].lab) i--
  const start = placed[i]?.v.gen ?? t
  const at = runTimeAt(placed, t)
  return { tier, act, at, duration: Math.max(0, at - runTimeAt(placed, start)), level: levelAt(levels, t) }
}

/** How many zones someone has to share with you to count as playing the run
 *  with you: one or two is a portal to hand something over. */
export const PARTY_MIN_ZONES = 3

/** Who played the run with you, most present first; [] = solo. */
export function partyOf(run: Pick<RunSummary, 'shared'>): string[] {
  return Object.entries(run.shared ?? {})
    .filter(([, n]) => n >= PARTY_MIN_ZONES)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
}

/** Solo or party. A run counts as solo until someone has shared enough of
 *  its zones (PARTY_MIN_ZONES) — so a run in progress can turn party, never
 *  back. null for a run kept before this was counted: it's compared with
 *  neither until an import reads it again. */
export function runKind(run: Pick<RunSummary, 'party'>): 'solo' | 'party' | null {
  if (!run.party) return null
  return run.party.length > 0 ? 'party' : 'solo'
}

/** The same run seen twice — once live, once read back from the log: the
 *  same character, over overlapping time. */
export function isSameRun(a: RunSummary, b: RunSummary): boolean {
  if (!a.character || a.character !== b.character) return false
  const aEnd = a.endedAt ?? a.startedAt + a.total
  const bEnd = b.endedAt ?? b.startedAt + b.total
  return a.startedAt <= bEnd && b.startedAt <= aEnd
}

function afkSoFar(afkFrom: number | null, now: number): number {
  return afkFrom == null ? 0 : Math.max(0, now - afkFrom)
}

/** The character's level at time t: the last level-up before it, or 1. */
function levelAt(levels: LevelMark[], t: number): number | null {
  if (levels.length === 0) return null
  let level = 1
  for (const l of levels) if (l.t <= t) level = l.level
  return level
}

function zeroTimes(): CategoryTimes {
  return { zone: 0, town: 0, hideout: 0, lab: 0, mule: 0, other: 0, loading: 0 }
}

/**
 * A mule: a character that never got past the Strand and Lioneye's Watch,
 * nor past level 2. ✓ log: every mule in two years of it stopped there; a
 * character played for real is on the Coast within minutes.
 */
export function isMuleLike(run: LiveRun): boolean {
  if (run.levels.some((l) => l.name === run.character && l.level > 2)) return false
  return run.visits.every(
    (v) => v.mule || !v.areaId || !isCampaignAreaId(v.areaId) || v.areaId === TWILIGHT_STRAND_ID || v.areaId === '1_1_town'
  )
}

/** Two stretches of visits, end to end, with the character switch between
 *  them counted as mule time when it's short (MULE_SWITCH_MS). `next` is when
 *  the second begins, for when it has no visit yet. */
function bridged(first: Visit[], second: Visit[], next: number): Visit[] {
  const last = first.at(-1)
  const from = last?.end
  const to = second[0]?.gen ?? next
  if (from == null || to <= from || to - from > MULE_SWITCH_MS) return [...first, ...second]
  const gap: Visit = { areaId: null, name: 'Switching characters', gen: from, ready: from, end: to, act: last!.act, mule: true }
  return [...first, gap, ...second]
}

function defaultId(): string {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
