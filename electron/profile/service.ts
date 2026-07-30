// Glue between the pure profile engine and the Electron app: profile file load
// with hot reload, gem data, live active-stage tracking from the bound
// character's level, and IPC pushes. Profiles resolve from settings.profilePath
// (a file you point at) or the bundled example.
//
// gems.json is READ AT RUNTIME rather than imported. It's ~370 KB, and an import
// makes the bundler inline it as a JavaScript object literal that V8 has to
// parse on every launch — over half the main bundle. Shipped as a resource and
// JSON.parse'd, it's both smaller and faster to start. The cost is a file that
// can go missing, so a failure to load is reported loudly (`gemDataError`)
// instead of degrading into "every gem is unknown".

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, watchFile, unwatchFile } from 'node:fs'
import { join } from 'node:path'
import { parseProfile, type Profile } from './profile.ts'
import { GemData, normalizeGemName, type GemInfo } from './gems.ts'
import {
  activeStageIndex,
  stepStageView,
  resolveStage,
  acquisitionsForStage,
  type Acquisitions
} from './engine.ts'
import { store } from '../settings.ts'
import { Channels, type ProfileSnapshot } from '../channels.ts'
import type { OverlayController } from '../overlay.ts'
import type { LogService } from '../log/service.ts'
import startingGemsJson from '../../data/starting-gems.json'

export class ProfileService {
  private readonly overlay: OverlayController
  private readonly log: LogService
  private readonly gems: GemData
  /** Set when gems.json couldn't be loaded — surfaced in the Gems tab, because
   *  silently colourless gems with no sources look like a data gap, not a bug. */
  private readonly gemDataError: string | null
  private profile: Profile | null = null
  private errors: string[] = []
  private level: number | null = null
  /** Manually paged gem stage (◀/▶). null = follow the tracked level (auto). */
  private viewIndex: number | null = null
  private watchedPath: string | null = null
  /** Bumped on every (re)load so the acquisition cache can't outlive its profile. */
  private profileRevision = 0
  private acqCache: { key: string; value: Acquisitions } | null = null

  /** class -> normalized set of its starting gems (already in inventory). */
  private readonly startingByClass = new Map<string, Set<string>>()
  /** normalized gem -> classes that START with it, for the muling hint (roll a
   *  level-1 alt of that class and stash its two starting gems). */
  private readonly startingOwners = new Map<string, string[]>()

  constructor(overlay: OverlayController, log: LogService) {
    this.overlay = overlay
    this.log = log
    const loaded = loadGemData()
    this.gems = loaded.gems
    this.gemDataError = loaded.error
    for (const [cls, names] of Object.entries(startingGemsJson.classes as Record<string, string[]>)) {
      this.startingByClass.set(cls, new Set(names.map(normalizeGemName)))
      for (const name of names) {
        const key = normalizeGemName(name)
        this.startingOwners.set(key, [...(this.startingOwners.get(key) ?? []), cls])
      }
    }
    log.addLevelListener((level) => {
      this.level = level
      this.push()
    })
  }

  start(): void {
    this.level = this.log.getSnapshot().state.level
    this.reload()
  }

  stop(): void {
    this.unwatch()
  }

  setPath(path: string | null): void {
    store.set('profilePath', path)
    this.reload()
  }

  /** Persist an imported profile into userData and make it the active file. */
  applyImport(profile: Profile): string {
    const dir = join(app.getPath('userData'), 'profiles')
    mkdirSync(dir, { recursive: true })
    const path = join(dir, 'pob-import.json')
    writeFileSync(path, JSON.stringify(profile, null, 2) + '\n')
    this.setPath(path)
    return path
  }

  snapshot(): ProfileSnapshot {
    const profile = this.profile
    const level = this.level
    const trackedClass = this.log.getSnapshot().state.charClass
    const liveIndex = profile ? activeStageIndex(profile, level) : -1
    // The shown stage is a pinned manual view (◀/▶) when set and in range,
    // otherwise the live stage the level maps to.
    const stageIndex =
      liveIndex < 0
        ? -1
        : this.viewIndex != null
          ? Math.min(profile!.stages.length - 1, Math.max(0, this.viewIndex))
          : liveIndex
    const stage = profile && stageIndex >= 0 ? profile.stages[stageIndex] : null

    return {
      meta: profile?.meta ?? null,
      errors: this.errors,
      gemDataError: this.gemDataError,
      level,
      classMismatch:
        !!profile && !!trackedClass && trackedClass !== profile.meta.class ? trackedClass : null,
      activeStage: stage ? resolveStage(stage, stageIndex, this.gems) : null,
      nextStage:
        profile && stageIndex >= 0 && stageIndex + 1 < profile.stages.length
          ? resolveStage(profile.stages[stageIndex + 1], stageIndex + 1, this.gems)
          : null,
      acquisitions: profile ? this.acquisitions(profile, stageIndex) : null,
      stageCount: profile ? profile.stages.length : 0,
      viewedIndex: stageIndex,
      liveIndex
    }
  }

