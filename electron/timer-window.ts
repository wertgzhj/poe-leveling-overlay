import { join } from 'node:path'
import { BrowserWindow, screen, type Rectangle, type WebContents } from 'electron'
import { store } from './settings'
import { Channels, type OverlayState } from './channels'
import { shouldIgnoreMouse } from './overlay-mouse'

const RENDERER_DEV_URL = process.env['ELECTRON_RENDERER_URL']

/**
 * The run timer's own window: transparent, frameless and on top like the
 * overlay, but placed and sized on its own — a clock wants a corner of the
 * screen, not a spot under the gem list. It has no hotkeys of its own: it
 * shows while the overlay shows, and follows its click-through and move mode,
 * so one Ctrl+Shift+M moves both.
 */
export class TimerWindow {
  private win: BrowserWindow | null = null
  private enabled: boolean
  private state: OverlayState = { visible: false, clickThrough: true, moveMode: false, settingsOpen: false }
  private hoverUi = false
  private saveTimer: NodeJS.Timeout | null = null

  constructor() {
    this.enabled = store.get('runTimer')
  }

  get window(): BrowserWindow | null {
    return this.win
  }

  /** Whether this window's page sent an IPC message (hover, resize). */
  owns(sender: WebContents): boolean {
    return !!this.win && !this.win.isDestroyed() && this.win.webContents === sender
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    this.apply()
  }

  /** The overlay's interaction state changed. */
  follow(state: OverlayState): void {
    this.state = state
    this.apply()
  }

  setHoverUi(over: boolean): void {
    if (this.hoverUi === over) return
    this.hoverUi = over
    this.applyMouseEvents()
  }

  resizeBy(dx: number, dy: number): void {
    if (!this.win || !this.state.moveMode) return
    const b = this.win.getBounds()
    const width = Math.max(200, Math.round(b.width + dx))
    const height = Math.max(120, Math.round(b.height + dy))
    this.win.setBounds({ x: b.x, y: b.y, width, height })
  }

  send(channel: string, payload: unknown): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send(channel, payload)
  }

  destroy(): void {
    this.win?.destroy()
    this.win = null
  }

  private apply(): void {
    const show = this.enabled && this.state.visible
    if (!show) {
      if (this.win && !this.win.isDestroyed()) this.win.hide()
      return
    }
    if (!this.win || this.win.isDestroyed()) {
      this.create()
      return // shown on ready-to-show
    }
    if (!this.win.isVisible()) {
      this.win.showInactive()
      this.win.setAlwaysOnTop(true, 'screen-saver')
    }
    this.applyMouseEvents()
    this.win.webContents.send(Channels.overlayState, this.state)
  }

  private create(): void {
    this.win = new BrowserWindow({
      ...this.resolveBounds(),
      show: false,
      frame: false,
      transparent: true,
      resizable: true,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // A clock that ticks while the game has focus — see overlay.ts.
        backgroundThrottling: false
      }
    })
    this.win.setAlwaysOnTop(true, 'screen-saver')
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    if (RENDERER_DEV_URL) {
      void this.win.loadURL(`${RENDERER_DEV_URL}/timer/index.html`)
    } else {
      void this.win.loadFile(join(__dirname, '../renderer/timer/index.html'))
    }

    this.win.once('ready-to-show', () => this.apply())
    this.win.on('moved', () => this.persistBoundsSoon())
    this.win.on('resized', () => this.persistBoundsSoon())
    this.win.on('closed', () => {
      this.win = null
    })
  }

  private applyMouseEvents(): void {
    if (!this.win || this.win.isDestroyed()) return
    const ignore = shouldIgnoreMouse({
      moveMode: this.state.moveMode,
      clickThrough: this.state.clickThrough,
      settingsOpen: false,
      hoverUi: this.hoverUi
    })
    this.win.setIgnoreMouseEvents(ignore, { forward: true })
  }

  private persistBoundsSoon(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      if (!this.win || this.win.isDestroyed()) return
      const { x, y, width, height } = this.win.getBounds()
      store.set('timerBounds', { x, y, width, height })
    }, 400)
  }

  /** The saved rectangle, or the primary display's top-right corner when
   *  there's none or it's on no connected monitor. */
  private resolveBounds(): Rectangle {
    const { x, y, width, height } = store.get('timerBounds')
    if (x != null && y != null) {
      const onScreen = screen.getAllDisplays().some((d) => {
        const wa = d.workArea
        return x < wa.x + wa.width && x + width > wa.x && y < wa.y + wa.height && y + height > wa.y
      })
      if (onScreen) return { x, y, width, height }
    }
    const wa = screen.getPrimaryDisplay().workArea
    return { x: wa.x + wa.width - width - 24, y: wa.y + 24, width, height }
  }
}
