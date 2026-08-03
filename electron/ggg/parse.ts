// Turning GGG's character JSON into the link groups you actually have equipped.
//
// Pure and network-free on purpose: it takes parsed JSON in and returns plain
// data, so the whole thing is unit-tested against fixtures without an OAuth
// client. See docs/GGG-API.md for what is still unknown about the API — chiefly
// whether this data is fresh enough to be worth showing at all.
//
// IMPORTANT: the input types below are what we *expect* the API to look like.
// They are deliberately tolerant — every field optional, every array checked —
// because the fixtures are hand-authored and nothing here has met the real
// endpoint yet. A field that turns out to be named differently should surface as
// "no groups found", never as a crash.

/** One socket on an item. `group` is what makes a link a link: sockets sharing
 *  a group id are linked to each other. */
export interface ApiSocket {
  group?: number
}

/** A gem (or jewel) sitting in one of those sockets. */
export interface ApiSocketedItem {
  /** Index into the item's `sockets` array. */
  socket?: number
  typeLine?: string
  baseType?: string
  /** Abyss jewels are socketed items too, and are not gems. */
  abyssJewel?: boolean
  properties?: ApiProperty[]
}

export interface ApiProperty {
  name?: string
  /** GGG's shape: [[displayValue, valueType], ...]. Only the first is read. */
  values?: [string, number][]
}

export interface ApiItem {
  /** Which equipment slot: "Weapon", "BodyArmour", "Helm", … */
  inventoryId?: string
  sockets?: ApiSocket[]
  socketedItems?: ApiSocketedItem[]
}

export interface ApiCharacter {
  name?: string
  class?: string
  level?: number
  league?: string
  equipment?: ApiItem[]
}

/** A gem as it is right now, rather than as it was planned. */
export interface ActualGem {
  name: string
  level?: number
  quality?: number
}

/** One linked group of gems, in the slot it's equipped in. */
export interface ActualGroup {
  /** Readable equipment slot, e.g. "Body" — the raw inventoryId if unmapped. */
  slot: string
  gems: ActualGem[]
}

// The slot names GGG uses are close enough to read raw, but not all of them:
// "BodyArmour" and "Weapon2" are worse than what a player would say out loud,
// and the tab has a narrow column to say it in.
const SLOT_NAMES: Record<string, string> = {
  Weapon: 'Weapon',
  Offhand: 'Offhand',
  Weapon2: 'Weapon (swap)',
  Offhand2: 'Offhand (swap)',
  Helm: 'Helmet',
  BodyArmour: 'Body',
  Gloves: 'Gloves',
  Boots: 'Boots',
  Ring: 'Ring',
  Ring2: 'Ring',
  Amulet: 'Amulet',
  Belt: 'Belt'
}

/** What a slot is called in the overlay. Unknown ids pass through unchanged —
 *  a new slot should read oddly, not vanish. */
export function slotName(inventoryId: string | undefined): string {
  if (!inventoryId) return 'Equipment'
  return SLOT_NAMES[inventoryId] ?? inventoryId
}

/**
 * The link groups currently equipped, in equipment order.
 *
 * `isGem` decides what counts as a gem, and is supplied by the caller rather
 * than imported: this module has no business loading `gems.json`, and passing
 * the predicate in is what keeps the tests free of it. Anything socketed that
 * isn't a known gem — abyss jewels, and whatever GGG adds next — is skipped
 * rather than guessed at.
 */
export function socketGroupsOf(
  character: ApiCharacter | null | undefined,
  isGem: (name: string) => boolean
): ActualGroup[] {
  const groups: ActualGroup[] = []
  for (const item of character?.equipment ?? []) {
    for (const gems of groupsInItem(item, isGem)) {
      groups.push({ slot: slotName(item.inventoryId), gems })
    }
  }
  return groups
}

/** The gem groups within one item, ordered by first socket. */
function groupsInItem(item: ApiItem, isGem: (name: string) => boolean): ActualGem[][] {
  const sockets = item.sockets ?? []
  // Insertion order is socket order, which is the order they read in game.
  const byGroup = new Map<number, ActualGem[]>()
  for (const socketed of item.socketedItems ?? []) {
    if (socketed.abyssJewel) continue
    const name = gemName(socketed)
    if (!name || !isGem(name)) continue
    // A socket index outside the item's own socket list means we've
    // misunderstood the shape. Drop the gem rather than invent a group for it.
    const index = socketed.socket
    if (typeof index !== 'number') continue
    const socket = sockets[index]
    if (!socket || typeof socket.group !== 'number') continue

    const gem: ActualGem = { name }
    const level = numericProperty(socketed, 'Level')
    const quality = numericProperty(socketed, 'Quality')
    if (level != null) gem.level = level
    if (quality != null) gem.quality = quality

    const existing = byGroup.get(socket.group)
    if (existing) existing.push(gem)
    else byGroup.set(socket.group, [gem])
  }
  return [...byGroup.values()]
}

/** The gem's name. `typeLine` is what the client shows; `baseType` is the
 *  fallback for the shapes where it isn't set. */
function gemName(socketed: ApiSocketedItem): string | null {
  const name = (socketed.typeLine ?? socketed.baseType ?? '').trim()
  return name.length > 0 ? name : null
}

/**
 * A number out of the property list. The values are display strings, not
 * numbers: quality reads "+20%", and a maxed gem's level reads "20 (Max)" —
 * so take the leading integer and ignore the rest rather than parsing formats
 * we'd only have guessed at.
 */
function numericProperty(socketed: ApiSocketedItem, name: string): number | undefined {
  for (const property of socketed.properties ?? []) {
    if (property.name !== name) continue
    const raw = property.values?.[0]?.[0]
    if (typeof raw !== 'string') continue
    const match = /-?\d+/.exec(raw)
    if (match) return Number(match[0])
  }
  return undefined
}

/** The character with this name, matched the way players type it — case is not
 *  something anyone should have to get right. */
export function findCharacter(
  characters: ApiCharacter[] | null | undefined,
  name: string | null | undefined
): ApiCharacter | null {
  if (!name) return null
  const wanted = name.trim().toLowerCase()
  if (!wanted) return null
  return (characters ?? []).find((c) => (c.name ?? '').trim().toLowerCase() === wanted) ?? null
}
