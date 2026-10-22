// Part of the build-profile engine (see ../engine.ts). One stage's acquisitions: everything the Gems tab shows for it.

import { needsLibrary, normalizeGemName, type GemData } from '../gems.ts'
import { type GemPlanEntry, type Profile } from '../profile.ts'
import { acquisitionOrder, classify } from './classify.ts'
import { MULE_TRIP_LAST_START } from './mule.ts'
import { buildPlan } from './plan.ts'
import { buildRewardGroups, owedFromPicks, upcomingRewards } from './rewards.ts'
import { type AcquisitionContext, type AcquisitionEntry, type Acquisitions, type LinkMark } from './types.ts'

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
  const { startingGems, playerLevel, actReached, reachedLibrary, mule } = ctx
  // The mule lookup classify() reads, holding only the one gem you chose — so
  // every other gem a different class could hand you stays a quest or a buy,
  // and the plan never sends you off to roll two alts.
  const startingOwners = mule
    ? new Map([[normalizeGemName(mule.gem), mule.classes]])
    : undefined
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
    // A gem you mule leaves the quest's pick: it's yours before the quest, and
    // the pick goes to the next gem you want from it — on a Marauder, Mercy
    // Mission hands over Chance to Bleed instead of the Momentum a Ranger alt
    // already gave you. It lands with the mule trip, still saying what the quest
    // would have been (see sourceMark).
    if (acq.bucket === 'reward' && acq.mule?.length) purchases.push(acq)
    else if (acq.bucket === 'reward') rewards.push(acq)
    else if (acq.bucket === 'purchase') purchases.push(acq)
    else other.push(acq)
  }
  // You mule once, before the run — not when the gem's stage comes round, and
  // not again on every stage until then. So the trip sits on the stages of the
  // run's first levels (see MULE_TRIP_LAST_START), even for a gem the build
  // slots much later — by level, not by "the first stage", because a profile
  // may well slice levels 1-4 into two stages.
  const muleTrip =
    !!mule && (stageIndex === 0 || (stage != null && stage.range[0] <= MULE_TRIP_LAST_START))
  if (mule && muleTrip) {
    const key = normalizeGemName(mule.gem)
    const firstUse = profile.stages.findIndex((s) =>
      s.socketGroups.some((g) => g.gems.some((gem) => normalizeGemName(gem) === key))
    )
    const listed = [...rewards, ...purchases, ...other].some((e) => normalizeGemName(e.gem) === key)
    if (firstUse > stageIndex && !listed) {
      const planned = profile.gemPlan.find((e) => normalizeGemName(e.gem) === key)
      const acq = classify(planned ?? { gem: mule.gem }, profile.meta.class, gems, startingGems, startingOwners)
      if (acq.mule?.length) purchases.push(acq)
    }
  }

  // Owner-specified priority: cost tier, then act (1→10), then alphabet.
  rewards.sort(acquisitionOrder)
  purchases.sort(acquisitionOrder)
  other.sort(acquisitionOrder)
  // One lookup table for the plan, instead of a linear scan per gem per stage.
  const planByGem = new Map<string, GemPlanEntry>()
  for (const entry of profile.gemPlan) planByGem.set(entry.gem.toLowerCase(), entry)

  // A gem you'll mule isn't an upcoming quest pick either; it joins the mule
  // trip when its stage comes round.
  const upcoming = upcomingRewards(profile, stageIndex, used, planByGem, gems, startingGems, startingOwners).filter(
    (e) => !e.mule?.length
  )
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
  //
  // Once, though: on the stage right after the pick, not on every stage after
  // it. One stage later you've either bought it or decided not to, and a row
  // that never leaves is a row nobody reads.
  const twoBack = new Set<string>()
  if (stageIndex > 1) {
    const s2 = profile.stages[stageIndex - 2]
    if (s2) for (const g of s2.socketGroups) for (const gem of g.gems) twoBack.add(gem.toLowerCase())
  }
  const justPicked = new Set(
    rewards
      .filter((e) => !isNewThisStage(e) && !twoBack.has(e.gem.toLowerCase()) && pickOne.has(e.gem.toLowerCase()))
      .map((e) => e.gem.toLowerCase())
  )
  const stillOwed = owedFromPicks(rewardGroups, justPicked, gems, profile.meta.class)

  // Only the to-do plan is deduped against the previous stage; rewardGroups and
  // the reward/purchase lists (which drive the link-overview tags) stay full.
  const plan = buildPlan(
    buildRewardGroups(rewards.filter(isNewThisStage), upcoming, gems, profile.meta.class),
    // The mule trip belongs to the early stages — each of them, even when the
    // one before already slotted the gem; past them, the gem is already yours.
    [...purchases.filter((e) => (e.mule?.length ? muleTrip : isNewThisStage(e))), ...stillOwed],
    playerLevel,
    actReached,
    reachedLibrary
  )
  // Say how the mule gets it wherever the gem is listed, so the instruction is
  // right for a Nessa buy as much as for a starting gem.
  if (mule?.how) {
    const key = normalizeGemName(mule.gem)
    for (const e of [...rewards, ...purchases, ...other, ...upcoming]) {
      if (e.mule?.length && normalizeGemName(e.gem) === key) e.muleHow = mule.how
    }
  }
  const linkMarks: Record<string, LinkMark> = {}
  if (actReached != null) {
    for (const e of [...rewards, ...purchases, ...other]) {
      if (e.starting || e.mule?.length || e.act == null) continue
      const key = e.gem.toLowerCase()
      const pastLibrary = reachedLibrary !== false || !needsLibrary(e.npc)
      if (e.act > actReached || (e.act === actReached && !pastLibrary)) linkMarks[key] = 'notYet'
      else if (e.act === actReached) linkMarks[key] = 'thisAct'
    }
  }
  const newGems = stageIndex > 0 ? [...used].filter((g) => !prevGems.has(g)) : []
  return { rewards, purchases, other, upcoming, rewardGroups, plan, linkMarks, newGems }
}
