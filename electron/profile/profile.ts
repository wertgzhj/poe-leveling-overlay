// Build-profile schema + validation (pure, no Electron imports — unit-tested).
// Profiles are OWNER-AUTHORED JSON (same workflow as routes): hot-reloaded on
// save with author-facing validation. Two axes (plan §5.3): `stages` = loadout
// per level range, `gemPlan` = where each gem is acquired.

export const CLASSES = [
  'Marauder',
  'Ranger',
  'Witch',
  'Duelist',
  'Templar',
  'Shadow',
  'Scion'
] as const
export type CharClass = (typeof CLASSES)[number]

export const GEM_SOURCE_KINDS = ['questReward', 'vendor', 'drop', 'unobtainable'] as const
export type GemSourceKind = (typeof GEM_SOURCE_KINDS)[number]

export interface GemSource {
  kind: GemSourceKind
  /** questReward: the quest that offers it. */
  questId?: string
  /** vendor: who sells it, in which act, after which quest. */
  npc?: string
  act?: number
  afterQuest?: string
  note?: string
}

export interface SocketGroup {
  gems: string[]
  note?: string
}

export interface Stage {
  /** Inclusive character-level range [min, max]. */
  range: [number, number]
  label?: string
  socketGroups: SocketGroup[]
  note?: string
}

export interface GemPlanEntry {
  gem: string
  count?: number
  source?: GemSource
}

export interface ProfileMeta {
  name: string
  class: CharClass
  ascendancy?: string
  /** Optional in-game character this profile belongs to. */
  character?: string
  pobSource?: string
}

export interface Profile {
  meta: ProfileMeta
  stages: Stage[]
  gemPlan: GemPlanEntry[]
}

export interface ProfileParseResult {
  profile: Profile | null
  errors: string[]
}

export function parseProfile(jsonText: string): ProfileParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(jsonText)
  } catch (e) {
    return { profile: null, errors: [`not valid JSON: ${(e as Error).message}`] }
  }
  return validateProfile(raw)
}

export function validateProfile(raw: unknown): ProfileParseResult {
  const errors: string[] = []
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { profile: null, errors: ['profile must be a JSON object'] }
  }
  const obj = raw as Record<string, unknown>

  const meta = validateMeta(obj['meta'], errors)
  const stages = validateStages(obj['stages'], errors)
  const gemPlan = validateGemPlan(obj['gemPlan'], errors)

  if (errors.length > 0 || !meta || !stages) return { profile: null, errors }
  return { profile: { meta, stages, gemPlan }, errors: [] }
}

function validateMeta(raw: unknown, errors: string[]): ProfileMeta | null {
  if (typeof raw !== 'object' || raw === null) {
    errors.push('"meta" must be an object with at least "name" and "class"')
    return null
  }
  const m = raw as Record<string, unknown>
  const name = typeof m['name'] === 'string' ? m['name'].trim() : ''
  if (!name) errors.push('meta.name is required')
  const cls = m['class']
  if (typeof cls !== 'string' || !CLASSES.includes(cls as CharClass)) {
    errors.push(`meta.class must be one of ${CLASSES.join(', ')}`)
    return null
  }
  if (!name) return null
  return {
    name,
    class: cls as CharClass,
    ascendancy: str(m['ascendancy']),
    character: str(m['character']),
    pobSource: str(m['pobSource'])
  }
}

function validateStages(raw: unknown, errors: string[]): Stage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    errors.push('"stages" must be a non-empty array')
    return null
  }
  const stages: Stage[] = []
  raw.forEach((rawStage, i) => {
    const where = `stage ${i + 1}`
    if (typeof rawStage !== 'object' || rawStage === null) {
      errors.push(`${where}: must be an object`)
      return
    }
    const s = rawStage as Record<string, unknown>
    const range = s['range']
    let min = NaN
    let max = NaN
    if (Array.isArray(range) && range.length === 2) {
      min = Number(range[0])
      max = Number(range[1])
    }
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
      errors.push(`${where}: "range" must be [min, max] integers with 1 <= min <= max`)
    }
    const groupsRaw = s['socketGroups']
    if (!Array.isArray(groupsRaw) || groupsRaw.length === 0) {
      errors.push(`${where}: "socketGroups" must be a non-empty array`)
      return
    }
    const socketGroups: SocketGroup[] = []
    groupsRaw.forEach((g, gi) => {
      const gems = (g as Record<string, unknown>)?.['gems']
      const list = Array.isArray(gems)
        ? gems.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        : []
      if (list.length === 0) {
        errors.push(`${where} group ${gi + 1}: needs a non-empty "gems" array`)
        return
      }
      socketGroups.push({ gems: list.map((x) => x.trim()), note: str((g as Record<string, unknown>)['note']) })
    })
    stages.push({ range: [min, max], label: str(s['label']), socketGroups, note: str(s['note']) })
  })

  // Warn (not fail) on overlaps so switching is unambiguous — plan §6 wizard
  // does this for imports; here it just flags author mistakes.
  const ordered = [...stages].sort((a, b) => a.range[0] - b.range[0])
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].range[0] <= ordered[i - 1].range[1]) {
      errors.push(
        `stages overlap: [${ordered[i - 1].range.join('–')}] and [${ordered[i].range.join('–')}]`
      )
    }
  }
  return stages
}

function validateGemPlan(raw: unknown, errors: string[]): GemPlanEntry[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    errors.push('"gemPlan" must be an array when present')
    return []
  }
  const plan: GemPlanEntry[] = []
  raw.forEach((entry, i) => {
    const e = entry as Record<string, unknown>
    const gem = typeof e?.['gem'] === 'string' ? e['gem'].trim() : ''
    if (!gem) {
      errors.push(`gemPlan ${i + 1}: missing "gem"`)
      return
    }
    let source: GemSource | undefined
    if (e['source'] !== undefined) {
      const kind = (e['source'] as Record<string, unknown>)?.['kind']
      if (typeof kind !== 'string' || !GEM_SOURCE_KINDS.includes(kind as GemSourceKind)) {
        errors.push(`gemPlan "${gem}": source.kind must be one of ${GEM_SOURCE_KINDS.join(', ')}`)
      } else {
        const s = e['source'] as Record<string, unknown>
        source = {
          kind: kind as GemSourceKind,
          questId: str(s['questId']),
          npc: str(s['npc']),
          act: typeof s['act'] === 'number' ? s['act'] : undefined,
          afterQuest: str(s['afterQuest']),
          note: str(s['note'])
        }
      }
    }
    plan.push({ gem, count: typeof e['count'] === 'number' ? e['count'] : undefined, source })
  })
  return plan
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined
}
