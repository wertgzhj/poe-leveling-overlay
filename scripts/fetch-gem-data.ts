// Fetch per-class gem acquisition (quest + vendor) from the Path of Exile Wiki
// and merge it into data/gems.json, filling the intentionally-empty `sources`.
//
// Uses the MediaWiki Action API's **cargoquery** (api.php?action=cargoquery) —
// plain JSON in and out, structured error objects on a bad query. (The older
// Special:CargoExport page 500s with an empty body on these tables, so it's
// useless for diagnosis — don't switch back.) Two tables:
//   - quest_rewards : gems given as a quest reward
//   - vendor_rewards: gems a vendor sells after a quest
// The row -> source transform lives in ./gem-cargo.ts (pure, unit-tested); this
// file only does I/O. It always prints the query URLs so a wrong table/field
// name (the wiki schema can drift) shows up as an inspectable error, not a
// silent empty result.
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
const API = `${WIKI}/w/api.php`
const UA = { 'user-agent': 'poe-overlay gem-data fetch' }
// Cargo tables + the fields we read. Keep the list minimal (a nonexistent
// column fails the whole query) and let gem-cargo.ts read rows defensively.
// A bad query comes back as a JSON `error` object naming the problem — printed
// verbatim; adjust here if the wiki schema drifts.
const QUEST = { table: 'quest_rewards', fields: ['reward', 'act', 'quest', 'classes'] }
const VENDOR = { table: 'vendor_rewards', fields: ['reward', 'act', 'quest', 'npc', 'classes'] }
const PAGE = 500 // cargoquery's anonymous cap; page through with offset.

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

function queryUrl(table: string, fields: string[], offset: number): string {
  // No "order by": we don't need it (buildSources sorts). Fields are aliased
  // ("table.field=field") so the returned keys are exactly what gem-cargo.ts
  // reads, table prefix stripped.
  const p = new URLSearchParams({
    action: 'cargoquery',
    format: 'json',
    tables: table,
    fields: fields.map((f) => `${table}.${f}=${f}`).join(','),
    limit: String(PAGE),
    offset: String(offset)
  })
  return `${API}?${p.toString()}`
}

/** Response body with HTML stripped and clipped, for error/diagnosis output. */
function bodySnippet(body: string, max = 400): string {
  const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.slice(0, max)
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: UA })
  return await res.text()
}

/** Failure aid: an MWException from cargoquery means a table or column in the
 *  query doesn't exist, without saying which. Print what actually exists —
 *  reward-ish table names from the Special:CargoTables index plus the declared
 *  schema of the tables we query — so the next edit of QUEST/VENDOR is
 *  informed, not guessed. */
async function printDiscovery(): Promise<void> {
  try {
    const index = bodySnippet(await fetchText(`${WIKI}/index.php?title=Special:CargoTables`), 40000)
    const words = [...new Set(index.split(/\s+/).filter((w) => /reward|vendor|quest/i.test(w)))]
    console.error('\nCargo tables/words mentioning reward|vendor|quest:')
    console.error('  ' + (words.slice(0, 50).join(' ') || '(none found)'))
  } catch (e) {
    console.error('\n(could not list Cargo tables:', e instanceof Error ? e.message : e, ')')
  }
  for (const table of [QUEST.table, VENDOR.table]) {
    try {
      console.error(`\nSchema of "${table}" (Special:CargoTables/${table}):`)
      console.error(
        '  ' + bodySnippet(await fetchText(`${WIKI}/index.php?title=Special:CargoTables/${table}`), 1500)
      )
    } catch (e) {
      console.error(`  (could not fetch: ${e instanceof Error ? e.message : e})`)
    }
  }
}

async function fetchTable(table: string, fields: string[]): Promise<CargoRow[]> {
  const rows: CargoRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const url = queryUrl(table, fields, offset)
    if (offset === 0) console.log(`  ${table}: ${url}`)
    const res = await fetch(url, { headers: UA })
    const body = await res.text()
    if (!res.ok) {
      throw new Error(
        `${table} query failed: HTTP ${res.status} ${res.statusText}\n  server says: ${bodySnippet(body)}`
      )
    }
    let data: unknown
    try {
      data = JSON.parse(body)
    } catch {
      throw new Error(`${table} query was not JSON\n  server says: ${bodySnippet(body)}`)
    }
    // The API reports bad queries as a structured error object — surface it.
    const obj = data as { error?: unknown; cargoquery?: unknown }
    if (obj.error) {
      throw new Error(`${table} query error: ${JSON.stringify(obj.error).slice(0, 400)}`)
    }
    if (!Array.isArray(obj.cargoquery)) {
      throw new Error(`${table} query: no cargoquery array\n  server says: ${bodySnippet(body)}`)
    }
    // Each result is wrapped as { title: { field: value } }.
    const page = obj.cargoquery.map((r) => ((r as { title?: CargoRow }).title ?? {}) as CargoRow)
    rows.push(...page)
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

main().catch(async (err) => {
  console.error('\nFailed:', err instanceof Error ? err.message : err)
  console.error(
    'An MWException means a table/column in the query does not exist on the wiki.\n' +
      'The discovery below shows what does — adjust QUEST/VENDOR at the top of this script.'
  )
  await printDiscovery()
  process.exit(1)
})
