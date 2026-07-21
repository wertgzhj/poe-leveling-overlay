// Pure progress state machine fed by parsed log events (no Electron imports).
// Pairs the locale-independent areaGenerated debug line (primary signal, §8)
// with the localized zoneEntered INFO line (fallback / display-name source),
// and binds level-ups to one character so party members don't advance stages.

import type { LogParser, ParsedLogEvent } from './parser.ts'

// The Twilight Strand (Act 1 opening zone) is only ever entered by a brand-new
// character — you can't go back. So entering it in auto-detect mode is an
// unambiguous "different character now" signal: re-arm adoption so the new
// character's first level-up binds instead of staying stuck on the old one.
const TWILIGHT_STRAND_ID = '1_1_1'

export interface AreaState {
  /** Canonical act-scoped id ("1_1_town"); null when only a name was seen and it couldn't be resolved. */
  areaId: string | null
  name: string
  /** Monster level from the Generating line; null when the area came from the fallback path. */
  areaLevel: number | null
  ts: number
}

export interface LevelUpEvent {
  name: string
  charClass: string
  level: number
  /** True when this level-up belongs to the tracked character (drives stage switching). */
  isBound: boolean
  ts: number
}

export interface TrackerSnapshot {
  area: AreaState | null
  character: string | null
  charClass: string | null
  level: number | null
}

export interface TrackerCallbacks {
  onArea?: (area: AreaState) => void
  onLevelUp?: (ev: LevelUpEvent) => void
}

export interface TrackerOptions {
  /** areaId -> display name (data/areas/<lang>.json) */
  areaNames: Record<string, string>
  /** Explicit character binding (settings/profile). null = adopt heuristically. */
  boundCharacter?: string | null
  callbacks?: TrackerCallbacks
  now?: () => number
}

export class ProgressTracker {
  private readonly areaNames: Record<string, string>
  /** name -> areaId; null value = ambiguous (duplicate zone names across acts, §5.1). */
  private readonly reverseNames = new Map<string, string | null>()
  private readonly callbacks: TrackerCallbacks
  private readonly now: () => number

  private explicitBinding: string | null
  private adoptedBinding: string | null = null
  private levelUpCounts = new Map<string, number>()
  /** Latest level/class seen per character name (any name, bound or not). */
  private lastSeen = new Map<string, { level: number; charClass: string }>()
  /** Name from the most recent level-up (backscan tail + live) — the "who am I
   *  playing now" signal for the manual detect-character action. */
  private lastLevelUpName: string | null = null

  private area: AreaState | null = null
  /** A Generating line was seen and its localized "You have entered" is still expected. */
  private pendingName = false

  constructor(opts: TrackerOptions) {
    this.areaNames = opts.areaNames
    this.explicitBinding = normalizeName(opts.boundCharacter)
    this.callbacks = opts.callbacks ?? {}
    this.now = opts.now ?? Date.now

    for (const [id, name] of Object.entries(opts.areaNames)) {
      const key = name.toLowerCase()
      this.reverseNames.set(key, this.reverseNames.has(key) ? null : id)
    }
  }

  get boundCharacter(): string | null {
    return this.explicitBinding ?? this.adoptedBinding
  }

  setBoundCharacter(name: string | null): void {
    this.explicitBinding = normalizeName(name)
  }

  /**
   * Manual "who am I logged in as?" — adopt the character from the most recent
   * level-up seen in the log (backscan tail + live lines). A level-up is the
   * only place Client.txt names your character, so one that hasn't levelled in
   * the retained log can't be found (returns null). Sets the adopted binding;
   * an explicit settings binding still wins for tracking. Safe against party
   * hijack — adoptedBinding ends up set, so a partymate's level-up won't grab it.
   */
  detectCurrentCharacter(): { name: string; charClass: string; level: number } | null {
    const name = this.lastLevelUpName
    if (!name) return null
    this.adoptedBinding = name
    const seen = this.lastSeen.get(name)
    return { name, charClass: seen?.charClass ?? '', level: seen?.level ?? 0 }
  }

  snapshot(): TrackerSnapshot {
    const bound = this.boundCharacter
    const seen = bound ? this.lastSeen.get(bound) : undefined
    return {
      area: this.area,
      character: bound,
      charClass: seen?.charClass ?? null,
      level: seen?.level ?? null
    }
  }

