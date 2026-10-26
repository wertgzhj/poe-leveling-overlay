// Every clipboard write the overlay makes goes through here, so it knows what
// it put there: copying on its own (autocopy.ts) may replace that, never
// something you copied yourself (see mayOverwrite).

import { clipboard } from 'electron'
import { mayOverwrite } from './profile/search.ts'

/** The overlay's recent writes; a handful is plenty. */
const written: string[] = []

/** Copy on a click: always. */
export async function copyText(text: string): Promise<void> {
  written.push(text)
  if (written.length > 20) written.shift()
  await clipboard.writeText(text)
}

/** Copy on its own: only when what's there may be replaced. True when copied. */
export async function copyIfFree(text: string): Promise<boolean> {
  if (!mayOverwrite(await clipboard.readText(), new Set(written))) return false
  await copyText(text)
  return true
}
