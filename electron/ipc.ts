import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { copyText } from './clipboard.ts'
import { Channels, type AppInfo, type SettingsSetResult } from './channels'
import {
  getHotkeys,
  getSettings,
  sanitizeVisibleTabs,
  store,
  type AppSettings,
  type HotkeyBindings
} from './settings'
import { registerHotkeys, unregisterHotkeys } from './hotkeys'
import { normalizeSearchRegex } from './search-regex.ts'
import { sanitizeGemNames } from './gem-names.ts'
import { isDev, type OverlayController } from './overlay'
import type { LogService } from './log/service.ts'
import type { GuideService } from './guide/service.ts'
import type { ProfileService } from './profile/service.ts'
import type { TrialsService } from './trials/service.ts'
import type { UpdateService } from './update/service.ts'
import type { TimerService } from './timer/service.ts'
import type { TimerWindow } from './timer-window.ts'
import { importPobCode, importPobXml } from './profile/pob.ts'
import { resolvePobInput } from './profile/pobbin.ts'
import type { EditorSaveResult, LibraryResult, PobImportResponse, RouteImportResult } from './channels'
import type { EditorWindow } from './editor-window.ts'
import {
  loadForEditor,
  routesForExport,
  importRoutes,
  saveRoute as saveRouteFile,
} from './editor/io.ts'
import { exportRoutes } from './guide/share.ts'

