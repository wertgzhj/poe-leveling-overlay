// IPC channel names + payload types shared between the main process and the
// preload bridge. Renderer-facing type mirrors live in src/env.d.ts (kept in sync).

import type { TrackerSnapshot } from './log/tracker.ts'
import type { WatcherStatus } from './log/watcher.ts'
import type { Route } from './guide/route.ts'
import type { ProfileMeta, Profile } from './profile/profile.ts'
import type { ResolvedStage, Acquisitions } from './profile/engine.ts'
import type { TrialsSnapshot } from './trials/engine.ts'

export type { TrialsSnapshot }

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
  /** renderer -> main: cursor is over visible UI (drives empty-area passthrough) */
  overlayHoverUi: 'overlay:hover-ui',
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
  /** renderer -> main (invoke): native file picker for the build profile path */
  dialogPickProfile: 'dialog:pick-profile',
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
  logGetSnapshot: 'log:get-snapshot',
  /** main -> renderer: route/progress changed (hot reload, auto-advance, toggle) */
  guideState: 'guide:state',
  /** renderer -> main (invoke): current guide state */
  guideGet: 'guide:get',
  /** renderer -> main: toggle one step's done state */
  guideToggleStep: 'guide:toggle-step',
  /** renderer -> main: clear progress for the active character */
  guideReset: 'guide:reset',
  /** main -> renderer: build profile / active stage changed (hot reload, level-up) */
  profileState: 'profile:state',
  /** renderer -> main (invoke): current profile snapshot */
  profileGet: 'profile:get',
  /** renderer -> main (invoke): import a PoB code/link into an active profile */
  pobImport: 'pob:import',
  /** renderer -> main: open the editor window */
  editorOpen: 'editor:open',
  /** editor -> main (invoke): load all act routes + the active profile for editing */
  editorLoad: 'editor:load',
  /** editor -> main (invoke): validate + save one act route to the userData override */
  editorSaveRoute: 'editor:save-route',
  /** editor -> main (invoke): validate + save + activate the profile */
  editorSaveProfile: 'editor:save-profile',
  /** main -> renderer: trials tracker state changed */
  trialsState: 'trials:state',
  /** renderer -> main (invoke): current trials state */
  trialsGet: 'trials:get',
  /** renderer -> main: toggle one trial's seen state */
  trialsToggle: 'trials:toggle',
  /** renderer -> main: clear trials for the active character */
  trialsReset: 'trials:reset',
  /** main -> renderer: auto-update status changed (checking/downloading/ready/…) */
  updateStatus: 'update:status',
  /** renderer -> main (invoke): current auto-update status */
  updateGet: 'update:get',
  /** renderer -> main: check for updates now */
  updateCheck: 'update:check',
  /** renderer -> main: quit and install a downloaded update */
  updateInstall: 'update:install'
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

export interface GuideState {
  route: Route | null
  /** Acts present in the combined campaign route, in order. */
  acts: number[]
  /** Route-file validation problems, shown to the author in the panel. */
  errors: string[]
  doneIds: string[]
  cursorIndex: number
  cursorStepId: string | null
}

export interface ProfileSnapshot {
  meta: ProfileMeta | null
  errors: string[]
  level: number | null
  /** The tracked class when it differs from the profile's class, else null (§8). */
  classMismatch: string | null
  activeStage: ResolvedStage | null
  nextStage: ResolvedStage | null
  acquisitions: Acquisitions | null
}

export interface PobImportResponse {
  ok: boolean
  path?: string
  warnings: string[]
  errors: string[]
}

export interface EditorRouteEntry {
  act: number
  route: Route | null
  errors: string[]
  /** where the loaded file came from — an editable override, the bundled fallback, or none yet. */
  source: 'override' | 'bundled' | 'missing'
}

export interface EditorLoad {
  routes: EditorRouteEntry[]
  profile: { profile: Profile | null; errors: string[]; path: string | null }
}

export interface EditorSaveResult {
  ok: boolean
  errors: string[]
  path?: string
}

/** Auto-update state machine, pushed to the renderer as it changes. */
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'disabled'; reason: string }
  | { state: 'checking' }
  | { state: 'current'; version: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }
