// Part of the build-profile engine (see ../engine.ts). One stage's acquisitions: everything the Gems tab shows for it.

import { actsOfLevels } from '../acts.ts'
import { normalizeGemName, vendorCostFor, type GemData } from '../gems.ts'
import { type CharClass, type GemPlanEntry, type Profile, type Stage } from '../profile.ts'
import { acquisitionOrder, classify } from './classify.ts'
import { type MuleChoice } from './mule.ts'
import { linkChanges, stageCopies } from './links.ts'
import { buildPlan } from './plan.ts'
import { buildRewardGroups, owedFromPicks, upcomingRewards } from './rewards.ts'
import { type AcquisitionContext, type AcquisitionEntry, type Acquisitions, type LinkMark, type RewardGroup } from './types.ts'

/**
 * The gems used by the active stage, grouped by how they're acquired — the
 * basis for the reward recommendation and the town shopping list. A gem's
 * source is the profile's authored `gemPlan.source` when present, otherwise
 * resolved live from gems.json for the profile's class, so a hand-written
 * or imported plan without sources still gets buy/reward hints where the data
 * exists.
 *
 * Read top to bottom, one step each; the order matters where a later step
 * annotates entries an earlier one already placed (see markMuleHow).
 */
export function acquisitionsForStage(
  profile: Profile,
  stageIndex: number,
  gems?: GemData,
  ctx: AcquisitionContext = {}
): Acquisitions {
  const { startingGems, playerLevel, actReached, liveIndex, mule, laterRewards } = ctx
  const cls = profile.meta.class
  // The mule lookup classify() reads, holding only the one gem you chose — so
  // every other gem a different class could hand you stays a quest or a buy,
  // and the plan never sends you off to roll two alts.
  const startingOwners = mule
    ? new Map([[normalizeGemName(mule.gem), mule.classes]])
    : undefined
  const stage = profile.stages[stageIndex]
  const { used, copies } = stageGems(stage)

  // Gems already required (socketed) in the PREVIOUS stage are assumed acquired,
  // so they're dropped from this stage's to-do plan — don't repeat what you've
  // already handled. Advance-buys are exempt automatically:
  // they were never in the previous stage's socket groups, so a gem that only
  // becomes required now still counts as new. The first stage has nothing before
  // it, and this only touches the plan — the full lists (and link tags) stay put.
  const prevGems = stageIndex > 0 ? gemsOf(profile.stages[stageIndex - 1]) : new Set<string>()
  const isNewThisStage = (e: AcquisitionEntry): boolean => !prevGems.has(e.gem.toLowerCase())
  const prevCopies = stageCopies(stageIndex > 0 ? profile.stages[stageIndex - 1] : undefined)

  const { rewards, purchases, other } = sortIntoLists(profile, used, copies, gems, startingGems, startingOwners)

  // Owner-specified priority: cost tier, then act (1→10), then alphabet.
  rewards.sort(acquisitionOrder)
  purchases.sort(acquisitionOrder)
  other.sort(acquisitionOrder)
  // One lookup table for the plan, instead of a linear scan per gem per stage.
  const planByGem = new Map<string, GemPlanEntry>()
  for (const entry of profile.gemPlan) planByGem.set(entry.gem.toLowerCase(), entry)

  // A gem you'll mule isn't an upcoming quest pick either; it joins the mule
  // trip when its stage comes round. How far ahead to look is the player's
  // call: from your level, or the stage's start when you paged ahead to it.
  const ahead = laterRewards == null ? Infinity : laterRewards
  const from = Math.max(playerLevel ?? 0, stage?.range[0] ?? 0)
  const upcoming = upcomingRewards(profile, stageIndex, used, planByGem, gems, startingGems, startingOwners).filter(
    (e) => !e.mule?.length && (e.fromLevel ?? 0) <= from + ahead
  )
  upcoming.sort(acquisitionOrder)
  const rewardGroups = buildRewardGroups(rewards, upcoming, gems, cls)

  const stillOwed = leftFromLastPick(profile, stageIndex, rewards, rewardGroups, prevGems, gems, cls)

  // Only the to-do plan is deduped against the previous stage; rewardGroups and
  // the reward/purchase lists (which drive the link-overview tags) stay full.
  const acts = planWindow(stage, stageIndex, liveIndex, actReached)
  const plan = buildPlan(
    buildRewardGroups(rewards.filter(isNewThisStage), upcoming, gems, cls).filter((g) =>
      // A pick only for later stages belongs to the stages of its own act: an
      // Act 1 quest isn't on an Act 2 stage's list, however far off its gems'
      // use. A group holding one of this stage's gems is this stage's business.
      g.gems.some((e) => !e.fromLevel) || g.act == null || g.act >= acts.from
    ),
    // No mule row (owner): the choice lives in Settings, and the gem's line in
    // the links says "Mule · Ranger". The list is for what you get in the run.
    [
      ...purchases.filter((e) => !e.mule?.length && isNewThisStage(e)),
      ...moreCopies([...rewards, ...purchases, ...other], prevCopies, copies, gems, cls),
      ...stillOwed
    ],
    playerLevel,
    acts.to
  )
  markMuleHow(mule, [...rewards, ...purchases, ...other, ...upcoming])
  const linkMarks = linkMarksFor([...rewards, ...purchases, ...other], actReached)
  const changes = linkChanges(stageIndex > 0 ? profile.stages[stageIndex - 1] : undefined, stage)
  return { rewards, purchases, other, upcoming, rewardGroups, plan, linkMarks, linkChanges: changes }
}

