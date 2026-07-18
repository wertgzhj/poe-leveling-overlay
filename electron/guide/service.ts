// Glue between the pure guide engine and the Electron app. Loads per-act route
// files (act1.json … act10.json) and merges them into one campaign step list
// with hot reload, per-character progress, hotkey actions, and IPC pushes.
// Each act resolves from userData/routes/ (owner override) first, then the
// bundled data/campaign/ (dev) or resources/campaign/ (packaged) — so the owner
// can override a single act or all of them.

import { app } from 'electron'
import { existsSync, readFileSync, watchFile, unwatchFile } from 'node:fs'
import { join } from 'node:path'
import { parseRoute, combineRoutes, type Route } from './route.ts'
import { GuideEngine } from './engine.ts'
import { store } from '../settings.ts'
import { Channels, type GuideState } from '../channels.ts'
import type { OverlayController } from '../overlay.ts'
import type { LogService } from '../log/service.ts'
import type { AreaState } from '../log/tracker.ts'

const ACTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const
const DEFAULT_CHAR_KEY = '(default)'

export class GuideService {
  private readonly overlay: OverlayController
  private readonly log: LogService
  private engine: GuideEngine | null = null
  private route: Route | null = null
  private acts: number[] = []
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
    // Watch every candidate path (override + bundled for each act) once —
    // watchFile tolerates missing files and fires when one is created, so a new
    // override is picked up on save.
    for (const paths of this.candidatePaths().values()) {
      for (const p of paths) {
        watchFile(p, { interval: 1000 }, () => this.reload())
        this.watched.push(p)
      }
    }
    this.reload()
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
      acts: this.acts,
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
    const routes: Route[] = []
    const errors: string[] = []
    for (const [act, paths] of this.candidatePaths()) {
      const path = paths.find((p) => existsSync(p))
      if (!path) continue
      let text: string
      try {
        text = readFileSync(path, 'utf8')
      } catch (e) {
        errors.push(`act ${act}: cannot read (${(e as Error).message})`)
        continue
      }
      const { route, errors: routeErrors } = parseRoute(text)
      for (const err of routeErrors) errors.push(`act${act}.json: ${err}`)
      if (route) {
        if (route.act !== act) errors.push(`act${act}.json declares act ${route.act} — using file position`)
        routes.push({ ...route, act })
      }
    }

    if (routes.length === 0) {
      this.errors = errors.length ? errors : ['no route files found in data/campaign/']
      this.route = null
      this.engine = null
      this.acts = []
      this.push()
      return
    }

    const combined = combineRoutes(routes)
    this.errors = [...errors, ...combined.errors]
    this.acts = combined.acts
    const route: Route = { act: combined.acts[0], name: 'Campaign', steps: combined.steps }
    this.route = route
    this.charKey = this.log.getSnapshot().state.character ?? DEFAULT_CHAR_KEY
    if (this.engine) {
      this.engine.setRoute(route) // keep in-memory progress across hot reloads
    } else {
      this.engine = new GuideEngine(route, this.loadDone(this.charKey))
    }
    this.push()
  }

  /** act -> [override path, bundled path], highest priority first. */
  private candidatePaths(): Map<number, string[]> {
    const map = new Map<number, string[]>()
    const routesDir = join(app.getPath('userData'), 'routes')
    const bundledDir = app.isPackaged
      ? join(process.resourcesPath, 'campaign')
      : join(app.getAppPath(), 'data', 'campaign')
    for (const act of ACTS) {
      const file = `act${act}.json`
      map.set(act, [join(routesDir, file), join(bundledDir, file)])
    }
    return map
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
