// Pure progress state machine fed by parsed log events (no Electron imports).
// Pairs the locale-independent areaGenerated debug line (primary signal)
// with the localized zoneEntered INFO line (fallback / display-name source),
// and binds level-ups to one character so party members don't advance stages.

import { isCampaignAreaId, isTownId } from './areas.ts'
import type { LogParser, ParsedLogEvent } from './parser.ts'

// The Twilight Strand (Act 1 opening zone) is only ever entered by a brand-new
// character — you can't go back. So entering it in auto-detect mode is an
// unambiguous "different character now" signal: re-arm adoption so the new
// character's first level-up binds instead of staying stuck on the old one.
export const TWILIGHT_STRAND_ID = '1_1_1'

/** A character's first level-up is to level 2. After entering the Twilight
 *  Strand, a level-up to this level or below is the new character; anything
 *  higher means you went back to an old one instead. Confirmed against a real
 *  capture: all 46 new characters in it (see "What the code takes as given",
 *  docs/TESTING.md). */
export const FRESH_CHARACTER_MAX_LEVEL = 2

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

/** How your level sits against the zone's monster level. */
export interface ZoneFit {
  verdict: 'under' | 'over'
  /** The zone's monster level, for the message. */
  areaLevel: number
  /** How far past the safe range you are, in levels. */
  by: number
}

/**
 * Compare the character's level with the zone's monster level. Path of Exile
 * cuts experience once the gap exceeds the safe range in *either* direction, so
 * both are worth saying: too far under and the zone is dangerous and stingy, too
 * far over and you're farming for nothing.
 *
 * Returns null whenever the comparison would mislead:
 *  - towns generate at a fixed monster level (Lioneye's Watch at 13), so
 *    standing in one at level 5 is not "underlevelled"
 *  - non-campaign instances (hideouts, maps, the Labyrinth) aren't part of the
 *    levelling curve
 *  - the fallback zone path carries no monster level at all
 */
export function zoneFit(
  area: { areaId: string | null; areaLevel: number | null } | null,
  charLevel: number | null,
  safeRange: number
): ZoneFit | null {
  if (!area || area.areaLevel == null || charLevel == null) return null
  if (!area.areaId || !isCampaignAreaId(area.areaId) || isTownId(area.areaId)) return null
  const gap = area.areaLevel - charLevel
  if (gap > safeRange) return { verdict: 'under', areaLevel: area.areaLevel, by: gap - safeRange }
  if (-gap > safeRange) return { verdict: 'over', areaLevel: area.areaLevel, by: -gap - safeRange }
  return null
}

export interface TrackerSnapshot {
  area: AreaState | null
  character: string | null
  charClass: string | null
  level: number | null
  /** Characters this install has tracked as you, most recent last — see
   *  ProgressTracker.own. Persisted with the rest so a restart keeps them. */
  own?: string[]
}

/** How many of your characters are remembered. Enough for a league's worth of
 *  alts and mules; old ones fall off the front. */
const OWN_LIMIT = 20

export interface TrackerCallbacks {
  onArea?: (area: AreaState) => void
  onLevelUp?: (ev: LevelUpEvent) => void
  /**
   * A brand-new character, named. Fires once per Twilight Strand, on that
   * character's first level-up and BEFORE its onLevelUp — so whoever keeps
   * per-character progress can drop last league's namesake's before loading.
   * Not at the Strand itself: nothing in the log names the new character
   * until it levels, and in auto mode the binding is empty by then.
   */
  onFreshCharacter?: (name: string) => void
}

/** What a backscan window actually contained, per event kind. The split matters
 *  for diagnosis: `areaGenerated` is locale-independent, `zoneEntered` and
 *  `levelUp` are localized. A window with the former and none of the latter is
 *  the signature of a game client running in a language we have no patterns for. */
export interface BackscanCounts {
  areaGenerated: number
  zoneEntered: number
  levelUp: number
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
  /** name -> every areaId with that name. Most have one; the second part of
   *  the campaign revisits Act 1-5 zones under the same names (The Coast is
   *  1_1_2 and 2_6_2), never twice within a part. */
  private readonly reverseNames = new Map<string, string[]>()
  private readonly callbacks: TrackerCallbacks
  private readonly now: () => number

  private explicitBinding: string | null
  private adoptedBinding: string | null = null
  /** Entered the Twilight Strand; the next level-up says who's new (see
   *  onFreshCharacter). */
  private freshPending = false
  private levelUpCounts = new Map<string, number>()
  /** Latest level/class seen per character name (any name, bound or not). */
  private lastSeen = new Map<string, { level: number; charClass: string }>()
  /** Name from the most recent level-up (backscan tail + live) — the "who am I
   *  playing now" signal for the manual detect-character action. */
  private lastLevelUpName: string | null = null
  /**
   * Characters that have been tracked as YOU, most recent last.
   *
   * The binding exists so a partymate's level-up can't move your progress. But
   * it also held on to a mule: roll a level-1 Ranger for its starting gems, it
   * enters the Twilight Strand (which releases your main) and levels once on
   * Hillock (which binds it), and from then on your main's level-ups counted as
   * a stranger's. A character on this list is never a stranger — one account
   * can't have two characters online, so a level-up from one of them means
   * you're playing it again. A partymate never gets on the list.
   */
  private own: string[] = []

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
      this.reverseNames.set(key, [...(this.reverseNames.get(key) ?? []), id])
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
  detectCurrentCharacter(): {
    name: string
    charClass: string
    level: number
    /** false when a pinned name in Settings wins, so tracking did NOT move. */
    tracking: boolean
    pinnedTo: string | null
  } | null {
    const name = this.lastLevelUpName
    if (!name) return null
    this.adopt(name)
    const seen = this.lastSeen.get(name)
    return {
      name,
      charClass: seen?.charClass ?? '',
      level: seen?.level ?? 0,
      tracking: this.explicitBinding == null || this.explicitBinding === name,
      pinnedTo: this.explicitBinding
    }
  }