/**
 * The acts a stage's shopping list may draw on: what you could get there, now
 * or for later. A stage's level range says which acts it covers (see acts.ts);
 * where you've been says what you can reach.
 *
 * - The live stage: everything up to the furthest act you've reached. Before
 *   any zone has said, the stage's own acts stand in.
 * - A stage you paged BACK to: what it showed when it was live — its own acts,
 *   never past where you've been. At level 38 in Act 4, the opening stage
 *   still lists Act 1 only.
 * - A stage you paged FORWARD to: a preview of everything it covers.
 *
 * `from` is the stage's first act; a pick that's only for later stages and
 * comes from an earlier act isn't listed (owner's call: once you've moved on a
 * stage, a forgotten Act 1 pick stays in the link rows, not on the list).
 */
export function planWindow(
  stage: Stage | undefined,
  stageIndex: number,
  liveIndex: number | null | undefined,
  actReached: number | null | undefined
): { from: number; to: number } {
  const [first, last] = stage ? actsOfLevels(stage.range) : [1, 10]
  let to: number
  if (liveIndex == null || stageIndex === liveIndex) to = actReached ?? last
  else if (stageIndex < liveIndex) to = Math.min(last, actReached ?? last)
  else to = Math.max(last, actReached ?? last)
  return { from: Math.min(first, to), to }
}

/** The stage's gems (lowercased), and how many copies of each it needs: the
 *  same gem in two different links means you must own TWO of it, so the to-do
 *  list has to say so. */
function stageGems(stage: Stage | undefined): { used: Set<string>; copies: Map<string, number> } {
  const used = new Set<string>()
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
  return { used, copies }
}

/** Every gem in a stage's links, lowercased; empty for no stage. */
function gemsOf(stage: Stage | undefined): Set<string> {
  const set = new Set<string>()
  if (stage) for (const g of stage.socketGroups) for (const gem of g.gems) set.add(gem.toLowerCase())
  return set
}

/** The stage's planned gems, classified into rewards, purchases and the rest. */
function sortIntoLists(
  profile: Profile,
  used: Set<string>,
  copies: Map<string, number>,
  gems: GemData | undefined,
  startingGems: ReadonlySet<string> | undefined,
  startingOwners: Map<string, string[]> | undefined
): { rewards: AcquisitionEntry[]; purchases: AcquisitionEntry[]; other: AcquisitionEntry[] } {
  const rewards: AcquisitionEntry[] = []
  const purchases: AcquisitionEntry[] = []
  const other: AcquisitionEntry[] = []
  for (const entry of profile.gemPlan) {
    if (used.size > 0 && !used.has(entry.gem.toLowerCase())) continue
    const acq = classify(entry, profile.meta.class, gems, startingGems, startingOwners)
    // The stage's socket groups are the truth for how many you need — both
    // ways. The plan's count is the most any stage needs (a PoB import writes
    // that), so taking only the larger made "2× Alt" of a gem this stage
    // slots once because a later one slots it twice.
    const needed = copies.get(entry.gem.toLowerCase())
    if (needed != null) acq.count = needed > 1 ? needed : undefined
    // A gem you mule leaves the quest's pick: it's yours before the quest, and
    // the pick goes to the next gem you want from it — on a Marauder, Mercy
    // Mission hands over Chance to Bleed instead of the Momentum a Ranger alt
    // already gave you. It's filed with the purchases, off the to-do list, and
    // its line in the links still says what the quest would have been (see
    // sourceMark).
    if (acq.bucket === 'reward' && acq.mule?.length) purchases.push(acq)
    else if (acq.bucket === 'reward') rewards.push(acq)
    else if (acq.bucket === 'purchase') purchases.push(acq)
    else other.push(acq)
  }
  return { rewards, purchases, other }
}

