// The passive tree: which node to take with each passive point. Pure (no
// Electron imports — unit-tested in tests/tree.test.ts).
//
// Path of Building keeps a build's trees as a list of "specs", typically one
// per levelling milestone ("12", "33 (Lab)", "69 Map entry"). Each is just the
// SET of nodes allocated at that point — not the order they were taken in. The
// order is worked out here, once, at import, and stored in the profile, where
// it can be edited: from what's already allocated, walk to the nearest notable,
// keystone or jewel socket the next spec adds, taking every travel node on the
// way, then to the next nearest. A mastery comes right after the first notable
// of its group. Nodes a spec drops are a respec, shown before that spec's points.
//
// Which node is due follows the points you have: (level - 1) plus the Book of
// Skill points the log says you used.

/** What kind of passive a node is, for how it's shown. */
export type NodeKind = 'small' | 'notable' | 'keystone' | 'mastery' | 'jewel' | 'start' | 'ascendancyStart'

/** One node of data/tree.json (see scripts/tree-extract.ts). */
export interface TreeNode {
  name: string
  kind: NodeKind
  stats: string[]
  /** neighbours, both directions; the tree and ascendancies aren't linked */
  links: number[]
  group?: number
  /** set on ascendancy nodes */
  ascendancy?: string
  /** a class's starting node: its index in the export's classes */
  classStart?: number
  /** a mastery's effects: effect id -> stats */
  effects?: Record<string, string[]>
}

export interface TreeFile {
  /** the release, "3.29.1" */
  version: string
  /** what a PoB build calls it, "3_29" */
  treeVersion: string
  nodes: Record<string, TreeNode>
}

/** One step of the plan: a PoB spec's new nodes, in the order to take them. */
export interface PassiveStage {
  label?: string
  /** node ids, one passive point each */
  take: number[]
  /** nodes this stage drops — refund them first */
  refund?: number[]
  /** mastery node id -> the effect picked */
  masteries?: Record<string, number>
}

/** The tree part of a profile. */
export interface PassivePlan {
  /** the tree it was made for, "3_29" */
  tree: string
  stages: PassiveStage[]
  /** ascendancy nodes in the order to take them, two per Labyrinth */
  ascendancy?: number[]
}

/** A PoB spec as the import reads it. */
export interface TreeSpec {
  title?: string
  nodes: number[]
  /** mastery node id -> effect id */
  masteries: Record<string, number>
}

/** A node as the overlay shows it. */
export interface PassiveNodeView {
  id: number
  name: string
  kind: NodeKind
  /** for a mastery, the picked effect's */
  stats: string[]
}

export interface PassivesView {
  /** points you should have spent by now: (level - 1) + quest points */
  points: number
  /** the Book of Skill points among them */
  questPoints: number
  /** points the whole plan takes */
  total: number
  /** the label of the PoB spec the next node belongs to ("33 (Lab)") */
  stageLabel: string | null
  /** the next nodes, the due one first; empty once the plan is done */
  next: PassiveNodeView[]
  /** the nodes to refund before the next ones, when a respec is due */
  refund: PassiveNodeView[]
  /** the ascendancy notables the next Labyrinth's points go to, and how many
   *  Labyrinths are beaten */
  ascendancy: { labs: number; next: PassiveNodeView[] } | null
  /** the plan was made for another tree than the one shipped */
  treeMismatch: string | null
  /** For the in-game tree's search box: the masteries still to take in the
   *  current stage, as one quoted regex ("life mastery|axe mastery") — the
   *  quotes keep the search from splitting it at its spaces. null: none. */
  masteryRegex: string | null
}

/** How many nodes ahead the overlay lists. */
const LOOKAHEAD = 6
/** A respec is shown while the stage that needs it is this many points in. */
const RESPEC_WINDOW = 3
const KEY_KINDS: ReadonlySet<NodeKind> = new Set(['notable', 'keystone', 'jewel'])

