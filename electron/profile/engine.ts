// Pure build-profile engine (no Electron imports — unit-tested). Picks the
// active stage for the current level, colours its socket groups, and derives
// acquisition views (reward picks / vendor shopping list) from the gemPlan.

import type { Profile, Stage, CharClass, GemSource, GemPlanEntry } from './profile.ts'
import {
  GemData,
  vendorCostFor,
  costRank,
  safeLevelRange,
  normalizeGemName,
  needsLibrary,
  type ColoredGem,
  type GemSourceInfo
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
  /** other classes that START with this gem: roll a level-1 mule of one of them
   *  and stash its two starting gems instead of buying this. */
  mule?: string[]
  /** the gem's level requirement (gems.json) — drives the now/coming-up split. */
  requiredLevel?: number
  /** where this entry's quest falls within its act (lower = earlier), so the
   *  to-do list reads in the order you actually reach things. */
  questRank?: number
  /** the gem's socket colour, so the to-do list can show the same pip the link
   *  rows do. Absent only when gems.json failed to load. */
  colored?: ColoredGem
  /** a purchase only because a quest choice went the other way — you may
   *  already own it. Listed anyway: nothing in the log says which you picked. */
  fromPickOne?: boolean
}

export interface Acquisitions {
  /** gems taken as quest rewards. */
  rewards: AcquisitionEntry[]
  /** gems bought from a vendor. */
  purchases: AcquisitionEntry[]
  /** drop-only, unobtainable en route, or source unknown. */
  other: AcquisitionEntry[]
  /** quest-reward gems that LATER stages need — take them when a quest offers
   *  them now instead of paying a vendor later. */
  upcoming: AcquisitionEntry[]
  /** rewards + upcoming grouped by quest. A quest reward is ONE pick in game —
   *  a group with several gems is a player choice (take one, buy the rest). */
  rewardGroups: RewardGroup[]
  /** one chronological to-do list: reward-picks and vendor-buys interleaved by
   *  the act you reach them in, rewards first on ties so you never pay for a
   *  gem you could take free. */
  plan: AcquisitionItem[]
}

export interface RewardGroup {
  quest?: string
  act?: number
  /** several gems from the same quest reward — the player must choose one. */
  pickOne: boolean
  gems: AcquisitionEntry[]
  /** the copies you DON'T get free, what the dearest of them costs, and where
   *  you can buy them. Only set on a pickOne group — see buyRest(). */
  buyRest?: {
    count: number
    cost?: string
    /** the vendor by whom all of them are available. */
    act?: number
    npc?: string
    /** at least one of them isn't sold by any vendor we know of. */
    partial?: boolean
  }
}

/** A shopping trip a purchase belongs to. `label` is the fallback text; `npc`
 *  lets the renderer name it its own way. */
export interface ShoppingStop {
  key: string
  label: string
  act?: number
  npc?: string
}

/** A single line in the acquisition to-do list — either a quest-reward group
 *  (one in-game pick, possibly a choice between several of your gems) or a
 *  single vendor purchase. */
