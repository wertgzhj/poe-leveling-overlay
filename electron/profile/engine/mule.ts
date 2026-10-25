// Part of the build-profile engine (see ../engine.ts). Muling: which gems a fresh alt of another class gets on the Twilight Strand.

import { normalizeGemName, type GemData } from '../gems.ts'
import { baseClassOf, type CharClass, type Profile } from '../profile.ts'

/** A gem to mule, and the classes that get it by clearing the Twilight Strand. */
export interface MuleChoice {
  gem: string
  classes: string[]
  how?: MuleHow
}

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

export interface MuleOption {
  gem: string
  /** Classes whose fresh character gets it, cheapest way first. */
  classes: string[]
  how: MuleHow
}

const HOW_RANK: Record<MuleHow, number> = { start: 0, reward: 1, vendor: 2 }

/**
 * What a level-1 alt of `cls` gets by clearing the Twilight Strand: the gems it
 * starts with, the Strand quest's reward options, and what Nessa sells it once
 * that quest is done. Normalized gem -> how. Everything else is past a mule.
 */
function strandGems(cls: string, starting: readonly string[], gems: GemData | undefined, wanted: Iterable<string>): Map<string, MuleHow> {
  const got = new Map<string, MuleHow>()
  const note = (key: string, how: MuleHow): void => {
    const had = got.get(key)
    if (!had || HOW_RANK[how] < HOW_RANK[had]) got.set(key, how)
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
 * The gems of this build worth muling: any gem a fresh character of another
 * class gets on the Twilight Strand that yours doesn't. In the order the build
 * first uses them.
 *
 * Not tied to any one gem. Momentum is the usual answer — a Ranger starts with
 * it, and Nessa sells it to a Ranger after Hillock — but a Duelist hands over
 * Chance to Bleed the same way, and which one is worth an alt is the player's
 * call. `starting` is class -> the gems that class starts with.
 */
export function muleOptions(
  profile: Profile,
  gems: GemData | undefined,
  starting: Readonly<Record<string, readonly string[]>>
): MuleOption[] {
  // First stage each gem appears in, so options follow the run.
  const firstUse = new Map<string, { gem: string; at: number }>()
  profile.stages.forEach((stage, i) => {
    for (const g of stage.socketGroups) {
      for (const gem of g.gems) {
        const key = normalizeGemName(gem)
        if (!firstUse.has(key)) firstUse.set(key, { gem, at: i })
      }
    }
  })
  const wanted = [...firstUse.values()].map((v) => v.gem)
  const own = strandGems(profile.meta.class, starting[profile.meta.class] ?? [], gems, wanted)

  const options: (MuleOption & { at: number })[] = []
  for (const [key, { gem, at }] of firstUse) {
    if (own.has(key)) continue // your own class gets it on the Strand anyway
    const offers: { cls: string; how: MuleHow }[] = []
    for (const cls of Object.keys(starting)) {
      if (cls === profile.meta.class) continue
      const how = strandGems(cls, starting[cls] ?? [], gems, [gem]).get(key)
      if (how) offers.push({ cls, how })
    }
    if (offers.length === 0) continue
    offers.sort((a, b) => HOW_RANK[a.how] - HOW_RANK[b.how] || a.cls.localeCompare(b.cls))
    options.push({ gem, classes: offers.map((o) => o.cls), how: offers[0]!.how, at })
  }
  options.sort((a, b) => a.at - b.at || a.gem.localeCompare(b.gem))
  return options.map(({ at: _at, ...o }) => o)
}

/** The mule you get unless you pick another: Momentum when the build has it
 *  — the classic, and what you'd mule if you mule anything — otherwise the
 *  gem the build needs first. */
export function defaultMule(options: readonly MuleOption[]): MuleOption | null {
  return options.find((o) => normalizeGemName(o.gem) === 'momentum') ?? options[0] ?? null
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