  /** Restore persisted state (used when the log yields nothing, e.g. deleted). */
  hydrate(snap: TrackerSnapshot): void {
    if (!this.area && snap.area) this.area = snap.area
    if (!this.explicitBinding && !this.adoptedBinding && snap.character) {
      this.adoptedBinding = snap.character
      if (snap.level != null && !this.lastSeen.has(snap.character)) {
        this.lastSeen.set(snap.character, {
          level: snap.level,
          charClass: snap.charClass ?? ''
        })
      }
    }
  }

  /**
   * Replay a chunk of historical lines (startup backscan, §8 restart/resume).
   * Mutates state without emitting events; character binding falls to the most
   * frequent level-up name in the window — you always see your own level-ups,
   * party members only while grouped. Ties resolve to the latest seen.
   */
  backscan(lines: string[], parser: LogParser): void {
    let lastName: string | null = null
    for (const line of lines) {
      const ev = parser.parseLine(line)
      if (!ev) continue
      if (ev.kind === 'levelUp') lastName = ev.name
      this.apply(ev, false)
    }
    if (!this.explicitBinding && !this.adoptedBinding && this.levelUpCounts.size > 0) {
      let best: string | null = null
      let bestCount = -1
      for (const [name, count] of this.levelUpCounts) {
        if (count > bestCount || (count === bestCount && name === lastName)) {
          best = name
          bestCount = count
        }
      }
      this.adoptedBinding = best
    }
  }

  handle(ev: ParsedLogEvent): void {
    this.apply(ev, true)
  }

  private apply(ev: ParsedLogEvent, emit: boolean): void {
    switch (ev.kind) {
      case 'areaGenerated': {
        // New character (auto mode only): forget the adopted binding so the
        // next level-up adopts whoever is now playing. Explicit bindings and
        // the backscan (which adopts by frequency at the end) are untouched.
        if (emit && ev.areaId === TWILIGHT_STRAND_ID && !this.explicitBinding && this.adoptedBinding) {
          this.adoptedBinding = null
          this.levelUpCounts.clear()
        }
        this.area = {
          areaId: ev.areaId,
          name: this.areaNames[ev.areaId] ?? ev.areaId,
          areaLevel: ev.areaLevel,
          ts: this.now()
        }
        this.pendingName = true
        if (emit) this.callbacks.onArea?.(this.area)
        break
      }
      case 'zoneEntered': {
        // Every instance load logs the Generating line first, then this INFO
        // line with the localized display name (verified: act1-real.log pairs
        // them without exception). While a Generating area awaits its name,
        // adopt the localized name and keep the id — this also self-heals a
        // wrong entry in the areas/<lang> map.
        if (this.pendingName && this.area) {
          this.pendingName = false
          if (this.area.name !== ev.zoneName) {
            this.area = { ...this.area, name: ev.zoneName }
            if (emit) this.callbacks.onArea?.(this.area)
          }
          break
        }
        // Repeat announcement of the current zone: nothing to do.
        if (this.area && this.area.name === ev.zoneName) break
        // Fallback: the debug line was missed (pattern drift, §8) — reverse
        // name lookup; unknown or act-ambiguous names yield a null id.
        this.area = {
          areaId: this.reverseNames.get(ev.zoneName.toLowerCase()) ?? null,
          name: ev.zoneName,
          areaLevel: null,
          ts: this.now()
        }
        if (emit) this.callbacks.onArea?.(this.area)
        break
      }
      case 'levelUp': {
        this.lastLevelUpName = ev.name
        this.levelUpCounts.set(ev.name, (this.levelUpCounts.get(ev.name) ?? 0) + 1)
        this.lastSeen.set(ev.name, { level: ev.level, charClass: ev.charClass })
        if (!this.explicitBinding && !this.adoptedBinding && emit) {
          // First live level-up adopts the character (confirm toast is P3).
          this.adoptedBinding = ev.name
        }
        if (emit) {
          this.callbacks.onLevelUp?.({
            name: ev.name,
            charClass: ev.charClass,
            level: ev.level,
            isBound: ev.name === this.boundCharacter,
            ts: this.now()
          })
        }
        break
      }
    }
  }
}

function normalizeName(name: string | null | undefined): string | null {
  const trimmed = name?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}
