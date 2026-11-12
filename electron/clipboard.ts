// Every clipboard write the overlay makes goes through here. It only ever
// writes, on a click or a hotkey, and never reads the clipboard: GGG's overlay
// rules allow a clipboard read only once per manual key press
// (docs/ARCHITECTURE.md#tos-position).

import { clipboard } from 'electron'

/** Copy on a click or a hotkey. */
export async function copyText(text: string): Promise<void> {
  await clipboard.writeText(text)
}
