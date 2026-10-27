import { join } from 'node:path'
import { BrowserWindow, screen, type Rectangle, type WebContents } from 'electron'
import { store } from './settings'
import { Channels, type OverlayState } from './channels'
import { shouldIgnoreMouse } from './overlay-mouse'

const RENDERER_DEV_URL = process.env['ELECTRON_RENDERER_URL']

/** Header and a line or two: the smallest the window shrinks to. */
const MIN_HEIGHT = 80

/**
 * The run timer's own window: transparent, frameless and on top like the
 * overlay, but placed and sized on its own — a clock wants a corner of the
 * screen, not a spot under the gem list. It shows and hides on its own hotkey
 * (the overlay's leaves it be: a timer is often wanted while the gem list
 * isn't), and follows the overlay's click-through and move mode, so one
 * Ctrl+Shift+M moves both.
 */
export class TimerWindow {
  private win: BrowserWindow | null = null
  private enabled: boolean
  private shown: boolean
  private state: OverlayState = { visible: false, clickThrough: true, moveMode: false, settingsOpen: false, view: 'panel' }
  private hoverUi = false
  private saveTimer: NodeJS.Timeout | null = null
  /** what the page last said its panel needs — refitted after a move */
  private needed = 0

  constructor() {
    this.enabled = store.get('runTimer')
    this.shown = store.get('timerShown')
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
    // Switching it on means wanting to see it, whatever its hotkey last did.
    if (on && !this.shown) {
      this.shown = true
      store.set('timerShown', true)
    }
    this.apply()
  }

  /** Show or hide the window (its hotkey, the tray). Nothing while the timer
   *  is switched off in Settings. */
  toggle(): void {
    if (!this.enabled) return
    this.shown = !this.shown
    store.set('timerShown', this.shown)
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

  /** The resize grip sets the width; the height follows the content. */
  resizeBy(dx: number, _dy: number): void {
    if (!this.win || !this.state.moveMode) return
    const b = this.win.getBounds()
    const width = Math.max(200, Math.round(b.width + dx))
    this.win.setBounds({ x: b.x, y: b.y, width, height: b.height })
  }

  /** As tall as the page says its panel needs, from where the window's top
   *  is down to the bottom of that screen at most — past that, it scrolls. */
  fitHeight(needed: number): void {
    this.needed = needed
    if (!this.win || this.win.isDestroyed()) return
    const b = this.win.getBounds()
    const wa = screen.getDisplayMatching(b).workArea
    const room = wa.y + wa.height - b.y
    const height = Math.round(Math.max(MIN_HEIGHT, Math.min(needed, room)))
    if (height !== b.height) this.win.setBounds({ x: b.x, y: b.y, width: b.width, height })
  }

  send(channel: string, payload: unknown): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send(channel, payload)
  }

  destroy(): void {
    this.win?.destroy()
    this.win = null
  }

  private apply(): void {
    const show = this.enabled && this.shown
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
    this.win.on('moved', () => {
      // Dragged lower, there's less room below; higher, more.
      this.fitHeight(this.needed)
      this.persistBoundsSoon()
    })
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
