// Pure editing model for the editor window (no DOM/React/Electron imports — the
// non-trivial ops are unit-tested). Drafts are lenient working copies (fields may
// be blank mid-edit); the authoritative validation happens in the main process on
// save, reusing the same validators the app loads files with.

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

export interface StepDraft {
  id: string
  type: StepType
  areaId?: string
  zone?: string
  text: string
  hints?: string[]
  rewardHint?: boolean
}

export interface RouteDraft {
  act: number
  name?: string
  steps: StepDraft[]
}

export interface SocketGroupDraft {
  gems: string[]
  note?: string
}

export interface StageDraft {
  range: [number, number]
  label?: string
  socketGroups: SocketGroupDraft[]
  note?: string
}

export interface ProfileMetaDraft {
  name: string
  class: CharClass
  ascendancy?: string
  character?: string
  pobSource?: string
}

export interface GemPlanDraft {
  gem: string
  count?: number
  source?: unknown
}

export interface ProfileDraft {
  meta: ProfileMetaDraft
  stages: StageDraft[]
  gemPlan: GemPlanDraft[]
}

/** Move an item within an array, returning a new array (clamped, no-op if out of range). */
export function moveItem<T>(arr: readonly T[], from: number, to: number): T[] {
  const next = [...arr]
  if (from < 0 || from >= next.length) return next
  const clamped = Math.max(0, Math.min(next.length - 1, to))
  const [item] = next.splice(from, 1)
  next.splice(clamped, 0, item)
  return next
}

/** A unique step id for the act, of the form "a{act}-{n}". */
export function genStepId(route: RouteDraft): string {
  const used = new Set(route.steps.map((s) => s.id))
  for (let i = 1; ; i++) {
    const id = `a${route.act}-${i}`
    if (!used.has(id)) return id
  }
}

export function blankStep(route: RouteDraft): StepDraft {
  return { id: genStepId(route), type: 'hint', text: '' }
}

/** Insert a blank step after `index` (or at the end when index < 0). */
export function addStepAfter(route: RouteDraft, index: number): RouteDraft {
  const step = blankStep(route)
  const steps = [...route.steps]
  const at = index < 0 || index >= steps.length ? steps.length : index + 1
  steps.splice(at, 0, step)
  return { ...route, steps }
}

export function updateStep(route: RouteDraft, index: number, patch: Partial<StepDraft>): RouteDraft {
  if (index < 0 || index >= route.steps.length) return route
  const steps = route.steps.map((s, i) => (i === index ? { ...s, ...patch } : s))
  return { ...route, steps }
}

export function deleteStep(route: RouteDraft, index: number): RouteDraft {
  return { ...route, steps: route.steps.filter((_, i) => i !== index) }
}

export function moveStep(route: RouteDraft, from: number, to: number): RouteDraft {
  return { ...route, steps: moveItem(route.steps, from, to) }
}

/** Strip a draft to a clean route object for saving (drops empty optional fields). */
export function serializeRoute(route: RouteDraft): unknown {
  return {
    act: route.act,
    ...(route.name ? { name: route.name } : {}),
    steps: route.steps.map((s) => ({
      id: s.id.trim(),
      type: s.type,
      ...(s.areaId?.trim() ? { areaId: s.areaId.trim() } : {}),
      ...(s.zone?.trim() ? { zone: s.zone.trim() } : {}),
      text: s.text.trim(),
      ...(s.hints && s.hints.filter((h) => h.trim()).length
        ? { hints: s.hints.map((h) => h.trim()).filter(Boolean) }
        : {}),
      ...(s.rewardHint ? { rewardHint: true } : {})
    }))
  }
}

export function blankStage(fromLevel: number): StageDraft {
  return {
    range: [fromLevel, Math.min(90, fromLevel + 10)],
    socketGroups: [{ gems: [] }]
  }
}

export function serializeProfile(profile: ProfileDraft): unknown {
  return {
    meta: {
      name: profile.meta.name.trim(),
      class: profile.meta.class,
      ...(profile.meta.ascendancy?.trim() ? { ascendancy: profile.meta.ascendancy.trim() } : {}),
      ...(profile.meta.character?.trim() ? { character: profile.meta.character.trim() } : {}),
      ...(profile.meta.pobSource ? { pobSource: profile.meta.pobSource } : {})
    },
    stages: profile.stages.map((st) => ({
      range: st.range,
      ...(st.label?.trim() ? { label: st.label.trim() } : {}),
      socketGroups: st.socketGroups.map((g) => ({
        gems: g.gems.map((x) => x.trim()).filter(Boolean),
        ...(g.note?.trim() ? { note: g.note.trim() } : {})
      })),
      ...(st.note?.trim() ? { note: st.note.trim() } : {})
    })),
    gemPlan: profile.gemPlan
  }
}
