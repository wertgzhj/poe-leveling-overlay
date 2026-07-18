// Pure build-profile engine (no Electron imports — unit-tested). Picks the
// active stage for the current level, colours its socket groups, and derives
// acquisition views (reward picks / vendor shopping list) from the gemPlan.

import type { Profile, Stage, GemPlanEntry } from './profile.ts'
import { GemData, type ColoredGem } from './gems.ts'

export interface ColoredSocketGroup {
  gems: ColoredGem[]
  note?: string
}

export interface ResolvedStage {
  index: number
  label: string
  range: [number, number]
  groups: ColoredSocketGroup[]
  note?: string
}

export interface Acquisitions {
  /** gemPlan entries sourced from quest rewards. */
  rewards: GemPlanEntry[]
  /** gemPlan entries bought from vendors. */
  purchases: GemPlanEntry[]
  /** drop-only or otherwise not obtainable en route. */
  other: GemPlanEntry[]
}

/** Index of the stage whose range contains `level`; clamps below the first and
 *  above the last so there is always an active stage. */
export function activeStageIndex(profile: Profile, level: number | null): number {
  const stages = profile.stages
  if (stages.length === 0) return -1
  const lvl = level ?? 1
  const ordered = stages
    .map((s, i) => ({ i, min: s.range[0], max: s.range[1] }))
    .sort((a, b) => a.min - b.min)

  // Exact hit wins; otherwise fall back to the nearest lower stage (the one
  // you'd still be running through a gap), clamping to the first below all.
  let fallback = ordered[0].i
  for (const s of ordered) {
    if (lvl >= s.min && lvl <= s.max) return s.i
    if (lvl >= s.min) fallback = s.i
  }
  return fallback
}

export function resolveStage(stage: Stage, index: number, gems: GemData): ResolvedStage {
  return {
    index,
    label: stage.label ?? `Level ${stage.range[0]}–${stage.range[1]}`,
    range: stage.range,
    note: stage.note,
    groups: stage.socketGroups.map((g) => ({ gems: gems.colorGroup(g.gems), note: g.note }))
  }
}

/** The gems used by the active stage, grouped by how they're acquired — the
 *  basis for the reward recommendation and the town shopping list. */
export function acquisitionsForStage(profile: Profile, stageIndex: number): Acquisitions {
  const stage = profile.stages[stageIndex]
  const used = new Set<string>()
  if (stage) for (const g of stage.socketGroups) for (const gem of g.gems) used.add(gem.toLowerCase())

  const rewards: GemPlanEntry[] = []
  const purchases: GemPlanEntry[] = []
  const other: GemPlanEntry[] = []
  for (const entry of profile.gemPlan) {
    if (used.size > 0 && !used.has(entry.gem.toLowerCase())) continue
    const kind = entry.source?.kind
    if (kind === 'questReward') rewards.push(entry)
    else if (kind === 'vendor') purchases.push(entry)
    else other.push(entry)
  }
  return { rewards, purchases, other }
}

/** gemPlan entries for a specific quest reward step (route rewardHint join). */
export function rewardsForQuest(profile: Profile, questId: string | null): GemPlanEntry[] {
  if (!questId) return []
  return profile.gemPlan.filter(
    (e) => e.source?.kind === 'questReward' && e.source.questId === questId
  )
}
