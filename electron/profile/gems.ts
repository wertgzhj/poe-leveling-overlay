// Gem attribute -> socket colour lookup (pure). Socket colour is computed, never
// authored (plan §5.3): Str->red, Dex->green, Int->blue. gems.json only needs a
// gem's primary attribute; unknown gems render neutral so a partial gem list
// still works (full data is P5).

export type Attr = 'str' | 'dex' | 'int'
export type SocketColor = 'R' | 'G' | 'B' | 'W'

export interface GemInfo {
  attr?: Attr
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
}

/** Forgiving match: case-insensitive, trailing " Support" optional, so
 *  "Arcane Surge" and "Arcane Surge Support" resolve the same. */
export function normalizeGemName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+support$/, '')
}
