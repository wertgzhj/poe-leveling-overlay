import { contextBridge, ipcRenderer } from 'electron'
import {
  Channels,
  type AppInfo,
  type DetectedCharacter,
  type EditorLoad,
  type EditorProfileLoad,
  type EditorSaveResult,
  type GuideState,
  type LibraryResult,
  type LogSnapshot,
  type OverlayState,
  type PassiveMap,
  type PlanCheck,
  type PobImportResponse,
  type ProfileSnapshot,
  type RouteImportResult,
  type RunTimerSnapshot,
  type SearchKind,
  type Spoken,
  type AnnounceEvent,
  type ImportResult,
  type SettingsSetResult,
  type TrialsSnapshot,
  type UpdateStatus
} from './channels'
import type { AreaState, LevelUpEvent } from './log/tracker.ts'
import type { WatcherStatus } from './log/watcher.ts'
import type { AppSettings, SettingsPatch } from './settings.ts'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

// The only surface exposed to the renderer. Sandboxed + contextIsolated, so the
// overlay can reach exactly these channels and nothing else.
const api = {
  getState: (): Promise<OverlayState> => ipcRenderer.invoke(Channels.overlayGetState),

  onState: (cb: (state: OverlayState) => void): (() => void) =>
    subscribe(Channels.overlayState, cb),

  getLogSnapshot: (): Promise<LogSnapshot> => ipcRenderer.invoke(Channels.logGetSnapshot),
  detectCharacter: (): Promise<DetectedCharacter | null> =>
    ipcRenderer.invoke(Channels.logDetectCharacter),
  copySearch: (kind: SearchKind): Promise<boolean> => ipcRenderer.invoke(Channels.clipboardCopySearch, kind),
  copyPassive: (id: number): Promise<boolean> => ipcRenderer.invoke(Channels.clipboardCopyPassive, id),
  onSearchCopied: (cb: (kind: SearchKind) => void): (() => void) => subscribe(Channels.searchCopied, cb),
  onAnnounce: (cb: (spoken: Spoken) => void): (() => void) => subscribe(Channels.announceSpeak, cb),
  testAnnounce: (event: AnnounceEvent): void => ipcRenderer.send(Channels.announceTest, event),
  onLogStatus: (cb: (status: WatcherStatus) => void): (() => void) =>
    subscribe(Channels.logStatus, cb),
  onLogSnapshot: (cb: (snap: LogSnapshot) => void): (() => void) =>
    subscribe(Channels.logSnapshot, cb),
  onAreaEntered: (cb: (area: AreaState) => void): (() => void) =>
    subscribe(Channels.areaEntered, cb),
  onLevelUp: (cb: (ev: LevelUpEvent) => void): (() => void) =>
    subscribe(Channels.playerLevelUp, cb),

  getGuide: (): Promise<GuideState> => ipcRenderer.invoke(Channels.guideGet),
  onGuideState: (cb: (state: GuideState) => void): (() => void) =>
    subscribe(Channels.guideState, cb),
  guideToggleStep: (stepId: string): void =>
    ipcRenderer.send(Channels.guideToggleStep, stepId),
  guideReset: (): void => ipcRenderer.send(Channels.guideReset),

  getProfile: (): Promise<ProfileSnapshot> => ipcRenderer.invoke(Channels.profileGet),
  passiveMap: (aspect: number): Promise<PassiveMap | null> => ipcRenderer.invoke(Channels.profilePassiveMap, aspect),
  onProfileState: (cb: (snap: ProfileSnapshot) => void): (() => void) =>
    subscribe(Channels.profileState, cb),
  stageStep: (delta: number): void => ipcRenderer.send(Channels.profileStageStep, delta),
  stageToLive: (): void => ipcRenderer.send(Channels.profileStageLive),
  setMule: (gem: string | null): void => ipcRenderer.send(Channels.profileSetMule, gem),
  gemNameList: (): Promise<string[]> => ipcRenderer.invoke(Channels.profileGemNames),
  dismissChoice: (id: string): void => ipcRenderer.send(Channels.profileDismissChoice, id),
  togglePantheon: (soul: string): void => ipcRenderer.send(Channels.profileTogglePantheon, soul),
  activateProfile: (id: string): Promise<boolean> => ipcRenderer.invoke(Channels.profilesActivate, id),
  createProfile: (name: string, charClass: string): Promise<LibraryResult> =>
    ipcRenderer.invoke(Channels.profilesCreate, { name, charClass }),
  duplicateProfile: (id: string): Promise<LibraryResult> => ipcRenderer.invoke(Channels.profilesDuplicate, id),
  renameProfile: (id: string, name: string): Promise<LibraryResult> =>
    ipcRenderer.invoke(Channels.profilesRename, { id, name }),
  deleteProfile: (id: string): Promise<LibraryResult> => ipcRenderer.invoke(Channels.profilesDelete, id),
  importProfileFile: (): Promise<LibraryResult | null> => ipcRenderer.invoke(Channels.profilesImportFile),
  importPob: (input: string): Promise<PobImportResponse> =>
    ipcRenderer.invoke(Channels.pobImport, input),

  getTrials: (): Promise<TrialsSnapshot> => ipcRenderer.invoke(Channels.trialsGet),
  onTrialsState: (cb: (snap: TrialsSnapshot) => void): (() => void) =>
    subscribe(Channels.trialsState, cb),
  trialsToggle: (id: string): void => ipcRenderer.send(Channels.trialsToggle, id),
  trialsReset: (): void => ipcRenderer.send(Channels.trialsReset),
  trialsDismissLab: (lab: string): void => ipcRenderer.send(Channels.trialsDismissLab, lab),

  getRunTimer: (): Promise<RunTimerSnapshot> => ipcRenderer.invoke(Channels.timerGet),
  onRunTimer: (cb: (snap: RunTimerSnapshot) => void): (() => void) => subscribe(Channels.timerState, cb),
  deleteRun: (id: string): void => ipcRenderer.send(Channels.timerDeleteRun, id),
  endRun: (): void => ipcRenderer.send(Channels.timerEndRun),
  importRuns: (): Promise<ImportResult> => ipcRenderer.invoke(Channels.timerImport),
  onImportProgress: (cb: (done: number) => void): (() => void) => subscribe(Channels.timerImportProgress, cb),
  fitHeight: (height: number): void => ipcRenderer.send(Channels.timerFitHeight, height),

  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke(Channels.updateGet),
  onUpdateStatus: (cb: (status: UpdateStatus) => void): (() => void) =>
    subscribe(Channels.updateStatus, cb),
  checkForUpdates: (): void => ipcRenderer.send(Channels.updateCheck),
  installUpdate: (): void => ipcRenderer.send(Channels.updateInstall),
  openReleases: (): void => ipcRenderer.send(Channels.updateOpenReleases),

  openEditor: (tab?: string): void => ipcRenderer.send(Channels.editorOpen, tab),
  onEditorFocusTab: (cb: (tab: string) => void): (() => void) => subscribe(Channels.editorFocusTab, cb),
  editorLoadProfile: (id: string): Promise<EditorProfileLoad | null> =>
    ipcRenderer.invoke(Channels.editorLoadProfile, id),
  editorLoad: (): Promise<EditorLoad> => ipcRenderer.invoke(Channels.editorLoad),
  editorSaveRoute: (act: number, json: unknown): Promise<EditorSaveResult> =>
    ipcRenderer.invoke(Channels.editorSaveRoute, { act, json }),
  editorSaveProfile: (id: string, json: unknown): Promise<EditorSaveResult> =>
    ipcRenderer.invoke(Channels.editorSaveProfile, { id, json }),
  editorPassivesCheck: (plan: unknown, charClass: string): Promise<PlanCheck | null> =>
    ipcRenderer.invoke(Channels.editorPassivesCheck, { plan, charClass }),
  editorPassivesResort: (plan: unknown, charClass: string, stage: number | 'ascendancy'): Promise<number[] | null> =>
    ipcRenderer.invoke(Channels.editorPassivesResort, { plan, charClass, stage }),
  editorExportRoutes: (): Promise<string> => ipcRenderer.invoke(Channels.editorExportRoutes),
  editorImportRoutes: (text: string): Promise<RouteImportResult> =>
    ipcRenderer.invoke(Channels.editorImportRoutes, text),

  exitMoveMode: (): void => ipcRenderer.send(Channels.overlayExitMoveMode),

  setSettingsOpen: (open: boolean): void =>
    ipcRenderer.send(Channels.overlaySetSettingsOpen, open),

  resizeBy: (dx: number, dy: number): void =>
    ipcRenderer.send(Channels.overlayResizeBy, { dx, dy }),

  setHoverUi: (over: boolean): void => ipcRenderer.send(Channels.overlayHoverUi, over),

  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(Channels.settingsGetAll),

  setSettings: (patch: SettingsPatch): Promise<SettingsSetResult> =>
    ipcRenderer.invoke(Channels.settingsSet, patch),

  pauseHotkeys: (): void => ipcRenderer.send(Channels.hotkeysPause),
  resumeHotkeys: (): void => ipcRenderer.send(Channels.hotkeysResume),

  pickClientTxt: (): Promise<string | null> =>
    ipcRenderer.invoke(Channels.dialogPickClientTxt),
  locateClientTxt: (): Promise<string | null> =>
    ipcRenderer.invoke(Channels.logLocateClientTxt),

  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(Channels.appGetInfo)
}

contextBridge.exposeInMainWorld('overlay', api)

export type OverlayApi = typeof api
