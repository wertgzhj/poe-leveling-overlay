// How a gem's source is named and coloured in the Gems tab (pure — unit-tested).
//
// Lives outside the panel because it kept going wrong there: the tab reads a
// source in three places (the shopping row, the stop heading, the link row) and
// wiring a rename or a colour into one of them and not the others is invisible
// until someone plays far enough to see it. Here it is one function with a test.

/**
 * What the data calls a source, and what you'd rather read. The wiki names the
 * quest; what you need is where you stand or who you fight.
 */
export const SOURCE_ALIAS: Record<string, string> = {
  // Siosa never comes up in conversation — "the Library" is the trip you make,
  // and the trip is what unlocks his stock (see LIBRARY_VENDOR in gems.ts).
  Siosa: 'Library',
  // You clear this one by killing Gravicius, and enough builds skip him that
  // the name of the fight beats the name of the quest.
  'Sever the Right Hand': 'Gravicius'
}

/**
 * Sources that get their own colour, so they don't read as ordinary shopping —
 * the same reason muling is turquoise. The Library is a trip you have to make,
 * Gravicius a fight you have to win, and both are easy to walk past.
 *
 * Keyed by the ALIAS, not the raw name: everything downstream renames first.
 */
export const SOURCE_TONE: Record<string, string> = {
  Library: 'text-violet-300',
  Gravicius: 'text-rose-300'
}

export const MUTED = 'text-overlay-muted'

/** The name to show for a vendor or quest. */
export function sourceName(what: string): string {
  return SOURCE_ALIAS[what] ?? what
}

/** The colour for an already-renamed source. */
export function sourceTone(named: string): string {
  return SOURCE_TONE[named] ?? MUTED
}

/** Just the fields a source mark reads — structurally what the acquisition
 *  entries carry, spelled out here so this module needs nothing from Electron. */
export interface SourceInput {
  bucket: 'reward' | 'purchase' | 'other'
  act?: number
  npc?: string
  quest?: string
  note?: string
  cost?: string
  fallback?: boolean
  starting?: boolean
  mule?: string[]
}

export interface SourceMark {
  label: string
  title: string
  tone: string
}

/**
 * Short "where it comes from" tag for a gem line — the same shape as the
 * shopping list's source column, "A<N> · where", so both share one left edge.
 *
 * The full story (quest name in full, price, note) goes in the tooltip: in the
 * row it was a third variable-width thing competing for the tightest cell on
 * screen, and the reason the right-hand side used to jump between "✓ start" and
 * "🎁 A1 Enemy at the Gate".
 */
export function sourceMark(e: SourceInput | undefined): SourceMark | null {
  if (!e) return null
  if (e.starting) {
    return { label: '✓ start', title: 'You start with this gem', tone: 'text-emerald-400/90' }
  }
  const act = e.act ? `A${e.act}` : null
  const inAct = e.act ? ` in Act ${e.act}` : ''
  const at = (named: string): string => [act, named].filter(Boolean).join(' · ')

  // Muling wins over the vendor even here: quoting Siosa's price next to a gem
  // an alt hands you for nothing is the one thing the links should not do.
  if (e.mule?.length) {
    return {
      label: `Mule · ${e.mule.join('/')}`,
      title: `Roll a level-1 ${e.mule.join(' or ')}, stash its starting gems, delete it. Otherwise ${e.npc ?? 'a vendor'}${inAct} sells it${e.cost ? ` for ${e.cost}` : ''}.`,
      tone: 'text-sky-300/90'
    }
  }
  if (e.bucket === 'reward') {
    const quest = e.quest ?? 'quest'
    const named = sourceName(quest)
    return { label: at(named), title: `Free quest reward${inAct}: ${quest}`, tone: sourceTone(named) }
  }
  if (e.bucket === 'purchase') {
    const npc = e.npc ?? 'vendor'
    const named = sourceName(npc)
    return {
      label: at(named),
      title:
        `Buy from ${npc}${inAct}${e.cost ? ` · ${e.cost}` : ''}` +
        (e.fallback ? ' — general vendor, may show up earlier as a quest reward' : ''),
      tone: sourceTone(named)
    }
  }
  const note = e.note ?? 'drop/trade'
  return { label: note, title: note, tone: MUTED }
}
