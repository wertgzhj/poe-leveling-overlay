// The searches the overlay copies for the game's search boxes. Copying happens
// only on a click or a hotkey (searches.ts): never on its own, and the overlay
// never reads the clipboard (docs/ARCHITECTURE.md#tos-position).

/** The searches the overlay copies for the game's search boxes. */
export const SEARCH_KINDS = ['vendor', 'tree', 'regex'] as const
export type SearchKind = (typeof SEARCH_KINDS)[number]
