// The profile library: every build profile you own is its own file in one
// folder (userData/profiles). No Electron in here — every function takes the
// folder as a parameter — so the whole thing is tested against a real temp dir.
//
// It exists because the app used to keep at most two profiles of its own, both
// on a last-write-wins basis: every PoB import went to `pob-import.json` and
// every editor save to `profile.json`. Importing a build for a second character
// silently replaced the first one's — and since characters remember their
// profile by path, the first character then loaded the second one's build.
// One file per profile, named once and never reused, is the fix.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { validateProfile } from './profile.ts'

/** The id the bundled example answers to. Reserved: a profile of yours named
 *  "Example" gets `example-2`, so the two can never be confused. */
export const BUNDLED_ID = 'example'

export interface LibraryEntry {
  /** File name without `.json` — stable for the profile's whole life. Renaming
   *  changes the name inside, never the file, so nothing that remembers a
   *  profile by path (the per-character map) can be left pointing at nothing. */
  id: string
  path: string
  /** `meta.name`; the file name when the file can't be read. */
  name: string
  charClass?: string
  ascendancy?: string
  /** `meta.character` — the character the profile says it belongs to. */
  character?: string
  stages: number
  /** The bundled example: listed and usable, never written to or deleted. */
  bundled?: boolean
  /** Why the file doesn't validate. A broken file is still yours, so it is
   *  listed with its problem rather than silently left out. */
  errors: string[]
}

export interface LibraryResult {
  ok: boolean
  errors: string[]
  entry?: LibraryEntry
}

/** A file-name stem from a profile name: lowercase ASCII, digits and hyphens.
 *  Anything else becomes a hyphen; the result is never empty. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
  return slug || 'profile'
}

/** `base`, or `base-2`, `base-3`, … — the first one not taken. */
export function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}

/** Whether a path is a file directly inside the library folder. */
export function isInLibrary(dir: string, path: string): boolean {
  const rel = relative(resolve(dir), resolve(path))
  return rel.length > 0 && !rel.startsWith('..') && dirname(rel) === '.' && rel.endsWith('.json')
}

/** The id of a library path (its file name without `.json`). */
export function idOf(path: string): string {
  return basename(path).replace(/\.json$/i, '')
}

/** One entry from one file. Never throws: a file that won't read or won't
 *  validate is an entry with errors. */
export function readEntry(path: string, bundled = false): LibraryEntry {
  const id = bundled ? BUNDLED_ID : idOf(path)
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    return { id, path, name: id, stages: 0, bundled, errors: [`can't read: ${(e as Error).message}`] }
  }
  const { profile, errors } = validateProfile(raw)
  if (!profile) {
    // Even a broken file usually has its name — show that, not the file name.
    const meta = (raw as { meta?: { name?: unknown } } | null)?.meta
    const name = typeof meta?.name === 'string' && meta.name.trim() ? meta.name.trim() : id
    return { id, path, name, stages: 0, bundled, errors }
  }
  return {
    id,
    path,
    name: profile.meta.name,
    charClass: profile.meta.class,
    ascendancy: profile.meta.ascendancy,
    character: profile.meta.character,
    stages: profile.stages.length,
    bundled,
    errors: []
  }
}

/** Every profile in the library, by name. The bundled example is the caller's
 *  to add — it lives elsewhere and differs between dev and packaged builds. */
export function listLibrary(dir: string): LibraryEntry[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .map((f) => readEntry(join(dir, f)))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id))
}

function takenIds(dir: string): Set<string> {
  const ids = new Set<string>([BUNDLED_ID])
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) if (f.toLowerCase().endsWith('.json')) ids.add(idOf(f))
  }
  return ids
}

/**
 * Write a profile as a NEW file in the library, named after it. Never
 * overwrites: a second build called "Cyclone Slayer" becomes
 * `cyclone-slayer-2`. Validates first — the library only ever gains profiles
 * the overlay can load.
 */
export function addProfile(dir: string, json: unknown): LibraryResult {
  const { profile, errors } = validateProfile(json)
  if (!profile) return { ok: false, errors }
  mkdirSync(dir, { recursive: true })
  const id = uniqueId(slugify(profile.meta.name), takenIds(dir))
  const path = join(dir, `${id}.json`)
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n')
  return { ok: true, errors: [], entry: readEntry(path) }
}

/**
 * The smallest profile that is both valid and true: one stage covering every
 * level, holding the gems the class starts the game with, linked. A profile
 * can't be empty — the format requires a stage with a gem — and this is the
 * one stage every character of that class really does begin with.
 */
export function blankProfile(name: string, charClass: string, startingGems: readonly string[]): unknown {
  return {
    meta: { name: name.trim() || 'New profile', class: charClass },
    stages: [
      {
        range: [1, 100],
        label: 'Starting gems',
        socketGroups: [{ gems: startingGems.length ? [...startingGems] : ['Portal'] }]
      }
    ],
    gemPlan: []
  }
}

