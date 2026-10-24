// Glue for the run timer: feeds it every log line's time, persists what it
// records to its own file (runs.json in the userData folder — not settings.json,
// which people open and edit by hand), and pushes its state to the timer window.
// Records only while Settings → Run timer is on.

import Store from 'electron-store'
import { RunTimer, type RunTimerSnapshot, type RunTimerState } from './engine.ts'
import { Channels } from '../channels.ts'
import { store } from '../settings.ts'
import type { LogService } from '../log/service.ts'
import type { TimerWindow } from '../timer-window.ts'
import areasEn from '../../data/areas/en.json'

const QUIET_PUSH_MS = 60_000

interface RunsSchema {
  timer: RunTimerState | null
}

export class TimerService {
  private readonly window: TimerWindow
  private readonly runs = new Store<RunsSchema>({ name: 'runs', defaults: { timer: null } })
  private timer: RunTimer
  private enabled: boolean
  private pushTimer: NodeJS.Timeout | null = null
  private pushedAt = 0
  private persistTimer: NodeJS.Timeout | null = null

  constructor(log: LogService, window: TimerWindow) {
    this.window = window
    this.enabled = store.get('runTimer')
    this.timer = new RunTimer({ saved: this.runs.get('timer'), areaNames: areasEn.areas })
    log.addLineListener((stamp, ev) => {
      if (!this.enabled) return
      if (this.timer.feed(stamp, ev)) this.changed()
      // Any line moves the time the window ticks from, without anything
      // shown changing: say so now and then, so its clock doesn't go stale
      // during a long zone.
      else if (Date.now() - this.pushedAt > QUIET_PUSH_MS) this.pushSoon()
    })
  }

  stop(): void {
    if (this.pushTimer) clearTimeout(this.pushTimer)
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistNow()
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    this.window.setEnabled(on)
  }

  snapshot(): RunTimerSnapshot {
    return this.timer.snapshot()
  }

  deleteRun(id: string): void {
    if (this.timer.deleteRun(id)) this.changed()
  }

  private changed(): void {
    this.pushSoon()
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => this.persistNow(), 2000)
  }

  /** A backscan replays a few hundred lines at once — push once, after. */
  private pushSoon(): void {
    if (this.pushTimer) return
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null
      this.pushedAt = Date.now()
      this.window.send(Channels.timerState, this.snapshot())
    }, 200)
  }

  private persistNow(): void {
    this.persistTimer = null
    this.runs.set('timer', this.timer.save())
  }
}
