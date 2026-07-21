// Pure build-profile engine (no Electron imports — unit-tested). Picks the
// active stage for the current level, colours its socket groups, and derives
// acquisition views (reward picks / vendor shopping list) from the gemPlan.

import type { Profile, Stage, CharClass, GemSource } from './profile.ts'
import {
  GemData,
  vendorCostFor,
  costRank,
  safeLevelRange,
  normalizeGemName,
  type ColoredGem
} from './gems.ts'

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
  /** the class's starting gem — already in inventory, so don't buy/quest it. */
  starting?: boolean
  /** the gem's level requirement (gems.json) — drives the now/coming-up split. */
  requiredLevel?: number
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
  /** one chronological to-do list: reward-picks and vendor-buys interleaved by
   *  the act you reach them in, rewards first on ties so you never pay for a
   *  gem you could take free (owner feedback — the merged Gems-tab box). */
  plan: AcquisitionItem[]
}

export interface RewardGroup {
  quest?: string
  act?: number
  /** several gems from the same quest reward — the player must choose one. */
  pickOne: boolean
  gems: AcquisitionEntry[]
}

/** A single line in the acquisition to-do list — either a quest-reward group
 *  (one in-game pick, possibly a choice between several of your gems) or a
 *  single vendor purchase. */
export type AcquisitionItem = (
  | { kind: 'reward'; group: RewardGroup }
  | { kind: 'buy'; entry: AcquisitionEntry }
) & {
  /** true when the gem is more than the XP safe-range above your level — show it
   *  dimmed as "coming up" rather than as an act-now item. */
  later: boolean
  /** the gem's (soonest) required level, for the "lvl X" coming-up tag. */
  atLevel?: number
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

/** Manual stage paging for the Gems tab (owner feedback: you may have missed a
 *  gem from an earlier level range and need to look back). Given the currently
 *  viewed index (null = follow the level), step by delta and clamp to range.
 *  Returns null when it lands back on the live stage — so it resumes auto-follow
 *  — otherwise the new index to pin. */
export function stepStageView(
  viewIndex: number | null,
  delta: number,
  liveIndex: number,
  count: number
): number | null {
  if (count <= 0) return null
  const current = viewIndex ?? liveIndex
  const next = Math.min(count - 1, Math.max(0, current + delta))
  return next === liveIndex ? null : next
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
  currentAct?: number | null,
  startingGems?: ReadonlySet<string>,
  playerLevel?: number | null
): Acquisitions {
  const stage = profile.stages[stageIndex]
  const used = new Set<string>()
  if (stage) for (const g of stage.socketGroups) for (const gem of g.gems) used.add(gem.toLowerCase())

  // Gems already required (socketed) in the PREVIOUS stage are assumed acquired,
  // so they're dropped from this stage's to-do plan — don't repeat what you've
  // already handled (owner feedback). Advance-buys are exempt automatically:
  // they were never in the previous stage's socket groups, so a gem that only
  // becomes required now still counts as new. The first stage has nothing before
  // it, and this only touches the plan — the full lists (and link tags) stay put.
  const prevGems = new Set<string>()
  if (stageIndex > 0) {
    const prev = profile.stages[stageIndex - 1]
    if (prev) for (const g of prev.socketGroups) for (const gem of g.gems) prevGems.add(gem.toLowerCase())
  }
  const isNewThisStage = (e: AcquisitionEntry): boolean => !prevGems.has(e.gem.toLowerCase())

  const rewards: AcquisitionEntry[] = []
  const purchases: AcquisitionEntry[] = []
  const other: AcquisitionEntry[] = []
  for (const entry of profile.gemPlan) {
    if (used.size > 0 && !used.has(entry.gem.toLowerCase())) continue
    const acq = classify(entry, profile.meta.class, gems, startingGems)
    if (acq.bucket === 'reward') rewards.push(acq)
    else if (acq.bucket === 'purchase') purchases.push(acq)
    else other.push(acq)
  }
  // Owner-specified priority: cost tier, then act (1→10), then alphabet.
  rewards.sort(acquisitionOrder)
  purchases.sort(acquisitionOrder)
  other.sort(acquisitionOrder)
  const upcoming = upcomingRewards(profile, stageIndex, used, gems, currentAct, startingGems)
  upcoming.sort(acquisitionOrder)
  const rewardGroups = buildRewardGroups(rewards, upcoming)
  // Only the to-do plan is deduped against the previous stage; rewardGroups and
  // the reward/purchase lists (which drive the link-overview tags) stay full.
  const plan = buildPlan(
    buildRewardGroups(rewards.filter(isNewThisStage), upcoming),
    purchases.filter(isNewThisStage),
    playerLevel
  )
  return { rewards, purchases, other, upcoming, rewardGroups, plan }
}

/** Merge the reward groups and vendor buys into one ordered to-do list. Ordered
 *  by the act you reach each in (the order you play through them); when a reward
 *  and a buy land in the same act the reward comes first, so you take the free
 *  gem before spending on the vendor one (owner feedback). Relies on a stable
 *  sort to keep the reward groups' choices-first order and the buys'
 *  cheapest-first order intact within a single act. */
function buildPlan(
  rewardGroups: RewardGroup[],
  purchases: AcquisitionEntry[],
  playerLevel?: number | null
): AcquisitionItem[] {
  const minReq = (entries: AcquisitionEntry[]): number | undefined => {
    const levels = entries.map((e) => e.requiredLevel).filter((l): l is number => l != null)
    return levels.length ? Math.min(...levels) : undefined
  }
  type Raw = ({ kind: 'reward'; group: RewardGroup } | { kind: 'buy'; entry: AcquisitionEntry }) & {
    req?: number
  }
  const raw: Raw[] = [
    ...rewardGroups.map((group): Raw => ({ kind: 'reward', group, req: minReq(group.gems) })),
    ...purchases.map((entry): Raw => ({ kind: 'buy', entry, req: entry.requiredLevel }))
  ]
  // Order by the act you reach each in, reward-first on ties (unchanged).
  const actOf = (it: Raw): number => (it.kind === 'reward' ? it.group.act : it.entry.act) ?? 99
  const rewardFirst = (it: Raw): number => (it.kind === 'reward' ? 0 : 1)
  raw.sort((a, b) => actOf(a) - actOf(b) || rewardFirst(a) - rewardFirst(b))
  // Nothing is filtered out (owner feedback: act-based hiding vanished too much,
  // and act detection is unreliable). Instead a gem more than the XP safe-range
  // above your level is flagged "later" — the UI dims it and shows the level it
  // comes online. Unknown player level = everything shown as now.
  const range = playerLevel != null ? safeLevelRange(playerLevel) : null
  return raw.map((it): AcquisitionItem => {
    const later = range != null && it.req != null && it.req > (playerLevel as number) + range
    return it.kind === 'reward'
      ? { kind: 'reward', group: it.group, later, atLevel: it.req }
      : { kind: 'buy', entry: it.entry, later, atLevel: it.req }
  })
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
  currentAct?: number | null,
  startingGems?: ReadonlySet<string>
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
        const acq = classify(planned ?? { gem }, profile.meta.class, gems, startingGems)
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
  gems?: GemData,
  startingGems?: ReadonlySet<string>
): AcquisitionEntry {
  const requiredLevel = gems?.info(entry.gem)?.requiredLevel
  // Starting gems are already in inventory — never buy or quest them.
  if (startingGems?.has(normalizeGemName(entry.gem))) {
    return {
      gem: entry.gem,
      count: entry.count,
      bucket: 'other',
      starting: true,
      note: 'you start with it',
      requiredLevel
    }
  }
  const cost = vendorCostFor(requiredLevel)
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
      cost: bucket === 'purchase' ? cost : undefined,
      requiredLevel
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
      cost: src.kind === 'vendor' ? cost : undefined,
      requiredLevel
    }
  }
  return { gem: entry.gem, count: entry.count, bucket: 'other', requiredLevel }
}
