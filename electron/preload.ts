import { contextBridge, ipcRenderer } from 'electron'
import {
  Channels,
  type AppInfo,
  type LogSnapshot,
  type OverlayState,
  type SettingsSetResult
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

  exitMoveMode: (): void => ipcRenderer.send(Channels.overlayExitMoveMode),

  setSettingsOpen: (open: boolean): void =>
    ipcRenderer.send(Channels.overlaySetSettingsOpen, open),

  resizeBy: (dx: number, dy: number): void =>
    ipcRenderer.send(Channels.overlayResizeBy, { dx, dy }),

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
