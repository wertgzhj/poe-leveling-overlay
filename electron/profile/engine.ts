// Pure build-profile engine (no Electron imports — unit-tested). Picks the
// active stage for the current level, colours its socket groups, and derives
// acquisition views (reward picks / vendor shopping list) from the gemPlan.

import type { Profile, Stage, CharClass, GemSource } from './profile.ts'
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

export interface AcquisitionEntry {
  gem: string
  count?: number
  bucket: 'reward' | 'purchase' | 'other'
  act?: number
  npc?: string
  quest?: string
  note?: string
  /** true when the source is the broad-vendor fallback (Siosa/Lilly), not gem-specific. */
  fallback?: boolean
  /** upcoming entries: the level the gem's stage starts at. */
  fromLevel?: number
}

export interface Acquisitions {
  /** gems taken as quest rewards. */
  rewards: AcquisitionEntry[]
  /** gems bought from a vendor. */
  purchases: AcquisitionEntry[]
  /** drop-only, unobtainable en route, or source unknown. */
  other: AcquisitionEntry[]
  /** quest-reward gems that LATER stages need — take them when a quest offers
   *  them now instead of paying a vendor later (owner feedback). */
  upcoming: AcquisitionEntry[]
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

/**
 * The gems used by the active stage, grouped by how they're acquired — the
 * basis for the reward recommendation and the town shopping list. A gem's
 * source is the profile's authored `gemPlan.source` when present, otherwise
 * resolved live from gems.json for the profile's class (P5), so a hand-written
 * or imported plan without sources still gets buy/reward hints where the data
 * exists.
 */
export function acquisitionsForStage(profile: Profile, stageIndex: number, gems?: GemData): Acquisitions {
  const stage = profile.stages[stageIndex]
  const used = new Set<string>()
  if (stage) for (const g of stage.socketGroups) for (const gem of g.gems) used.add(gem.toLowerCase())

  const rewards: AcquisitionEntry[] = []
  const purchases: AcquisitionEntry[] = []
  const other: AcquisitionEntry[] = []
  for (const entry of profile.gemPlan) {
    if (used.size > 0 && !used.has(entry.gem.toLowerCase())) continue
    const acq = classify(entry, profile.meta.class, gems)
    if (acq.bucket === 'reward') rewards.push(acq)
    else if (acq.bucket === 'purchase') purchases.push(acq)
    else other.push(acq)
  }
  return { rewards, purchases, other, upcoming: upcomingRewards(profile, stageIndex, used, gems) }
}

/** Gems first used in LATER stages that a quest rewards this class — worth
 *  grabbing the moment the quest offers them (free beats buying later). */
function upcomingRewards(
  profile: Profile,
  stageIndex: number,
  activeGems: Set<string>,
  gems?: GemData
): AcquisitionEntry[] {
  const seen = new Set<string>()
  const out: AcquisitionEntry[] = []
  for (let i = stageIndex + 1; i < profile.stages.length; i++) {
    const st = profile.stages[i]
    for (const group of st.socketGroups) {
      for (const gem of group.gems) {
        const key = gem.toLowerCase()
        if (activeGems.has(key) || seen.has(key)) continue
        seen.add(key)
        const planned = profile.gemPlan.find((p) => p.gem.toLowerCase() === key)
        const acq = classify(planned ?? { gem }, profile.meta.class, gems)
        if (acq.bucket === 'reward') out.push({ ...acq, fromLevel: st.range[0] })
      }
    }
  }
  return out
}

function classify(
  entry: { gem: string; count?: number; source?: GemSource },
  cls: CharClass,
  gems?: GemData
): AcquisitionEntry {
  const authored = entry.source
  if (authored) {
    const bucket = authored.kind === 'questReward' ? 'reward' : authored.kind === 'vendor' ? 'purchase' : 'other'
    return {
      gem: entry.gem,
      count: entry.count,
      bucket,
      act: authored.act,
      npc: authored.npc,
      quest: authored.questId,
      note: authored.note
    }
  }
  const src = gems?.earliestSource(entry.gem, cls)
  if (src) {
    return {
      gem: entry.gem,
      count: entry.count,
      bucket: src.kind === 'quest' ? 'reward' : 'purchase',
      act: src.act,
      npc: src.npc,
      quest: src.quest,
      note: src.note,
      fallback: src.fallback
    }
  }
  return { gem: entry.gem, count: entry.count, bucket: 'other' }
}
