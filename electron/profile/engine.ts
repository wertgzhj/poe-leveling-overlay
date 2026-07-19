// Pure build-profile engine (no Electron imports — unit-tested). Picks the
// active stage for the current level, colours its socket groups, and derives
// acquisition views (reward picks / vendor shopping list) from the gemPlan.

import type { Profile, Stage, CharClass, GemSource } from './profile.ts'
import { GemData, vendorCostFor, costRank, type ColoredGem } from './gems.ts'

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
  /** vendor price tier ("Wisdom", "Alteration", …) — provisional, by gem level req. */
  cost?: string
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
  /** rewards + upcoming grouped by quest. A quest reward is ONE pick in game —
   *  a group with several gems is a player choice (take one, buy the rest). */
  rewardGroups: RewardGroup[]
}

export interface RewardGroup {
  quest?: string
  act?: number
  /** several gems from the same quest reward — the player must choose one. */
  pickOne: boolean
  gems: AcquisitionEntry[]
}

/** Campaign act from a numeric area id ("2_1_3" -> 2). Word ids (hideouts,
 *  maps) and unknown shapes give null — keep the last known act instead. */
export function actFromAreaId(areaId: string | null | undefined): number | null {
  if (!areaId) return null
  const m = /^(\d+)_/.exec(areaId)
  if (!m) return null
  const act = Number(m[1])
  return act >= 1 && act <= 10 ? act : null
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
export function acquisitionsForStage(
  profile: Profile,
  stageIndex: number,
  gems?: GemData,
  currentAct?: number | null
): Acquisitions {
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
  // Owner-specified priority: cost tier, then act (1→10), then alphabet.
  rewards.sort(acquisitionOrder)
  purchases.sort(acquisitionOrder)
  other.sort(acquisitionOrder)
  const upcoming = upcomingRewards(profile, stageIndex, used, gems, currentAct)
  upcoming.sort(acquisitionOrder)
  const rewardGroups = buildRewardGroups(rewards, upcoming)
  return { rewards, purchases, other, upcoming, rewardGroups }
}

/** Cheapest first, then earliest act, then alphabetical (owner priority).
 *  Quest rewards have no cost so they order by act — the order you meet them. */
function acquisitionOrder(a: AcquisitionEntry, b: AcquisitionEntry): number {
  return (
    costRank(a.cost) - costRank(b.cost) ||
    (a.act ?? 99) - (b.act ?? 99) ||
    a.gem.localeCompare(b.gem)
  )
}

/** Group reward + upcoming gems by the quest that offers them. A quest reward
 *  is ONE pick in game, so a group with several of your gems is a choice —
 *  take one, buy the rest (owner feedback). Singleton groups are plain "take it". */
function buildRewardGroups(rewards: AcquisitionEntry[], upcoming: AcquisitionEntry[]): RewardGroup[] {
  const byQuest = new Map<string, AcquisitionEntry[]>()
  const order: string[] = []
  for (const e of [...rewards, ...upcoming]) {
    // Rewards without a quest name can't be a shared choice — keep them separate.
    const key = e.quest ? `${e.act ?? '?'}|${e.quest.toLowerCase()}` : `__solo__${e.gem.toLowerCase()}`
    if (!byQuest.has(key)) {
      byQuest.set(key, [])
      order.push(key)
    }
    byQuest.get(key)!.push(e)
  }
  const groups = order.map((key): RewardGroup => {
    const gems = byQuest.get(key)!.slice().sort(acquisitionOrder)
    return { quest: gems[0].quest, act: gems[0].act, pickOne: gems.length > 1, gems }
  })
  // Choices first (they need a decision), then by act, then quest name.
  return groups.sort(
    (a, b) =>
      Number(b.pickOne) - Number(a.pickOne) ||
      (a.act ?? 99) - (b.act ?? 99) ||
      (a.quest ?? '').localeCompare(b.quest ?? '')
  )
}

/** Gems first used in LATER stages that a quest rewards this class — worth
 *  grabbing the moment the quest offers them (free beats buying later). Only
 *  quests up to the CURRENT act are listed (an Act 3 reward is noise while you
 *  stand in Act 1 — owner feedback); unknown act = no filter. */
function upcomingRewards(
  profile: Profile,
  stageIndex: number,
  activeGems: Set<string>,
  gems?: GemData,
  currentAct?: number | null
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
        if (acq.bucket !== 'reward') continue
        if (currentAct != null && acq.act != null && acq.act > currentAct) continue
        out.push({ ...acq, fromLevel: st.range[0] })
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
  const cost = vendorCostFor(gems?.info(entry.gem)?.requiredLevel)
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
      note: authored.note,
      cost: bucket === 'purchase' ? cost : undefined
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
      fallback: src.fallback,
      cost: src.kind === 'vendor' ? cost : undefined
    }
  }
  return { gem: entry.gem, count: entry.count, bucket: 'other' }
}
