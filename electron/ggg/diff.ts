// Comparing the links you planned against the links you're wearing.
//
// Pure, so it can be unit-tested to death without an OAuth client — which is
// the point, because this is where the real difficulty of the GGG feature sits
// (docs/GGG-API.md). Three things make it harder than "is this string in that
// array":
//
//   1. The plan never says which ITEM a group belongs to. It's a list of gem
//      names, authored by hand or imported from PoB. So a planned group has to
//      be matched to whichever equipped group looks most like it.
//   2. Gem names don't line up. "Cold Snap" in the plan, "Vaal Cold Snap" or
//      "Cold Snap of Power" on the character. Those are neither the same gem
//      nor a miss, and pretending either way is worse than saying so.
//   3. Improvising is normal. A spare 3-link you threw together mid-act isn't
//      a mistake to report — it's just not in the plan.

import { exactGemKey, type GemData } from '../profile/gems.ts'
import type { ActualGroup } from './parse.ts'

/** A group as the profile authored it — just names. */
export interface PlannedGroup {
  gems: string[]
}

/**
 * How a gem name is reduced before two of them are compared.
 *
 * A parameter rather than a fixed rule, because getting this wrong is silent
 * and expensive. Profiles are written by hand, so they say "Melee Physical
 * Damage" where the API says "Melee Physical Damage Support" — and the obvious
 * fix, making the " Support" suffix optional, also makes the skill gem
 * "Barrage" equal to "Barrage Support". `GemData` already resolves this
 * exact-first (it was fixed there once), so the wiring passes a key function
 * backed by it and this module stays free of the gem data.
 *
 * The default is deliberately strict. An unresolved name reported as missing is
 * a false alarm you can see and dismiss; one reported as matched is a four-link
 * you never notice is a three-link.
 */
export type GemKey = (name: string) => string

export const strictKey: GemKey = exactGemKey

/** The key function the app actually runs with: the gem dataset decides what
 *  two spellings mean, so a hand-written profile matches the API's wording
 *  without "Barrage" matching "Barrage Support". */
export function gemKey(gems: GemData): GemKey {
  return (name) => gems.canonicalKey(name)
}

/** A planned gem that is socketed under a related name. */
export interface VariantMatch {
  planned: string
  socketed: string
}

/** A planned gem found in some other link group. */
export interface Elsewhere {
  gem: string
  slot: string
}

export interface GroupCheck {
  /** Index of the planned group in the stage's socketGroups. */
  index: number
  /** Slot of the equipped group this was matched to; null if none was. */
  slot: string | null
  matched: string[]
  variants: VariantMatch[]
  /** Planned, and socketed nowhere at all. */
  missing: string[]
  /** Planned, socketed, but in a different group. */
  elsewhere: Elsewhere[]
  /** In the matched group, not in the plan. */
  extra: string[]
  state: 'ok' | 'incomplete' | 'unequipped'
}

export interface CharacterCheck {
  groups: GroupCheck[]
  /** Equipped groups that matched no planned group. Not a problem — shown, if
   *  at all, as "not in the plan". */
  unplanned: ActualGroup[]
}

/**
 * The plan against the character.
 *
 * Both sides come in as they're stored: `planned` from the active stage's
 * `socketGroups`, `actual` from `socketGroupsOf()`.
 */
export function checkCharacter(
  planned: PlannedGroup[],
  actual: ActualGroup[],
  keyOf: GemKey = strictKey
): CharacterCheck {
  const match = matcher(keyOf)
  const mapping = assign(planned, actual, match)
  const groups = planned.map((group, index) =>
    checkGroup(group, index, mapping.get(index) ?? null, actual, match)
  )
  const taken = new Set(mapping.values())
  return {
    groups,
    unplanned: actual.filter((_, j) => !taken.has(j))
  }
}

interface Matcher {
  same: (a: string, b: string) => boolean
  variant: (a: string, b: string) => boolean
  related: (a: string, b: string) => boolean
}

function matcher(keyOf: GemKey): Matcher {
  const same = (a: string, b: string): boolean => keyOf(a) === keyOf(b)

  /**
   * Related, but not the same gem: the Vaal version, or a transfigured one.
   *
   * Both tests are deliberately narrow. Stripping a trailing " of …" outright
   * would turn every Herald into "Herald" and quietly declare Herald of Ice and
   * Herald of Thunder interchangeable — the sort of thing you'd notice three
   * acts later. So the transfigured test requires the *whole* other name plus
   * " of " as a prefix: "Cold Snap of Power" relates to "Cold Snap", and
   * "Herald of Thunder" relates to nothing.
   */
  const variant = (a: string, b: string): boolean => {
    const left = withoutVaal(keyOf(a))
    const right = withoutVaal(keyOf(b))
    if (left === right) return !same(a, b)
    return right.startsWith(`${left} of `) || left.startsWith(`${right} of `)
  }

  return { same, variant, related: (a, b) => same(a, b) || variant(a, b) }
}

