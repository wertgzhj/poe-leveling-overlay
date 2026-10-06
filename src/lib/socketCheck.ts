// How a link's plan-vs-reality check reads in the Gems tab (pure — unit-tested).
//
// The engine behind it is electron/ggg/diff.ts; this is only the wording and the
// colour. Same split as src/lib/sources.ts, and for the same reason: the tab
// reads it in more than one place, and a rule that lives in a component is a
// rule that gets applied in one of them.
//
// The connection to GGG does not exist yet (docs/GGG-API.md), so today this is
// only ever called with `undefined` and renders nothing. That is deliberate and
// it is also the most important rule here — see socketMark.

/** Structurally what electron/ggg/diff.ts returns per group, spelled out again
 *  so the renderer needs nothing from the main process's build graph. */
export interface GroupCheckInput {
  state: 'ok' | 'incomplete' | 'unequipped'
  slot?: string | null
  missing?: string[]
  elsewhere?: { gem: string; slot: string }[]
  variants?: { planned: string; socketed: string }[]
  extra?: string[]
}

export interface SocketMark {
  label: string
  title: string
  tone: string
}

const OK = 'text-emerald-400/90'
const WARN = 'text-amber-300'
const MUTED = 'text-overlay-muted'

/**
 * The one-line verdict for a link group, or null for "say nothing".
 *
 * Null is the common case and the one to protect. Not connected, no character
 * matched, stale data, feature switched off — all of them mean the overlay does
 * not know, and an overlay that does not know says nothing rather than nagging
 * you to connect an account. The plan works without this.
 */
export function socketMark(check: GroupCheckInput | undefined | null): SocketMark | null {
  if (!check) return null

  const missing = check.missing ?? []
  const elsewhere = check.elsewhere ?? []
  const variants = check.variants ?? []

  if (check.state === 'unequipped') {
    // Nothing of this group is on the character. Before the level you'd set it
    // up at that's just the future, so it stays grey rather than red.
    return { label: 'not set up', title: `Nothing from this link is socketed yet.`, tone: MUTED }
  }

  if (missing.length > 0) {
    return {
      label: missing.length === 1 ? `missing ${missing[0]}` : `missing ${missing.length}`,
      title: `Not socketed anywhere: ${missing.join(', ')}.`,
      tone: WARN
    }
  }

  if (elsewhere.length > 0) {
    const first = elsewhere[0]
    return {
      label: elsewhere.length === 1 && first ? `${first.gem} in ${first.slot}` : `${elsewhere.length} elsewhere`,
      title:
        'Socketed, but in another item: ' +
        elsewhere.map((e) => `${e.gem} (${e.slot})`).join(', ') +
        '.',
      tone: WARN
    }
  }

  // Everything the plan wanted is there. Quiet — the common case must not
  // compete with the case that needs you.
  const where = check.slot ? ` in your ${check.slot}` : ''
  if (variants.length > 0) {
    return {
      label: 'ok',
      title:
        `The link is complete${where}, with a variant: ` +
        variants.map((v) => `${v.socketed} for ${v.planned}`).join(', ') +
        '.',
      tone: OK
    }
  }
  return { label: 'ok', title: `Socketed as planned${where}.`, tone: OK }
}
