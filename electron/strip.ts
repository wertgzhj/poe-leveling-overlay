// The compact strip: what it shows under its header, and how much. Pure
// (unit-tested in tests/strip.test.ts); the renderer draws it (src/panels/
// StripPanel.tsx) from what the overlay already knows.
//
// The strip sits above the XP bar, where the vendor, stash and inventory
// windows leave room for a few lines, so it never grows past STRIP_LINES under
// its header: a reminder, the gems to get in this town, the next passive point,
// in that order of importance. What doesn't fit is in the full panel.

import { isTownId } from './log/areas.ts'
import type { AcquisitionItem } from './profile/engine/types.ts'
import type { ColoredGem } from './profile/gems.ts'
import type { ShowSet } from './show-rules.ts'
import type { LabTier } from './trials/engine.ts'

/** Lines under the header, at most. Four fit between the vendor window and
 *  the XP bar at the game's own text size. */
export const STRIP_LINES = 4

/** The one reminder the strip has room for, ranked as in the panel's notice
 *  bar: a one-time choice, a Labyrinth ready, a trial here, a god here. */
export type StripNotice =
  | { kind: 'choice'; id: 'bandit' | 'pantheon'; wants: string }
  | { kind: 'lab'; lab: LabTier }
  | { kind: 'trial'; id: string }
  | { kind: 'god'; soul: string; side?: string }

/** One thing to pick up in this town. */
export interface StripGem {
  /** a quest reward to take, one of several to pick, or a gem to buy */
  how: 'take' | 'pick' | 'buy'
  gems: Array<{ name: string; colored?: ColoredGem }>
  /** who hands it over: the vendor's name, else the quest's */
  from?: string
}

export interface StripInput {
  /** where you are; the gems show in a campaign town only */
  areaId: string | null
  show: ShowSet
  choice: { id: 'bandit' | 'pantheon'; wants: string } | null
  /** the first Labyrinth ready to run, not yet acknowledged */
  lab: LabTier | null
  /** a trial in this zone you haven't done */
  trial: string | null
  /** a Pantheon god your build wants, fought here */
  god: { soul: string; side?: string } | null
  /** the live stage's to-do list (see Acquisitions.plan) */
  plan: readonly AcquisitionItem[]
  passive: { name: string; points: number; total: number } | null
}

export interface StripModel {
  notice: StripNotice | null
  /** the gems to get in this town that fit */
  gems: StripGem[]
  /** how many more there are, in the full panel */
  more: number
  passive: StripInput['passive']
}

/** The campaign act of a town's area id ("1_2_town" is Act 2). */
export function townAct(areaId: string | null): number | null {
  if (!areaId || !isTownId(areaId)) return null
  const act = Number(areaId.split('_')[1])
  return Number.isInteger(act) && act >= 1 && act <= 10 ? act : null
}

function noticeOf(input: StripInput): StripNotice | null {
  const { show } = input
  if (input.choice && show[input.choice.id]) return { kind: 'choice', ...input.choice }
  if (input.lab && show.lab) return { kind: 'lab', lab: input.lab }
  if (input.trial && show.trialHere) return { kind: 'trial', id: input.trial }
  if (input.god && show.pantheon) return { kind: 'god', ...input.god }
  return null
}

/** What to pick up in the town of this act: the plan's items for the act
 *  that are due now (not "coming up" at a later level). */
export function townGems(plan: readonly AcquisitionItem[], act: number): StripGem[] {
  const out: StripGem[] = []
  for (const item of plan) {
    if (item.later) continue
    if (item.kind === 'reward') {
      const g = item.group
      if (g.act !== act) continue
      out.push({
        how: g.pickOne ? 'pick' : 'take',
        gems: g.gems.map((e) => ({ name: e.gem, colored: e.colored })),
        from: g.quest
      })
    } else {
      const e = item.entry
      if (e.act !== act) continue
      out.push({
        how: 'buy',
        gems: e.anyOf ? e.anyOf.map((a) => ({ name: a.gem, colored: a.colored })) : [{ name: e.gem, colored: e.colored }],
        from: e.npc ?? item.stop?.npc
      })
    }
  }
  return out
}

export function stripModel(input: StripInput): StripModel {
  const notice = noticeOf(input)
  const act = townAct(input.areaId)
  const all = act != null && input.show.gemsToGet ? townGems(input.plan, act) : []
  const passive = input.show.passive ? input.passive : null
  const room = STRIP_LINES - (notice ? 1 : 0)
  // Everything fits: done.
  if (all.length + (passive ? 1 : 0) <= room) return { notice, gems: all, more: 0, passive }
  // Town is about the gems: the passive steps aside for them first, then the
  // last gem line becomes "+N more".
  if (all.length <= room) return { notice, gems: all, more: 0, passive: null }
  const shown = all.slice(0, room - 1)
  return { notice, gems: shown, more: all.length - shown.length, passive: null }
}
