// IPC channel names + payload types shared between the main process and the
// preload bridge. Renderer-facing type mirrors live in src/env.d.ts (kept in sync).

export const Channels = {
  /** main -> renderer: overlay interaction state changed */
  overlayState: 'overlay:state',
  /** renderer -> main (invoke): fetch current overlay state */
  overlayGetState: 'overlay:get-state',
  /** renderer -> main: leave move/resize mode (e.g. a "Done" button) */
  overlayExitMoveMode: 'overlay:exit-move-mode',
  /** renderer -> main: resize the overlay window by a pixel delta (resize grip) */
  overlayResizeBy: 'overlay:resize-by',
  /** renderer -> main (invoke): read persisted settings */
  settingsGetAll: 'settings:get-all',
  /** renderer -> main (invoke): app/runtime info for the panel */
  appGetInfo: 'app:get-info'
} as const

export interface OverlayState {
  visible: boolean
  clickThrough: boolean
  moveMode: boolean
}

export interface AppInfo {
  version: string
  electron: string
  isDev: boolean
}
