import { contextBridge, ipcRenderer } from 'electron'
import { Channels, type AppInfo, type OverlayState } from './channels'

// The only surface exposed to the renderer. Sandboxed + contextIsolated, so the
// overlay can reach exactly these channels and nothing else (plan §11.1).
const api = {
  getState: (): Promise<OverlayState> => ipcRenderer.invoke(Channels.overlayGetState),

  onState: (cb: (state: OverlayState) => void): (() => void) => {
    const listener = (_e: unknown, state: OverlayState): void => cb(state)
    ipcRenderer.on(Channels.overlayState, listener)
    return () => ipcRenderer.removeListener(Channels.overlayState, listener)
  },

  exitMoveMode: (): void => ipcRenderer.send(Channels.overlayExitMoveMode),

  resizeBy: (dx: number, dy: number): void =>
    ipcRenderer.send(Channels.overlayResizeBy, { dx, dy }),

  getSettings: () => ipcRenderer.invoke(Channels.settingsGetAll),

  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(Channels.appGetInfo)
}

contextBridge.exposeInMainWorld('overlay', api)

export type OverlayApi = typeof api
