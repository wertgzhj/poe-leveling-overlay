// Part of the build-profile engine (see ../engine.ts). Muling: which gems a fresh alt of another class gets on the Twilight Strand.

import { normalizeGemName, type GemData } from '../gems.ts'
import { baseClassOf, type CharClass, type Profile } from '../profile.ts'

/** One gem a mule hands over, and how it gets it. */
export interface MuleGem {
  gem: string
  how: MuleHow
}

/**
 * A mule: one level-1 alt of another class, and every gem of this build it
 * hands over on the Twilight Strand. One alt, so one class — the plan never
 * sends you off to roll two.
 */
export interface MuleChoice {
  cls: string
  gems: MuleGem[]
}

/** A mule you can pick in Settings. The same shape as the choice itself. */
export type MuleOption = MuleChoice

/** A mule is rolled for its starting gems and deleted, usually after levelling
 *  once on Hillock — so it never gets far. Past this it's a real character.
 *  Confirmed against a real capture: every mule in it stopped at level 2. */
export const MULE_MAX_LEVEL = 3

/** The quest that clears the Twilight Strand (Hillock). A fresh alt finishes
 *  it in minutes, so its reward and the stock it unlocks at Nessa are as much a
 *  mule's to hand over as the gems the class starts with. */
export const STRAND_QUEST = 'Enemy at the Gate'

/** How a mule of a class gets a gem — the cheapest way it can. */
export type MuleHow = 'start' | 'reward' | 'vendor'

/** Every way a level-1 alt of `cls` gets each gem by clearing the Twilight
 *  Strand: the gems it starts with, the Strand quest's reward options, and what
 *  Nessa sells it once that quest is done. Normalized gem -> ways. */
function strandGems(
  cls: string,
  starting: readonly string[],
  gems: GemData | undefined,
  wanted: Iterable<string>
): Map<string, Set<MuleHow>> {
  const got = new Map<string, Set<MuleHow>>()
  const note = (key: string, how: MuleHow): void => {
    const ways = got.get(key) ?? new Set<MuleHow>()
    ways.add(how)
    got.set(key, ways)
  }
  for (const gem of starting) note(normalizeGemName(gem), 'start')
  for (const gem of wanted) {
    for (const src of gems?.info(gem)?.sources ?? []) {
      if (src.act !== 1 || src.quest !== STRAND_QUEST) continue
      if (src.classes && !src.classes.includes(cls as CharClass)) continue
      note(normalizeGemName(gem), src.kind === 'quest' ? 'reward' : 'vendor')
    }
  }
  return got
}

/**
 * What one alt of `cls` can hand over of `wanted` (in the order the build first
 * uses them): every gem it starts with, ONE gem as Hillock's reward — a quest
 * hands out one — and the rest from Nessa. A gem only the reward offers takes
 * the reward first, since Nessa can't stand in for it; a gem she sells too is
 * bought. A second reward-only gem is past this mule.
 */
function muleGems(ways: ReadonlyMap<string, ReadonlySet<MuleHow>>, wanted: readonly string[]): MuleGem[] {
  const out = new Map<string, MuleGem>()
  const rest: string[] = []
  for (const gem of wanted) {
    const w = ways.get(normalizeGemName(gem))
    if (!w) continue
    if (w.has('start')) out.set(gem, { gem, how: 'start' })
    else rest.push(gem)
  }
  const can = (gem: string, how: MuleHow): boolean => !!ways.get(normalizeGemName(gem))?.has(how)
  const rewardTo =
    rest.find((g) => can(g, 'reward') && !can(g, 'vendor')) ?? rest.find((g) => can(g, 'reward'))
  for (const gem of rest) {
    if (gem === rewardTo) out.set(gem, { gem, how: 'reward' })
    else if (can(gem, 'vendor')) out.set(gem, { gem, how: 'vendor' })
  }
  // Back in the build's order.
  return wanted.flatMap((g) => out.get(g) ?? [])
}