export class TreeData {
  readonly version: string
  readonly treeVersion: string
  private readonly nodes: Map<number, TreeNode>

  constructor(file: TreeFile) {
    this.version = file.version
    this.treeVersion = file.treeVersion
    this.nodes = new Map(Object.entries(file.nodes).map(([id, n]) => [Number(id), n]))
  }

  node(id: number): TreeNode | undefined {
    return this.nodes.get(id)
  }

  view(id: number, masteryEffect?: number): PassiveNodeView {
    const n = this.nodes.get(id)
    if (!n) return { id, name: `unknown node ${id}`, kind: 'small', stats: [] }
    const stats = n.kind === 'mastery' && masteryEffect != null ? (n.effects?.[String(masteryEffect)] ?? []) : n.stats
    return { id, name: n.name, kind: n.kind, stats }
  }
}

/**
 * The plan for a build's specs, in their order. Nodes the tree data doesn't
 * know (another league's tree) are taken as they come rather than dropped:
 * a node in the wrong place is a nuisance, a missing point is a wrong build.
 */
export function planFromSpecs(specs: TreeSpec[], tree: TreeData, treeVersion: string): PassivePlan {
  const isTree = (id: number): boolean => {
    const n = tree.node(id)
    return !n || (!n.ascendancy && n.kind !== 'start' && n.kind !== 'ascendancyStart')
  }
  const isAscendancy = (id: number): boolean => {
    const n = tree.node(id)
    return !!n?.ascendancy && n.kind !== 'ascendancyStart'
  }

  const stages: PassiveStage[] = []
  let have = new Set<number>()
  const ascendancy: number[] = []
  for (const spec of specs) {
    // Starting nodes cost nothing and anchor every walk.
    const anchors = spec.nodes.filter((id) => {
      const k = tree.node(id)?.kind
      return k === 'start' || k === 'ascendancyStart'
    })
    const now = new Set(spec.nodes.filter(isTree))
    const refund = [...have].filter((id) => !now.has(id))
    const kept = new Set([...have].filter((id) => now.has(id)))
    const added = [...now].filter((id) => !have.has(id))
    const take = orderNodes(tree, new Set([...kept, ...anchors]), added)
    const masteries: Record<string, number> = {}
    for (const id of take) {
      const effect = spec.masteries[String(id)]
      if (effect != null) masteries[String(id)] = effect
    }
    const stage: PassiveStage = { take }
    if (spec.title) stage.label = spec.title
    if (refund.length) stage.refund = refund
    if (Object.keys(masteries).length) stage.masteries = masteries
    if (take.length || refund.length) stages.push(stage)
    have = now

    const newAsc = spec.nodes.filter((id) => isAscendancy(id) && !ascendancy.includes(id))
    ascendancy.push(...orderNodes(tree, new Set([...anchors, ...ascendancy]), newAsc))
  }
  const plan: PassivePlan = { tree: treeVersion, stages }
  if (ascendancy.length) plan.ascendancy = ascendancy
  return plan
}

/**
 * `wanted` in the order to take them, starting from `from`: the nearest
 * notable/keystone/jewel socket and every node on the way there, then the
 * next nearest. Masteries follow the first notable of their group.
 */