/**
 * The copies this stage slots beyond the previous one's, for a gem the previous
 * stage already had: a second Autoexertion. Deduping by name read "already
 * handled" and the second copy was never listed. Always a purchase — the quest
 * gave its one, a starting gem is one — from the earliest vendor, counting only
 * the extra copies. A gem nobody sells (a drop) has no row; it stays in the
 * links as NEW.
 */
function moreCopies(
  entries: readonly AcquisitionEntry[],
  before: ReadonlyMap<string, number>,
  now: ReadonlyMap<string, number>,
  gems: GemData | undefined,
  cls: CharClass
): AcquisitionEntry[] {
  const out: AcquisitionEntry[] = []
  for (const e of entries) {
    const key = e.gem.toLowerCase()
    const had = before.get(key) ?? 0
    const more = (now.get(key) ?? 0) - had
    if (had === 0 || more <= 0 || e.mule?.length) continue
    const count = more > 1 ? more : undefined
    if (e.bucket === 'purchase') {
      out.push({ ...e, count })
      continue
    }
    const vendor = gems?.earliestVendor(e.gem, cls)
    if (!vendor) continue
    out.push({
      ...e,
      bucket: 'purchase',
      count,
      starting: undefined,
      act: vendor.act,
      npc: vendor.npc,
      quest: vendor.quest,
      note: undefined,
      fallback: vendor.fallback,
      cost: vendorCostFor(e.requiredLevel),
      questRank: gems?.questRank(vendor.act, vendor.quest)
    })
  }
  return out
}

/**
 * What the previous stage's quest pick left you to buy.
 *
 * Deduping against the previous stage assumes you dealt with it there. That
 * holds for a lone reward or a plain buy — and NOT for a gem from a quest that
 * offered several of yours: the quest hands over exactly one, so the rest are
 * still purchases, and nothing in a log tells us which you took. Dropping them
 * silently is why Cold Snap and Controlled Destruction vanished from the list
 * the moment their stage rolled over, never to be mentioned again.
 *
 * So they carry forward as buys instead, with the vendor who has them. Once,
 * though: on the stage right after the pick, not on every stage after it. One
 * stage later you've either bought it or decided not to, and a row that never
 * leaves is a row nobody reads.
 */
function leftFromLastPick(
  profile: Profile,
  stageIndex: number,
  rewards: readonly AcquisitionEntry[],
  rewardGroups: RewardGroup[],
  prevGems: ReadonlySet<string>,
  gems: GemData | undefined,
  cls: CharClass
): AcquisitionEntry[] {
  const pickOne = new Set(
    rewardGroups
      .filter((g) => g.pickOne)
      .flatMap((g) => g.gems.map((e) => e.gem.toLowerCase()))
  )
  const twoBack = stageIndex > 1 ? gemsOf(profile.stages[stageIndex - 2]) : new Set<string>()
  const justPicked = new Set(
    rewards
      .filter((e) => {
        const key = e.gem.toLowerCase()
        return prevGems.has(key) && !twoBack.has(key) && pickOne.has(key)
      })
      .map((e) => e.gem.toLowerCase())
  )
  return owedFromPicks(rewardGroups, justPicked, gems, cls)
}

/** Say how the mule gets it wherever the gem is listed, so the instruction is
 *  right for a Nessa buy as much as for a starting gem. Annotates the entries
 *  in place — the plan holds the same objects, so it reads the note too. */
function markMuleHow(mule: MuleChoice | null | undefined, entries: readonly AcquisitionEntry[]): void {
  if (!mule?.how) return
  const key = normalizeGemName(mule.gem)
  for (const e of entries) {
    if (e.mule?.length && normalizeGemName(e.gem) === key) e.muleHow = mule.how
  }
}

/** Each listed gem's act state for the links (see LinkMark). None without an
 *  act; none for a starting gem, the mule, or a gem with no act. Siosa counts
 *  as Act 3 like everyone there (owner's call): the "Library" label says where
 *  to go, the act says when. */
function linkMarksFor(
  entries: readonly AcquisitionEntry[],
  actReached: number | null | undefined
): Record<string, LinkMark> {
  const marks: Record<string, LinkMark> = {}
  if (actReached == null) return marks
  for (const e of entries) {
    if (e.starting || e.mule?.length || e.act == null) continue
    const key = e.gem.toLowerCase()
    if (e.act > actReached) marks[key] = 'notYet'
    else if (e.act === actReached) marks[key] = 'thisAct'
  }
  return marks
}