export type AcquisitionItem = (
  | { kind: 'reward'; group: RewardGroup }
  | { kind: 'buy'; entry: AcquisitionEntry; stop?: ShoppingStop }
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

/** Manual stage paging for the Gems tab, for when a gem from an earlier level
 *  range was missed and needs looking up. Given the currently
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

/** What the app knows about the player, beyond the profile itself. Passed as one
 *  object because these are independent optional refinements — as positional
 *  arguments they were easy to line up wrong (and one of them, the current act,
 *  turned out to be the wrong signal entirely). */
export interface AcquisitionContext {
  /** Normalized gems the profile's class already owns at level 1. */
  startingGems?: ReadonlySet<string>
  /** Tracked character level — drives the now/coming-up split. */
  playerLevel?: number | null
  /** Normalized gem -> classes that start with it, for the mule hint. */
  startingOwners?: ReadonlyMap<string, string[]>
  /** The furthest campaign act this character has reached. Entries from beyond
   *  it are dropped from the plan: at level 2 in Act 1, an Act 4 quest choice is
   *  not a preview, it is six hours of noise. null = unknown, show everything. */
  actReached?: number | null
  /** Whether this character has been to Act 3's Library. Siosa is gated on it
   *  separately from the act — see LIBRARY_VENDOR. null/undefined = unknown. */
  reachedLibrary?: boolean | null
}

/**
 * The gems used by the active stage, grouped by how they're acquired — the
 * basis for the reward recommendation and the town shopping list. A gem's
 * source is the profile's authored `gemPlan.source` when present, otherwise
 * resolved live from gems.json for the profile's class, so a hand-written
 * or imported plan without sources still gets buy/reward hints where the data
 * exists.
 */
export function acquisitionsForStage(
  profile: Profile,
  stageIndex: number,
  gems?: GemData,
  ctx: AcquisitionContext = {}
): Acquisitions {
  const { startingGems, playerLevel, startingOwners, actReached, reachedLibrary } = ctx
  const stage = profile.stages[stageIndex]
  const used = new Set<string>()
  // How many copies this stage needs: the same gem in two different links means
  // you must own TWO of it, so the to-do list has to say so.
  const copies = new Map<string, number>()
  if (stage) {
    for (const g of stage.socketGroups) {
      for (const gem of g.gems) {
        const key = gem.toLowerCase()
        used.add(key)
        copies.set(key, (copies.get(key) ?? 0) + 1)
      }
    }
  }

  // Gems already required (socketed) in the PREVIOUS stage are assumed acquired,
  // so they're dropped from this stage's to-do plan — don't repeat what you've
  // already handled. Advance-buys are exempt automatically:
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
    const acq = classify(entry, profile.meta.class, gems, startingGems, startingOwners)
    // The stage's socket groups are the truth for how many you need.
    const needed = copies.get(entry.gem.toLowerCase())
    if (needed != null && needed > (acq.count ?? 1)) acq.count = needed
    if (acq.bucket === 'reward') rewards.push(acq)
    else if (acq.bucket === 'purchase') purchases.push(acq)
    else other.push(acq)
  }
  // Owner-specified priority: cost tier, then act (1→10), then alphabet.
  rewards.sort(acquisitionOrder)
  purchases.sort(acquisitionOrder)
  other.sort(acquisitionOrder)
  // One lookup table for the plan, instead of a linear scan per gem per stage.
  const planByGem = new Map<string, GemPlanEntry>()
  for (const entry of profile.gemPlan) planByGem.set(entry.gem.toLowerCase(), entry)

  const upcoming = upcomingRewards(profile, stageIndex, used, planByGem, gems, startingGems, startingOwners)
  upcoming.sort(acquisitionOrder)
  const rewardGroups = buildRewardGroups(rewards, upcoming, gems, profile.meta.class)

  // Deduping against the previous stage assumes you dealt with it there. That
  // holds for a lone reward or a plain buy — and NOT for a gem from a quest that
  // offered several of yours: the quest hands over exactly one, so the rest are
  // still purchases, and nothing in a log tells us which you took. Dropping them
  // silently is why Cold Snap and Controlled Destruction vanished from the list
  // the moment their stage rolled over, never to be mentioned again.
  //
  // So they carry forward as buys instead, with the vendor who has them.
  const pickOne = new Set(
    rewardGroups
      .filter((g) => g.pickOne)
      .flatMap((g) => g.gems.map((e) => e.gem.toLowerCase()))
  )
  const stillOwed = rewards
    .filter((e) => !isNewThisStage(e) && pickOne.has(e.gem.toLowerCase()))
    .map((e) => asPurchase(e, gems, profile.meta.class))
    .filter((e): e is AcquisitionEntry => e !== null)

  // Only the to-do plan is deduped against the previous stage; rewardGroups and
  // the reward/purchase lists (which drive the link-overview tags) stay full.
  const plan = buildPlan(
    buildRewardGroups(rewards.filter(isNewThisStage), upcoming, gems, profile.meta.class),
    [...purchases.filter(isNewThisStage), ...stillOwed],
    playerLevel,
    actReached,
    reachedLibrary
  )
  return { rewards, purchases, other, upcoming, rewardGroups, plan }
}

/** Merge the reward groups and vendor buys into one ordered to-do list. Ordered
 *  by the act you reach each in (the order you play through them); when a reward
 *  and a buy land in the same act the reward comes first, so you take the free
 *  gem before spending on the vendor one. Relies on a stable
 *  sort to keep the reward groups' choices-first order and the buys'
 *  cheapest-first order intact within a single act. */
