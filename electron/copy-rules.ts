// When the overlay may copy a search without a click, and over what. Pure
// (unit-tested); electron/searches.ts does the copying.

import { isTownId } from './log/areas.ts'
import { SEARCH_BOX_LIMIT } from './profile/search.ts'

/** The searches the overlay copies for the game's search boxes. */
export const SEARCH_KINDS = ['vendor', 'tree', 'regex'] as const
export type SearchKind = (typeof SEARCH_KINDS)[number]

/** What can copy a search without a click, and what each copies ('off': none). */
export type CopyTrigger = 'town' | 'levelUp'
export const COPY_CHOICES = ['off', ...SEARCH_KINDS] as const
export type CopyChoice = (typeof COPY_CHOICES)[number]

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
    return was != null && areaId != null && areaId !== was && isTownId(areaId)
  }
}
