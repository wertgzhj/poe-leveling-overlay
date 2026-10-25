// Part of the build-profile engine (see ../engine.ts). Where one gem comes from for a class — a quest, a vendor, the mule, nowhere —
// and the order the lists are sorted in.

import { costRank, normalizeGemName, vendorCostFor, type GemData } from '../gems.ts'
import { type CharClass, type GemSource } from '../profile.ts'
import { type AcquisitionEntry } from './types.ts'

/** Cheapest first, then earliest act, then alphabetical.
 *  Quest rewards have no cost so they order by act — the order you meet them. */
export function acquisitionOrder(a: AcquisitionEntry, b: AcquisitionEntry): number {
  return (
    costRank(a.cost) - costRank(b.cost) ||
    (a.act ?? 99) - (b.act ?? 99) ||
    a.gem.localeCompare(b.gem)
  )
}

// Everything the acquisition list needs about one gem: where it comes from, plus
// the socket colour. The colour is resolved here rather than in the renderer so
// it comes from the same place as the pips on the link rows — including for
// gems a later stage needs, which aren't in the current stage's socket groups
// and so can't be looked up there at all.
export function classify(
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
