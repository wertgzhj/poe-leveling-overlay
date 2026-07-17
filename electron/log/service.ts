// Glue between the pure log pipeline (watcher -> parser -> tracker) and the
// Electron app: settings, IPC pushes to the overlay window, and persistence of
// the resume snapshot (§8 restart/resume). The only file in electron/log/ that
// may import Electron modules.

import { LogParser } from './parser.ts'
import { ProgressTracker, type AreaState, type LevelUpEvent } from './tracker.ts'
import { LogFileWatcher } from './watcher.ts'
import { store } from '../settings.ts'
import { Channels, type LogEventSummary, type LogSnapshot } from '../channels.ts'
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

  getSnapshot(): LogSnapshot {
    return {
      status: this.watcher.status(),
      state: this.tracker.snapshot(),
      recent: this.recent
    }
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
