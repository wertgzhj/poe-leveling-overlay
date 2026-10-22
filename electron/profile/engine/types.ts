// Part of the build-profile engine (see ../engine.ts). The shapes the engine produces: resolved stages, acquisition entries, reward
// groups, the plan.

import { type ColoredGem } from '../gems.ts'
import { type MuleChoice, type MuleHow } from './mule.ts'

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
  /** the gem you chose to mule, and the classes whose fresh character hands it
   *  over on the Twilight Strand (see muleOptions). */
  mule?: string[]
  /** how that mule gets it: it starts with it, takes it as Hillock's reward, or
   *  buys it from Nessa. Decides whether the mule is free. */
  muleHow?: MuleHow
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
  /** set on one row standing for several gems that lost the same quest pick:
   *  buy the ones you didn't take. `gem` then reads "A or B", and `count` is
   *  how many of them to buy. */
  anyOf?: { gem: string; colored?: ColoredGem }[]
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
  /** how each of this stage's gems sits against the act you've reached, keyed
   *  by lowercased name (see LinkMark); a gem with no mark is left plain. */
  linkMarks: Record<string, LinkMark>
  /** this stage's gems that the previous stage's links don't have, lowercased:
   *  what changed. Every gem, whatever its act or source, on every stage you
   *  look at — and none on the first stage, which has nothing to compare with.
   *  By name: a gem that only moves to another link hasn't changed. */
  newGems: string[]
}

/**
 * A link row's act state, from where the gem comes from and how far you are:
 *
 * - `thisAct`: you get it in the act you're in — the gems this act is for.
 * - `notYet`: from an act you haven't reached (or Siosa before the Library).
 *
 * Earlier-act gems, starting gems and the mule have none. Whether a gem is new
 * to this stage is a separate question (Acquisitions.newGems): the two stack.
 */
export type LinkMark = 'thisAct' | 'notYet'

export interface RewardGroup {
  quest?: string
  act?: number
  /** several gems from the same quest reward — the player must choose one. */
  pickOne: boolean
  /** which of a quest's two rewards this is, for the quests that give two
   *  (see TWO_REWARD_QUESTS); absent for every other quest. */
  slot?: 'support' | 'skill'
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

/** What the app knows about the player, beyond the profile itself. Passed as one
 *  object because these are independent optional refinements — as positional
 *  arguments they were easy to line up wrong (and one of them, the current act,
 *  turned out to be the wrong signal entirely). */
export interface AcquisitionContext {
  /** Normalized gems the profile's class already owns at level 1. */
  startingGems?: ReadonlySet<string>
  /** Tracked character level — drives the now/coming-up split. */
  playerLevel?: number | null
  /** The furthest campaign act this character has reached. Entries from beyond
   *  it are dropped from the plan: at level 2 in Act 1, an Act 4 quest choice is
   *  not a preview, it is six hours of noise. null = unknown, show everything. */
  actReached?: number | null
  /** Whether this character has been to Act 3's Library. Siosa is gated on it
   *  separately from the act — see LIBRARY_VENDOR. null/undefined = unknown. */
  reachedLibrary?: boolean | null
  /**
   * The one gem you mule on this character, and the classes that can hand it
   * over (see muleOptions). null/undefined = no mule: every gem comes from its
   * quest or its vendor. Whether rolling an alt is worth it — in a party, say —
   * is the player's call, so this is chosen per character, never assumed.
   */
  mule?: MuleChoice | null
}
