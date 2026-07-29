// Gem data: socket colour (from attribute) + acquisition sources (P5).
// Socket colour is computed, never authored (plan §5.3): Str->red, Dex->green,
// Int->blue. Sources say where a gem comes from, per class — the engine uses
// them to fill a gemPlan and build the shopping list / reward recommendation.
// The shipped data/gems.json is partial and flagged; unknown gems degrade
// gracefully (neutral colour, no source).

import type { CharClass } from './profile.ts'

export type Attr = 'str' | 'dex' | 'int'
export type SocketColor = 'R' | 'G' | 'B' | 'W'

export interface GemSourceInfo {
  kind: 'quest' | 'vendor'
  act: number
  /** quest reward: the quest offering it. vendor: the quest that unlocks it. */
  quest?: string
  /** vendor NPC (vendor kind). */
  npc?: string
  /** classes this source applies to; absent = all classes. */
  classes?: CharClass[]
  note?: string
  /** broad-vendor fallback (Siosa/Lilly), not a gem-specific source. */
  fallback?: boolean
}

// Siosa (Act 3, after "A Fixture of Fate") and Lilly Roth (Act 6+) sell almost
// every gem to any class (plan §5.2). A *guess* for gems with no gem-specific
// source — only used while the dataset can't answer the question itself (see
// `hasBroadVendorData` below).
export const BROAD_VENDORS: readonly GemSourceInfo[] = [
  { kind: 'vendor', act: 3, npc: 'Siosa', classes: undefined, fallback: true, note: 'A3 Library — sells most gems' },
  { kind: 'vendor', act: 6, npc: 'Lilly Roth', classes: undefined, fallback: true, note: 'A6+ — sells most gems' }
] as const

/** NPCs whose stock the wiki lists per gem. Their presence in the data is what
 *  tells us the dataset can answer "does a broad vendor sell this?" itself. */
const BROAD_VENDOR_NPCS = new Set(['siosa', 'lilly roth'])
/** How many explicit broad-vendor rows make the dataset authoritative. A couple
 *  of hand-written entries shouldn't flip it; the wiki fetch yields hundreds. */
export const BROAD_VENDOR_DATA_MIN = 20

export interface GemInfo {
  attr?: Attr
  /** the gem's level requirement (from the wiki) — drives the vendor cost tier. */
  requiredLevel?: number
  sources?: GemSourceInfo[]
}

// PROVISIONAL vendor gem prices by the gem's level requirement — the community
// tier list; verify in game and adjust here (TESTING has the checklist item).
const COST_TIERS: ReadonlyArray<[minLevel: number, cost: string]> = [
  [28, 'Alchemy'],
  [16, 'Chance'],
  [12, 'Alteration'],
  [8, 'Transmutation'],
  [1, 'Wisdom']
]

/** Vendor price ("Wisdom", "Alteration", …) for a gem by level requirement. */
export function vendorCostFor(requiredLevel: number | undefined): string | undefined {
  if (requiredLevel === undefined) return undefined
  for (const [min, cost] of COST_TIERS) if (requiredLevel >= min) return cost
  return undefined
}

/**
 * PoE's experience "safe range" above your level: `3 + one per 16 complete
 * levels` (wiki: SafeZone = 3 + PlayerLevel/16). A gem whose required level is
 * more than this above yours is "coming up", not for right now — the Gems tab
 * uses it to split the plan into now vs. dimmed-later, gating by level (which we
 * track reliably) instead of act (which we can't always map to a level).
 */
export function safeLevelRange(level: number): number {
  return 3 + Math.floor(level / 16)
}

// Cheap -> expensive, for sorting. Unknown/free (quest rewards) rank first.
const COST_RANK = new Map<string, number>([
  ['Wisdom', 1],
  ['Transmutation', 2],
  ['Alteration', 3],
  ['Chance', 4],
  ['Alchemy', 5]
])

/** Sort rank for a cost tier (lower = cheaper/earlier); 0 for none/free. */
export function costRank(cost: string | undefined): number {
  return cost ? (COST_RANK.get(cost) ?? 0) : 0
}

const ATTR_COLOR: Record<Attr, SocketColor> = { str: 'R', dex: 'G', int: 'B' }

export interface ColoredGem {
  name: string
  color: SocketColor
  /** True when the gem wasn't found in gems.json at all — we have no idea what
   *  colour it is, and the neutral pip is a placeholder. */
  unknown: boolean
  /** True when the gem IS known and simply has no attribute requirement, so it
   *  goes in a socket of any colour (Portal, Convocation, …). A white pip is the
   *  correct, complete answer here — not a missing one. */
  anyColor?: boolean
}

