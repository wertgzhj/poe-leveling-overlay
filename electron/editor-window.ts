import { join } from 'node:path'
import { BrowserWindow } from 'electron'

const RENDERER_DEV_URL = process.env['ELECTRON_RENDERER_URL']

/** A normal (framed, resizable) window hosting the route/profile editor —
 *  separate from the transparent overlay (plan §4). */
export class EditorWindow {
  private win: BrowserWindow | null = null

  open(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.show()
      this.win.focus()
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

    if (RENDERER_DEV_URL) {
      void this.win.loadURL(`${RENDERER_DEV_URL}/editor/index.html`)
    } else {
      void this.win.loadFile(join(__dirname, '../renderer/editor/index.html'))
    }

    this.win.on('closed', () => {
      this.win = null
    })
  }

  destroy(): void {
    this.win?.destroy()
    this.win = null
  }
}
