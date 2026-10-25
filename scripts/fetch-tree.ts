// Fetch Grinding Gear Games' passive skill tree export and write the part the
// overlay uses to data/tree.json: each node's name, stats, kind and links.
// The export (github.com/grindinggear/skilltree-export) is what GGG publishes
// for tool authors; it's ~6.5 MB with sprites and art paths, of which the
// overlay needs a few hundred KB. The transform lives in ./tree-extract.ts
// (pure, unit-tested); this file only does I/O.
//
// Usage:
//   npm run fetch-tree                         # current export from GitHub
//   npm run fetch-tree -- path/to/data.json    # a local copy of the export
//   npm run fetch-tree -- --version 3.29.1     # name the release it is
//
// Re-run when a league changes the tree; a PoB build names its tree version
// ("3_29") and the overlay says so when it doesn't match the shipped one.

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { extractTree, type TreeExport } from './tree-extract.ts'

const REPO = 'https://raw.githubusercontent.com/grindinggear/skilltree-export/master'
const TAGS = 'https://api.github.com/repos/grindinggear/skilltree-export/commits/master'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const versionAt = args.indexOf('--version')
let version = versionAt >= 0 ? args[versionAt + 1] : undefined
const source = args.find((a, i) => !a.startsWith('--') && i !== versionAt + 1)

let raw: string
if (source) {
  raw = await readFile(source, 'utf8')
} else {
  console.log(`fetching ${REPO}/data.json`)
  const res = await fetch(`${REPO}/data.json`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${REPO}/data.json`)
  raw = await res.text()
  if (!version) {
    // The export's commits are titled with the release ("3.29.1").
    const commit = await fetch(TAGS).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    const title = (commit as { commit?: { message?: string } } | null)?.commit?.message?.split('\n')[0]
    if (title && /^\d+\.\d+\.\d+/.test(title)) version = title
  }
}
if (!version) throw new Error('could not tell which release this is — pass --version 3.x.y')

const tree = extractTree(JSON.parse(raw) as TreeExport, version)
const out = join(root, 'data', 'tree.json')
await writeFile(out, JSON.stringify(tree) + '\n')
console.log(`wrote ${out}: tree ${tree.version} (${tree.treeVersion}), ${Object.keys(tree.nodes).length} nodes`)
