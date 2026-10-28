// Where each of a PoB build's gem sets starts, as a character level (pure,
// unit-tested in tests/pob-stages.test.ts).
//
// PoB keeps one character level per build, not per loadout, so the export says
// nothing about when a gem set is meant for. What it does say: which tree goes
// with which gem set (a loadout: the same title, or the same {n} ids, the way
// PoB itself pairs them), and how many points that tree has spent, which is
// what PoB's own "Auto" level goes by. Titles are free text, so a title is only
// read for a level it states outright ("Level 12-20" on a gem set, "12" or
// "33 (Lab)" leading a tree's title), never for what a name might mean
// ("After Brutus"). What can't be told is left open for the player to fill in.

/** A gem set as the import reads it. */
export interface PobGemSet {
  title: string | undefined
  gems: number
}

/** A tree spec as the import reads it: its title, and the passive points it
 *  spends (class start and ascendancy left out). */
export interface PobTreeSpec {
  title: string | undefined
  points: number
}

/** Where a stage's start level came from, for the import's review step. */
export type StartSource = 'set-title' | 'tree-title' | 'tree-points'

export interface StageDraft {
  /** what the stage is called: the gem set's title, else its (earliest) tree's */
  label: string
  gems: number
  /** the level it starts at; null: nothing in the build says */
  start: number | null
  from: StartSource | null
  /** the tree it was read from, by title */
  tree?: string
}

const IDS = /\{\s*(\d+(?:\s*,\s*\d+)*)\s*\}\s*$/

/** A title split into its name and its loadout ids: "28 {3,4}" -> "28", [3, 4]. */
export function loadoutOf(title: string | undefined): { base: string; ids: number[] } {
  const t = (title ?? '').trim()
  const m = IDS.exec(t)
  if (!m) return { base: t, ids: [] }
  return { base: t.slice(0, m.index).trim(), ids: m[1].split(',').map((n) => Number(n.trim())) }
}

/** PoB's pairing: the same {n} ids, or, without ids, the same title. */
function linked(set: string | undefined, spec: string | undefined): boolean {
  const a = loadoutOf(set)
  const b = loadoutOf(spec)
  if (a.ids.length && b.ids.length) return a.ids.some((id) => b.ids.includes(id))
  if (a.ids.length || b.ids.length) return false
  return a.base !== '' && a.base.toLowerCase() === b.base.toLowerCase()
}

/** A level a tree's title starts with: "12", "33 (Lab)", "69 Map entry". */
export function treeTitleLevel(title: string | undefined): number | null {
  const m = /^\s*(\d{1,3})(?!\d)/.exec(loadoutOf(title).base)
  const n = m ? Number(m[1]) : NaN
  return n >= 1 && n <= 100 ? n : null
}

/** The level a tree's points are spent by: PoB's Auto level, points + 1.
 *  Books of Skill make the real level up to a few lower, later on. */
export function pointsLevel(points: number): number {
  return Math.min(100, Math.max(1, points + 1))
}

/**
 * Each gem set's start level, in PoB's order: a range its own title states,
 * else its tree's title, else its tree's points. A set with more than one
 * tree (one gem set for several loadouts) starts with the earliest of them.
 */
export function stageDrafts(
  sets: readonly PobGemSet[],
  specs: readonly PobTreeSpec[],
  setTitleRange: (title: string | undefined) => [number, number] | null
): StageDraft[] {
  return sets.map((set, i) => {
    const own = loadoutOf(set.title).base
    const trees = specs.filter((s) => linked(set.title, s.title))
    let best: { start: number; from: StartSource; tree: string } | null = null
    for (const t of trees) {
      const titled = treeTitleLevel(t.title)
      const start = titled ?? pointsLevel(t.points)
      if (!best || start < best.start) {
        best = { start, from: titled != null ? 'tree-title' : 'tree-points', tree: loadoutOf(t.title).base }
      }
    }
    const label = own || best?.tree || `Stage ${i + 1}`
    const range = setTitleRange(own)
    if (range) return { label, gems: set.gems, start: range[0], from: 'set-title' }
    return best
      ? { label, gems: set.gems, start: best.start, from: best.from, tree: best.tree || '(untitled)' }
      : { label, gems: set.gems, start: null, from: null }
  })
}

/**
 * Level ranges from start levels, given in PoB's order: sorted by start, each
 * running to the next one's start, the last to `end`, the first from level 1. Two sets starting at
 * the same level can't share it: the later one moves up a level (and it says
 * so). Returns the order too, as indices into the given starts.
 */
export function rangesFromStarts(
  starts: readonly number[],
  end: number,
  warnings: string[],
  labels: readonly string[] = []
): Array<{ index: number; range: [number, number] }> {
  const order = starts.map((start, index) => ({ index, start })).sort((a, b) => a.start - b.start || a.index - b.index)
  for (let i = 1; i < order.length; i++) {
    if (order[i].start <= order[i - 1].start) {
      const moved = order[i - 1].start + 1
      warnings.push(
        `"${labels[order[i].index] ?? `stage ${order[i].index + 1}`}" starts at the same level as the one before it; it now starts at ${moved}.`
      )
      order[i].start = moved
    }
  }
  // the first stage is the one you start with: it covers level 1 on
  return order.map((o, i) => ({
    index: o.index,
    range: [i === 0 ? 1 : o.start, i < order.length - 1 ? order[i + 1].start - 1 : Math.max(end, o.start)]
  }))
}
