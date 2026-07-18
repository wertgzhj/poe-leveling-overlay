// Editor file IO (main process). Loads routes/profile for editing and saves
// edits to the userData override files — which the guide/profile services watch,
// so the overlay hot-reloads. Reuses the same validators the app loads with, so
// the editor can never write a file the app would reject.

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseRoute, validateRoute } from '../guide/route.ts'
import { parseProfile, validateProfile } from '../profile/profile.ts'
import { store } from '../settings.ts'
import type { EditorLoad, EditorRouteEntry, EditorSaveResult } from '../channels.ts'

function routesDir(): string {
  return join(app.getPath('userData'), 'routes')
}
function profilesDir(): string {
  return join(app.getPath('userData'), 'profiles')
}
function bundledDir(kind: 'campaign' | 'profiles'): string {
  return app.isPackaged
    ? join(process.resourcesPath, kind)
    : join(app.getAppPath(), 'data', kind === 'campaign' ? 'campaign' : 'profiles')
}

export function loadForEditor(): EditorLoad {
  const routes: EditorRouteEntry[] = []
  for (let act = 1; act <= 10; act++) {
    const override = join(routesDir(), `act${act}.json`)
    const bundled = join(bundledDir('campaign'), `act${act}.json`)
    let source: EditorRouteEntry['source'] = 'missing'
    let path: string | null = null
    if (existsSync(override)) {
      source = 'override'
      path = override
    } else if (existsSync(bundled)) {
      source = 'bundled'
      path = bundled
    }
    if (path) {
      const { route, errors } = parseRoute(readFileSync(path, 'utf8'))
      routes.push({ act, route, errors, source })
    } else {
      routes.push({ act, route: null, errors: [], source })
    }
  }

  const configured = store.get('profilePath')
  const profilePath =
    configured ?? join(bundledDir('profiles'), 'example.json')
  let profileEntry: EditorLoad['profile'] = { profile: null, errors: ['profile not found'], path: configured }
  if (existsSync(profilePath)) {
    const { profile, errors } = parseProfile(readFileSync(profilePath, 'utf8'))
    profileEntry = { profile, errors, path: configured }
  }

  return { routes, profile: profileEntry }
}

export function saveRoute(act: number, json: unknown): EditorSaveResult {
  const { route, errors } = validateRoute(json)
  if (!route) return { ok: false, errors }
  if (route.act !== act) {
    return { ok: false, errors: [`route declares act ${route.act}, but this is Act ${act}`] }
  }
  mkdirSync(routesDir(), { recursive: true })
  const path = join(routesDir(), `act${act}.json`)
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n')
  return { ok: true, errors: [], path }
}

/** Saves the profile to a userData override and returns its path (the caller
 *  activates it so the profile service reloads). */
export function saveProfile(json: unknown): EditorSaveResult {
  const { profile, errors } = validateProfile(json)
  if (!profile) return { ok: false, errors }
  mkdirSync(profilesDir(), { recursive: true })
  const path = join(profilesDir(), 'profile.json')
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n')
  return { ok: true, errors: [], path }
}
