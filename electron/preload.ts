import { contextBridge, ipcRenderer } from 'electron'
import {
  Channels,
  type AppInfo,
  type EditorLoad,
  type EditorSaveResult,
  type GuideState,
  type LogSnapshot,
  type OverlayState,
  type PobImportResponse,
  type ProfileSnapshot,
  type SettingsSetResult,
  type TrialsSnapshot,
  type UpdateStatus
} from './channels'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

// The only surface exposed to the renderer. Sandboxed + contextIsolated, so the
// overlay can reach exactly these channels and nothing else (plan §11.1).
const api = {
  getState: (): Promise<OverlayState> => ipcRenderer.invoke(Channels.overlayGetState),

  onState: (cb: (state: OverlayState) => void): (() => void) =>
    subscribe(Channels.overlayState, cb),

  getLogSnapshot: (): Promise<LogSnapshot> => ipcRenderer.invoke(Channels.logGetSnapshot),
  onLogStatus: (cb: (status: unknown) => void): (() => void) =>
    subscribe(Channels.logStatus, cb),
  onLogSnapshot: (cb: (snap: LogSnapshot) => void): (() => void) =>
    subscribe(Channels.logSnapshot, cb),
  onAreaEntered: (cb: (area: unknown) => void): (() => void) =>
    subscribe(Channels.areaEntered, cb),
  onLevelUp: (cb: (ev: unknown) => void): (() => void) =>
    subscribe(Channels.playerLevelUp, cb),

  getGuide: (): Promise<GuideState> => ipcRenderer.invoke(Channels.guideGet),
  onGuideState: (cb: (state: GuideState) => void): (() => void) =>
    subscribe(Channels.guideState, cb),
  guideToggleStep: (stepId: string): void =>
    ipcRenderer.send(Channels.guideToggleStep, stepId),
  guideReset: (): void => ipcRenderer.send(Channels.guideReset),

  getProfile: (): Promise<ProfileSnapshot> => ipcRenderer.invoke(Channels.profileGet),
  onProfileState: (cb: (snap: ProfileSnapshot) => void): (() => void) =>
    subscribe(Channels.profileState, cb),
  pickProfile: (): Promise<string | null> => ipcRenderer.invoke(Channels.dialogPickProfile),
  importPob: (input: string): Promise<PobImportResponse> =>
    ipcRenderer.invoke(Channels.pobImport, input),

  getTrials: (): Promise<TrialsSnapshot> => ipcRenderer.invoke(Channels.trialsGet),
  onTrialsState: (cb: (snap: TrialsSnapshot) => void): (() => void) =>
    subscribe(Channels.trialsState, cb),
  trialsToggle: (id: string): void => ipcRenderer.send(Channels.trialsToggle, id),
  trialsReset: (): void => ipcRenderer.send(Channels.trialsReset),

  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke(Channels.updateGet),
  onUpdateStatus: (cb: (status: UpdateStatus) => void): (() => void) =>
    subscribe(Channels.updateStatus, cb),
  checkForUpdates: (): void => ipcRenderer.send(Channels.updateCheck),
  installUpdate: (): void => ipcRenderer.send(Channels.updateInstall),

  openEditor: (): void => ipcRenderer.send(Channels.editorOpen),
  editorLoad: (): Promise<EditorLoad> => ipcRenderer.invoke(Channels.editorLoad),
  editorSaveRoute: (act: number, json: unknown): Promise<EditorSaveResult> =>
    ipcRenderer.invoke(Channels.editorSaveRoute, { act, json }),
  editorSaveProfile: (json: unknown): Promise<EditorSaveResult> =>
    ipcRenderer.invoke(Channels.editorSaveProfile, json),

  exitMoveMode: (): void => ipcRenderer.send(Channels.overlayExitMoveMode),

  setSettingsOpen: (open: boolean): void =>
    ipcRenderer.send(Channels.overlaySetSettingsOpen, open),

  resizeBy: (dx: number, dy: number): void =>
    ipcRenderer.send(Channels.overlayResizeBy, { dx, dy }),

  setHoverUi: (over: boolean): void => ipcRenderer.send(Channels.overlayHoverUi, over),

  getSettings: () => ipcRenderer.invoke(Channels.settingsGetAll),

  setSettings: (patch: unknown): Promise<SettingsSetResult> =>
    ipcRenderer.invoke(Channels.settingsSet, patch),

  pauseHotkeys: (): void => ipcRenderer.send(Channels.hotkeysPause),
  resumeHotkeys: (): void => ipcRenderer.send(Channels.hotkeysResume),

  pickClientTxt: (): Promise<string | null> =>
    ipcRenderer.invoke(Channels.dialogPickClientTxt),

  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(Channels.appGetInfo)
}

contextBridge.exposeInMainWorld('overlay', api)

export type OverlayApi = typeof api
