import { join } from 'node:path'
import { app, BrowserWindow, screen, type Rectangle } from 'electron'
import { store } from './settings'
import { Channels, type OverlayState } from './channels'
import { shouldIgnoreMouse } from './overlay-mouse'

const RENDERER_DEV_URL = process.env['ELECTRON_RENDERER_URL']

/**
 * Owns the single transparent overlay window and its interaction state
 * (visibility, click-through, move/resize mode). Nothing here talks to the
 * game — the window only ever sits on top and reads input meant for itself.
 */
export class OverlayController {
  private win: BrowserWindow | null = null
  private clickThrough: boolean
  private moveMode = false
  private settingsOpen = false
  private hoverUi = false
  private saveTimer: NodeJS.Timeout | null = null

  constructor() {
    this.clickThrough = store.get('clickThrough')
  }

  get window(): BrowserWindow | null {
    return this.win
  }

  create(): BrowserWindow {
    const bounds = this.resolveBounds()

    this.win = new BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      transparent: true,
      resizable: true,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      // Overlays never hold focus while the game runs; without this Electron
      // throttles the unfocused renderer and live updates stutter (plan §4).
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false
      }
    })

    // Sit above borderless-fullscreen games; 'screen-saver' outranks plain
    // always-on-top which games intermittently beat (plan §4/§8).
    this.win.setAlwaysOnTop(true, 'screen-saver')
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    if (RENDERER_DEV_URL) {
      void this.win.loadURL(RENDERER_DEV_URL)
    } else {
      void this.win.loadFile(join(__dirname, '../renderer/index.html'))
    }

    this.win.once('ready-to-show', () => {
      this.applyMouseEvents()
      this.win?.show()
      this.pushState()
    })

    this.win.on('moved', () => this.persistBoundsSoon())
    this.win.on('resized', () => this.persistBoundsSoon())
    this.win.on('closed', () => {
      this.win = null
    })

    return this.win
  }

  toggleVisibility(): void {
    if (!this.win) return
    if (this.win.isVisible()) {
      this.win.hide()
    } else {
      this.win.showInactive()
      this.win.setAlwaysOnTop(true, 'screen-saver')
    }
    this.pushState()
  }

  toggleClickThrough(): void {
    this.setClickThrough(!this.clickThrough)
  }

  setClickThrough(value: boolean): void {
    this.clickThrough = value
    store.set('clickThrough', value)
    this.applyMouseEvents()
    this.pushState()
  }

  setSettingsOpen(on: boolean): void {
    this.settingsOpen = on
    // Settings must be interactable even if click-through is the user's default.
    if (on && !this.win?.isVisible()) this.win?.showInactive()
    this.applyMouseEvents()
    this.pushState()
  }

  toggleMoveMode(): void {
    this.setMoveMode(!this.moveMode)
  }

  setMoveMode(on: boolean): void {
    this.moveMode = on
    // Entering move mode must guarantee the window can be grabbed even if
    // click-through is the user's normal preference.
    if (on && !this.win?.isVisible()) this.win?.showInactive()
    this.applyMouseEvents()
    this.pushState()
  }

  resizeBy(dx: number, dy: number): void {
    if (!this.win || !this.moveMode) return
    const b = this.win.getBounds()
    const width = Math.max(220, Math.round(b.width + dx))
    const height = Math.max(160, Math.round(b.height + dy))
    this.win.setBounds({ x: b.x, y: b.y, width, height })
  }

  getState(): OverlayState {
    return {
      visible: this.win?.isVisible() ?? false,
      clickThrough: this.clickThrough,
      moveMode: this.moveMode,
      settingsOpen: this.settingsOpen
    }
  }

  /** Renderer-reported hover state: cursor is over visible UI (the panel). */
  setHoverUi(over: boolean): void {
    if (this.hoverUi === over) return
    this.hoverUi = over
    this.applyMouseEvents()
  }

  private applyMouseEvents(): void {
    if (!this.win) return
    // Decision is a pure function (overlay-mouse.ts, unit-tested). forward:true
    // keeps mousemove flowing so the renderer can keep reporting hover even when
    // the window is currently ignoring clicks.
    const ignore = shouldIgnoreMouse({
      moveMode: this.moveMode,
      clickThrough: this.clickThrough,
      settingsOpen: this.settingsOpen,
      hoverUi: this.hoverUi
    })
    this.win.setIgnoreMouseEvents(ignore, { forward: true })
  }

  private pushState(): void {
    this.win?.webContents.send(Channels.overlayState, this.getState())
  }

  private persistBoundsSoon(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      if (!this.win) return
      const { x, y, width, height } = this.win.getBounds()
      store.set('bounds', { x, y, width, height })
    }, 400)
  }

  /**
   * Restore the saved window rectangle, but fall back to the primary display
   * if the saved position is off every currently-connected monitor (a monitor
   * was unplugged, resolution changed, etc.) — plan §8 multi-monitor.
   */
  private resolveBounds(): Rectangle {
    const saved = store.get('bounds')
    const width = saved.width
    const height = saved.height

    if (saved.x == null || saved.y == null) {
      return this.centerOnPrimary(width, height)
    }

    const onScreen = screen.getAllDisplays().some((d) => {
      const wa = d.workArea
      return (
        saved.x! < wa.x + wa.width &&
        saved.x! + width > wa.x &&
        saved.y! < wa.y + wa.height &&
        saved.y! + height > wa.y
      )
    })

    return onScreen
      ? { x: saved.x, y: saved.y, width, height }
      : this.centerOnPrimary(width, height)
  }

  private centerOnPrimary(width: number, height: number): Rectangle {
    const wa = screen.getPrimaryDisplay().workArea
    return {
      x: Math.round(wa.x + (wa.width - width) / 2),
      y: Math.round(wa.y + (wa.height - height) / 3),
      width,
      height
    }
  }
}

export function isDev(): boolean {
  return !!RENDERER_DEV_URL || !app.isPackaged
}