export class GemData {
  private readonly byKey = new Map<string, GemInfo>()
  /** "<act>|<quest>" -> lowest gem level that quest hands out. */
  private readonly questLevel = new Map<string, number>()
  /** True when the dataset lists Siosa/Lilly stock per gem (i.e. the wiki fetch
   *  has run). Then "no source" is an answer — they don't sell it — and the
   *  broad-vendor guess must stay quiet. */
  private readonly hasBroadVendorData: boolean

  constructor(gems: Record<string, GemInfo>) {
    for (const [name, info] of Object.entries(gems)) {
      this.byKey.set(normalizeGemName(name), info)
    }
    let broadVendorRows = 0
    for (const info of this.byKey.values()) {
      for (const s of info.sources ?? []) {
        if (s.kind === 'vendor' && s.npc && BROAD_VENDOR_NPCS.has(s.npc.toLowerCase())) broadVendorRows++
      }
    }
    this.hasBroadVendorData = broadVendorRows >= BROAD_VENDOR_DATA_MIN
    // Chronological quest order, derived instead of hardcoded: a quest's gems
    // scale with where it sits in the campaign, so the LOWEST gem level a quest
    // rewards ranks it within its act (verified to reproduce the real order for
    // every act with reward data). Self-updates with the wiki gem refresh.
    for (const info of this.byKey.values()) {
      const level = info.requiredLevel
      if (level == null) continue
      for (const s of info.sources ?? []) {
        // Quest REWARDS only. A vendor's unlock quest would poison the rank —
        // "A Fixture of Fate" unlocks Siosa, who sells level-1 gems, which would
        // rank the game's latest Act 3 quest as its earliest.
        if (s.kind !== 'quest' || !s.quest || s.act == null) continue
        const key = questKey(s.act, s.quest)
        const prev = this.questLevel.get(key)
        if (prev == null || level < prev) this.questLevel.set(key, level)
      }
    }
  }

  /** Where a quest falls within its act (lower = earlier). Unknown quests sort
   *  last so they never jump ahead of a quest we can actually place. */
  questRank(act: number | undefined, quest: string | undefined): number {
    if (act == null || !quest) return Number.MAX_SAFE_INTEGER
    return this.questLevel.get(questKey(act, quest)) ?? Number.MAX_SAFE_INTEGER
  }

  info(gem: string): GemInfo | undefined {
    return this.byKey.get(normalizeGemName(gem))
  }

  /** Socket colour for a gem. Three outcomes, deliberately distinct: a known
   *  attribute gives its colour; a known gem with no attribute requirement gives
   *  a white "any socket" pip (that's an answer, not a gap); an unknown name
   *  gives a white pip flagged as a guess. Conflating the last two made the
   *  overlay put a "?" on gems it knew perfectly well. */
  color(gem: string): ColoredGem {
    const info = this.info(gem)
    if (!info) return { name: gem, color: 'W', unknown: true }
    const c = info.attr ? ATTR_COLOR[info.attr] : undefined
    if (!c) return { name: gem, color: 'W', unknown: false, anyColor: true }
    return { name: gem, color: c, unknown: false }
  }

  colorGroup(gems: string[]): ColoredGem[] {
    return gems.map((g) => this.color(g))
  }

  /** Sources for a gem available to a class (or all, when no class given). */
  sourcesFor(gem: string, cls?: CharClass | null): GemSourceInfo[] {
    const all = this.info(gem)?.sources ?? []
    if (!cls) return all
    return all.filter((s) => !s.classes || s.classes.includes(cls))
  }

  /** Earliest source for a class: lowest act, quest reward before vendor.
   *
   *  With a filled dataset there is deliberately NO fallback: the wiki lists
   *  Siosa's and Lilly's stock per gem, so a gem without any source is one they
   *  don't sell — Vaal, Awakened and Transfigured gems, and drop-only supports
   *  like Empower. Guessing "Siosa · Act 3" for those was worse than saying
   *  nothing (it sent people shopping for gems that only drop). The guess only
   *  survives for a dataset that predates the fetch, where it's the best we have. */
  earliestSource(gem: string, cls?: CharClass | null): GemSourceInfo | null {
    const options = this.sourcesFor(gem, cls)
    if (options.length > 0) {
      return [...options].sort((a, b) => a.act - b.act || rank(a.kind) - rank(b.kind))[0]
    }
    if (this.hasBroadVendorData) return null
    // Only known gems (present in gems.json) fall back — an unknown name might
    // not be a real campaign gem, so don't claim Siosa sells it.
    if (this.info(gem)?.attr) return BROAD_VENDORS[0]
    return null
  }
}

function rank(kind: GemSourceInfo['kind']): number {
  return kind === 'quest' ? 0 : 1
}

function questKey(act: number, quest: string): string {
  return `${act}|${quest.trim().toLowerCase()}`
}

/** Forgiving match: case-insensitive, trailing " Support" optional, so
 *  "Arcane Surge" and "Arcane Surge Support" resolve the same. */
export function normalizeGemName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+support$/, '')
}
