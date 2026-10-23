// Part of the build-profile engine (see ../engine.ts). The to-do list: rewards and buys merged in the order you reach them.

import { costRank, safeLevelRange } from '../gems.ts'
import { groupQuestRank } from './rewards.ts'
import { type AcquisitionEntry, type AcquisitionItem, type RewardGroup, type ShoppingStop } from './types.ts'

/** Merge the reward groups and vendor buys into one ordered to-do list. Ordered
 *  by the act you reach each in (the order you play through them); when a reward
 *  and a buy land in the same act the reward comes first, so you take the free
 *  gem before spending on the vendor one. Relies on a stable
 *  sort to keep the reward groups' choices-first order and the buys'
 *  cheapest-first order intact within a single act. */
export function buildPlan(
  rewardGroups: RewardGroup[],
  purchases: AcquisitionEntry[],
  playerLevel?: number | null,
  actReached?: number | null
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
  // Siosa counts as Act 3, like Clarissa (owner's call): the list is for what
  // you can get from the act, now or later, and he's in it.
  const shoppable = (entry: AcquisitionEntry): boolean => reachable(entry.act)
  const raw: Raw[] = [
    ...rewardGroups
      .filter((group) => reachable(group.act))
      .map((group): Raw => ({ kind: 'reward', group, req: minReq(group.gems) })),
    ...purchases
      .filter(shoppable)
      .map((entry): Raw => ({ kind: 'buy', entry, req: entry.requiredLevel }))
  ]
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
      actOf(a) - actOf(b) ||
      questOf(a) - questOf(b) ||
      rewardFirst(a) - rewardFirst(b) ||
      costOf(a) - costOf(b) ||
      nameOf(a).localeCompare(nameOf(b))
  )
  // Within the acts that stay, a gem more than the XP safe-range above your
  // level is flagged "later" — the UI dims it and shows the level it comes
  // online. Unknown player level = everything shown as now.
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
