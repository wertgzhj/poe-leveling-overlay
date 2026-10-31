// What the overlay shows: one switch per piece of information, in Settings →
// What the overlay shows. Pure (unit-tested in tests/show.test.ts). Hiding
// something only hides it: tracking, trials and the plan carry on, so switching
// it back on shows the state you're in.

export const SHOW_ITEMS = [
  /** the tracker line: zone, character, level */
  'zoneLine',
  /** the "zone 28 ▲" tag when the zone's level costs experience */
  'zoneFit',
  /** Vendor, Tree and Regex in the header */
  'copyButtons',
  /** the notice in a zone with a trial you haven't done */
  'trialHere',
  /** the notice when a Labyrinth's trials are all done */
  'lab',
  /** the bandit reminder */
  'bandit',
  /** the Pantheon reminder, and the Trials tab's Pantheon list */
  'pantheon',
  /** the Gems tab's "Get these gems" box */
  'gemsToGet',
  /** the Gems tab's socket groups */
  'links',
  /** the Gems tab's passives block */
  'passive',
  /** a respec the build asks for, until you mark it done */
  'respec',
  /** the Map button inside it */
  'passiveMap'
] as const
export type ShowItem = (typeof SHOW_ITEMS)[number]
export type ShowSet = Record<ShowItem, boolean>

/** Everything on: the overlay as it was before these switches existed. */
export const SHOW_ALL: ShowSet = Object.fromEntries(SHOW_ITEMS.map((k) => [k, true])) as ShowSet

/** The strip's: everything it has room for but the Pantheon, which waits
 *  for you to come back for it. */
export const SHOW_STRIP_DEFAULT: ShowSet = { ...SHOW_ALL, pantheon: false }

/** Stored or sent switches, made whole: anything missing or not a boolean
 *  keeps the base's value. */
export function sanitizeShow(raw: unknown, base: ShowSet = SHOW_ALL): ShowSet {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = { ...base }
  for (const k of SHOW_ITEMS) if (typeof r[k] === 'boolean') out[k] = r[k]
  return out
}
