// In-app auto-update. Wraps
// electron-updater's autoUpdater, which reads the update feed baked in at build
// time (app-update.yml -> the GitHub Releases of this repo, see the `publish`
// block in electron-builder.yml). The flow the user sees: on launch we check,
// download a newer version in the background, then show a "restart to update"
// prompt — one click installs. Nobody has to watch GitHub.
//
// The portable exe only checks: electron-updater's feed is the installer, and
// installing it on quit would turn a portable copy into an installed one behind
// the player's back. It says a newer version is out and links the Releases page.
//
// Only runs in a packaged build: unpackaged/dev has no app-update.yml, so we
// report `disabled` and never touch the network. All state is pushed to the
// renderer so the overlay can show progress; nothing here is fatal — a
// missing/unreachable feed becomes an `error` status, not a crash.

import { app, shell } from 'electron'
import electronUpdater from 'electron-updater'
import { Channels, type UpdateStatus } from '../channels.ts'
import { classifyUpdateError } from './errors.ts'
import type { OverlayController } from '../overlay.ts'

const { autoUpdater } = electronUpdater

// Re-check a few times a day so a long play session still picks up a release.
const RECHECK_MS = 6 * 60 * 60 * 1000
// Let the app settle before the first check (don't compete with startup work).
const FIRST_CHECK_MS = 10 * 1000
const RELEASES_URL = 'https://github.com/wertgzhj/poe-leveling-overlay/releases/latest'

/** electron-builder's portable launcher sets this before starting the app. */
const isPortable = (): boolean => !!process.env['PORTABLE_EXECUTABLE_DIR']

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

    const portable = isPortable()
    autoUpdater.autoDownload = !portable
    autoUpdater.autoInstallOnAppQuit = !portable
    // We drive our own UI, so don't let electron-updater pop native dialogs.
    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking' }))
    autoUpdater.on('update-available', (info) =>
      this.set(
        portable
          ? { state: 'available', version: info.version }
          : { state: 'downloading', version: info.version, percent: 0 }
      )
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
    autoUpdater.on('error', (err) => this.fail(err))

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
    autoUpdater.checkForUpdates().catch((err: unknown) => this.fail(err))
  }

  /** Quit and install a downloaded update. Only valid in the `ready` state. */
  install(): void {
    if (this.status.state !== 'ready') return
    // Per-user install (perMachine: false) needs no UAC, so a silent reinstall +
    // relaunch is the "effortless" path: click Restart, it swaps and reopens.
    autoUpdater.quitAndInstall(true, true)
  }

  /** The Releases page, for a portable copy to fetch its next version from. */
  openReleases(): void {
    void shell.openExternal(RELEASES_URL)
  }

  /** A failed check, said the way a player can use it (see errors.ts). */
  private fail(err: unknown): void {
    const problem = classifyUpdateError(err)
    this.set(
      problem.kind === 'publishing'
        ? { state: 'publishing', version: problem.version }
        : { state: 'error', message: problem.message }
    )
  }

  private versionOf(): string {
    return this.status.state === 'downloading' ? this.status.version : ''
  }

  private set(status: UpdateStatus): void {
    this.status = status
    this.overlay.window?.webContents.send(Channels.updateStatus, status)
  }
}