function buildPlan(
  rewardGroups: RewardGroup[],
  purchases: AcquisitionEntry[],
  playerLevel?: number | null,
  actReached?: number | null,
  reachedLibrary?: boolean | null
): AcquisitionItem[] {
  const minReq = (entries: AcquisitionEntry[]): number | undefined => {
    const levels = entries.map((e) => e.requiredLevel).filter((l): l is number => l != null)
    return levels.length ? Math.min(...levels) : undefined
  }
  type Raw = ({ kind: 'reward'; group: RewardGroup } | { kind: 'buy'; entry: AcquisitionEntry }) & {
    req?: number
  }
  // Acts you haven't reached are dropped, not dimmed. The list is a to-do list,
  // and an Act 4 quest choice at level 2 is not something you can do — it was
  // six greyed-out boxes between you and the two gems you can actually pick up.
  // Anything whose source names no act stays: we can't place it, so we can't
  // rule it out either. Unknown progress likewise shows everything — never
  // blank the list because a signal is missing.
  const reachable = (act: number | undefined): boolean =>
    actReached == null || act == null || act <= actReached
  // Siosa is gated on the Library rather than on Act 3 — walking into the act
  // doesn't reach him, walking into that zone does. Unknown stays visible.
  const shoppable = (entry: AcquisitionEntry): boolean =>
    reachable(entry.act) && (reachedLibrary !== false || !needsLibrary(entry.npc))
  const raw: Raw[] = [
    ...rewardGroups
      .filter((group) => reachable(group.act))
      .map((group): Raw => ({ kind: 'reward', group, req: minReq(group.gems) })),
    ...purchases
      .filter(shoppable)
      .map((entry): Raw => ({ kind: 'buy', entry, req: entry.requiredLevel }))
  ]
  // Muling comes first, whatever act the gem's vendor sits in. You roll the alt,
  // stash its two starting gems and delete it before you take a step on the real
  // character — it is the one item on this list that isn't part of the run.
  const muleFirst = (it: Raw): number => (it.kind === 'buy' && it.entry.mule?.length ? 0 : 1)
  // Order by the act you reach each in, reward-first on ties (unchanged).
  const actOf = (it: Raw): number => (it.kind === 'reward' ? it.group.act : it.entry.act) ?? 99
  const rewardFirst = (it: Raw): number => (it.kind === 'reward' ? 0 : 1)
  // Within an act, follow the quest order you actually play (derived rank), so
  // an "Enemy at the Gate" pick sits above a "Caged Brute" one. Rewards still
  // beat buys at the same point (never pay for what a quest hands over), and
  // cost/name break any remaining tie.
  const questOf = (it: Raw): number =>
    it.kind === 'reward' ? groupQuestRank(it.group) : (it.entry.questRank ?? Number.MAX_SAFE_INTEGER)
  const costOf = (it: Raw): number => (it.kind === 'buy' ? costRank(it.entry.cost) : 0)
  const nameOf = (it: Raw): string =>
    it.kind === 'reward' ? (it.group.gems[0]?.gem ?? '') : it.entry.gem
  raw.sort(
    (a, b) =>
      muleFirst(a) - muleFirst(b) ||
      actOf(a) - actOf(b) ||
      questOf(a) - questOf(b) ||
      rewardFirst(a) - rewardFirst(b) ||
      costOf(a) - costOf(b) ||
      nameOf(a).localeCompare(nameOf(b))
  )
  // Nothing is filtered out: act-based hiding vanished too much,
  // and act detection is unreliable). Instead a gem more than the XP safe-range
  // above your level is flagged "later" — the UI dims it and shows the level it
  // comes online. Unknown player level = everything shown as now.
  const range = playerLevel != null ? safeLevelRange(playerLevel) : null
  return raw.map((it): AcquisitionItem => {
    const later = range != null && it.req != null && it.req > (playerLevel as number) + range
    return it.kind === 'reward'
      ? { kind: 'reward', group: it.group, later, atLevel: it.req }
      : { kind: 'buy', entry: it.entry, later, atLevel: it.req, stop: shoppingStop(it.entry) }
  })
}

