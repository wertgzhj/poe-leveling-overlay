// Your short names for gems, applied where the Gems tab draws a name. Display
// only — see electron/gem-names.ts for why it never goes further. Pure.

import { normalizeGemName } from '../../electron/profile/gems.ts'

/**
 * A lookup for a short-name map: the short name for a gem as a profile spells
 * it, or the name itself. Exact first, then forgiving — a PoB profile writes
 * "Cast when Damage Taken" for the gem the data calls "… Support".
 */
export function shortNamer(names: Readonly<Record<string, string>>): (gem: string) => string {
  const exact = new Map<string, string>()
  const loose = new Map<string, string>()
  for (const [gem, short] of Object.entries(names)) {
    exact.set(gem.trim().toLowerCase(), short)
    const k = normalizeGemName(gem)
    if (!loose.has(k)) loose.set(k, short)
  }
  return (gem) => exact.get(gem.trim().toLowerCase()) ?? loose.get(normalizeGemName(gem)) ?? gem
}
