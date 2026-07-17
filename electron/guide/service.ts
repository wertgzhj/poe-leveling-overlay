// Glue between the pure guide engine and the Electron app: route file loading
// with hot reload (authoring feedback loop), per-character progress
// persistence, hotkey actions, and IPC pushes. Route files resolve from
// userData/routes/ (override) first, then the repo's data/campaign/ in dev or
// resources/campaign/ when packaged.

import { app } from 'electron'
import { existsSync, readFileSync, watchFile, unwatchFile } from 'node:fs'
import { join } from 'node:path'
import { parseRoute, type Route } from './route.ts'
import { GuideEngine } from './engine.ts'
import { store } from '../settings.ts'
import { Channels, type GuideState } from '../channels.ts'
import type { OverlayController } from '../overlay.ts'
import type { LogService } from '../log/service.ts'
import type { AreaState } from '../log/tracker.ts'

const ROUTE_FILE = 'act1.json'
const DEFAULT_CHAR_KEY = '(default)'

export class GuideService {
  private readonly overlay: OverlayController
  private readonly log: LogService
  private engine: GuideEngine | null = null
  private route: Route | null = null
  private errors: string[] = []
  private charKey = DEFAULT_CHAR_KEY
  private watched: string[] = []
  private persistTimer: NodeJS.Timeout | null = null

  constructor(overlay: OverlayController, log: LogService) {
    this.overlay = overlay
    this.log = log
    log.addAreaListener((area) => this.onArea(area))
  }

  start(): void {
    this.reload()
    // Watch both candidate paths — watchFile tolerates missing files and fires
    // when they appear, so creating an override picks it up automatically.
    for (const p of this.candidatePaths()) {
      watchFile(p, { interval: 1000 }, () => this.reload())
      this.watched.push(p)
    }
  }

  stop(): void {
    for (const p of this.watched) unwatchFile(p)
    this.watched = []
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistNow()
  }

  snapshot(): GuideState {
    const engineSnap = this.engine?.snapshot()
    return {
      route: this.route,
      errors: this.errors,
      doneIds: engineSnap?.doneIds ?? [],
      cursorIndex: engineSnap?.cursorIndex ?? 0,
      cursorStepId: engineSnap?.cursorStepId ?? null
    }
  }

  forward(): void {
    if (this.engine?.forward()) this.afterChange()
  }

  back(): void {
    if (this.engine?.back()) this.afterChange()
  }

  toggleStep(stepId: string): void {
    if (typeof stepId === 'string' && this.engine?.toggle(stepId)) this.afterChange()
  }

  reset(): void {
    if (!this.engine) return
    this.engine.reset()
    this.afterChange()
  }

  private onArea(area: AreaState): void {
    if (!this.engine) return
    this.syncCharacter()
    if (this.engine.applyArea({ areaId: area.areaId, name: area.name })) {
      this.afterChange()
    }
  }

  /** Progress is stored per bound character, so an alt does not inherit the
   *  main's guide position. Rechecked lazily on each area event. */
  private syncCharacter(): void {
    const next = this.log.getSnapshot().state.character ?? DEFAULT_CHAR_KEY
    if (next === this.charKey) return
    this.persistNow()
    this.charKey = next
    if (this.route) {
      this.engine = new GuideEngine(this.route, this.loadDone(next))
      this.push()
    }
  }

  private reload(): void {
    const path = this.candidatePaths().find((p) => existsSync(p))
    if (!path) {
      this.errors = [`no route file found — expected data/campaign/${ROUTE_FILE}`]
      this.route = null
      this.engine = null
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

    const { route, errors } = parseRoute(text)
    this.errors = errors
    if (!route) {
      // Keep the last good route running while the author fixes the file —
      // the errors are shown in the panel either way.
      this.push()
      return
    }

    this.route = route
    this.charKey = this.log.getSnapshot().state.character ?? DEFAULT_CHAR_KEY
    if (this.engine) {
      this.engine.setRoute(route) // keep in-memory progress across hot reloads
    } else {
      this.engine = new GuideEngine(route, this.loadDone(this.charKey))
    }
    this.push()
  }

  private candidatePaths(): string[] {
    const override = join(app.getPath('userData'), 'routes', ROUTE_FILE)
    const bundled = app.isPackaged
      ? join(process.resourcesPath, 'campaign', ROUTE_FILE)
      : join(app.getAppPath(), 'data', 'campaign', ROUTE_FILE)
    return [override, bundled]
  }

  private loadDone(charKey: string): string[] {
    return store.get('guideProgress')[charKey] ?? []
  }

  private afterChange(): void {
    this.persistSoon()
    this.push()
  }

  private persistSoon(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => this.persistNow(), 1000)
  }

  private persistNow(): void {
    if (!this.engine) return
    const all = { ...store.get('guideProgress') }
    all[this.charKey] = this.engine.snapshot().doneIds
    store.set('guideProgress', all)
  }

  private push(): void {
    this.overlay.window?.webContents.send(Channels.guideState, this.snapshot())
  }
}