/**
 * The shopping trip a purchase belongs to: an act and an NPC. Rewards get none —
 * you pick those up as you go, they aren't a stop you stand at.
 *
 * A vendor recurs, because their stock grows with each quest you finish, so the
 * same NPC legitimately heads more than one block. That's not a duplicate label:
 * it is two visits, which is what actually happens.
 */
function shoppingStop(entry: AcquisitionEntry): ShoppingStop | undefined {
  if (entry.mule?.length) return { key: 'mule', label: 'Roll a mule first' }
  if (entry.bucket !== 'purchase' || !entry.npc) return undefined
  const where = entry.act ? `A${entry.act} · ${entry.npc}` : entry.npc
  return {
    // The unlock quest is part of the key, not the label: it splits the visits
    // apart without spending a line on a quest name nobody needs to read here.
    key: `${where}|${entry.quest ?? ''}`,
    label: where,
    // Handed over separately so the renderer can rename the vendor (Siosa reads
    // as "Library" — it's the trip, not the man) without parsing the label back.
    act: entry.act,
    npc: entry.npc
  }
}

/**
 * Re-file a quest reward as the purchase it has become. Used for the losers of
 * a "pick one": the quest is behind you and gave you one gem, so the others are
 * shopping now. Null when no vendor sells it — then there is nothing useful to
 * say, and inventing a shop would be worse than staying quiet.
 */
function asPurchase(
  e: AcquisitionEntry,
  gems?: GemData,
  cls?: CharClass
): AcquisitionEntry | null {
  const vendor = gems?.earliestVendor(e.gem, cls)
  if (!vendor) return null
  return {
    ...e,
    bucket: 'purchase',
    act: vendor.act,
    npc: vendor.npc,
    quest: vendor.quest,
    note: undefined,
    fallback: vendor.fallback,
    cost: vendorCostFor(e.requiredLevel),
    questRank: gems?.questRank(vendor.act, vendor.quest),
    // You may well have picked this one. The row has to say so, or it reads as
    // "go buy this" for a gem already in your inventory.
    fromPickOne: true
  }
}

/** Cheapest first, then earliest act, then alphabetical.
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
 *  take one, buy the rest. Singleton groups are plain "take it". */
function buildRewardGroups(
  rewards: AcquisitionEntry[],
  upcoming: AcquisitionEntry[],
  gemData?: GemData,
  cls?: CharClass
): RewardGroup[] {
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
    // Earliest need first: within one quest's choice, a gem you slot at 32 beats
    // one you slot at 62, because it covers a need you actually have soon.
    // Entries without a fromLevel are wanted right now, so they lead.
    const gems = byQuest
      .get(key)!
      .slice()
      .sort((a, b) => (a.fromLevel ?? 0) - (b.fromLevel ?? 0) || acquisitionOrder(a, b))
    return {
      quest: gems[0].quest,
      act: gems[0].act,
      pickOne: gems.length > 1,
      gems,
      buyRest: gems.length > 1 ? buyRest(gems, gemData, cls) : undefined
    }
  })
  // Choices first (they need a decision), then by act, then quest name.
  // Chronological: act, then where the quest sits within that act (derived rank),
  // then name. Choices are no longer hoisted to the top — the amber "Pick one"
  // box already makes them stand out, and reading order should match play order.
  return groups.sort(
    (a, b) =>
      (a.act ?? 99) - (b.act ?? 99) ||
      groupQuestRank(a) - groupQuestRank(b) ||
      (a.quest ?? '').localeCompare(b.quest ?? '')
  )
}

/**
 * What a "pick one" group actually costs you. The quest hands out exactly ONE
 * gem, so every other copy your build needs is a vendor purchase: for a group of
 * four golems that's three buys, not four.
 *
 * Copies count, not gems — a gem the build needs twice is one extra buy. And the
 * free pick is assumed to be the dearest of them, because that's what anyone
 * would take; the price quoted is the dearest of what's left, so the number is
 * never an underestimate of a single purchase.
 */
