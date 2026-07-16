import { app, ipcMain } from 'electron'
import { Channels, type AppInfo } from './channels'
import { getSettings } from './settings'
import { isDev, type OverlayController } from './overlay'

// Allow-listed IPC only (plan §11.1 Electron hardening). Every channel the
// preload bridge can reach is registered here explicitly.
export function registerIpc(overlay: OverlayController): void {
  ipcMain.handle(Channels.overlayGetState, () => overlay.getState())

  ipcMain.handle(Channels.settingsGetAll, () => getSettings())

  ipcMain.handle(Channels.appGetInfo, (): AppInfo => ({
    version: app.getVersion(),
    electron: process.versions.electron ?? '',
    isDev: isDev()
  }))

  ipcMain.on(Channels.overlayExitMoveMode, () => overlay.setMoveMode(false))

  ipcMain.on(Channels.overlayResizeBy, (_e, delta: { dx: number; dy: number }) => {
    if (!delta || typeof delta.dx !== 'number' || typeof delta.dy !== 'number') return
    overlay.resizeBy(delta.dx, delta.dy)
  })
}