export function orderNodes(tree: TreeData, from: Set<number>, wanted: number[]): number[] {
  const have = new Set(from)
  const pending = new Set(wanted.filter((id) => tree.node(id)?.kind !== 'mastery'))
  const masteries = wanted.filter((id) => tree.node(id)?.kind === 'mastery')
  const out: number[] = []

  const take = (id: number): void => {
    out.push(id)
    have.add(id)
    pending.delete(id)
    const node = tree.node(id)
    if (node?.kind !== 'notable' || node.group == null) return
    for (const m of [...masteries]) {
      if (tree.node(m)?.group === node.group) {
        out.push(m)
        have.add(m)
        masteries.splice(masteries.indexOf(m), 1)
      }
    }
  }

  while (pending.size > 0) {
    // Breadth-first from everything allocated, through the nodes still to
    // take: the first key node reached is the nearest.
    const via = new Map<number, number>()
    const queue = [...have]
    const seen = new Set(have)
    let target: number | null = null
    let firstReached: number | null = null
    for (let i = 0; i < queue.length && target == null; i++) {
      const at = queue[i]
      for (const next of tree.node(at)?.links ?? []) {
        if (seen.has(next) || !pending.has(next)) continue
        seen.add(next)
        via.set(next, at)
        queue.push(next)
        firstReached ??= next
        if (KEY_KINDS.has(tree.node(next)?.kind as NodeKind)) {
          target = next
          break
        }
      }
    }
    target ??= firstReached
    if (target == null) {
      // Nothing left connects (unknown nodes, another tree): as they come.
      for (const id of [...pending]) take(id)
      break
    }
    const path: number[] = []
    for (let at: number | undefined = target; at != null && !have.has(at); at = via.get(at)) path.push(at)
    for (const id of path.reverse()) take(id)
  }
  for (const m of masteries) take(m)
  return out
}

/** Where the plan stands for a character with `points` passive points. */
export function passivesView(
  plan: PassivePlan,
  tree: TreeData,
  level: number | null,
  questPoints: number,
  labs: number
): PassivesView {
  const flat: Array<{ id: number; stage: number }> = []
  plan.stages.forEach((s, stage) => s.take.forEach((id) => flat.push({ id, stage })))
  const points = level == null ? 0 : Math.max(0, level - 1) + questPoints
  const at = Math.min(points, flat.length)
  const effect = (stage: number, id: number): number | undefined => plan.stages[stage].masteries?.[String(id)]
  const next = flat.slice(at, at + LOOKAHEAD).map((s) => tree.view(s.id, effect(s.stage, s.id)))

  let refund: PassiveNodeView[] = []
  const due = flat[at]
  if (due) {
    const stageStart = flat.findIndex((s) => s.stage === due.stage)
    const stage = plan.stages[due.stage]
    if (stage.refund?.length && at - stageStart < RESPEC_WINDOW) refund = stage.refund.map((id) => tree.view(id))
  }

  // Of a Labyrinth's two points, only the notables matter to read; the small
  // node on the way is just the way. Two small ones: the notable they lead to.
  const asc = plan.ascendancy ?? []
  const isBig = (id: number): boolean => tree.node(id)?.kind !== 'small'
  const labPoints = asc.slice(labs * 2, labs * 2 + 2)
  const towards = labPoints.length ? asc.slice(labs * 2).find(isBig) : undefined
  const ascNext = (labPoints.some(isBig) ? labPoints.filter(isBig) : towards != null ? [towards] : []).map((id) =>
    tree.view(id)
  )
  // Mastery names repeat across the tree ("Life Mastery" sits in several
  // places): the search lights every one, which is still where to look.
  const masteries = due
    ? flat
        .slice(at)
        .filter((s) => s.stage === due.stage && tree.node(s.id)?.kind === 'mastery')
        .map((s) => tree.node(s.id)!.name.toLowerCase().replace(/[.*+?^${}()|[\]\\"]/g, '\\$&'))
    : []
  const masteryRegex = masteries.length ? `"${[...new Set(masteries)].join('|')}"` : null

  return {
    masteryRegex,
    points,
    questPoints,
    total: flat.length,
    stageLabel: due ? (plan.stages[due.stage].label ?? null) : null,
    next,
    refund,
    ascendancy: asc.length ? { labs, next: ascNext } : null,
    treeMismatch:
      plan.tree === tree.treeVersion
        ? null
        : `the build's tree is ${plan.tree.replace('_', '.')}, the overlay has ${tree.version} — nodes may have moved`
  }
}