/**
 * The mules this build could use: for each other class, every gem of the build
 * its fresh character gets on the Twilight Strand that yours doesn't. A Ranger
 * hands over Momentum (it starts with it) and Frost Blades (Hillock's reward)
 * on the same trip, so it's one mule, not a choice between them. Classes that
 * hand over nothing are left out; the rest follow the build: the one whose
 * first gem is needed first, then the one with more gems.
 *
 * `starting` is class -> the gems that class starts with.
 */
export function muleOptions(
  profile: Profile,
  gems: GemData | undefined,
  starting: Readonly<Record<string, readonly string[]>>
): MuleOption[] {
  // First stage each gem appears in, so a mule's gems follow the run.
  const firstUse = new Map<string, { gem: string; at: number }>()
  profile.stages.forEach((stage, i) => {
    for (const g of stage.socketGroups) {
      for (const gem of g.gems) {
        const key = normalizeGemName(gem)
        if (!firstUse.has(key)) firstUse.set(key, { gem, at: i })
      }
    }
  })
  const used = [...firstUse.values()]
  const own = strandGems(profile.meta.class, starting[profile.meta.class] ?? [], gems, used.map((u) => u.gem))
  // Your own class gets these on the Strand anyway: nothing to mule.
  const wanted = used.filter((u) => !own.has(normalizeGemName(u.gem)))
  const atOf = new Map(wanted.map((u) => [u.gem, u.at]))

  const options: MuleOption[] = []
  for (const cls of Object.keys(starting)) {
    if (cls === profile.meta.class) continue
    const ways = strandGems(cls, starting[cls] ?? [], gems, wanted.map((u) => u.gem))
    const got = muleGems(ways, wanted.map((u) => u.gem))
    if (got.length) options.push({ cls, gems: got })
  }
  const first = (o: MuleOption): number => Math.min(...o.gems.map((g) => atOf.get(g.gem) ?? Infinity))
  options.sort((a, b) => first(a) - first(b) || b.gems.length - a.gems.length || a.cls.localeCompare(b.cls))
  return options
}

/** The mule you get unless you pick another: the class that hands over
 *  Momentum when the build has it — the classic, and what you'd mule if you
 *  mule anything — the one with the most gems if several do; otherwise the
 *  first option. */
export function defaultMule(options: readonly MuleOption[]): MuleOption | null {
  const momentum = options.filter((o) => o.gems.some((g) => normalizeGemName(g.gem) === 'momentum'))
  if (momentum.length) {
    const rank = (o: MuleOption): number =>
      o.gems.find((g) => normalizeGemName(g.gem) === 'momentum')!.how === 'start' ? 0 : 1
    return [...momentum].sort((a, b) => rank(a) - rank(b) || b.gems.length - a.gems.length)[0]
  }
  return options[0] ?? null
}

/** The mule a stored setting names: a class, as now, or a gem, as the setting
 *  held when a mule was one gem (it becomes the mule that hands it over).
 *  undefined = nothing stored, or nothing it still names. */
export function storedMule(options: readonly MuleOption[], stored: string): MuleOption | undefined {
  const byClass = options.find((o) => o.cls === stored)
  if (byClass) return byClass
  const key = normalizeGemName(stored)
  const holders = options.filter((o) => o.gems.some((g) => normalizeGemName(g.gem) === key))
  return defaultMule(holders) ?? undefined
}

/**
 * The tracked character's class when it looks like a mule for this build, else
 * null: low level, a different base class, and one of the classes this build
 * could mule from (see muleOptions). Anything else of another class is a real
 * mismatch and keeps its warning.
 */
export function mulingClass(
  profile: Profile,
  trackedClass: string | null,
  level: number | null,
  muleClasses: readonly string[]
): string | null {
  if (!trackedClass || level == null || level > MULE_MAX_LEVEL) return null
  const base = baseClassOf(trackedClass)
  if (!base || base === profile.meta.class) return null
  return muleClasses.includes(base) ? base : null
}
