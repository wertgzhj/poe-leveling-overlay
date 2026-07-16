import { app, BrowserWindow } from 'electron'
import { OverlayController } from './overlay'
import { registerHotkeys, unregisterHotkeys } from './hotkeys'
import { registerIpc } from './ipc'
import { createTray } from './tray'

// Set to a number of ms via SMOKE=<ms> to auto-quit after startup — used by the
// headless launch check in CI/dev to prove the app boots without a display.
const SMOKE_MS = process.env['SMOKE'] ? Number(process.env['SMOKE']) || 4000 : 0

const overlay = new OverlayController()
let tray: ReturnType<typeof createTray> = null

// Single instance: a second launch just resurfaces the existing overlay.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = overlay.window
    if (win) {
      if (!win.isVisible()) win.showInactive()
      win.setAlwaysOnTop(true, 'screen-saver')
    }
  })

  app.whenReady().then(() => {
    overlay.create()
    registerIpc(overlay)
    const failed = registerHotkeys(overlay)
    if (failed.length) {
      console.warn('[hotkeys] failed to register:', failed.join(', '))
    }
    tray = createTray(overlay)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) overlay.create()
    })

    if (SMOKE_MS) runSmoke(failed)
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  unregisterHotkeys()
  tray?.destroy()
})

// Emit a machine-checkable status line, then exit. Lets a headless run confirm
// the window was created and hotkeys/tray wired up without a real display.
function runSmoke(failedHotkeys: string[]): void {
  setTimeout(() => {
    const win = overlay.window
    const status = {
      windowCreated: !!win,
      alwaysOnTop: win?.isAlwaysOnTop() ?? false,
      state: overlay.getState(),
      hotkeysFailed: failedHotkeys,
      tray: !!tray
    }
    console.log('SMOKE_OK ' + JSON.stringify(status))
    app.quit()
  }, SMOKE_MS)
}