function buyRest(
  gems: AcquisitionEntry[],
  gemData?: GemData,
  cls?: CharClass
): RewardGroup['buyRest'] {
  const copies = gems.reduce((n, g) => n + (g.count ?? 1), 0)
  if (copies < 2) return undefined
  // Cheapest first, so dropping the last one drops the free pick.
  const tiers = gems
    .flatMap((g) => Array<string | undefined>((g.count ?? 1)).fill(vendorCostFor(g.requiredLevel)))
    .sort((a, b) => costRank(a) - costRank(b))
  tiers.pop()

  // Where you actually buy them. Every gem here is filed as a quest reward,
  // because a quest is its earliest source — so nothing ever put it on the
  // shopping list, and "buy the rest" was an instruction with no address. The
  // answer is the point by which a vendor sells ALL of them: the latest of
  // their earliest vendors, since anything sooner leaves one behind.
  let at: GemSourceInfo | null = null
  let missing = false
  for (const g of gems) {
    const vendor = gemData?.earliestVendor(g.gem, cls) ?? null
    if (!vendor) {
      missing = true
      continue
    }
    if (!at || vendor.act > at.act) at = vendor
  }
  return {
    count: copies - 1,
    cost: tiers[tiers.length - 1],
    act: at?.act,
    npc: at?.npc,
    // One of them isn't sold anywhere we know of — say so rather than let the
    // named vendor imply he stocks the lot.
    partial: missing || undefined
  }
}

/** A group's place in its act = the earliest rank among its gems. */
function groupQuestRank(group: RewardGroup): number {
  let best = Number.MAX_SAFE_INTEGER
  for (const g of group.gems) best = Math.min(best, g.questRank ?? Number.MAX_SAFE_INTEGER)
  return best
}

/** Gems first used in LATER stages that a quest rewards this class — worth
 *  grabbing the moment the quest offers them (free beats buying later).
 *
 *  Nothing is dropped by act. Act detection needs a numeric area id and lags
 *  behind reality, and hiding an Act 3 reward while you stand in Act 1 was one
 *  of the ways gems went missing from the list — "dim, don't hide" (owner).
 *  `buildPlan` dims what your level can't use yet, which is the signal we can
 *  actually track. */
function upcomingRewards(
  profile: Profile,
  stageIndex: number,
  activeGems: Set<string>,
  planByGem: ReadonlyMap<string, GemPlanEntry>,
  gems?: GemData,
  startingGems?: ReadonlySet<string>,
  startingOwners?: ReadonlyMap<string, string[]>
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
        const planned = planByGem.get(key)
        const acq = classify(planned ?? { gem }, profile.meta.class, gems, startingGems, startingOwners)
        if (acq.bucket !== 'reward') continue
        out.push({ ...acq, fromLevel: st.range[0] })
      }
    }
  }
  return out
}

// Everything the acquisition list needs about one gem: where it comes from, plus
// the socket colour. The colour is resolved here rather than in the renderer so
// it comes from the same place as the pips on the link rows — including for
// gems a later stage needs, which aren't in the current stage's socket groups
// and so can't be looked up there at all.
function classify(
  entry: { gem: string; count?: number; source?: GemSource },
  cls: CharClass,
  gems?: GemData,
  startingGems?: ReadonlySet<string>,
  startingOwners?: ReadonlyMap<string, string[]>
): AcquisitionEntry {
  const acq = classifySource(entry, cls, gems, startingGems, startingOwners)
  if (gems) acq.colored = gems.color(entry.gem)
  return acq
}

function classifySource(
  entry: { gem: string; count?: number; source?: GemSource },
  cls: CharClass,
  gems?: GemData,
  startingGems?: ReadonlySet<string>,
  startingOwners?: ReadonlyMap<string, string[]>
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
  // Muling: another class BEGINS with this gem, so a level-1 alt of that class
  // hands it over for free (its skill + support gem are in its inventory at
  // creation) — no quest, no vendor. Only classes other than yours qualify.
  const mule = startingOwners?.get(normalizeGemName(entry.gem))?.filter((c) => c !== cls)
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
      requiredLevel,
      mule: mule?.length ? mule : undefined,
      questRank: gems?.questRank(authored.act, authored.questId)
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
      requiredLevel,
      mule: mule?.length ? mule : undefined,
      questRank: gems?.questRank(src.act, src.quest)
    }
  }
  return {
    gem: entry.gem,
    count: entry.count,
    bucket: 'other',
    requiredLevel,
    mule: mule?.length ? mule : undefined
  }
}
