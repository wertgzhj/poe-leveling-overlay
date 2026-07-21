// Glue between the pure log pipeline (watcher -> parser -> tracker) and the
// Electron app: settings, IPC pushes to the overlay window, and persistence of
// the resume snapshot (§8 restart/resume). The only file in electron/log/ that
// may import Electron modules.

import { LogParser } from './parser.ts'
import { ProgressTracker, type AreaState, type LevelUpEvent } from './tracker.ts'
import { LogFileWatcher } from './watcher.ts'
import { store } from '../settings.ts'
import { Channels, type DetectedCharacter, type LogEventSummary, type LogSnapshot } from '../channels.ts'
import type { OverlayController } from '../overlay.ts'
import patternsEn from '../../data/log-patterns/en.json'
import areasEn from '../../data/areas/en.json'

const RECENT_MAX = 100

export class LogService {
  private readonly overlay: OverlayController
  private parser: LogParser
  private tracker: ProgressTracker
  private readonly watcher: LogFileWatcher
  private recent: LogEventSummary[] = []
  private persistTimer: NodeJS.Timeout | null = null
  /** In-main consumers of live area events (e.g. the guide). */
  private areaListeners: Array<(area: AreaState) => void> = []
  /** In-main consumers of bound-character level changes (e.g. the gem panel). */
  private levelListeners: Array<(level: number) => void> = []

  constructor(overlay: OverlayController) {
    this.overlay = overlay
    this.parser = new LogParser(patternsEn.patterns)
    this.tracker = this.makeTracker()
    this.watcher = new LogFileWatcher(
      {
        onBackscan: (lines) => this.onBackscan(lines),
        onLines: (lines) => this.onLines(lines),
        onStatus: (status) => this.send(Channels.logStatus, status)
      },
      { pollMs: 300 }
    )
  }

  start(): void {
    const path = store.get('clientTxtPath')
    if (path) {
      this.watcher.start(path)
    } else {
      this.send(Channels.logStatus, this.watcher.status())
    }
  }

  stop(): void {
    this.watcher.stop()
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistNow()
  }

  setPath(path: string | null): void {
    if (path) {
      this.watcher.start(path) // restart = fresh backscan on the new file
    } else {
      this.watcher.stop()
      this.send(Channels.logStatus, this.watcher.status())
    }
  }

  setCharacter(name: string | null): void {
    this.tracker.setBoundCharacter(name)
    this.persistSoon()
    this.pushSnapshot()
  }

  addAreaListener(listener: (area: AreaState) => void): void {
    this.areaListeners.push(listener)
  }

  addLevelListener(listener: (level: number) => void): void {
    this.levelListeners.push(listener)
  }

  getSnapshot(): LogSnapshot {
    return {
      status: this.watcher.status(),
      state: this.tracker.snapshot(),
      recent: this.recent
    }
  }

  /** Manual re-detect (overlay button): lock tracking onto the character from
   *  the most recent level-up in the log. Returns the detected character, or
   *  null when the log has no level-up yet. */
  detectCharacter(): DetectedCharacter | null {
    const found = this.tracker.detectCurrentCharacter()
    this.persistSoon()
    this.pushSnapshot()
    return found
  }

  private makeTracker(): ProgressTracker {
    return new ProgressTracker({
      areaNames: areasEn.areas,
      boundCharacter: store.get('characterName'),
      callbacks: {
        onArea: (area) => this.onArea(area),
        onLevelUp: (ev) => this.onLevelUp(ev)
      }
    })
  }

  private onBackscan(lines: string[]): void {
    // Fresh attach (new path or truncated file): rebuild tracker state from
    // the log tail — the log is ground truth. Persisted state only fills the
    // gaps the tail couldn't answer (e.g. the log was deleted).
    this.tracker = this.makeTracker()
    this.tracker.backscan(lines, this.parser)
    const persisted = store.get('progress')
    if (persisted) this.tracker.hydrate(persisted)
    this.persistSoon()
    this.pushSnapshot()
    // The backscan replays silently (no per-line events), so consumers that
    // registered before it finished would otherwise sit on stale state until
    // the next LIVE event — the gem panel stuck on stage 1 after a restart
    // until you happened to level. Push the resumed end state to them once.
    const state = this.tracker.snapshot()
    if (state.level != null) for (const listener of this.levelListeners) listener(state.level)
    if (state.area) for (const listener of this.areaListeners) listener(state.area)
  }

  private onLines(lines: string[]): void {
    for (const line of lines) {
      const ev = this.parser.parseLine(line)
      if (ev) this.tracker.handle(ev)
    }
  }

  private onArea(area: AreaState): void {
    this.remember({
      kind: 'area',
      ts: area.ts,
      text: `→ ${area.name}${area.areaLevel != null ? ` (lvl ${area.areaLevel})` : ''}${area.areaId ? ` [${area.areaId}]` : ''}`
    })
    this.send(Channels.areaEntered, area)
    for (const listener of this.areaListeners) listener(area)
    this.persistSoon()
  }

  private onLevelUp(ev: LevelUpEvent): void {
    this.remember({
      kind: 'levelup',
      ts: ev.ts,
      text: `${ev.name} (${ev.charClass}) → level ${ev.level}${ev.isBound ? '' : ' — other player'}`
    })
    this.send(Channels.playerLevelUp, ev)
    if (ev.isBound) for (const listener of this.levelListeners) listener(ev.level)
    this.persistSoon()
  }

  private remember(entry: LogEventSummary): void {
    this.recent.push(entry)
    if (this.recent.length > RECENT_MAX) this.recent.splice(0, this.recent.length - RECENT_MAX)
  }

  private pushSnapshot(): void {
    this.send(Channels.logSnapshot, this.getSnapshot())
  }

  private persistSoon(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => this.persistNow(), 1000)
  }

  private persistNow(): void {
    store.set('progress', this.tracker.snapshot())
  }

  private send(channel: string, payload: unknown): void {
    this.overlay.window?.webContents.send(channel, payload)
  }
}
