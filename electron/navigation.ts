// Where the app's own pages may go. Pure, so it's tested directly; security.ts
// wires it into every window.
//
// The overlay and the editor are local pages that never link anywhere: every
// gem, route and build is drawn by the app itself. So a page trying to load
// something else — a link that slipped into a route note, a script that got
// past the CSP — is never something the user asked for, and is refused.

/** Whether a page at `current` may navigate itself to `target`: only to the
 *  same page (a reload, a #hash or ?query change) — the same file on disk, or
 *  the same origin of the dev server. */
export function navigationAllowed(target: string, current: string): boolean {
  let to: URL
  let from: URL
  try {
    to = new URL(target)
    from = new URL(current)
  } catch {
    return false
  }
  if (to.protocol === 'file:' && from.protocol === 'file:') return to.pathname === from.pathname
  if (to.protocol === 'http:' || to.protocol === 'https:') return to.origin === from.origin
  return false
}
