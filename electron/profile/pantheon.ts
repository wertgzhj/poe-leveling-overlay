// Where the campaign's Pantheon gods are, so the overlay can say "the god your
// profile wants is here" when you walk in. Pure — tested directly.
//
// Sources: poewiki's The Pantheon (powers become available when you defeat the
// gods in Acts 6-10) and the owner's list of where each god is fought, from the
// gods' poewiki pages (2026-10-23). The zones' area ids are verified against a
// real capture (data/areas/en.json). The side areas some gods are fought in
// aren't zones of their own in the log — two years of it, those zones visited
// throughout, and not one of them ever loaded — so the hint shows in the zone
// they belong to, and names the side area in words.
//
// When a god falls, Sin bids it farewell — a line per god, the same every time
// (✓ log: two years, every campaign; an optional god skipped has none). That
// line, in the god's zone, is how a power gets ticked by itself.
//
// Upgrades are left out on purpose: the map bosses that upgrade a power rotate
// with the atlas, and a stale list would send you to the wrong map.

import type { Pantheon } from './profile.ts'

export interface PantheonGod {
  /** The power, as a profile names it ("Soul of Tukohama"). */
  soul: string
  /** The boss you defeat for it. */
  god: string
  act: number
  /** The campaign zone it's in (or whose side area it's in). */
  areaId: string
  zone: string
  /** The side area of that zone it's fought in, when it is one — a name to
   *  look for, not a zone the log reports. */
  sideArea?: string
  /** Wording for a side area whose name we don't have. */
  sideAreaHint?: string
  /** What Sin says when the god falls — the only sign of it in the log. */
  farewell: string
}

export const PANTHEON_GODS: readonly PantheonGod[] = [
  // Major
  {
    soul: 'Soul of the Brine King',
    god: 'Tsoagoth, the Brine King',
    act: 6,
    areaId: '2_6_15',
    zone: "The Brine King's Reef",
    farewell: "Born of ocean's mire, in death washed clean of dark desire."
  },
  {
    soul: 'Soul of Arakaali',
    god: 'Arakaali, Spinner of Shadows',
    act: 7,
    areaId: '2_7_12_2',
    zone: 'The Temple of Decay Level 2',
    farewell: 'Death is the true climax of perverted lust.'
  },
  {
    soul: 'Soul of Lunaris',
    god: 'Lunaris, Eternal Moon',
    act: 8,
    areaId: '2_8_13',
    zone: 'The Harbour Bridge',
    farewell: 'Eclipse cold pride, flaming rage, and pass beyond this human age.'
  },
  {
    soul: 'Soul of Solaris',
    god: 'Solaris, Eternal Sun',
    act: 8,
    areaId: '2_8_13',
    zone: 'The Harbour Bridge',
    farewell: 'Eclipse cold pride, flaming rage, and pass beyond this human age.'
  },
  // Minor
  {
    soul: 'Soul of Tukohama',
    god: 'Tukohama, Karui God of War',
    act: 6,
    areaId: '2_6_5',
    zone: 'The Karui Fortress',
    farewell: 'The soil wants for your blood no more.'
  },
  {
    soul: 'Soul of Abberath',
    god: 'Abberath, the Cloven One',
    act: 6,
    areaId: '2_6_8',
    zone: "Prisoner's Gate",
    sideArea: 'The Valley of the Fire Drinker',
    farewell: 'At last your thirst is quenched.'
  },
  {
    soul: 'Soul of Ryslatha',
    god: 'Ryslatha, the Puppet Mistress',
    act: 6,
    areaId: '2_6_11',
    zone: 'The Wetlands',
    sideArea: 'The Spawning Ground',
    farewell: 'Release this land to the will of its true children.'
  },
  {
    soul: 'Soul of Ralakesh',
    god: 'Ralakesh, Master of a Million Faces',
    act: 7,
    areaId: '2_7_7',
    zone: 'The Ashen Fields',
    farewell: "Turn away the tyrant's face and kingdom end without a trace."
  },
  {
    soul: 'Soul of Gruthkul',
    god: 'Gruthkul, Mother of Despair',
    act: 7,
    areaId: '2_7_9',
    zone: 'The Dread Thicket',
    sideArea: 'Den of Despair',
    farewell: "Thus I release you from motherhood's rage."
  },
  {
    soul: 'Soul of Yugul',
    god: 'Yugul, Reflection of Terror',
    act: 8,
    areaId: '2_8_4',
    zone: 'The High Gardens',
    farewell: 'In death the mirrors are thus shattered.'
  },
  {
    soul: 'Soul of Shakari',
    god: 'Shakari, Queen of the Sands',
    act: 9,
    areaId: '2_9_4',
    zone: 'The Oasis',
    sideArea: 'The Sand Pit',
    farewell: 'Rest, my child. Be free from the torments of immortality.'
  },
  {
    soul: 'Soul of Garukhan',
    god: 'Garukhan, Queen of the Winds',
    act: 9,
    areaId: '2_9_8',
    zone: 'The Quarry',
    sideAreaHint: 'a side area',
    farewell: 'You were too beautiful for this ugly world. I shall find you in the next.'
  }
]

/** Where to find a god, in words: "The Sand Pit, a side area of The Oasis". */
export function whereIs(god: PantheonGod): string {
  if (god.sideArea) return `${god.sideArea}, a side area of ${god.zone}`
  if (god.sideAreaHint) return `${god.sideAreaHint} of ${god.zone}`
  return god.zone
}

/** The gods a profile's Pantheon choice names, major first. */
export function godsFor(pantheon: Pantheon | undefined): PantheonGod[] {
  if (!pantheon) return []
  return [pantheon.major, pantheon.minor]
    .filter((s): s is NonNullable<typeof s> => s != null)
    .map((soul) => PANTHEON_GODS.find((g) => g.soul === soul))
    .filter((g): g is PantheonGod => g != null)
}

/** Whether you're where a god is fought: its zone, by area id — Prisoner's
 *  Gate and The Wetlands exist in Act 1 too. */
/** The gods a line of Sin's says have just fallen, where you are: the zone
 *  the god belongs to (a side area logs as its parent zone) and his farewell.
 *  Lunaris and Solaris fall together, and share one. */
export function godsFallen(sinLine: string, areaId: string | null | undefined): PantheonGod[] {
  return PANTHEON_GODS.filter((g) => g.areaId === areaId && g.farewell === sinLine)
}

export function isHere(god: PantheonGod, areaId: string | null | undefined): boolean {
  return !!areaId && areaId === god.areaId
}
