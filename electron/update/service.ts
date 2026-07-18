// In-app auto-update (plan §9 P6+ / backlog "effortless updates"). Wraps
// electron-updater's autoUpdater, which reads the update feed baked in at build
// time (app-update.yml -> the GitHub Releases of this repo, see the `publish`
// block in electron-builder.yml). The flow the user sees: on launch we check,
// download a newer version in the background, then show a "restart to update"
// prompt — one click installs. Nobody has to watch GitHub.
//
// Only runs in a packaged build: unpackaged/dev has no app-update.yml, so we
// report `disabled` and never touch the network. All state is pushed to the
// renderer so the overlay can show progress; nothing here is fatal — a
// missing/unreachable feed becomes an `error` status, not a crash.

import { app } from 'electron'
import electronUpdater from 'electron-updater'
import { Channels, type UpdateStatus } from '../channels.ts'
import type { OverlayController } from '../overlay.ts'

const { autoUpdater } = electronUpdater

// Re-check a few times a day so a long play session still picks up a release.
const RECHECK_MS = 6 * 60 * 60 * 1000
// Let the app settle before the first check (don't compete with startup work).
const FIRST_CHECK_MS = 10 * 1000

export class UpdateService {
  private readonly overlay: OverlayController
  private status: UpdateStatus = { state: 'idle' }
  private timer: NodeJS.Timeout | null = null
  private firstTimer: NodeJS.Timeout | null = null

  constructor(overlay: OverlayController) {
    this.overlay = overlay
  }

  start(): void {
    if (!app.isPackaged) {
      this.set({ state: 'disabled', reason: 'updates run in the installed build only' })
      return
    }

    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    // We drive our own UI, so don't let electron-updater pop native dialogs.
    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking' }))
    autoUpdater.on('update-available', (info) =>
      this.set({ state: 'downloading', version: info.version, percent: 0 })
    )
    autoUpdater.on('update-not-available', (info) =>
      this.set({ state: 'current', version: info.version })
    )
    autoUpdater.on('download-progress', (p) =>
      this.set({ state: 'downloading', version: this.versionOf(), percent: Math.round(p.percent) })
    )
    autoUpdater.on('update-downloaded', (info) =>
      this.set({ state: 'ready', version: info.version })
    )
    autoUpdater.on('error', (err) =>
      this.set({ state: 'error', message: err == null ? 'unknown error' : String(err.message ?? err) })
    )

    this.firstTimer = setTimeout(() => this.check(), FIRST_CHECK_MS)
    this.timer = setInterval(() => this.check(), RECHECK_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    if (this.firstTimer) clearTimeout(this.firstTimer)
    this.timer = null
    this.firstTimer = null
  }

  snapshot(): UpdateStatus {
    return this.status
  }

  /** Manual check (Settings button). No-op unless packaged. */
  check(): void {
    if (!app.isPackaged) return
    // Don't stack checks on top of an in-flight download/ready state.
    if (this.status.state === 'downloading' || this.status.state === 'ready') return
    autoUpdater.checkForUpdates().catch((err: unknown) =>
      this.set({ state: 'error', message: err instanceof Error ? err.message : String(err) })
    )
  }

  /** Quit and install a downloaded update. Only valid in the `ready` state. */
  install(): void {
    if (this.status.state !== 'ready') return
    // Per-user install (perMachine: false) needs no UAC, so a silent reinstall +
    // relaunch is the "effortless" path: click Restart, it swaps and reopens.
    autoUpdater.quitAndInstall(true, true)
  }

  private versionOf(): string {
    return this.status.state === 'downloading' ? this.status.version : ''
  }

  private set(status: UpdateStatus): void {
    this.status = status
    this.overlay.window?.webContents.send(Channels.updateStatus, status)
  }
}