  /** The acquisition views for a stage, recomputed only when an input actually
   *  changed. A snapshot goes out on every level-up and every reload, but the
   *  plan only depends on the stage, the level and the loaded profile — and most
   *  level-ups stay inside the same stage, so the sorting work was being redone
   *  for an identical result. */
  private acquisitions(profile: Profile, stageIndex: number): Acquisitions {
    const key = `${this.profileRevision}|${stageIndex}|${this.level ?? ''}`
    if (this.acqCache?.key === key) return this.acqCache.value
    const value = acquisitionsForStage(profile, stageIndex, this.gems, {
      startingGems: this.startingByClass.get(profile.meta.class),
      playerLevel: this.level,
      startingOwners: this.startingOwners
    })
    this.acqCache = { key, value }
    return value
  }

  /** Page the viewed gem stage (◀/▶). Pins a manual view until it lands back on
   *  the live stage; a level-up then no longer moves what you're reading. */
  stageStep(delta: number): void {
    if (!this.profile) return
    const liveIndex = activeStageIndex(this.profile, this.level)
    this.viewIndex = stepStageView(this.viewIndex, delta, liveIndex, this.profile.stages.length)
    this.push()
  }

  /** Drop the manual view and resume following the tracked level. */
  stageToLive(): void {
    if (this.viewIndex == null) return
    this.viewIndex = null
    this.push()
  }

  private reload(): void {
    // A new/edited profile can shift stage indices — drop any manual paging.
    this.viewIndex = null
    this.profileRevision++
    this.acqCache = null
    const path = this.resolvePath()
    this.watch(path)

    if (!existsSync(path)) {
      this.errors = [`profile file not found: ${path}`]
      this.profile = null
      this.push()
      return
    }
    let text: string
    try {
      text = readFileSync(path, 'utf8')
    } catch (e) {
      this.errors = [`cannot read ${path}: ${(e as Error).message}`]
      this.push()
      return
    }
    const { profile, errors } = parseProfile(text)
    this.errors = errors
    if (profile) this.profile = profile // keep last good on error
    this.push()
  }

  private resolvePath(): string {
    const configured = store.get('profilePath')
    if (configured) return configured
    return app.isPackaged
      ? join(process.resourcesPath, 'profiles', 'example.json')
      : join(app.getAppPath(), 'data', 'profiles', 'example.json')
  }

  // watchFile tolerates a missing file and fires when it appears, so pointing at
  // a not-yet-created profile picks it up on save (same pattern as the guide).
  private watch(path: string): void {
    if (this.watchedPath === path) return
    this.unwatch()
    this.watchedPath = path
    watchFile(path, { interval: 1000 }, () => this.reload())
  }

  private unwatch(): void {
    if (this.watchedPath) unwatchFile(this.watchedPath)
    this.watchedPath = null
  }

  private push(): void {
    this.overlay.window?.webContents.send(Channels.profileState, this.snapshot())
  }
}

/** Read gems.json from the app's resources (packaged) or the repo (dev). Never
 *  throws: an unreadable file yields empty gem data plus the reason, so the Gems
 *  tab can say what's wrong rather than quietly showing every gem as unknown. */
function loadGemData(): { gems: GemData; error: string | null } {
  const path = app.isPackaged
    ? join(process.resourcesPath, 'gems.json')
    : join(app.getAppPath(), 'data', 'gems.json')
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { gems?: Record<string, GemInfo> }
    const gems = raw.gems
    if (!gems || typeof gems !== 'object') {
      return { gems: new GemData({}), error: `gem data at ${path} has no "gems" object` }
    }
    return { gems: new GemData(gems), error: null }
  } catch (e) {
    return { gems: new GemData({}), error: `could not read gem data (${path}): ${(e as Error).message}` }
  }
}
