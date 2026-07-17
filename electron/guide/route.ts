// Route schema + validation (pure, no Electron imports — unit-tested).
// Route content is OWNER-AUTHORED by design (plan changelog 2026-07-17): the
// app ships an engine and a template, not imported route data. Files live in
// data/campaign/ (dev) or userData/routes/ (override) and hot-reload on save,
// so authoring feedback must be good: validation returns human messages, not
// throws.

export const STEP_TYPES = [
  'quest',
  'waypoint',
  'trial',
  'town',
  'boss',
  'kill',
  'enter',
  'hint'
] as const

export type StepType = (typeof STEP_TYPES)[number]

export interface RouteStep {
  /** Stable unique id — progress is persisted against it, don't rename casually. */
  id: string
  type: StepType
  /** Canonical area id ("1_1_2"). Preferred match key when known. */
  areaId?: string
  /** Display name ("The Ledge") — fallback match key while the id is unknown. */
  zone?: string
  text: string
  hints?: string[]
  /** P3: the GemPanel shows the build's reward choice at this step. */
  rewardHint?: boolean
}

export interface Route {
  act: number
  name?: string
  steps: RouteStep[]
}

export interface RouteParseResult {
  route: Route | null
  errors: string[]
}

/** Parse + validate raw JSON text into a Route. Never throws. */
export function parseRoute(jsonText: string): RouteParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(jsonText)
  } catch (e) {
    return { route: null, errors: [`not valid JSON: ${(e as Error).message}`] }
  }
  return validateRoute(raw)
}

export function validateRoute(raw: unknown): RouteParseResult {
  const errors: string[] = []
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { route: null, errors: ['route must be a JSON object'] }
  }
  const obj = raw as Record<string, unknown>

  const act = typeof obj['act'] === 'number' ? obj['act'] : NaN
  if (!Number.isInteger(act) || act < 1 || act > 10) {
    errors.push('"act" must be an integer 1–10')
  }

  if (!Array.isArray(obj['steps']) || obj['steps'].length === 0) {
    errors.push('"steps" must be a non-empty array')
    return { route: null, errors }
  }

  const steps: RouteStep[] = []
  const seenIds = new Set<string>()
  ;(obj['steps'] as unknown[]).forEach((rawStep, i) => {
    const where = `step ${i + 1}`
    if (typeof rawStep !== 'object' || rawStep === null) {
      errors.push(`${where}: must be an object`)
      return
    }
    const s = rawStep as Record<string, unknown>
    const id = typeof s['id'] === 'string' ? s['id'].trim() : ''
    if (!id) {
      errors.push(`${where}: missing "id"`)
      return
    }
    if (seenIds.has(id)) {
      errors.push(`${where}: duplicate id "${id}"`)
      return
    }
    seenIds.add(id)

    const type = s['type']
    if (typeof type !== 'string' || !STEP_TYPES.includes(type as StepType)) {
      errors.push(`step "${id}": type must be one of ${STEP_TYPES.join(' | ')}`)
      return
    }

    const text = typeof s['text'] === 'string' ? s['text'].trim() : ''
    if (!text) errors.push(`step "${id}": missing "text"`)

    const areaId = typeof s['areaId'] === 'string' && s['areaId'].trim() ? s['areaId'].trim() : undefined
    const zone = typeof s['zone'] === 'string' && s['zone'].trim() ? s['zone'].trim() : undefined
    if (!areaId && !zone && type !== 'hint') {
      errors.push(`step "${id}": needs "areaId" or "zone" (only type "hint" may have neither)`)
    }

    const hints = Array.isArray(s['hints'])
      ? (s['hints'] as unknown[]).filter((h): h is string => typeof h === 'string')
      : undefined

    steps.push({
      id,
      type: type as StepType,
      areaId,
      zone,
      text,
      hints,
      rewardHint: s['rewardHint'] === true ? true : undefined
    })
  })

  if (errors.length > 0) return { route: null, errors }
  return { route: { act, name: typeof obj['name'] === 'string' ? obj['name'] : undefined, steps }, errors: [] }
}
