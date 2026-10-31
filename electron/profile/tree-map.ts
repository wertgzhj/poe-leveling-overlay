// The passive map: a small piece of the tree around your next points, for the
// Gems tab's Passives block (opened with a click). Pure — unit-tested in
// tests/tree.test.ts. It names nothing new: the same plan, points and next
// nodes as passivesView, laid out where they sit on the tree.

import { LOOKAHEAD, duePosition, earlierPositions, respecPoints, type NodeKind, type PassivePlan, type TreeData } from './tree.ts'

/** What a node is to you: taken by plan, one of the few before your point
 *  now (maybe not placed yet), your point now, one after, one a respec takes
 *  out (until you mark it done), or not yours. */
export type MapState = 'taken' | 'earlier' | 'due' | 'next' | 'refund' | 'off'

export interface MapNode {
  id: number
  x: number
  y: number
  kind: NodeKind
  name: string
  state: MapState
  /** 1 for your point now, 2-6 for the ones after */
  num?: number
}

export interface MapLink {
  from: [number, number]
  to: [number, number]
  /** taken: both ends taken; path: the way your points go, the earlier ones
   *  too; off: the rest */
  state: 'taken' | 'path' | 'off'
  /** two nodes on one orbit of a group join along it, as in the game */
  arc?: { r: number; sweep: 0 | 1 }
}

export interface PassiveMap {
  /** the view: x, y, width, height, in the tree's units */
  box: [number, number, number, number]
  nodes: MapNode[]
  links: MapLink[]
}

/** How much of the tree the map shows across, at least (the tree is ~25 000
 *  units wide; this is a few groups). */
const MIN_WIDTH = 3000
/** Room kept around the next nodes. */
const MARGIN = 300

/**
 * The map for `points` passive points: the nodes in view, each with what it is
 * to you. Taken means taken by the plan — the overlay counts points, it can't
 * see your tree. A stage's respec counts from when it can be done
 * (respecPoints). null when the plan is done, or the tree data has no
 * positions. `aspect` is width / height of where it's drawn; `refunds`, the
 * nodes of a respec not marked done yet, are marked to take out.
 */
export function passiveMap(
  plan: PassivePlan,
  tree: TreeData,
  points: number,
  start: number | undefined,
  aspect: number,
  refunds: ReadonlySet<number> = new Set()
): PassiveMap | null {
  // the same place in the plan as the list (duePosition: a respec's points
  // come back)
  const respecAt = respecPoints(plan, tree, start)
  const { at: due } = duePosition(plan, points, respecAt)
  const taken = new Set<number>(start != null ? [start] : [])
  const next: number[] = []
  const earlierAt = new Set(earlierPositions(plan, due))
  const earlier = new Set<number>()
  let i = 0
  plan.stages.forEach((stage, s) => {
    stage.take.forEach((id, k) => {
      // a respec counts once you're past where it can be done (planPosition)
      if (k === (respecAt[s] ?? 0) && i < due) for (const r of stage.refund ?? []) taken.delete(r)
      if (earlierAt.has(i)) earlier.add(id)
      else if (i < due) taken.add(id)
      else if (next.length < LOOKAHEAD) next.push(id)
      i++
    })
    // after the stage's last node, or a stage that only takes out
    if ((respecAt[s] ?? 0) >= stage.take.length && i < due) for (const r of stage.refund ?? []) taken.delete(r)
  })
  const at = (id: number): [number, number] | null => {
    const n = tree.node(id)
    return n?.x != null && n.y != null ? [n.x, n.y] : null
  }
  if (next.length === 0) return null
  // the earlier ones too: after a run, they're where you are
  const placed = [...earlier, ...next, ...refunds].map(at).filter((p): p is [number, number] => p != null)
  if (placed.length === 0) return null

  // Around your next points, just wide enough for all of them: their
  // bounding box, centred, with room around it.
  const xs = placed.map(([x]) => x)
  const ys = placed.map(([, y]) => y)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const w = Math.max(
    MIN_WIDTH,
    Math.max(...xs) - Math.min(...xs) + 2 * MARGIN,
    (Math.max(...ys) - Math.min(...ys) + 2 * MARGIN) * aspect
  )
  const h = w / aspect
  const box: PassiveMap['box'] = [Math.round(cx - w / 2), Math.round(cy - h / 2), Math.round(w), Math.round(h)]
  const inView = (x: number, y: number): boolean =>
    x > box[0] - MARGIN && x < box[0] + box[2] + MARGIN && y > box[1] - MARGIN && y < box[1] + box[3] + MARGIN

  const stateOf = (id: number): MapState => {
    const k = next.indexOf(id)
    if (refunds.has(id)) return 'refund'
    return k === 0 ? 'due' : k > 0 ? 'next' : earlier.has(id) ? 'earlier' : taken.has(id) ? 'taken' : 'off'
  }
  const nodes: MapNode[] = []
  const links: MapLink[] = []
  const shown = new Set<number>()
  for (const id of tree.ids()) {
    const n = tree.node(id)!
    if (n.x == null || n.y == null || n.ascendancy || !inView(n.x, n.y)) continue
    shown.add(id)
    const state = stateOf(id)
    const k = next.indexOf(id)
    nodes.push({ id, x: n.x, y: n.y, kind: n.kind, name: n.name, state, ...(k >= 0 ? { num: k + 1 } : {}) })
  }
  for (const id of shown) {
    const a = tree.node(id)!
    if (a.kind === 'mastery') continue
    for (const other of a.links) {
      const b = tree.node(other)
      // once per pair: from the lower id, or from the one in view
      if (!b || b.x == null || b.y == null || b.kind === 'mastery' || (shown.has(other) && other < id)) continue
      const sa = stateOf(id)
      const sb = stateOf(other)
      const mine = (s: MapState): boolean => s !== 'off' && s !== 'refund'
      const state = sa === 'taken' && sb === 'taken' ? 'taken' : mine(sa) && mine(sb) ? 'path' : 'off'
      links.push({ from: [a.x!, a.y!], to: [b.x, b.y], state, ...arcOf(tree, a, b) })
    }
  }
  // drawn in order: the rest first, your way on top
  const rank = { off: 0, taken: 1, path: 2 }
  links.sort((p, q) => rank[p.state] - rank[q.state])
  return { box, nodes, links }
}

/** Two nodes on the same orbit of one group join along the orbit. */
function arcOf(
  tree: TreeData,
  a: { group?: number; x?: number; y?: number },
  b: { group?: number; x?: number; y?: number }
): { arc?: MapLink['arc'] } {
  if (a.group == null || a.group !== b.group) return {}
  const c = tree.groupCentre(a.group)
  if (!c) return {}
  const ra = Math.hypot(a.x! - c[0], a.y! - c[1])
  const rb = Math.hypot(b.x! - c[0], b.y! - c[1])
  if (ra < 1 || Math.abs(ra - rb) > 2) return {}
  // angles clockwise from straight up; the short way round
  const angle = (x: number, y: number): number => Math.atan2(x - c[0], -(y - c[1]))
  const turn = (angle(b.x!, b.y!) - angle(a.x!, a.y!) + 4 * Math.PI) % (2 * Math.PI)
  return { arc: { r: Math.round(ra), sweep: turn < Math.PI ? 1 : 0 } }
}
