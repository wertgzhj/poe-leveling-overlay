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

/** The gems to buy now — what the vendor search looks for — by name, without
 *  " Support", each once, in list order. */
export function vendorGems(plan: AcquisitionItem[]): string[] {
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
  return [...new Set(names.map(normalizeGemName))]
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
  const terms: string[] = []
  for (const name of vendorGems(plan)) {
    const term = searchTerm(name)
    if (terms.includes(term)) continue
    if (quotedSearch([...terms, term]).length > SEARCH_BOX_LIMIT) break
    terms.push(term)
  }
  return terms.length ? quotedSearch(terms) : null
}