/**
 * Which equipped group belongs to which planned group.
 *
 * Best-fit, greedily: score every pair by how many planned gems it accounts
 * for, take the strongest pair, cross both off, repeat. Greedy rather than
 * optimal because the numbers are tiny (a stage has a handful of groups) and
 * because a player can read greedy: the group that looks most like your plan is
 * the one it gets attributed to.
 */
function assign(planned: PlannedGroup[], actual: ActualGroup[], match: Matcher): Map<number, number> {
  const pairs: { i: number; j: number; score: number }[] = []
  planned.forEach((group, i) => {
    actual.forEach((equipped, j) => {
      const score = overlap(group.gems, equipped.gems.map((g) => g.name), match)
      if (score > 0) pairs.push({ i, j, score })
    })
  })
  // Ties go to the earlier planned group, then the earlier equipped one, so the
  // result doesn't wander between two runs on identical input.
  pairs.sort((a, b) => b.score - a.score || a.i - b.i || a.j - b.j)

  const mapping = new Map<number, number>()
  const usedActual = new Set<number>()
  for (const pair of pairs) {
    if (mapping.has(pair.i) || usedActual.has(pair.j)) continue
    mapping.set(pair.i, pair.j)
    usedActual.add(pair.j)
  }
  return mapping
}

/** How many planned gems this equipped group accounts for, counting duplicates
 *  once each. Variants count — a Vaal version is still that link filled. */
function overlap(planned: string[], socketed: string[], match: Matcher): number {
  const pool = [...socketed]
  let hits = 0
  for (const gem of planned) {
    const at = pool.findIndex((s) => match.related(gem, s))
    if (at >= 0) {
      pool.splice(at, 1)
      hits += 1
    }
  }
  return hits
}

function checkGroup(
  group: PlannedGroup,
  index: number,
  actualIndex: number | null,
  actual: ActualGroup[],
  match: Matcher
): GroupCheck {
  const equipped = actualIndex == null ? null : actual[actualIndex] ?? null
  const pool = (equipped?.gems ?? []).map((g) => g.name)
  const claimed = new Array<boolean>(pool.length).fill(false)

  const matched: string[] = []
  const variants: VariantMatch[] = []

  // Exact names first, across the whole group, so a "Cold Snap of Power" can't
  // claim the socket that a plain "Cold Snap" was going to fill.
  const pending: string[] = []
  for (const gem of group.gems) {
    const at = pool.findIndex((s, k) => !claimed[k] && match.same(gem, s))
    if (at >= 0) {
      claimed[at] = true
      matched.push(gem)
    } else {
      pending.push(gem)
    }
  }
  const unresolved: string[] = []
  for (const gem of pending) {
    const at = pool.findIndex((s, k) => !claimed[k] && match.variant(gem, s))
    const socketed = at >= 0 ? pool[at] : undefined
    if (at >= 0 && socketed != null) {
      claimed[at] = true
      variants.push({ planned: gem, socketed })
    } else {
      unresolved.push(gem)
    }
  }

  // Whatever the plan still wants: is it somewhere else on the character?
  const elsewhere: Elsewhere[] = []
  const missing: string[] = []
  for (const gem of unresolved) {
    const found = actual.find(
      (candidate, j) => j !== actualIndex && candidate.gems.some((g) => match.related(gem, g.name))
    )
    if (found) elsewhere.push({ gem, slot: found.slot })
    else missing.push(gem)
  }

  return {
    index,
    slot: equipped?.slot ?? null,
    matched,
    variants,
    missing,
    elsewhere,
    extra: pool.filter((_, k) => !claimed[k]),
    state: stateOf(equipped != null, missing.length + elsewhere.length)
  }
}

function stateOf(equipped: boolean, outstanding: number): GroupCheck['state'] {
  if (!equipped) return 'unequipped'
  return outstanding === 0 ? 'ok' : 'incomplete'
}

function withoutVaal(key: string): string {
  return key.startsWith('vaal ') ? key.slice('vaal '.length) : key
}
