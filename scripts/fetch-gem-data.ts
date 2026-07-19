// Fetch per-class gem acquisition (quest + vendor) from the Path of Exile Wiki
// and merge it into data/gems.json, filling the intentionally-empty `sources`.
//
// The wiki exposes its data through the MediaWiki **Cargo** export API, which
// returns plain JSON — no scraping. We read two tables:
//   - quest_rewards : gems given as a quest reward
//   - vendor_rewards: gems a vendor sells after a quest
// The row -> source transform lives in ./gem-cargo.ts (pure, unit-tested); this
// file only does I/O. It always prints the query URLs so a wrong table/field
// name (the wiki schema can drift) shows up as an inspectable empty result
// rather than a silent one.
//
// Usage:
//   npm run fetch-gems            # fetch + merge into data/gems.json
//   npm run fetch-gems -- --dry-run   # fetch + print a summary, write nothing
//   npm run fetch-gems -- --all       # also add gems we don't yet curate (no attr)
//   npm run fetch-gems -- --out other.json
//
// Note: the sandbox used to develop this blocks poewiki.net, so this script is
// meant to be run from a normal network. Everything it depends on for logic is
// covered by tests/gem-cargo.test.ts.

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  buildSources,
  mergeGemData,
  type CargoRow,
  type GemSourceInfo,
  type GemsFile
} from './gem-cargo.ts'

const WIKI = 'https://www.poewiki.net'
// Cargo tables + the fields we read. Requesting a column that doesn't exist
// makes the whole export 500 — keep this list minimal and let gem-cargo.ts read
// rows defensively. On errors we print the server's message, which names the
// offending column; adjust here if the wiki schema drifts.
const QUEST = { table: 'quest_rewards', fields: ['reward', 'act', 'quest', 'classes'] }
const VENDOR = { table: 'vendor_rewards', fields: ['reward', 'act', 'quest', 'npc', 'classes'] }
const PAGE = 500 // Cargo caps a single export; page through with offset.

interface Args {
  dryRun: boolean
  all: boolean
  out: string
}

function parseArgs(argv: string[]): Args {
  const here = dirname(fileURLToPath(import.meta.url))
  const args: Args = { dryRun: false, all: false, out: join(here, '..', 'data', 'gems.json') }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') args.dryRun = true
    else if (a === '--all') args.all = true
    else if (a === '--out') args.out = argv[++i]
    else {
      console.error(`Unknown argument: ${a}`)
      process.exit(2)
    }
  }
  return args
}

function exportUrl(table: string, fields: string[], offset: number): string {
  // No "order by": we don't need it (buildSources sorts), and it's one more
  // thing that can 500. Cargo's default row order is stable enough for paging.
  const p = new URLSearchParams({
    title: 'Special:CargoExport',
    tables: table,
    fields: fields.join(','),
    format: 'json',
    limit: String(PAGE),
    offset: String(offset)
  })
  return `${WIKI}/index.php?${p.toString()}`
}

/** First ~400 chars of a response body with HTML stripped — MediaWiki error
 *  pages bury the actual database error (e.g. an unknown column) in there. */
function bodySnippet(body: string): string {
  const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.slice(0, 400)
}

async function fetchTable(table: string, fields: string[]): Promise<CargoRow[]> {
  const rows: CargoRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const url = exportUrl(table, fields, offset)
    if (offset === 0) console.log(`  ${table}: ${url}`)
    const res = await fetch(url, { headers: { 'user-agent': 'poe-overlay gem-data fetch' } })
    const body = await res.text()
    if (!res.ok) {
      throw new Error(
        `${table} export failed: HTTP ${res.status} ${res.statusText}\n  server says: ${bodySnippet(body)}`
      )
    }
    let page: unknown
    try {
      page = JSON.parse(body)
    } catch {
      throw new Error(`${table} export was not JSON\n  server says: ${bodySnippet(body)}`)
    }
    if (!Array.isArray(page)) {
      throw new Error(`${table} export was not a JSON array\n  server says: ${bodySnippet(body)}`)
    }
    rows.push(...(page as CargoRow[]))
    if (page.length < PAGE) break
  }
  return rows
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+support$/, '')
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  console.log('Querying the Path of Exile Wiki Cargo export:')
  const [questRows, vendorRows] = await Promise.all([
    fetchTable(QUEST.table, QUEST.fields),
    fetchTable(VENDOR.table, VENDOR.fields)
  ])
  console.log(`  fetched ${questRows.length} quest rows, ${vendorRows.length} vendor rows`)

  const allSources = buildSources(questRows, vendorRows)

  const existing = JSON.parse(await readFile(args.out, 'utf8')) as GemsFile
  const known = new Set(Object.keys(existing.gems).map(normalize))

  // Default: only fill sources for gems we already curate (guarantees we never
  // pull non-gem quest rewards into gems.json). --all takes everything.
  const sources: Record<string, GemSourceInfo[]> = {}
  const unknown: string[] = []
  for (const [gem, srcs] of Object.entries(allSources)) {
    if (args.all || known.has(normalize(gem))) sources[gem] = srcs
    else unknown.push(gem)
  }

  console.log(
    `\nMatched ${Object.keys(sources).length} gems with sources` +
      (args.all ? ' (--all: including uncurated)' : ` (${unknown.length} wiki gems not in gems.json)`)
  )
  if (!args.all && unknown.length) {
    console.log('  Not in gems.json (add an attr there to include them):')
    console.log('  ' + unknown.sort().join(', '))
  }

  // Show a sample so a dry run is actually inspectable.
  const sample = Object.entries(sources).slice(0, 3)
  if (sample.length) {
    console.log('\nSample:')
    for (const [gem, srcs] of sample) console.log(`  ${gem}: ${JSON.stringify(srcs)}`)
  }

  if (args.dryRun) {
    console.log('\n--dry-run: no files written.')
    return
  }

  const merged = mergeGemData(existing, sources)
  await writeFile(args.out, JSON.stringify(merged, null, 2) + '\n')
  console.log(`\nWrote ${args.out}.`)
}

main().catch((err) => {
  console.error('\nFailed:', err instanceof Error ? err.message : err)
  console.error(
    'If the URLs above return empty JSON, the wiki table/field names likely changed.\n' +
      'Open one in a browser to check, then adjust QUEST/VENDOR at the top of this script.'
  )
  process.exit(1)
})
