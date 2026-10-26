// Text for the game's own search boxes — a vendor's, the stash's, the passive
// tree's. Pure (unit-tested). The overlay only ever puts it on the clipboard;
// pasting it is the player's (docs/ARCHITECTURE.md#tos-position).
//
// The boxes read a regex when it's quoted ("barbarism|life mastery"); unquoted,
// they split at spaces and match each word on its own (✓ owner). They keep 250
// characters and cut the rest (✓ owner).

import { normalizeGemName } from './gems.ts'
import type { AcquisitionItem } from './engine/types.ts'

export const SEARCH_BOX_LIMIT = 250

/** A name as a regex alternative: lower case, special characters escaped. */
export function searchTerm(name: string): string {
  return name.toLowerCase().replace(/[.*+?^${}()|[\]\\"]/g, '\\$&')
}

/** Alternatives as one quoted regex, duplicates dropped. */
export function quotedSearch(terms: string[]): string {
  return `"${[...new Set(terms)].join('|')}"`
}

/**
 * The gems to buy now, for the vendor's search: every purchase in the to-do
 * list that isn't "coming up", and the gems of a "pick one" quest you'll buy
 * the rest of. Names without " Support" — the vendor lists "Chance to Bleed
 * Support", and "chance to bleed" finds it. Whole names only, in list order,
 * as many as fit the box. null when there's nothing to buy.
 *
 * Every town's vendor gets the same text; one that doesn't sell a gem just
 * doesn't light it.
 */
export function vendorSearch(plan: AcquisitionItem[]): string | null {
  const names: string[] = []
  for (const item of plan) {
    if (item.later) continue
    if (item.kind === 'buy') {
      const e = item.entry
      if (e.mule || e.starting) continue
      for (const gem of e.anyOf ? e.anyOf.map((g) => g.gem) : [e.gem]) names.push(gem)
    } else if (item.group.pickOne && item.group.buyRest) {
      for (const g of item.group.gems) names.push(g.gem)
    }
  }
  const terms: string[] = []
  for (const name of names) {
    const term = searchTerm(normalizeGemName(name))
    if (terms.includes(term)) continue
    if (quotedSearch([...terms, term]).length > SEARCH_BOX_LIMIT) break
    terms.push(term)
  }
  return terms.length ? quotedSearch(terms) : null
}

/**
 * Whether copying on its own may replace what's on the clipboard: only when
 * it's empty, something the overlay put there, or a search regex anyway (one
 * quoted line — what the overlay copies, also from before a restart). Anything
 * else is yours — a trade whisper, an item, a link — and stays.
 */
export function mayOverwrite(current: string, ours: ReadonlySet<string>): boolean {
  if (current.trim() === '' || ours.has(current)) return true
  return new RegExp(`^"[^"\\r\\n]{1,${SEARCH_BOX_LIMIT}}"$`).test(current)
}

/**
 * When to copy on its own: the tree search on a level-up, the vendor search on
 * walking into a town. Fed every level and area the log reports — including
 * the resumed state after a restart, which is a baseline, not an event: only a
 * change from what was last seen counts, and a character switch starts over.
 */
export class AutoCopyTrigger {
  private character: string | null = null
  private level: number | null = null
  private areaId: string | null = null

  /** A level for `character`: true when it's a level-up worth the tree search. */
  onLevel(character: string | null, level: number): boolean {
    const known = character != null && character === this.character && this.level != null
    const up = known && level > (this.level as number)
    this.character = character
    this.level = level
    return up
  }

  /** An area entered: true when it's a town, walked into from somewhere else. */
  onArea(areaId: string | null): boolean {
    const was = this.areaId
    this.areaId = areaId
    return was != null && areaId != null && areaId !== was && areaId.endsWith('_town')
  }
}
