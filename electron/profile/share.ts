// Sharing a build profile as text (pure, no Electron imports; unit-tested in
// tests/profile-share.test.ts). Like the routes (guide/share.ts), the format is
// the profile JSON itself: a build you take from someone is something you
// should be able to read before you use it. Unlike a PoB code, it carries what
// you made of the build here: the stages, the passive order, the notes.

import { validateProfile } from './profile.ts'

/** Written into exports so a future format change can be recognised. */
export const PROFILE_SHARE_FORMAT = 'poe-leveling-overlay/profile@1'

export interface SharedProfileResult {
  /** the profile to add to the library, as JSON; null when it won't load */
  json: Record<string, unknown> | null
  errors: string[]
}

/** The profile without what is yours alone: the character it belongs to
 *  (meta.character). On someone else's PC it would bind to a stranger's name. */
function withoutCharacter(json: Record<string, unknown>): Record<string, unknown> {
  const meta = json['meta']
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return json
  const { character: _character, ...rest } = meta as Record<string, unknown>
  return { ...json, meta: rest }
}

/** A profile file's JSON, ready to send. */
export function exportProfile(json: Record<string, unknown>): string {
  return JSON.stringify({ format: PROFILE_SHARE_FORMAT, profile: withoutCharacter(json) }, null, 2) + '\n'
}

/**
 * Read a shared profile: an export from `exportProfile`, or a profile file
 * pasted as it is. It goes through the same validator the library loads files
 * with, so an import can never add a profile the overlay would reject.
 */
export function parseSharedProfile(text: string): SharedProfileResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { json: null, errors: [`not valid JSON: ${(e as Error).message}`] }
  }
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
  const inner = obj && obj['format'] === PROFILE_SHARE_FORMAT ? obj['profile'] : obj
  if (!inner || typeof inner !== 'object' || Array.isArray(inner)) {
    return { json: null, errors: ['expected an exported profile or a profile file'] }
  }
  const json = withoutCharacter(inner as Record<string, unknown>)
  const { profile, errors } = validateProfile(json)
  return profile ? { json, errors: [] } : { json: null, errors }
}