  snapshot(): TrackerSnapshot {
    const bound = this.boundCharacter
    const seen = bound ? this.lastSeen.get(bound) : undefined
    return {
      area: this.area,
      character: bound,
      charClass: seen?.charClass ?? null,
      level: seen?.level ?? null,
      own: [...this.own]
    }
  }

  /** Bind to a character in auto mode, and remember it as one of yours. */
  private adopt(name: string): void {
    this.adoptedBinding = name
    this.own = [...this.own.filter((n) => n !== name), name].slice(-OWN_LIMIT)
  }

  /** Restore persisted state (used when the log yields nothing, e.g. deleted). */
  hydrate(snap: TrackerSnapshot): void {
    if (!this.area && snap.area) this.area = snap.area
    // Who you are doesn't depend on what this log window happened to contain:
    // merge the remembered characters in, ahead of anything the backscan found.
    const recent = new Set(this.own)
    this.own = [...(snap.own ?? []).filter((n) => !recent.has(n)), ...this.own].slice(-OWN_LIMIT)
    // Not while the log ends mid-roll on the Twilight Strand: the log is ground
    // truth, and it says the remembered character isn't the one playing.
    if (!this.explicitBinding && !this.adoptedBinding && !this.freshPending && snap.character) {
      this.adopt(snap.character)
      if (snap.level != null && !this.lastSeen.has(snap.character)) {
        this.lastSeen.set(snap.character, {
          level: snap.level,
          charClass: snap.charClass ?? ''
        })
      }
    }
  }

  /**
   * Replay a chunk of historical lines (the startup backscan, for resume).
   * Mutates state without emitting events; character binding falls to the most
   * frequent level-up name in the window — you always see your own level-ups,
   * party members only while grouped. Ties resolve to the latest seen.
   *
   * Returns what the window contained per kind, so the caller can tell "nothing
   * happened yet" from "we can't read this client's language".
   */
  backscan(lines: string[], parser: LogParser): BackscanCounts {
    const counts: BackscanCounts = { areaGenerated: 0, zoneEntered: 0, levelUp: 0 }
    let lastName: string | null = null
    for (const line of lines) {
      const ev = parser.parseLine(line)
      if (!ev) continue
      if (ev.kind === 'levelUp') lastName = ev.name
      if (ev.kind === 'areaGenerated' || ev.kind === 'zoneEntered' || ev.kind === 'levelUp') counts[ev.kind]++
      this.apply(ev, false)
    }
    // The log ends on the Twilight Strand: a new character is mid-roll and
    // hasn't levelled yet. Adopting the log's most frequent name would bind
    // last week's character, and the new one's first level-up would then be
    // "someone else". Stay unbound; that level-up adopts it.
    if (!this.explicitBinding && !this.adoptedBinding && !this.freshPending && this.levelUpCounts.size > 0) {
      let best: string | null = null
      let bestCount = -1
      for (const [name, count] of this.levelUpCounts) {
        if (count > bestCount || (count === bestCount && name === lastName)) {
          best = name
          bestCount = count
        }
      }
      if (best) this.adopt(best)
    }
    return counts
  }

  /** The area id for a zone name, for the fallback path. A name both parts of
   *  the campaign use resolves to the part you were just in — you can't walk
   *  from Act 3 into Act 6's Coast — and to nothing without one to go on. */
  private idForName(zoneName: string): string | null {
    const ids = this.reverseNames.get(zoneName.toLowerCase()) ?? []
    if (ids.length <= 1) return ids[0] ?? null
    const here = this.area?.areaId
    if (!here || !isCampaignAreaId(here)) return null
    const part = here.slice(0, here.indexOf('_') + 1)
    const same = ids.filter((id) => id.startsWith(part))
    return same.length === 1 ? same[0] : null
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
        // Also from the backscan: start the overlay after rolling the
        // character, and its first level-up is still to come. A level-up
        // already in the log settles it (below), so history never fires.
        if (ev.areaId === TWILIGHT_STRAND_ID) this.freshPending = true
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
        // Fallback: the debug line was missed (pattern drift) — reverse
        // name lookup; unknown or still-ambiguous names yield a null id.
        this.area = {
          areaId: this.idForName(ev.zoneName),
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
        // The Strand's character, named at last. With a pinned name only that
        // one counts — a mule rolled on the side mustn't wipe your main — and a
        // level-up past 2 means you went back to an old character: no reset.
        if (this.freshPending && (!this.explicitBinding || ev.name === this.explicitBinding)) {
          this.freshPending = false
          if (emit && ev.level <= FRESH_CHARACTER_MAX_LEVEL) this.callbacks.onFreshCharacter?.(ev.name)
        }
        if (!this.explicitBinding && emit) {
          if (!this.adoptedBinding) {
            // First live level-up adopts the character (confirm toast is P3).
            this.adopt(ev.name)
          } else if (ev.name !== this.adoptedBinding && this.own.includes(ev.name)) {
            // One of yours, levelling while another is bound: you've switched
            // back to it — after muling, typically. See `own`.
            this.adopt(ev.name)
          }
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
