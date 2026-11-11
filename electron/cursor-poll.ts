// Linux stand-in for setIgnoreMouseEvents(…, { forward: true }), which only
// Windows and macOS implement: a window that ignores the mouse there never
// hears the cursor again, so its panel could never take a click back. While a
// window waits for the cursor (overlay-mouse.ts waitsForHover), this asks where
// it is a few times a second and, when it's inside the window, hands the point
// to the renderer, which checks it against the panel (src/lib/hover.ts) and
// reports hover as it would from a real pointer event.

import { screen, type BrowserWindow } from 'electron'
import { Channels } from './channels.ts'

const EVERY_MS = 50

/** Only Linux needs it; elsewhere forward:true does the job. */
export const NEEDS_CURSOR_POLL = process.platform === 'linux'

export class CursorPoll {
  private timer: NodeJS.Timeout | null = null
  private lastInside = false

  /** Poll for this window while `on`, stop otherwise. */
  set(win: BrowserWindow | null, on: boolean): void {
    if (!NEEDS_CURSOR_POLL || !on || !win || win.isDestroyed()) {
      this.stop()
      return
    }
    if (this.timer) return
    this.lastInside = false
    this.timer = setInterval(() => this.tick(win), EVERY_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private tick(win: BrowserWindow): void {
    if (win.isDestroyed() || !win.isVisible()) return
    const p = screen.getCursorScreenPoint()
    const b = win.getContentBounds()
    const inside = p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height
    if (!inside && !this.lastInside) return
    this.lastInside = inside
    win.webContents.send(Channels.overlayCursor, inside ? { x: p.x - b.x, y: p.y - b.y } : null)
  }
}
