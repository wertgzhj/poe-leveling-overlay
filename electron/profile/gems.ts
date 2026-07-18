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
}

export interface GemInfo {
  attr?: Attr
  sources?: GemSourceInfo[]
}

const ATTR_COLOR: Record<Attr, SocketColor> = { str: 'R', dex: 'G', int: 'B' }

export interface ColoredGem {
  name: string
  color: SocketColor
  /** True when the gem wasn't found in gems.json (colour is a guess). */
  unknown: boolean
}

export class GemData {
  private readonly byKey = new Map<string, GemInfo>()

  constructor(gems: Record<string, GemInfo>) {
    for (const [name, info] of Object.entries(gems)) {
      this.byKey.set(normalizeGemName(name), info)
    }
  }

  info(gem: string): GemInfo | undefined {
    return this.byKey.get(normalizeGemName(gem))
  }

  color(gem: string): ColoredGem {
    const info = this.info(gem)
    const c = info?.attr ? ATTR_COLOR[info.attr] : undefined
    if (!c) return { name: gem, color: 'W', unknown: true }
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

  /** Earliest source for a class: lowest act, quest reward before vendor. */
  earliestSource(gem: string, cls?: CharClass | null): GemSourceInfo | null {
    const options = this.sourcesFor(gem, cls)
    if (options.length === 0) return null
    return [...options].sort(
      (a, b) => a.act - b.act || rank(a.kind) - rank(b.kind)
    )[0]
  }
}

function rank(kind: GemSourceInfo['kind']): number {
  return kind === 'quest' ? 0 : 1
}

/** Forgiving match: case-insensitive, trailing " Support" optional, so
 *  "Arcane Surge" and "Arcane Surge Support" resolve the same. */
export function normalizeGemName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+support$/, '')
}
