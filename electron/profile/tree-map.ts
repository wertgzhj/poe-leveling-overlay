// The passive map: the tree around your next points, for the Gems tab's
// Passives block (opened with a click). Pure — unit-tested in
// tests/tree.test.ts. It names nothing new: the same plan, points and next
// nodes as passivesView, laid out where they sit on the tree. The whole tree
// comes along, so the map can be dragged and zoomed out to the rest of the
// plan; `box` is only where it opens.

import { LOOKAHEAD, duePosition, earlierPositions, respecPoints, type NodeKind, type PassivePlan, type TreeData } from './tree.ts'

/** What a node is to you: taken by plan, one of the few before your point
 *  now (maybe not placed yet), your point now, one after, one the plan takes
 *  later still (past the few after), one a respec takes out (until you mark
 *  it done), or not yours. */
export type MapState = 'taken' | 'earlier' | 'due' | 'next' | 'later' | 'refund' | 'off'

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
   *  too; later: the way the rest of the plan goes; off: the rest */
  state: 'taken' | 'path' | 'later' | 'off'
  /** two nodes on one orbit of a group join along it, as in the game */
  arc?: { r: number; sweep: 0 | 1 }
}

export interface PassiveMap {
  /** the view it opens on, around your next points: x, y, width, height,
   *  in the tree's units */
  box: [number, number, number, number]
  /** the whole plan in view, the same aspect: the map's overview */
  plan: [number, number, number, number]
  /** the whole tree, the same aspect: as far as the map zooms out */
  extent: [number, number, number, number]
  nodes: MapNode[]
  links: MapLink[]
}

/** How much of the tree the map opens on across, at least (the tree is
 *  ~25 000 units wide; this is a few groups). */
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
  const later = new Set<number>()
  let i = 0
  plan.stages.forEach((stage, s) => {
    stage.take.forEach((id, k) => {
      // a respec counts once you're past where it can be done (planPosition)
      if (k === (respecAt[s] ?? 0) && i < due) for (const r of stage.refund ?? []) taken.delete(r)
      if (earlierAt.has(i)) earlier.add(id)
      else if (i < due) taken.add(id)
      else if (next.length < LOOKAHEAD) next.push(id)
      else later.add(id)
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

  // Opens around your next points, just wide enough for all of them.
  const box = fit(placed, aspect, MIN_WIDTH)

  const stateOf = (id: number): MapState => {
    const k = next.indexOf(id)
    if (refunds.has(id)) return 'refund'
    if (k >= 0) return k === 0 ? 'due' : 'next'
    return earlier.has(id) ? 'earlier' : taken.has(id) ? 'taken' : later.has(id) ? 'later' : 'off'
  }
  const nodes: MapNode[] = []
  const links: MapLink[] = []
  const shown = new Set<number>()
  const all: [number, number][] = []
  for (const id of tree.ids()) {
    const n = tree.node(id)!
    if (n.x == null || n.y == null || n.ascendancy) continue
    all.push([n.x, n.y])
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
      // once per pair, from the lower id
      if (!b || !shown.has(other) || b.kind === 'mastery' || other < id) continue
      const sa = stateOf(id)
      const sb = stateOf(other)
      const mine = (s: MapState): boolean => s !== 'off' && s !== 'refund' && s !== 'later'
      const planned = (s: MapState): boolean => mine(s) || s === 'later'
      const state =
        sa === 'taken' && sb === 'taken'
          ? 'taken'
          : mine(sa) && mine(sb)
            ? 'path'
            : planned(sa) && planned(sb)
              ? 'later'
              : 'off'
      links.push({ from: [a.x!, a.y!], to: [b.x!, b.y!], state, ...arcOf(tree, a, b) })
    }
  }
  // drawn in order: the rest first, your way on top
  const rank = { off: 0, later: 1, taken: 2, path: 3 }
  links.sort((p, q) => rank[p.state] - rank[q.state])
  // the overview: everything the plan touches, and where you start
  const planned = [...taken, ...earlier, ...next, ...later, ...refunds]
    .map(at)
    .filter((p): p is [number, number] => p != null)
  return { box, plan: fit(planned, aspect, MIN_WIDTH), extent: fit(all, aspect, 0), nodes, links }
}

/** The view of `aspect` (width / height) around `points`: their bounding box,
 *  centred, with room around it, at least `minWidth` across. */
function fit(points: [number, number][], aspect: number, minWidth: number): PassiveMap['box'] {
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const w = Math.max(minWidth, x1 - x0 + 2 * MARGIN, (y1 - y0 + 2 * MARGIN) * aspect)
  const h = w / aspect
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2]
  return [Math.round(cx - w / 2), Math.round(cy - h / 2), Math.round(w), Math.round(h)]
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
