// Part of the build-profile engine (see ../engine.ts). Which stage you are on, and what the zone id says about the act.

import { type GemData } from '../gems.ts'
import { type Profile, type Stage } from '../profile.ts'
import { type ResolvedStage } from './types.ts'

/** Campaign act from a numeric area id ("1_2_7_1" -> 2, "2_6_town" -> 6). Word ids (hideouts,
 *  maps) and unknown shapes give null — keep the last known act instead. */
export function actFromAreaId(areaId: string | null | undefined): number | null {
  if (!areaId) return null
  // "<part>_<act>_<zone>": The Crypt is 1_2_…, Act 6's town 2_6_town. Reading
  // the first number made Acts 1-5 all "Act 1" and 6-10 all "Act 2".
  const m = /^\d+_(\d+)_/.exec(areaId)
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
    label: stage.label ?? `Level ${stage.range[0]}-${stage.range[1]}`,
    range: stage.range,
    note: stage.note,
    groups: stage.socketGroups.map((g) => ({ gems: gems.colorGroup(g.gems), note: g.note }))
  }
}
