import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { copyText } from './clipboard.ts'
import { Channels, type AppInfo, type SettingsSetResult } from './channels'
import { COPY_CHOICES, SEARCH_KINDS, type CopyChoice, type SearchKind } from './copy-rules.ts'
import type { SearchService } from './searches.ts'
import {
  getAnnounce,
  getHotkeys,
  getShowFull,
  getSettings,
  sanitizeVisibleTabs,
  store,
  type AppSettings,
  type HotkeyBindings
} from './settings'
import { registerHotkeys, unregisterHotkeys } from './hotkeys'
import { normalizeSearchRegex, sanitizeActRegexes } from './search-regex.ts'
import { sanitizeGemNames } from './gem-names.ts'
import { ANNOUNCE_EVENTS, sanitizeAnnounce, type AnnounceEvent } from './announce-rules.ts'
import type { AnnounceService } from './announce.ts'
import { sanitizeShow } from './show-rules.ts'
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
  timerWindow: TimerWindow,
  searches: SearchService,
  announcer: AnnounceService
): void {
  ipcMain.handle(Channels.overlayGetState, () => overlay.getState())
  // Settings → What the overlay shows: say an example of one moment, whether it's on or not.
  ipcMain.on(Channels.announceTest, (_e, event: unknown) => {
    if (ANNOUNCE_EVENTS.includes(event as AnnounceEvent)) announcer.test(event as AnnounceEvent)
  })

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
    if ('actRegexes' in patch) store.set('actRegexes', sanitizeActRegexes(patch.actRegexes))
    if ('gemNames' in patch) {
      store.set('gemNames', sanitizeGemNames(patch.gemNames, (gem) => profile.canonicalGemName(gem)))
    }
    if (COPY_CHOICES.includes(patch.autoCopyTown as CopyChoice)) store.set('autoCopyTown', patch.autoCopyTown)
    if (COPY_CHOICES.includes(patch.autoCopyLevelUp as CopyChoice)) store.set('autoCopyLevelUp', patch.autoCopyLevelUp)
    if (typeof patch.autoCopyProtect === 'boolean') store.set('autoCopyProtect', patch.autoCopyProtect)
    if ('announce' in patch) store.set('announce', sanitizeAnnounce(patch.announce, getAnnounce()))
    if ('showFull' in patch) store.set('showFull', sanitizeShow(patch.showFull, getShowFull()))
    if (typeof patch.runTimer === 'boolean') {
      store.set('runTimer', patch.runTimer)
      timer.setEnabled(patch.runTimer)
    }

    let failed: string[] = []
    if (patch.hotkeys) {
      store.set('hotkeys', sanitizeHotkeys(patch.hotkeys))
      failed = registerHotkeys(overlay, guide, timerWindow, searches)
    }
    return { failed }
  })

  // Suspend/resume global hotkeys around combo capture, so a shortcut that is
  // already bound reaches the renderer instead of firing its handler.
  ipcMain.on(Channels.hotkeysPause, () => unregisterHotkeys())
  ipcMain.on(Channels.hotkeysResume, () => registerHotkeys(overlay, guide, timerWindow, searches))

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
  ipcMain.handle(Channels.clipboardCopySearch, (_e, kind: unknown): Promise<boolean> =>
    SEARCH_KINDS.includes(kind as SearchKind) ? searches.copy(kind as SearchKind) : Promise.resolve(false)
  )

  ipcMain.handle(Channels.clipboardCopyPassive, async (_e, id: unknown): Promise<boolean> => {
    const name = typeof id === 'number' ? profile.tree?.node(id)?.name : undefined
    if (!name) return false
    await copyText(name)
    return true
  })

  ipcMain.handle(Channels.guideGet, () => guide.snapshot())
  ipcMain.on(Channels.guideToggleStep, (_e, stepId: unknown) => {
    if (typeof stepId === 'string') guide.toggleStep(stepId)
  })
  ipcMain.on(Channels.guideReset, () => guide.reset())

  ipcMain.handle(Channels.profileGet, () => profile.snapshot())
  ipcMain.handle(Channels.profilePassiveMap, (_e, aspect: unknown) =>
    // width / height of where it's drawn; anything odd gets the block's own
    typeof aspect === 'number' && aspect > 0.5 && aspect < 4 ? profile.passiveMap(aspect) : profile.passiveMap(1.5)
  )
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

  // The editor's Passive tree section: the tree data lives here, so naming,
  // checking and re-sorting happen here too. The plan is the editor's draft —
  // validated like a file's before anything walks it.
  ipcMain.handle(Channels.editorPassivesCheck, (_e, p: { plan?: unknown; charClass?: unknown }) =>
    p && typeof p.charClass === 'string' ? profile.checkPassives(p.plan, p.charClass) : null
  )
  ipcMain.handle(Channels.editorPassivesResort, (_e, p: { plan?: unknown; charClass?: unknown; stage?: unknown }) =>
    p && typeof p.charClass === 'string' && (Number.isInteger(p.stage) || p.stage === 'ascendancy')
      ? profile.resortPassives(p.plan, p.charClass, p.stage as number | 'ascendancy')
      : null
  )
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
    stepBack: pickString(next.stepBack, prev.stepBack),
    copyVendor: pickOptional(next.copyVendor, prev.copyVendor),
    copyTree: pickOptional(next.copyTree, prev.copyTree),
    copyRegex: pickOptional(next.copyRegex, prev.copyRegex)
  }
}

/** A binding that may be cleared: '' unsets it. */
function pickOptional(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}