// Allow-listed IPC only (Electron hardening). Every channel the
// preload bridge can reach is registered here explicitly.
export function registerIpc(
  overlay: OverlayController,
  log: LogService,
  guide: GuideService,
  profile: ProfileService,
  trials: TrialsService,
  editor: EditorWindow,
  update: UpdateService,
  timer: TimerService,
  timerWindow: TimerWindow
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
    if (typeof patch.clickThrough === 'boolean') {
      overlay.setClickThrough(patch.clickThrough)
    }
    if (patch.visibleTabs && typeof patch.visibleTabs === 'object') {
      store.set('visibleTabs', sanitizeVisibleTabs(patch.visibleTabs))
    }
    if ('searchRegex' in patch) {
      store.set('searchRegex', normalizeSearchRegex(patch.searchRegex))
    }
    if ('gemNames' in patch) {
      store.set('gemNames', sanitizeGemNames(patch.gemNames, (gem) => profile.canonicalGemName(gem)))
    }
    if (typeof patch.autoCopySearch === 'boolean') store.set('autoCopySearch', patch.autoCopySearch)
    if (typeof patch.runTimer === 'boolean') {
      store.set('runTimer', patch.runTimer)
      timer.setEnabled(patch.runTimer)
    }

    let failed: string[] = []
    if (patch.hotkeys) {
      store.set('hotkeys', sanitizeHotkeys(patch.hotkeys))
      failed = registerHotkeys(overlay, guide, timerWindow)
    }
    return { failed }
  })

  // Suspend/resume global hotkeys around combo capture, so a shortcut that is
  // already bound reaches the renderer instead of firing its handler.
  ipcMain.on(Channels.hotkeysPause, () => unregisterHotkeys())
  ipcMain.on(Channels.hotkeysResume, () => registerHotkeys(overlay, guide, timerWindow))

  ipcMain.on(Channels.overlayExitMoveMode, () => overlay.setMoveMode(false))

  ipcMain.on(Channels.overlaySetSettingsOpen, (_e, on: unknown) => {
    overlay.setSettingsOpen(!!on)
  })

  // The timer window shares the overlay's page bridge: hover and resize go to
  // whichever window sent them.
  ipcMain.on(Channels.overlayResizeBy, (e, delta: { dx: number; dy: number }) => {
    if (!delta || typeof delta.dx !== 'number' || typeof delta.dy !== 'number') return
    if (timerWindow.owns(e.sender)) timerWindow.resizeBy(delta.dx, delta.dy)
    else overlay.resizeBy(delta.dx, delta.dy)
  })

  ipcMain.on(Channels.overlayHoverUi, (e, over: unknown) => {
    if (timerWindow.owns(e.sender)) timerWindow.setHoverUi(!!over)
    else overlay.setHoverUi(!!over)
  })

  ipcMain.handle(Channels.logGetSnapshot, () => log.getSnapshot())
  ipcMain.handle(Channels.logDetectCharacter, () => log.detectCharacter())

  // Clipboard only. Pasting into the game is the player's own keystroke — the
  // overlay never types into it (docs/ARCHITECTURE.md#tos-position).
  ipcMain.handle(Channels.clipboardCopySearchRegex, async (): Promise<boolean> => {
    const regex = store.get('searchRegex')
    if (!regex) return false
    await copyText(regex)
    return true
  })

  ipcMain.handle(Channels.clipboardCopyPassive, async (_e, id: unknown): Promise<boolean> => {
    const name = typeof id === 'number' ? profile.tree?.node(id)?.name : undefined
    if (!name) return false
    await copyText(name)
    return true
  })

  ipcMain.handle(Channels.clipboardCopyVendorSearch, async (): Promise<boolean> => {
    const regex = profile.vendorSearch()
    if (!regex) return false
    await copyText(regex)
    return true
  })

  ipcMain.handle(Channels.clipboardCopyTreeSearch, async (): Promise<boolean> => {
    const regex = profile.treeSearch()
    if (!regex) return false
    await copyText(regex)
    return true
  })

  ipcMain.handle(Channels.guideGet, () => guide.snapshot())
  ipcMain.on(Channels.guideToggleStep, (_e, stepId: unknown) => {
    if (typeof stepId === 'string') guide.toggleStep(stepId)
  })
  ipcMain.on(Channels.guideReset, () => guide.reset())

  ipcMain.handle(Channels.profileGet, () => profile.snapshot())
  ipcMain.handle(Channels.profileGemNames, (): string[] => profile.gemNameList())
  ipcMain.on(Channels.profileStageStep, (_e, delta: unknown) => {
    if (typeof delta === 'number') profile.stageStep(delta)
  })
  ipcMain.on(Channels.profileStageLive, () => profile.stageToLive())
  ipcMain.on(Channels.profileSetMule, (_e, gem: unknown) => {
    if (gem === null || typeof gem === 'string') profile.setMule(gem)
  })
  ipcMain.on(Channels.profileDismissChoice, (_e, id: unknown) => {
    if (typeof id === 'string') profile.dismissChoice(id)
  })
  ipcMain.on(Channels.profileTogglePantheon, (_e, soul: unknown) => {
    if (typeof soul === 'string') profile.togglePantheon(soul)
  })

  ipcMain.on(Channels.editorOpen, (_e, tab: unknown) => editor.open(typeof tab === 'string' ? tab : undefined))
  ipcMain.handle(Channels.editorLoad, () => loadForEditor())
  ipcMain.handle(Channels.editorSaveRoute, (_e, payload: { act: number; json: unknown }): EditorSaveResult => {
    if (!payload || typeof payload.act !== 'number') return { ok: false, errors: ['bad payload'] }
    // The guide watches the override path, so writing it hot-reloads the overlay.
    return saveRouteFile(payload.act, payload.json)
  })
  ipcMain.handle(Channels.editorLoadProfile, (_e, id: unknown) =>
    typeof id === 'string' ? profile.forEditor(id) : null
  )
  ipcMain.handle(Channels.editorSaveProfile, (_e, payload: { id?: unknown; json?: unknown }): EditorSaveResult => {
    if (!payload || typeof payload.id !== 'string') return { ok: false, errors: ['bad payload'] }
    return profile.saveFromEditor(payload.id, payload.json)
  })

  // The profile library. Every call names a profile by its library id — never
  // by path — so the renderer can't point any of these at a file elsewhere.
  ipcMain.handle(Channels.profilesActivate, (_e, id: unknown): boolean =>
    typeof id === 'string' ? profile.activate(id) : false
  )
  ipcMain.handle(Channels.profilesCreate, (_e, p: { name?: unknown; charClass?: unknown }): LibraryResult => {
    if (!p || typeof p.name !== 'string' || typeof p.charClass !== 'string') {
      return { ok: false, errors: ['bad payload'] }
    }
    return profile.create(p.name, p.charClass)
  })
  ipcMain.handle(Channels.profilesDuplicate, (_e, id: unknown): LibraryResult =>
    typeof id === 'string' ? profile.duplicate(id) : { ok: false, errors: ['bad payload'] }
  )
  ipcMain.handle(Channels.profilesRename, (_e, p: { id?: unknown; name?: unknown }): LibraryResult => {
    if (!p || typeof p.id !== 'string' || typeof p.name !== 'string') return { ok: false, errors: ['bad payload'] }
    return profile.rename(p.id, p.name)
  })
  ipcMain.handle(Channels.profilesDelete, (_e, id: unknown): Promise<LibraryResult> | LibraryResult =>
    typeof id === 'string' ? profile.remove(id) : { ok: false, errors: ['bad payload'] }
  )
  ipcMain.handle(Channels.profilesImportFile, async (e): Promise<LibraryResult | null> => {
    // The dialog belongs to whichever window asked — the editor, normally.
    const owner = BrowserWindow.fromWebContents(e.sender)
    const opts: Electron.OpenDialogOptions = {
      title: 'Import a build profile',
      properties: ['openFile'],
      filters: [{ name: 'Profile JSON', extensions: ['json'] }]
    }
    const picked = owner ? await dialog.showOpenDialog(owner, opts) : await dialog.showOpenDialog(opts)
    if (picked.canceled || !picked.filePaths[0]) return null
    return profile.importFile(picked.filePaths[0])
  })

  ipcMain.handle(Channels.editorExportRoutes, (): string => exportRoutes(routesForExport()))
  ipcMain.handle(Channels.editorImportRoutes, (_e, text: unknown): RouteImportResult => {
    if (typeof text !== 'string' || !text.trim()) {
      return { written: [], errors: ['paste an exported route bundle or an actN.json'] }
    }
    // The guide watches the override files, so writing them hot-reloads the overlay.
    return importRoutes(text)
  })

  ipcMain.handle(Channels.trialsGet, () => trials.snapshot())
  ipcMain.on(Channels.trialsToggle, (_e, id: unknown) => {
    if (typeof id === 'string') trials.toggle(id)
  })
  ipcMain.on(Channels.trialsReset, () => trials.reset())
  ipcMain.on(Channels.trialsDismissLab, (_e, lab: unknown) => {
    if (typeof lab === 'string') trials.dismissLab(lab)
  })

  ipcMain.handle(Channels.timerGet, () => timer.snapshot())
  ipcMain.on(Channels.timerEndRun, () => timer.endRun())
  ipcMain.handle(Channels.timerImport, () =>
    timer.importLog((done) => timerWindow.send(Channels.timerImportProgress, done))
  )
  ipcMain.on(Channels.timerFitHeight, (e, height: unknown) => {
    if (timerWindow.owns(e.sender) && typeof height === 'number' && Number.isFinite(height)) timerWindow.fitHeight(height)
  })
  ipcMain.on(Channels.timerDeleteRun, (_e, id: unknown) => {
    if (typeof id === 'string') timer.deleteRun(id)
  })

  ipcMain.handle(Channels.updateGet, () => update.snapshot())
  ipcMain.on(Channels.updateCheck, () => update.check())
  ipcMain.on(Channels.updateInstall, () => update.install())
  ipcMain.on(Channels.updateOpenReleases, () => update.openReleases())

  ipcMain.handle(Channels.pobImport, async (_e, input: unknown): Promise<PobImportResponse> => {
    if (typeof input !== 'string' || !input.trim()) {
      return { ok: false, warnings: [], errors: ['paste a Path of Building code or link'] }
    }
    const resolved = await resolvePobInput(input)
    if (resolved.error) return { ok: false, warnings: [], errors: [resolved.error] }
    const opts = { tree: profile.tree }
    const result = resolved.xml ? importPobXml(resolved.xml, opts) : importPobCode(resolved.code as string, opts)
    if (!result.profile) return { ok: false, warnings: result.warnings, errors: result.errors }
    const added = profile.applyImport(result.profile)
    if (!added.ok) return { ok: false, warnings: result.warnings, errors: added.errors }
    return { ok: true, path: added.entry?.path, warnings: result.warnings, errors: [] }
  })

  ipcMain.handle(Channels.dialogPickClientTxt, async (): Promise<string | null> => {
    return pickFile(overlay, 'Select Client.txt', [{ name: 'Client log', extensions: ['txt'] }])
  })

  ipcMain.handle(Channels.logLocateClientTxt, (): string | null => {
    const found = log.locateClientTxt()
    if (found && found !== store.get('clientTxtPath')) {
      store.set('clientTxtPath', found)
      log.setPath(found)
    }
    return found
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
    toggleTimer: pickString(next.toggleTimer, prev.toggleTimer),
    toggleClickThrough: pickString(next.toggleClickThrough, prev.toggleClickThrough),
    toggleMoveMode: pickString(next.toggleMoveMode, prev.toggleMoveMode),
    stepForward: pickString(next.stepForward, prev.stepForward),
    stepBack: pickString(next.stepBack, prev.stepBack)
  }
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}
