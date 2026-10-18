import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { Channels } from './channels.ts'

const RENDERER_DEV_URL = process.env['ELECTRON_RENDERER_URL']

/** A normal (framed, resizable) window hosting the route/profile editor —
 *  separate from the transparent overlay. */
export class EditorWindow {
  private win: BrowserWindow | null = null

  /** Open (or bring forward) the editor, optionally on a given tab. */
  open(tab?: string): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.show()
      this.win.focus()
      if (tab) this.win.webContents.send(Channels.editorFocusTab, tab)
      return
    }
    this.win = new BrowserWindow({
      width: 1000,
      height: 760,
      minWidth: 640,
      minHeight: 480,
      title: 'PoE Leveling Overlay — Editor',
      backgroundColor: '#0e1118',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    this.win.setMenuBarVisibility(false)

    // A fresh window reads the tab from the query; an open one is told (above).
    const query = tab ? `?tab=${encodeURIComponent(tab)}` : ''
    if (RENDERER_DEV_URL) {
      void this.win.loadURL(`${RENDERER_DEV_URL}/editor/index.html${query}`)
    } else {
      void this.win.loadFile(join(__dirname, '../renderer/editor/index.html'), tab ? { query: { tab } } : undefined)
    }

    this.win.on('closed', () => {
      this.win = null
    })
  }

  /** Push to the editor if it's open — it lists the same profile library the
   *  overlay does, and shouldn't need a Reload click to see a PoB import. */
  send(channel: string, payload: unknown): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send(channel, payload)
  }

  destroy(): void {
    this.win?.destroy()
    this.win = null
  }
}
