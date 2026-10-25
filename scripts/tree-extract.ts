// GGG's passive tree export -> the slice of it the overlay ships (data/tree.json).
// Pure, unit-tested (tests/tree.test.ts); scripts/fetch-tree.ts does the I/O.

import type { NodeKind, TreeFile, TreeNode } from '../electron/profile/tree.ts'

/** The fields of the export this reads — it has many more (art, sprites, orbits). */
export interface TreeExport {
  nodes: Record<
    string,
    {
      skill?: number
      name?: string
      stats?: string[]
      group?: number
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
  return { version: release, treeVersion: treeVersionOf(release), nodes }
}

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
