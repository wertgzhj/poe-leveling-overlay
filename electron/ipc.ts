import { app, dialog, ipcMain } from 'electron'
import { Channels, type AppInfo, type SettingsSetResult } from './channels'
import { getSettings, store, type AppSettings, type HotkeyBindings } from './settings'
import { registerHotkeys, unregisterHotkeys } from './hotkeys'
import { isDev, type OverlayController } from './overlay'
import type { LogService } from './log/service.ts'

// Allow-listed IPC only (plan §11.1 Electron hardening). Every channel the
// preload bridge can reach is registered here explicitly.
export function registerIpc(overlay: OverlayController, log: LogService): void {
  ipcMain.handle(Channels.overlayGetState, () => overlay.getState())

  ipcMain.handle(Channels.settingsGetAll, () => getSettings())

  ipcMain.handle(Channels.appGetInfo, (): AppInfo => ({
    version: app.getVersion(),
    electron: process.versions.electron ?? '',
    isDev: isDev()
  }))

  // Patch settings. Applies visual/behavioural changes live and, when hotkeys
  // change, re-registers them and reports which failed to bind.
  ipcMain.handle(Channels.settingsSet, (_e, patch: Partial<AppSettings>): SettingsSetResult => {
    if (!patch || typeof patch !== 'object') return { failed: [] }

    if (typeof patch.opacity === 'number') {
      store.set('opacity', clamp(patch.opacity, 0.4, 1))
    }
    if ('clientTxtPath' in patch) {
      const p = patch.clientTxtPath
      const next = typeof p === 'string' && p.trim().length > 0 ? p.trim() : null
      if (next !== store.get('clientTxtPath')) {
        store.set('clientTxtPath', next)
        log.setPath(next)
      }
    }
    if ('characterName' in patch) {
      const c = patch.characterName
      const next = typeof c === 'string' && c.trim().length > 0 ? c.trim() : null
      store.set('characterName', next)
      log.setCharacter(next)
    }
    if (typeof patch.clickThrough === 'boolean') {
      overlay.setClickThrough(patch.clickThrough)
    }

    let failed: string[] = []
    if (patch.hotkeys) {
      store.set('hotkeys', sanitizeHotkeys(patch.hotkeys, store.get('hotkeys')))
      failed = registerHotkeys(overlay)
    }
    return { failed }
  })

  // Suspend/resume global hotkeys around combo capture, so a shortcut that is
  // already bound reaches the renderer instead of firing its handler.
  ipcMain.on(Channels.hotkeysPause, () => unregisterHotkeys())
  ipcMain.on(Channels.hotkeysResume, () => registerHotkeys(overlay))

  ipcMain.on(Channels.overlayExitMoveMode, () => overlay.setMoveMode(false))

  ipcMain.on(Channels.overlaySetSettingsOpen, (_e, on: unknown) => {
    overlay.setSettingsOpen(!!on)
  })

  ipcMain.on(Channels.overlayResizeBy, (_e, delta: { dx: number; dy: number }) => {
    if (!delta || typeof delta.dx !== 'number' || typeof delta.dy !== 'number') return
    overlay.resizeBy(delta.dx, delta.dy)
  })

  ipcMain.handle(Channels.logGetSnapshot, () => log.getSnapshot())

  ipcMain.handle(Channels.dialogPickClientTxt, async (): Promise<string | null> => {
    const win = overlay.window
    const opts: Electron.OpenDialogOptions = {
      title: 'Select Client.txt',
      properties: ['openFile'],
      filters: [{ name: 'Client log', extensions: ['txt'] }]
    }
    const result = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts)
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// Only accept string accelerators; fall back to the previous binding per key.
function sanitizeHotkeys(next: Partial<HotkeyBindings>, prev: HotkeyBindings): HotkeyBindings {
  return {
    toggleVisibility: pickString(next.toggleVisibility, prev.toggleVisibility),
    toggleClickThrough: pickString(next.toggleClickThrough, prev.toggleClickThrough),
    toggleMoveMode: pickString(next.toggleMoveMode, prev.toggleMoveMode)
  }
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}
