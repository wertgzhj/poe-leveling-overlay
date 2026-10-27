import { join } from 'node:path'
import { app, BrowserWindow, screen, type Rectangle } from 'electron'
import { store } from './settings'
import { Channels, type OverlayState } from './channels'
import { shouldIgnoreMouse } from './overlay-mouse'
import { anchoredResize, defaultStripBounds } from './strip-place.ts'

const RENDERER_DEV_URL = process.env['ELECTRON_RENDERER_URL']

/**
 * Owns the single transparent overlay window and its interaction state
 * (visibility, click-through, move/resize mode). Nothing here talks to the
 * game: the window only ever sits on top and reads input meant for itself.
 *
 * With the compact strip on (a preview, Settings → Overlay), the window shows
 * one of two views, each where you put it: the strip, sized to its content and
 * growing away from its screen edge, or the full panel, on its hotkey. Settings
 * always opens on the panel's rectangle: it needs the room.
 */
export class OverlayController {
  private win: BrowserWindow | null = null
  private clickThrough: boolean
  private moveMode = false
  private settingsOpen = false
  private hoverUi = false
  private stripEnabled: boolean
  /** the full panel is open over the strip (its hotkey) */
  private panelOpen = false
  /** the view the window's rectangle is for */
  private shownView: 'strip' | 'panel'
  private saveTimer: NodeJS.Timeout | null = null
  private stateListeners: Array<(state: OverlayState) => void> = []

  constructor() {
    this.clickThrough = store.get('clickThrough')
    this.stripEnabled = store.get('stripEnabled')
    this.shownView = this.view()
  }

  get window(): BrowserWindow | null {
    return this.win
  }

  /** The compact strip is on (its hotkey is only taken then). */
  get stripOn(): boolean {
    return this.stripEnabled
  }

  create(): BrowserWindow {
    const bounds = this.shownView === 'strip' ? this.stripBounds() : this.resolveBounds()

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
      // throttles the unfocused renderer and live updates stutter.
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false
      }
    })

    // Sit above borderless-fullscreen games; 'screen-saver' outranks plain
    // always-on-top which games intermittently beat.
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
    this.applyView()
    this.applyMouseEvents()
    this.pushState()
  }

  /** Switch the compact strip on or off (Settings → Overlay). */
  setStripEnabled(on: boolean): void {
    this.stripEnabled = on
    store.set('stripEnabled', on)
    this.panelOpen = false
    this.applyView()
    this.pushState()
  }

  /** The full panel over the strip, and back (its hotkey, the strip's ⤢).
   *  Without the strip there is nothing to toggle: the panel is all there is. */
  toggleFullPanel(): void {
    if (!this.stripEnabled || !this.win) return
    this.panelOpen = !this.panelOpen
    if (!this.win.isVisible()) {
      this.win.showInactive()
      this.win.setAlwaysOnTop(true, 'screen-saver')
    }
    this.applyView()
    this.pushState()
  }

  /** The strip's content is this tall: fit the window to it, growing away
   *  from the screen edge it sits nearer to (strip-place.ts). */
  setStripHeight(height: number): void {
    if (!this.win || this.shownView !== 'strip') return
    const b = this.win.getBounds()
    const next = anchoredResize(b, height, screen.getDisplayMatching(b).bounds)
    if (next.height === b.height && next.y === b.y && next.x === b.x) return
    this.win.setBounds(next)
  }

  private view(): 'strip' | 'panel' {
    return this.stripEnabled && !this.panelOpen && !this.settingsOpen ? 'strip' : 'panel'
  }

  /** Move the window to the rectangle of the view it now shows. */
  private applyView(): void {
    const view = this.view()
    if (view === this.shownView || !this.win) {
      this.shownView = view
      return
    }
    // what's pending is for the view being left: save it now, under its name
    this.saveBounds()
    this.shownView = view
    this.win.setBounds(view === 'strip' ? this.stripBounds() : this.resolveBounds())
  }

  /** Where the strip goes: where you left it, else over the XP bar. Its
   *  height follows its content as soon as that reports in. */
  private stripBounds(): Rectangle {
    const saved = store.get('stripBounds')
    if (saved && saved.x != null && saved.y != null && this.onScreen({ ...saved, x: saved.x, y: saved.y })) {
      return { x: saved.x, y: saved.y, width: saved.width, height: saved.height }
    }
    return defaultStripBounds(screen.getPrimaryDisplay().bounds, 150)
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
    // the strip's height is its content's: only its width is yours
    if (this.shownView === 'strip') {
      this.win.setBounds({ ...b, width: Math.max(220, Math.round(b.width + dx)) })
      return
    }
    const width = Math.max(220, Math.round(b.width + dx))
    const height = Math.max(160, Math.round(b.height + dy))
    this.win.setBounds({ x: b.x, y: b.y, width, height })
  }

  getState(): OverlayState {
    return {
      visible: this.win?.isVisible() ?? false,
      clickThrough: this.clickThrough,
      moveMode: this.moveMode,
      settingsOpen: this.settingsOpen,
      view: this.shownView
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

  /** In-main consumers of the interaction state (the run timer window
   *  follows the overlay's visibility, click-through and move mode). */
  addStateListener(listener: (state: OverlayState) => void): void {
    this.stateListeners.push(listener)
  }

  private pushState(): void {
    const state = this.getState()
    this.win?.webContents.send(Channels.overlayState, state)
    for (const listener of this.stateListeners) listener(state)
  }

  private persistBoundsSoon(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.saveBounds(), 400)
  }

  /** Remember where the window is, for the view it shows. */
  private saveBounds(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    if (!this.win) return
    const { x, y, width, height } = this.win.getBounds()
    store.set(this.shownView === 'strip' ? 'stripBounds' : 'bounds', { x, y, width, height })
  }

  /**
   * Restore the saved window rectangle, but fall back to the primary display
   * if the saved position is off every currently-connected monitor (a monitor
   * was unplugged, resolution changed, etc.).
   */
  private resolveBounds(): Rectangle {
    const saved = store.get('bounds')
    const width = saved.width
    const height = saved.height

    if (saved.x == null || saved.y == null) {
      return this.centerOnPrimary(width, height)
    }

    return this.onScreen({ x: saved.x, y: saved.y, width, height })
      ? { x: saved.x, y: saved.y, width, height }
      : this.centerOnPrimary(width, height)
  }

  /** Some of it is on a monitor that's connected now. */
  private onScreen(r: Rectangle): boolean {
    return screen.getAllDisplays().some((d) => {
      const wa = d.bounds
      return r.x < wa.x + wa.width && r.x + r.width > wa.x && r.y < wa.y + wa.height && r.y + r.height > wa.y
    })
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
