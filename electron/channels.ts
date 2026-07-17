// IPC channel names + payload types shared between the main process and the
// preload bridge. Renderer-facing type mirrors live in src/env.d.ts (kept in sync).

import type { TrackerSnapshot } from './log/tracker.ts'
import type { WatcherStatus } from './log/watcher.ts'

export const Channels = {
  /** main -> renderer: overlay interaction state changed */
  overlayState: 'overlay:state',
  /** renderer -> main (invoke): fetch current overlay state */
  overlayGetState: 'overlay:get-state',
  /** renderer -> main: leave move/resize mode (e.g. a "Done" button) */
  overlayExitMoveMode: 'overlay:exit-move-mode',
  /** renderer -> main: open/close the in-overlay settings panel */
  overlaySetSettingsOpen: 'overlay:set-settings-open',
  /** renderer -> main: resize the overlay window by a pixel delta (resize grip) */
  overlayResizeBy: 'overlay:resize-by',
  /** renderer -> main (invoke): read persisted settings */
  settingsGetAll: 'settings:get-all',
  /** renderer -> main (invoke): patch settings; returns hotkeys that failed to bind */
  settingsSet: 'settings:set',
  /** renderer -> main: suspend global hotkeys while capturing a new combo */
  hotkeysPause: 'hotkeys:pause',
  /** renderer -> main: re-register global hotkeys from stored settings */
  hotkeysResume: 'hotkeys:resume',
  /** renderer -> main (invoke): native file picker for the Client.txt path */
  dialogPickClientTxt: 'dialog:pick-client-txt',
  /** renderer -> main (invoke): app/runtime info for the panel */
  appGetInfo: 'app:get-info',
  /** main -> renderer: log watcher status changed */
  logStatus: 'log:status',
  /** main -> renderer: full tracker snapshot (after backscan / rebinding) */
  logSnapshot: 'log:snapshot',
  /** main -> renderer: the tracked player entered an area (plan §4) */
  areaEntered: 'area:entered',
  /** main -> renderer: a level-up line was seen (bound or party member) */
  playerLevelUp: 'player:levelup',
  /** renderer -> main (invoke): current status + tracker state + recent events */
  logGetSnapshot: 'log:get-snapshot'
} as const

export interface OverlayState {
  visible: boolean
  clickThrough: boolean
  moveMode: boolean
  settingsOpen: boolean
}

export interface AppInfo {
  version: string
  electron: string
  isDev: boolean
}

/** Result of settings:set — accelerators that globalShortcut refused to bind. */
export interface SettingsSetResult {
  failed: string[]
}

/** Human-readable, already-parsed log event for the (dev-only) DebugPanel.
 *  Never contains raw log lines (§11.1). */
export interface LogEventSummary {
  kind: 'area' | 'levelup'
  ts: number
  text: string
}

export interface LogSnapshot {
  status: WatcherStatus
  state: TrackerSnapshot
  recent: LogEventSummary[]
}
