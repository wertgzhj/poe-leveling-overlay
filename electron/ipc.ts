import { app, dialog, ipcMain } from 'electron'
import { Channels, type AppInfo, type SettingsSetResult } from './channels'
import { getHotkeys, getSettings, store, type AppSettings, type HotkeyBindings } from './settings'
import { registerHotkeys, unregisterHotkeys } from './hotkeys'
import { isDev, type OverlayController } from './overlay'
import type { LogService } from './log/service.ts'
import type { GuideService } from './guide/service.ts'
import type { ProfileService } from './profile/service.ts'
import type { TrialsService } from './trials/service.ts'
import { importPobCode, importPobXml } from './profile/pob.ts'
import { resolvePobInput } from './profile/pobbin.ts'
import type { EditorSaveResult, PobImportResponse } from './channels'
import type { EditorWindow } from './editor-window.ts'
import { loadForEditor, saveRoute as saveRouteFile, saveProfile as saveProfileFile } from './editor/io.ts'

// Allow-listed IPC only (plan §11.1 Electron hardening). Every channel the
// preload bridge can reach is registered here explicitly.
export function registerIpc(
  overlay: OverlayController,
  log: LogService,
  guide: GuideService,
  profile: ProfileService,
  trials: TrialsService,
  editor: EditorWindow
): void {
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
    if ('profilePath' in patch) {
      const p = patch.profilePath
      const next = typeof p === 'string' && p.trim().length > 0 ? p.trim() : null
      if (next !== store.get('profilePath')) profile.setPath(next)
    }
    if (typeof patch.clickThrough === 'boolean') {
      overlay.setClickThrough(patch.clickThrough)
    }

    let failed: string[] = []
    if (patch.hotkeys) {
      store.set('hotkeys', sanitizeHotkeys(patch.hotkeys))
      failed = registerHotkeys(overlay, guide)
    }
    return { failed }
  })

  // Suspend/resume global hotkeys around combo capture, so a shortcut that is
  // already bound reaches the renderer instead of firing its handler.
  ipcMain.on(Channels.hotkeysPause, () => unregisterHotkeys())
  ipcMain.on(Channels.hotkeysResume, () => registerHotkeys(overlay, guide))

  ipcMain.on(Channels.overlayExitMoveMode, () => overlay.setMoveMode(false))

  ipcMain.on(Channels.overlaySetSettingsOpen, (_e, on: unknown) => {
    overlay.setSettingsOpen(!!on)
  })

  ipcMain.on(Channels.overlayResizeBy, (_e, delta: { dx: number; dy: number }) => {
    if (!delta || typeof delta.dx !== 'number' || typeof delta.dy !== 'number') return
    overlay.resizeBy(delta.dx, delta.dy)
  })

  ipcMain.handle(Channels.logGetSnapshot, () => log.getSnapshot())

  ipcMain.handle(Channels.guideGet, () => guide.snapshot())
  ipcMain.on(Channels.guideToggleStep, (_e, stepId: unknown) => {
    if (typeof stepId === 'string') guide.toggleStep(stepId)
  })
  ipcMain.on(Channels.guideReset, () => guide.reset())

  ipcMain.handle(Channels.profileGet, () => profile.snapshot())

  ipcMain.on(Channels.editorOpen, () => editor.open())
  ipcMain.handle(Channels.editorLoad, () => loadForEditor())
  ipcMain.handle(Channels.editorSaveRoute, (_e, payload: { act: number; json: unknown }): EditorSaveResult => {
    if (!payload || typeof payload.act !== 'number') return { ok: false, errors: ['bad payload'] }
    // The guide watches the override path, so writing it hot-reloads the overlay.
    return saveRouteFile(payload.act, payload.json)
  })
  ipcMain.handle(Channels.editorSaveProfile, (_e, json: unknown): EditorSaveResult => {
    const result = saveProfileFile(json)
    if (result.ok && result.path) profile.setPath(result.path) // activate + reload
    return result
  })

  ipcMain.handle(Channels.trialsGet, () => trials.snapshot())
  ipcMain.on(Channels.trialsToggle, (_e, id: unknown) => {
    if (typeof id === 'string') trials.toggle(id)
  })
  ipcMain.on(Channels.trialsReset, () => trials.reset())

  ipcMain.handle(Channels.pobImport, async (_e, input: unknown): Promise<PobImportResponse> => {
    if (typeof input !== 'string' || !input.trim()) {
      return { ok: false, warnings: [], errors: ['paste a Path of Building code or link'] }
    }
    const resolved = await resolvePobInput(input)
    if (resolved.error) return { ok: false, warnings: [], errors: [resolved.error] }
    const result = resolved.xml ? importPobXml(resolved.xml) : importPobCode(resolved.code as string)
    if (!result.profile) return { ok: false, warnings: result.warnings, errors: result.errors }
    const path = profile.applyImport(result.profile)
    return { ok: true, path, warnings: result.warnings, errors: [] }
  })

  ipcMain.handle(Channels.dialogPickClientTxt, async (): Promise<string | null> => {
    return pickFile(overlay, 'Select Client.txt', [{ name: 'Client log', extensions: ['txt'] }])
  })

  ipcMain.handle(Channels.dialogPickProfile, async (): Promise<string | null> => {
    return pickFile(overlay, 'Select build profile', [{ name: 'Profile JSON', extensions: ['json'] }])
  })
}

async function pickFile(
  overlay: OverlayController,
  title: string,
  filters: Electron.FileFilter[]
): Promise<string | null> {
  const win = overlay.window
  const opts: Electron.OpenDialogOptions = { title, properties: ['openFile'], filters }
  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// Only accept string accelerators; fall back to the previous binding per key.
function sanitizeHotkeys(next: Partial<HotkeyBindings>): HotkeyBindings {
  const prev = getHotkeys()
  return {
    toggleVisibility: pickString(next.toggleVisibility, prev.toggleVisibility),
    toggleClickThrough: pickString(next.toggleClickThrough, prev.toggleClickThrough),
    toggleMoveMode: pickString(next.toggleMoveMode, prev.toggleMoveMode),
    stepForward: pickString(next.stepForward, prev.stepForward),
    stepBack: pickString(next.stepBack, prev.stepBack)
  }
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}
