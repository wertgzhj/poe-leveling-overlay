// Your own short names for gems ("CwDT" for Cast when Damage Taken), from
// Settings. Pure, so it's tested directly.
//
// Display only, by design: the overlay knows a gem by its real name everywhere
// that matters — gem data, PoB import, the mule, NEW and RELINKED — and a short
// name must never reach any of that. It's applied where the Gems tab draws a
// name (src/lib/gem-names.ts) and nowhere else; the profile editor keeps the
// real names, and profiles never carry them.

/** A short name is a short name: longer than this isn't saving any room. */
export const SHORT_NAME_MAX = 24

/**
 * The stored map, from whatever came over IPC: real gem name -> short name.
 * Keys are respelled the way the gem data spells them, so "cast when damage
 * taken" and "Cast when Damage Taken Support" are one entry; an unknown gem,
 * an empty or overlong short name, or one that just repeats the real name is
 * dropped rather than stored.
 */
export function sanitizeGemNames(raw: unknown, canonical: (gem: string) => string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [gem, short] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof short !== 'string') continue
    const name = canonical(gem.trim())
    const s = short.trim()
    if (!name || s.length === 0 || s.length > SHORT_NAME_MAX) continue
    if (s.toLowerCase() === name.toLowerCase()) continue
    out[name] = s
  }
  return out
}
