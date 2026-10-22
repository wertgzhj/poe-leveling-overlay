// Part of the build-profile engine (see ../engine.ts). Quest rewards: one pick per quest, what a pick leaves to buy, and what
// later stages will want from quests you pass now.

import { costRank, vendorCostFor, type GemData, type GemSourceInfo } from '../gems.ts'
import { type CharClass, type GemPlanEntry, type Profile } from '../profile.ts'
import { acquisitionOrder, classify } from './classify.ts'
import { type AcquisitionEntry, type RewardGroup } from './types.ts'

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

/**
 * What a quest pick left you to buy, one row per pick: the quest handed over
 * one of its gems and you buy the rest — "Leap Slam or Intimidating Cry", not
 * two rows that read as two purchases. Gems sold by different vendors can't
 * share a row; they stay one row each, each saying it may be the one you took.
 */
export function owedFromPicks(
  groups: RewardGroup[],
  owed: ReadonlySet<string>,
  gems?: GemData,
  cls?: CharClass
): AcquisitionEntry[] {
  const out: AcquisitionEntry[] = []
  for (const group of groups) {
    if (!group.pickOne) continue
    const current = group.gems.filter((e) => !e.fromLevel)
    const buys = current
      .filter((e) => owed.has(e.gem.toLowerCase()))
      .map((e) => asPurchase(e, gems, cls))
      .filter((e): e is AcquisitionEntry => e !== null)
    if (buys.length === 0) continue
    const oneShop = buys.every((e) => e.npc === buys[0].npc && e.act === buys[0].act)
    if (buys.length === 1 || !oneShop) {
      out.push(...buys)
      continue
    }
    // Every gem of the pick is here, so the quest gave you one of them.
    const count = buys.length - (buys.length === current.length ? 1 : 0)
    const priciest = buys.reduce((a, b) => (costRank(b.cost) > costRank(a.cost) ? b : a))
    out.push({
      ...buys[0],
      gem: buys.map((e) => e.gem).join(' or '),
      count,
      cost: priciest.cost,
      requiredLevel: Math.min(...buys.map((e) => e.requiredLevel ?? 1)),
      anyOf: buys.map((e) => ({ gem: e.gem, colored: e.colored }))
    })
  }
  return out
}

/** Group reward + upcoming gems by the quest that offers them. A quest reward
 *  is ONE pick in game, so a group with several of your gems is a choice —
 *  take one, buy the rest. Singleton groups are plain "take it". */
/**
 * Quests that hand out TWO rewards — a support gem and a skill gem, each its own
 * pick — where every other quest hands out one.
 *
 * The wiki lists both under the one quest name, so the data alone can't tell
 * them apart, and the tab made one "pick one" box of all nine of The Caged
 * Brute's gems: take Faster Attacks or Leap Slam, buy the rest. In the game you
 * get both. Confirmed in game for The Caged Brute; checked against the data, it
 * is the only quest whose reward list mixes supports and skills for every
 * class. (The Eternal Nightmare mixes them for the Templar only, and that's one
 * window: Arcanist Brand is a skill gem that sits among the supports.)
 *
 * Keyed by quest name, lowercased. Add a quest here only once its two windows
 * have been seen in game.
 */
const TWO_REWARD_QUESTS: ReadonlySet<string> = new Set(['the caged brute'])

/** Which of a two-reward quest's picks a gem belongs to; undefined otherwise. */
function rewardSlot(e: AcquisitionEntry, gemData?: GemData): RewardGroup['slot'] {
  if (!e.quest || !TWO_REWARD_QUESTS.has(e.quest.toLowerCase())) return undefined
  // The gem data decides: a PoB profile spells supports without " Support".
  const support = gemData?.isSupport(e.gem) ?? /\sSupport$/i.test(e.gem)
  return support ? 'support' : 'skill'
}

export function buildRewardGroups(
  rewards: AcquisitionEntry[],
  upcoming: AcquisitionEntry[],
  gemData?: GemData,
  cls?: CharClass
): RewardGroup[] {
  const byQuest = new Map<string, AcquisitionEntry[]>()
  const order: string[] = []
  for (const e of [...rewards, ...upcoming]) {
    // Rewards without a quest name can't be a shared choice — keep them separate.
    const slot = rewardSlot(e, gemData)
    const key = e.quest
      ? `${e.act ?? '?'}|${e.quest.toLowerCase()}${slot ? `|${slot}` : ''}`
      : `__solo__${e.gem.toLowerCase()}`
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
      slot: rewardSlot(gems[0], gemData),
      gems,
      buyRest: gems.length > 1 ? buyRest(gems, gemData, cls) : undefined
    }
  })
  // Choices first (they need a decision), then by act, then quest name.
  // Chronological: act, then where the quest sits within that act (derived rank),
  // then name. Choices are no longer hoisted to the top — the gold "Pick one"
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
export function buyRest(
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
export function groupQuestRank(group: RewardGroup): number {
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
export function upcomingRewards(
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
