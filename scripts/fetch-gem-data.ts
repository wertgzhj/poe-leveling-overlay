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
  buildGemBasics,
  buildSources,
  gemName,
  mergeGemData,
  type CargoRow,
  type GemSourceInfo,
  type GemsFile
} from './gem-cargo.ts'

const WIKI = 'https://www.poewiki.net'
const API = `${WIKI}/w/api.php`
const UA = { 'user-agent': 'poe-overlay gem-data fetch' }
// Cargo tables + the fields we read (as "field=alias" expressions). These
// tables attach to each gem's wiki page, so the gem name is _pageName — there
// is no reward column (probe run: `reward` errors, everything else ok). Alias
// it to `reward` so the tested transform reads a stable key. Keep the list
// minimal: one nonexistent column fails the whole query.
const QUEST = {
  table: 'quest_rewards',
  fields: ['_pageName=reward', 'act=act', 'quest=quest', 'classes=classes']
}
const VENDOR = {
  table: 'vendor_rewards',
  fields: ['_pageName=reward', 'act=act', 'quest=quest', 'npc=npc', 'classes=classes']
}
// Every gem's attribute (socket colour) — full colour coverage instead of the
// hand-curated subset. (probe run #8: skill_gems has primary_attribute but NOT
// required_level — that lives on the items table, fetched separately below.)
const SKILL = {
  table: 'skill_gems',
  fields: ['_pageName=reward', 'primary_attribute=attr']
}
// Level requirements come from the items rows attached to the same gem pages,
// via a join. Best-effort: if this query breaks, attrs still land and the
// vendor cost tier is simply omitted.
const LEVELS = {
  tables: 'skill_gems,items',
  joinOn: 'skill_gems._pageID=items._pageID',
  fields: ['skill_gems._pageName=reward', 'items.required_level=required_level']
}
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
  // No "order by": we don't need it (buildSources sorts). Field expressions
  // already carry their alias, so the returned keys are exactly what
  // gem-cargo.ts reads.
  const p = new URLSearchParams({
    action: 'cargoquery',
    format: 'json',
    tables: table,
    fields: fields.map((f) => `${table}.${f}`).join(','),
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

/** One tiny cargoquery for a single field: "ok" or the error it produced. */
async function probeField(table: string, fieldExpr: string): Promise<string> {
  const p = new URLSearchParams({
    action: 'cargoquery',
    format: 'json',
    tables: table,
    fields: fieldExpr,
    limit: '1'
  })
  try {
    const res = await fetch(`${API}?${p.toString()}`, { headers: UA })
    const body = await res.text()
    if (!res.ok) return `HTTP ${res.status}`
    const data = JSON.parse(body) as { error?: { code?: string }; cargoquery?: unknown }
    if (data.error) return `ERROR ${data.error.code ?? 'unknown'}`
    return Array.isArray(data.cargoquery) ? 'ok' : 'unexpected response shape'
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

/** Failure aid: an MWException from cargoquery means a table or column in the
 *  query doesn't exist — without saying which. Probe each column with its own
 *  1-row query and print a per-column verdict; a failing _pageName means the
 *  table itself is the problem. */
async function printDiscovery(): Promise<void> {
  console.error('\nProbing tables/columns with 1-row queries:')
  for (const { table, fields } of [QUEST, VENDOR, SKILL]) {
    console.error(`  ${table}:`)
    console.error(`    _pageName: ${await probeField(table, `${table}._pageName=p`)}`)
    for (const f of fields) {
      console.error(`    ${f}: ${await probeField(table, `${table}.${f}`)}`)
    }
  }
}

/** Paged fetch of the LEVELS join. Failures are non-fatal by design. */
async function fetchLevels(): Promise<Map<string, number>> {
  const levels = new Map<string, number>()
  try {
    for (let offset = 0; ; offset += PAGE) {
      const p = new URLSearchParams({
        action: 'cargoquery',
        format: 'json',
        tables: LEVELS.tables,
        'join on': LEVELS.joinOn,
        fields: LEVELS.fields.join(','),
        limit: String(PAGE),
        offset: String(offset)
      })
      const url = `${API}?${p.toString()}`
      if (offset === 0) console.log(`  gem levels (join): ${url}`)
      const res = await fetch(url, { headers: UA })
      const body = await res.text()
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${bodySnippet(body)}`)
      const data = JSON.parse(body) as { error?: unknown; cargoquery?: unknown }
      if (data.error) throw new Error(JSON.stringify(data.error).slice(0, 300))
      if (!Array.isArray(data.cargoquery)) throw new Error('no cargoquery array')
      const page = data.cargoquery.map((r) => ((r as { title?: CargoRow }).title ?? {}) as CargoRow)
      for (const row of page) {
        const gem = gemName(row)
        const n = Number(row['required_level'])
        if (gem && Number.isInteger(n) && n >= 1 && n <= 100 && !levels.has(gem)) levels.set(gem, n)
      }
      if (page.length < PAGE) break
    }
  } catch (e) {
    console.warn(
      `  (gem level join failed — continuing without vendor cost tiers: ${e instanceof Error ? e.message : e})`
    )
  }
  return levels
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
  const [questRows, vendorRows, skillRows, levels] = await Promise.all([
    fetchTable(QUEST.table, QUEST.fields),
    fetchTable(VENDOR.table, VENDOR.fields),
    fetchTable(SKILL.table, SKILL.fields),
    fetchLevels()
  ])
  console.log(
    `  fetched ${questRows.length} quest rows, ${vendorRows.length} vendor rows, ` +
      `${skillRows.length} skill-gem rows, ${levels.size} gem levels`
  )

  const allSources = buildSources(questRows, vendorRows)
  const basics = buildGemBasics(skillRows)
  for (const [gem, lvl] of levels) {
    basics[gem] = { ...(basics[gem] ?? {}), requiredLevel: lvl }
  }

  const existing = JSON.parse(await readFile(args.out, 'utf8')) as GemsFile
  // "Known" = curated in gems.json OR a real skill gem per the wiki — sources
  // for anything else (books, non-gem rewards) stay excluded unless --all.
  const known = new Set([...Object.keys(existing.gems), ...Object.keys(basics)].map(normalize))

  const sources: Record<string, GemSourceInfo[]> = {}
  const unknown: string[] = []
  for (const [gem, srcs] of Object.entries(allSources)) {
    if (args.all || known.has(normalize(gem))) sources[gem] = srcs
    else unknown.push(gem)
  }

  console.log(
    `\nGem basics (attr/level) for ${Object.keys(basics).length} gems; ` +
      `sources for ${Object.keys(sources).length} ` +
      (args.all ? '(--all: including non-gems)' : `(${unknown.length} non-gem rewards excluded)`)
  )
  if (!args.all && unknown.length) {
    console.log('  Excluded (not skill gems per the wiki):')
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

  const merged = mergeGemData(existing, sources, basics)
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
