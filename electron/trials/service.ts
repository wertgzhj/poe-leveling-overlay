// Glue for the trials tracker: consumes area events from the log, tracks the
// six trials per bound character, persists, and pushes state to the overlay.

import { TrialsEngine } from './engine.ts'
import { store } from '../settings.ts'
import { Channels, type TrialsSnapshot } from '../channels.ts'
import type { OverlayController } from '../overlay.ts'
import type { LogService } from '../log/service.ts'

const DEFAULT_CHAR_KEY = '(default)'

export class TrialsService {
  private readonly overlay: OverlayController
  private readonly log: LogService
  private engine: TrialsEngine
  private charKey = DEFAULT_CHAR_KEY
  private persistTimer: NodeJS.Timeout | null = null

  constructor(overlay: OverlayController, log: LogService) {
    this.overlay = overlay
    this.log = log
    this.engine = new TrialsEngine()
    log.addAreaListener((area) => this.onZone(area.name))
    // Izaro's plaque line identifies the trial you just finished — auto-check it.
    log.addIzaroListener((line) => this.onIzaro(line))
  }

  start(): void {
    this.charKey = this.log.getSnapshot().state.character ?? DEFAULT_CHAR_KEY
    this.engine = new TrialsEngine(this.loadSeen(this.charKey))
    this.push()
  }

  stop(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistNow()
  }

  snapshot(): TrialsSnapshot {
    return this.engine.snapshot()
  }

  toggle(id: string): void {
    if (this.engine.toggle(id)) this.afterChange()
  }

  reset(): void {
    this.engine.reset()
    this.afterChange()
  }

  private onZone(zoneName: string): void {
    this.syncCharacter()
    if (this.engine.applyZone(zoneName)) this.afterChange()
  }

  private onIzaro(line: string): void {
    this.syncCharacter()
    if (this.engine.completeByIzaro(line)) this.afterChange()
  }

  private syncCharacter(): void {
    const next = this.log.getSnapshot().state.character ?? DEFAULT_CHAR_KEY
    if (next === this.charKey) return
    this.persistNow()
    this.charKey = next
    this.engine = new TrialsEngine(this.loadSeen(next))
    this.push()
  }

  private loadSeen(charKey: string): string[] {
    return store.get('trialsProgress')[charKey] ?? []
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
    const all = { ...store.get('trialsProgress') }
    all[this.charKey] = this.engine.seenIds()
    store.set('trialsProgress', all)
  }

  private push(): void {
    this.overlay.window?.webContents.send(Channels.trialsState, this.snapshot())
  }
}
