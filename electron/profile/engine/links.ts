// Part of the build-profile engine (see ../engine.ts). What changed in a
// stage's links since the stage before: which gems are new, and which links
// were rearranged. By copy, not by name — the second Autoexertion a stage
// slots is as new as a gem never seen before.

import { type Stage } from '../profile.ts'

export interface LinkChanges {
  /** Per socket group, per gem: a copy the previous stage didn't have (NEW). */
  fresh: boolean[][]
  /** Per socket group: rearranged in a way NEW alone doesn't explain — a gem
   *  moved in from another link, or one left it (RELINKED). */
  relinked: boolean[]
}

const key = (gem: string): string => gem.toLowerCase()

/** How many copies of each gem a stage slots, lowercased. */
export function stageCopies(stage: Stage | undefined): Map<string, number> {
  const copies = new Map<string, number>()
  for (const g of stage?.socketGroups ?? []) {
    for (const gem of g.gems) copies.set(key(gem), (copies.get(key(gem)) ?? 0) + 1)
  }
  return copies
}

/**
 * NEW and RELINKED for a stage. None on the first stage, which has nothing to
 * compare with.
 *
 * NEW: a gem gets as many NEW copies as this stage slots more of it than the
 * previous one did — every copy for a gem never seen, one for a second copy.
 * The new copies are the last ones in reading order: the earlier link that
 * already held one keeps it.
 *
 * RELINKED: take a group's gems that aren't NEW. If they're exactly the gems of
 * some link in the previous stage, the group only grew (NEW says that) or is
 * unchanged; if nothing of it is old, it's a new link (NEW says that too).
 * Anything else — a gem from another link, or one gone — is a rearrangement.
 */
export function linkChanges(prev: Stage | undefined, stage: Stage | undefined): LinkChanges {
  const groups = stage?.socketGroups ?? []
  if (!prev) {
    return { fresh: groups.map((g) => g.gems.map(() => false)), relinked: groups.map(() => false) }
  }
  const before = stageCopies(prev)
  const now = stageCopies(stage)
  // How many more copies this stage has, per gem.
  const extra = new Map<string, number>()
  for (const [gem, n] of now) {
    const more = n - (before.get(gem) ?? 0)
    if (more > 0) extra.set(gem, more)
  }
  // Mark the last `extra` occurrences of each gem, walking backwards.
  const fresh = groups.map((g) => g.gems.map(() => false))
  const left = new Map(extra)
  for (let gi = groups.length - 1; gi >= 0; gi--) {
    const gems = groups[gi].gems
    for (let i = gems.length - 1; i >= 0; i--) {
      const k = key(gems[i])
      const n = left.get(k) ?? 0
      if (n > 0) {
        fresh[gi][i] = true
        left.set(k, n - 1)
      }
    }
  }

  const prevLinks = prev.socketGroups.map((g) => signature(g.gems))
  const relinked = groups.map((g, gi) => {
    const old = g.gems.filter((_, i) => !fresh[gi][i])
    if (old.length === 0) return false
    return !prevLinks.includes(signature(old))
  })
  return { fresh, relinked }
}

/** A link's gems as a comparable string: order doesn't matter, copies do. */
function signature(gems: readonly string[]): string {
  return gems.map(key).sort().join('|')
}