/** Read a profile file as a JSON object for editing, or say why not. */
function readObject(path: string): { json: Record<string, unknown> | null; error?: string } {
  try {
    const json = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
      return { json: null, error: 'not a JSON object' }
    }
    return { json: json as Record<string, unknown> }
  } catch (e) {
    return { json: null, error: (e as Error).message }
  }
}

/**
 * A copy under "<name> (copy)", as a new file.
 *
 * The copy belongs to nobody: `meta.character` is dropped. Two profiles both
 * claiming the same character would make switching to that character a coin
 * toss, and the copy is the one that's about to become something else.
 * `dropNote` removes the bundled example's `_note` — instructions for the
 * example, which a copy of yours doesn't need.
 */
export function duplicateProfile(dir: string, sourcePath: string, dropNote = false): LibraryResult {
  const { json, error } = readObject(sourcePath)
  if (!json) return { ok: false, errors: [`can't read the profile: ${error}`] }
  const meta = { ...(json['meta'] as Record<string, unknown> | undefined) }
  const name = typeof meta['name'] === 'string' && meta['name'].trim() ? meta['name'].trim() : 'Profile'
  meta['name'] = `${name} (copy)`
  delete meta['character']
  const copy: Record<string, unknown> = { ...json, meta }
  if (dropNote) delete copy['_note']
  return addProfile(dir, copy)
}

/**
 * Give a profile a new name. Rewrites `meta.name` and nothing else — every
 * other field, including ones this version doesn't know, is kept as written.
 * The file keeps its name (see LibraryEntry.id).
 */
export function renameProfile(path: string, name: string): LibraryResult {
  const next = name.trim()
  if (!next) return { ok: false, errors: ['a profile needs a name'] }
  const { json, error } = readObject(path)
  if (!json) return { ok: false, errors: [`can't read the profile: ${error}`] }
  const meta = json['meta']
  if (typeof meta !== 'object' || meta === null) return { ok: false, errors: ['the profile has no "meta"'] }
  ;(meta as Record<string, unknown>)['name'] = next
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n')
  return { ok: true, errors: [], entry: readEntry(path) }
}

/** Remove a profile's file. `remove` is injectable so the app can send it to
 *  the recycle bin instead — a deleted build should be recoverable. */
export async function deleteProfile(
  dir: string,
  path: string,
  remove: (path: string) => Promise<void> | void = (p) => rmSync(p)
): Promise<LibraryResult> {
  if (!isInLibrary(dir, path)) return { ok: false, errors: ['only profiles in the library can be deleted'] }
  if (!existsSync(path)) return { ok: false, errors: ['that profile no longer exists'] }
  try {
    await remove(path)
    return { ok: true, errors: [] }
  } catch (e) {
    return { ok: false, errors: [`couldn't delete it: ${(e as Error).message}`] }
  }
}

/**
 * Bring an outside file into the library as a copy. The original is left
 * alone, and edits to it no longer reach the overlay — one place for every
 * profile is the point. Refuses what wouldn't load, so the library never gains
 * a broken entry from an import.
 */
export function importProfileFile(dir: string, externalPath: string): LibraryResult {
  const { json, error } = readObject(externalPath)
  if (!json) return { ok: false, errors: [`can't read ${basename(externalPath)}: ${error}`] }
  return addProfile(dir, json)
}

/**
 * Copy every outside profile still referenced by path into the library, once.
 * Returns old path -> new path for the caller to repoint its references.
 *
 * Before the library, a profile could be any file anywhere ("Browse…"). Those
 * references would keep working, but would also be the one kind of profile
 * the library can't rename, duplicate or delete safely. A path that is gone or
 * doesn't validate is left as it is: there's nothing to copy, and dropping it
 * silently would be worse than the error the overlay already shows for it.
 */
export function adoptExternal(dir: string, paths: Iterable<string>): Map<string, string> {
  const moved = new Map<string, string>()
  for (const path of paths) {
    if (moved.has(path) || isInLibrary(dir, path) || !existsSync(path)) continue
    const res = importProfileFile(dir, path)
    if (res.ok && res.entry) moved.set(path, res.entry.path)
  }
  return moved
}

/** The per-character map without any character pointing at `path`. */
export function dropReferences(map: Record<string, string>, path: string): Record<string, string> {
  return Object.fromEntries(Object.entries(map).filter(([, p]) => p !== path))
}

/** The per-character map with every moved path repointed. */
export function remapReferences(
  map: Record<string, string>,
  moved: ReadonlyMap<string, string>
): Record<string, string> {
  return Object.fromEntries(Object.entries(map).map(([who, p]) => [who, moved.get(p) ?? p]))
}
