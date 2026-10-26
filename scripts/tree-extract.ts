// GGG's passive tree export -> the slice of it the overlay ships (data/tree.json).
// Pure, unit-tested (tests/tree.test.ts); scripts/fetch-tree.ts does the I/O.

import type { NodeKind, TreeFile, TreeNode } from '../electron/profile/tree.ts'

/** The fields of the export this reads — it has many more (art, sprites). */
export interface TreeExport {
  /** where each group of nodes sits; a node sits on one of its orbits */
  groups?: Record<string, { x: number; y: number }>
  constants?: { skillsPerOrbit: number[]; orbitRadii: number[] }
  nodes: Record<
    string,
    {
      skill?: number
      name?: string
      stats?: string[]
      group?: number
      orbit?: number
      orbitIndex?: number
      out?: string[]
      in?: string[]
      isNotable?: boolean
      isKeystone?: boolean
      isMastery?: boolean
      isJewelSocket?: boolean
      isAscendancyStart?: boolean
      isProxy?: boolean
      classStartIndex?: number
      ascendancyName?: string
      masteryEffects?: Array<{ effect: number; stats?: string[] }>
    }
  >
}

/** "3.29.1" -> "3_29", the form a PoB build names its tree by. */
export function treeVersionOf(release: string): string {
  const m = /^(\d+)\.(\d+)/.exec(release)
  if (!m) throw new Error(`not a release number: ${release}`)
  return `${m[1]}_${m[2]}`
}

export function extractTree(data: TreeExport, release: string): TreeFile {
  // Cluster-jewel nodes (no group, or proxies) only exist inside a socketed
  // jewel and never lie on a levelling path.
  const kept = Object.entries(data.nodes).filter(([, n]) => n.skill != null && n.group != null && !n.isProxy)
  const ids = new Set(kept.map(([id]) => id))
  const nodes: Record<string, TreeNode> = {}
  for (const [id, n] of kept) {
    const node: TreeNode = { name: n.name ?? '?', kind: kindOf(n), stats: n.stats ?? [], links: [] }
    if (n.group != null) node.group = n.group
    const at = position(data, n)
    if (at) [node.x, node.y] = at
    if (n.ascendancyName) node.ascendancy = n.ascendancyName
    if (n.classStartIndex != null) node.classStart = n.classStartIndex
    if (n.masteryEffects?.length) {
      node.effects = Object.fromEntries(n.masteryEffects.map((e) => [String(e.effect), e.stats ?? []]))
    }
    nodes[id] = node
  }
  // Links both ways; a class start's edge to its ascendancies' starts isn't a
  // path anyone walks with passive points, so tree and ascendancy stay apart.
  for (const [id, n] of kept) {
    for (const other of [...(n.out ?? []), ...(n.in ?? [])]) {
      if (!ids.has(other) || other === id) continue
      if (!!nodes[id].ascendancy !== !!nodes[other].ascendancy) continue
      link(nodes[id], Number(other))
      link(nodes[other], Number(id))
    }
  }
  // The map draws the links between nodes on one orbit of a group as arcs
  // around its centre.
  const groups: Record<string, [number, number]> = {}
  for (const n of Object.values(nodes)) {
    const g = n.group != null ? data.groups?.[String(n.group)] : undefined
    if (g) groups[String(n.group)] = [Math.round(g.x), Math.round(g.y)]
  }
  return { version: release, treeVersion: treeVersionOf(release), nodes, groups }
}

/** Where a node sits: its group's centre, out along its orbit. Most orbits
 *  space their nodes evenly; the 16- and 40-node ones don't (PoB's tables). */
function position(data: TreeExport, n: TreeExport['nodes'][string]): [number, number] | null {
  const g = n.group != null ? data.groups?.[String(n.group)] : undefined
  const c = data.constants
  if (!g || !c || n.orbit == null || n.orbitIndex == null) return null
  const count = c.skillsPerOrbit[n.orbit]
  const deg =
    count === 16 ? ORBIT_16[n.orbitIndex] : count === 40 ? ORBIT_40[n.orbitIndex] : (360 * n.orbitIndex) / count
  const a = ((deg ?? 0) * Math.PI) / 180
  const r = c.orbitRadii[n.orbit]
  // clockwise from straight up, y downwards
  return [Math.round(g.x + r * Math.sin(a)), Math.round(g.y - r * Math.cos(a))]
}

const ORBIT_16 = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330]
const ORBIT_40 = [
  0, 10, 20, 30, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 130, 135, 140, 150, 160, 170, 180, 190, 200, 210, 220,
  225, 230, 240, 250, 260, 270, 280, 290, 300, 310, 315, 320, 330, 340, 350
]

function link(node: TreeNode, to: number): void {
  if (!node.links.includes(to)) node.links.push(to)
}

function kindOf(n: TreeExport['nodes'][string]): NodeKind {
  if (n.classStartIndex != null) return 'start'
  if (n.isAscendancyStart) return 'ascendancyStart'
  if (n.isKeystone) return 'keystone'
  if (n.isMastery) return 'mastery'
  if (n.isJewelSocket) return 'jewel'
  if (n.isNotable) return 'notable'
  return 'small'
}
