// Pure transform from poewiki Cargo-export rows into our gems.json `sources`
// (unit-tested). Kept separate from the fetching so it can be verified without
// the network. The wiki's exact column names can drift — the fetch script prints
// the query URLs so you can inspect them; adjust the field reads here if needed.

export const CLASS_NAMES = [
  'Marauder',
  'Ranger',
  'Witch',
  'Duelist',
  'Templar',
  'Shadow',
  'Scion'
] as const
export type CharClass = (typeof CLASS_NAMES)[number]

export interface GemSourceInfo {
  kind: 'quest' | 'vendor'
  act: number
  quest?: string
  npc?: string
  classes?: CharClass[]
}

/** A Cargo row is an object of string/number fields; we read defensively. */
export type CargoRow = Record<string, unknown>

function str(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined
  if (typeof v === 'number') return String(v)
  return undefined
}

/** Cargo List fields export as a delimited string. Keep only the 7 classes;
 *  "all classes" (none listed, or all 7) collapses to undefined = every class. */
export function parseClasses(raw: unknown): CharClass[] | undefined {
  const s = str(raw)
  if (!s) return undefined
  const found = s
    .split(/[,;|/]/)
    .map((x) => x.trim())
    .filter((x): x is CharClass => (CLASS_NAMES as readonly string[]).includes(x))
  const unique = [...new Set(found)]
  if (unique.length === 0 || unique.length === CLASS_NAMES.length) return undefined
  return unique
}

/** The gem name for a rewards row — the reward field (on poewiki an aliased
 *  _pageName: the tables attach to each gem's page), else the raw page name.
 *  Wiki disambiguation suffixes like "Blight (gem)" are stripped. */
export function gemName(row: CargoRow): string | undefined {
  const raw = str(row['reward']) ?? str(row['_pageName']) ?? str(row['reward_id'])
  return raw?.replace(/\s*\((?:skill )?gem\)$/i, '')
}

function actNumber(row: CargoRow): number | undefined {
  const n = Number(str(row['act']))
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : undefined
}

export function questRowToSource(row: CargoRow): { gem: string; source: GemSourceInfo } | null {
  const gem = gemName(row)
  const act = actNumber(row)
  if (!gem || act === undefined) return null
  return { gem, source: { kind: 'quest', act, quest: str(row['quest']) ?? str(row['quest_id']), classes: parseClasses(row['classes']) } }
}

export function vendorRowToSource(row: CargoRow): { gem: string; source: GemSourceInfo } | null {
  const gem = gemName(row)
  const act = actNumber(row)
  if (!gem || act === undefined) return null
  return {
    gem,
    source: {
      kind: 'vendor',
      act,
      npc: str(row['npc']),
      quest: str(row['quest']) ?? str(row['quest_id']),
      classes: parseClasses(row['classes'])
    }
  }
}

function sourceKey(s: GemSourceInfo): string {
  return `${s.kind}|${s.act}|${s.npc ?? ''}|${s.quest ?? ''}|${(s.classes ?? []).join('+')}`
}

/** Group + dedupe reward rows into per-gem source lists. */
export function buildSources(questRows: CargoRow[], vendorRows: CargoRow[]): Record<string, GemSourceInfo[]> {
  const byGem = new Map<string, Map<string, GemSourceInfo>>()
  const add = (r: { gem: string; source: GemSourceInfo } | null): void => {
    if (!r) return
    const existing = byGem.get(r.gem) ?? new Map<string, GemSourceInfo>()
    existing.set(sourceKey(r.source), r.source)
    byGem.set(r.gem, existing)
  }
  for (const row of questRows) add(questRowToSource(row))
  for (const row of vendorRows) add(vendorRowToSource(row))

  const out: Record<string, GemSourceInfo[]> = {}
  for (const [gem, sources] of byGem) {
    out[gem] = [...sources.values()].sort(
      (a, b) => a.act - b.act || (a.kind === b.kind ? 0 : a.kind === 'quest' ? -1 : 1)
    )
  }
  return out
}

export interface GemsFile {
  _note?: string
  gems: Record<string, { attr?: string; sources?: GemSourceInfo[] }>
}

/** Merge fetched sources into an existing gems.json, preserving attributes and
 *  any gems not present in the wiki data. Returns a new object. */
export function mergeGemData(existing: GemsFile, sources: Record<string, GemSourceInfo[]>): GemsFile {
  const gems: GemsFile['gems'] = {}
  for (const [name, info] of Object.entries(existing.gems)) gems[name] = { ...info }
  for (const [name, srcs] of Object.entries(sources)) {
    gems[name] = { ...(gems[name] ?? {}), sources: srcs }
  }
  return { ...existing, gems }
}
