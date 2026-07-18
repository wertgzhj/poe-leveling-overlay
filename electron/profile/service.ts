// Glue between the pure profile engine and the Electron app: profile file load
// with hot reload, gem data, live active-stage tracking from the bound
// character's level, and IPC pushes. Profiles resolve from settings.profilePath
// (owner's file) or the bundled example; gems.json ships with the app.

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, watchFile, unwatchFile } from 'node:fs'
import { join } from 'node:path'
import { parseProfile, type Profile } from './profile.ts'
import { GemData, type GemInfo } from './gems.ts'
import { activeStageIndex, resolveStage, acquisitionsForStage } from './engine.ts'
import { store } from '../settings.ts'
import { Channels, type ProfileSnapshot } from '../channels.ts'
import type { OverlayController } from '../overlay.ts'
import type { LogService } from '../log/service.ts'
import gemsJson from '../../data/gems.json'

export class ProfileService {
  private readonly overlay: OverlayController
  private readonly log: LogService
  private readonly gems: GemData
  private profile: Profile | null = null
  private errors: string[] = []
  private level: number | null = null
  private watchedPath: string | null = null

  constructor(overlay: OverlayController, log: LogService) {
    this.overlay = overlay
    this.log = log
    this.gems = new GemData(gemsJson.gems as Record<string, GemInfo>)
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
    const stageIndex = profile ? activeStageIndex(profile, level) : -1
    const stage = profile && stageIndex >= 0 ? profile.stages[stageIndex] : null

    return {
      meta: profile?.meta ?? null,
      errors: this.errors,
      level,
      classMismatch:
        !!profile && !!trackedClass && trackedClass !== profile.meta.class ? trackedClass : null,
      activeStage: stage ? resolveStage(stage, stageIndex, this.gems) : null,
      nextStage:
        profile && stageIndex >= 0 && stageIndex + 1 < profile.stages.length
          ? resolveStage(profile.stages[stageIndex + 1], stageIndex + 1, this.gems)
          : null,
      acquisitions: profile ? acquisitionsForStage(profile, stageIndex, this.gems) : null
    }
  }

  private reload(): void {
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
