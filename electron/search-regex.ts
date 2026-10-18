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
