// The search regex you keep in Settings and copy into the game's stash or vendor
// search box with one click (pure — unit-tested).
//
// The overlay only ever puts it on the clipboard. Pasting is yours: the game
// never receives anything from this app, which is the line docs/ARCHITECTURE.md
// draws and GGG's macro rules draw with it.

/**
 * What gets stored, from what was typed or pasted.
 *
 * Line breaks go: the search box is one line, and a regex copied out of a web
 * page or a chat message often brings a trailing newline with it — which would
 * then sit invisibly in the box and break the match. Everything else is kept
 * exactly, inner spaces included, because in a PoE search string a space is
 * part of the pattern ("movement speed" is not "movementspeed").
 */
export function normalizeSearchRegex(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/[\r\n]+/g, '').trim()
}

/** A regex for some acts only: Acts `from` to `to`, both included. */
export interface ActRegex {
  from: number
  to: number
  regex: string
}

/** Acts 1-10; the epilogue keeps Act 10's. */
const LAST_ACT = 10

/** At most this many: one per act and a few spare is more than anyone keeps. */
const MAX_ACT_REGEXES = 20

/**
 * What gets stored, from what the renderer sent: entries with an empty regex
 * dropped (that's a row you added and haven't filled), acts clamped to 1-10
 * and swapped round if typed backwards, each regex normalized as above.
 */
export function sanitizeActRegexes(raw: unknown): ActRegex[] {
  if (!Array.isArray(raw)) return []
  const out: ActRegex[] = []
  for (const r of raw.slice(0, MAX_ACT_REGEXES)) {
    if (!r || typeof r !== 'object') continue
    const regex = normalizeSearchRegex((r as ActRegex).regex)
    const a = toAct((r as ActRegex).from)
    const b = toAct((r as ActRegex).to)
    if (!regex || a == null || b == null) continue
    out.push({ from: Math.min(a, b), to: Math.max(a, b), regex })
  }
  return out
}

function toAct(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) ? Math.min(Math.max(v, 1), LAST_ACT) : null
}

/**
 * "Your regex" for the act you've reached: the first entry covering it, else
 * the general one. Before any act is known (no log yet), the general one.
 * null when neither says anything.
 */
export function regexForAct(general: string, perAct: ActRegex[], act: number | null): string | null {
  const hit = act == null ? undefined : perAct.find((r) => r.from <= act && act <= r.to)
  return hit?.regex || general || null
}
