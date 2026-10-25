// IPC channel names + payload types shared between the main process and the
// preload bridge. The renderer names them in src/env.d.ts, by reference — not a copy.

import type { TrackerSnapshot, ZoneFit } from './log/tracker.ts'
import type { WatcherStatus } from './log/watcher.ts'
import type { Route } from './guide/route.ts'
import type { ProfileMeta, Profile } from './profile/profile.ts'
import type { ResolvedStage, Acquisitions, MuleOption } from './profile/engine.ts'
import type { TrialsSnapshot } from './trials/engine.ts'
import type { LibraryEntry, LibraryResult } from './profile/library.ts'
import type { ChoiceDue } from './profile/run.ts'
import type { RunTimerSnapshot } from './timer/engine.ts'
import type { ImportResult } from './timer/service.ts'

export type { TrialsSnapshot, LibraryEntry, LibraryResult, RunTimerSnapshot, ImportResult }

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
  /** renderer -> main (invoke): look for Client.txt and use it; the path or null */
  logLocateClientTxt: 'log:locate-client-txt',
  /** renderer -> main: the gem to mule on the tracked character (null = none) */
  profileSetMule: 'profile:set-mule',
  /** renderer -> main (invoke): switch the active profile by library id */
  profilesActivate: 'profiles:activate',
  /** editor -> main (invoke): a new profile from a name + class */
  profilesCreate: 'profiles:create',
  /** editor -> main (invoke): copy a profile as a new one */
  profilesDuplicate: 'profiles:duplicate',
  /** editor -> main (invoke): rename a profile (its meta.name) */
  profilesRename: 'profiles:rename',
  /** editor -> main (invoke): move a profile to the recycle bin */
  profilesDelete: 'profiles:delete',
  /** editor -> main (invoke): pick an outside JSON file and copy it in */
  profilesImportFile: 'profiles:import-file',
  /** renderer -> main (invoke): app/runtime info for the panel */
  appGetInfo: 'app:get-info',
  /** main -> renderer: log watcher status changed */
  logStatus: 'log:status',
  /** main -> renderer: full tracker snapshot (after backscan / rebinding) */
  logSnapshot: 'log:snapshot',
  /** main -> renderer: the tracked player entered an area */
  areaEntered: 'area:entered',
  /** main -> renderer: a level-up line was seen (bound or party member) */
  playerLevelUp: 'player:levelup',
  /** renderer -> main (invoke): current status + tracker state + recent events */
  logGetSnapshot: 'log:get-snapshot',
  /** renderer -> main (invoke): re-detect + track the character from the most
   *  recent level-up in the log; returns the detected character or null. */
  logDetectCharacter: 'log:detect-character',
  /** renderer -> main (invoke): put the stored search regex on the clipboard.
   *  Copies what's in Settings, never text the renderer supplies — this channel
   *  can't be used to write arbitrary content to the clipboard. */
  clipboardCopySearchRegex: 'clipboard:copy-search-regex',
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
  /** renderer -> main (invoke): every gem's name, for the short-name picker */
  profileGemNames: 'profile:gem-names',
  /** renderer -> main: page the viewed gem stage by a delta (±1); pins a manual
   *  view until it lands back on the live stage. */
  profileStageStep: 'profile:stage-step',
  /** renderer -> main: drop the manual gem-stage view, resume auto-follow. */
  profileStageLive: 'profile:stage-live',
  /** renderer -> main: acknowledge a build-decision reminder (bandit/pantheon) */
  profileDismissChoice: 'profile:dismiss-choice',
  /** renderer -> main: tick/untick a Pantheon power as unlocked on this character */
  profileTogglePantheon: 'profile:toggle-pantheon',
  /** renderer -> main (invoke): import a PoB code/link into an active profile */
  pobImport: 'pob:import',
  /** renderer -> main: open the editor window */
  editorOpen: 'editor:open',
  /** editor -> main (invoke): load all act routes + the active profile for editing */
  editorLoad: 'editor:load',
  /** editor -> main (invoke): validate + save one act route to the userData override */
  editorSaveRoute: 'editor:save-route',
  /** editor -> main (invoke): one library profile, parsed, for editing */
  editorLoadProfile: 'editor:load-profile',
  /** editor -> main (invoke): validate + save a profile back to its own file */
  editorSaveProfile: 'editor:save-profile',
  /** main -> editor: bring a tab to the front ("Manage profiles…") */
  editorFocusTab: 'editor:focus-tab',
  /** editor -> main (invoke): the routes in effect, serialized for sharing */
  editorExportRoutes: 'editor:export-routes',
  /** editor -> main (invoke): validate shared routes and write them as overrides */
  editorImportRoutes: 'editor:import-routes',
  /** main -> renderer: trials tracker state changed */
  trialsState: 'trials:state',
  /** renderer -> main (invoke): current trials state */
  trialsGet: 'trials:get',
  /** renderer -> main: toggle one trial's seen state */
  trialsToggle: 'trials:toggle',
  /** renderer -> main: clear trials for the active character */
  trialsReset: 'trials:reset',
  /** renderer -> main: acknowledge a Labyrinth's "unlocked" notice */
  trialsDismissLab: 'trials:dismiss-lab',
  /** main -> timer window: the run timer changed (a load, a level-up) */
  timerState: 'timer:state',
  /** timer window -> main (invoke): current run timer state */
  timerGet: 'timer:get',
  /** timer window -> main: drop a run, by id (the live one included) */
  timerDeleteRun: 'timer:delete-run',
  /** timer window -> main: the height its panel needs, in px */
  timerFitHeight: 'timer:fit-height',
  /** timer window -> main (invoke): read the whole Client.txt for finished runs */
  timerImport: 'timer:import',
  /** main -> timer window: how far that read is, 0..1 */
  timerImportProgress: 'timer:import-progress',
  /** timer window -> main: end the run in progress and keep it */
  timerEndRun: 'timer:end-run',
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
 *  Never contains raw log lines. */
export interface LogEventSummary {
  kind: 'area' | 'levelup'
  ts: number
  text: string
}

export interface LogSnapshot {
  status: WatcherStatus
  state: TrackerSnapshot
  recent: LogEventSummary[]
  /** The log is being read, but only its locale-independent lines parse — the
   *  game client speaks a language the shipped patterns don't cover. */
  languageMismatch: boolean
  /** Character level vs. the zone's monster level, when the gap is wide enough
   *  to cost experience. null in towns and wherever the comparison is moot. */
  zoneFit: ZoneFit | null
}

/** The character the log says you're on now — from the most recent level-up —
 *  returned by the detect-character action. null = no level-up seen in the log
 *  yet (Client.txt only reveals a name when a character levels up). */
export interface DetectedCharacter {
  name: string
  charClass: string
  level: number
  /** false when a name pinned in Settings wins — the detection stands, but
   *  tracking did not move, and the button has to say so rather than tick. */
  tracking: boolean
  pinnedTo: string | null
}

export interface GuideState {
  route: Route | null
  /** Acts present in the combined campaign route, in order. */
  acts: number[]
  /** Acts still on the bundled placeholder route — the panel says so rather
   *  than presenting "Placeholder — add the zones you take" as guidance. */
  skeletonActs: number[]
  /** Route-file validation problems, shown to the author in the panel. */
  errors: string[]
  doneIds: string[]
  cursorIndex: number
  cursorStepId: string | null
}

export interface ProfileSnapshot {
  meta: ProfileMeta | null
  errors: string[]
  /** gems.json (shipped as a resource) failed to load — colours and sources are
   *  all missing, which needs saying out loud rather than looking like bad data. */
  gemDataError: string | null
  level: number | null
  /** The tracked class when it differs from the profile's class, else null. */
  classMismatch: string | null
  /** The tracked character looks like a mule for this build (low level, a
   *  class whose starting gems the profile uses): its class. Replaces the
   *  mismatch warning rather than adding to it. */
  muling: string | null
  /** The stage being shown (the viewed one — see viewedIndex vs liveIndex). */
  activeStage: ResolvedStage | null
  nextStage: ResolvedStage | null
  acquisitions: Acquisitions | null
  /** Total stages in the profile (for the ◀/▶ paging bounds). */
  stageCount: number
  /** Index of the stage currently shown (may be a manual view), -1 if none. */
  viewedIndex: number
  /** Index of the stage the tracked level maps to, -1 if none. When it differs
   *  from viewedIndex you're looking at a manually-paged stage, not the live one. */
  liveIndex: number
  /** a bandit/pantheon reminder that is due and not yet acknowledged. */
  choiceDue: ChoiceDue | null
  /** Every profile you have, bundled example first. */
  library: LibraryEntry[]
  /** The active profile's library id; null if it isn't in the library. */
  activeId: string | null
  /** What this build could mule and which gem you mule on the tracked
   *  character (null = none) — null altogether when there's no character yet or
   *  nothing to mule. */
  muleChoice: { options: MuleOption[]; chosen: string | null } | null
  /** The Pantheon powers the profile names, where their gods are fought, and
   *  whether this character has them — empty without a choice or a character. */
  pantheon: PantheonStatus[]
}

/** One Pantheon power the profile wants (see electron/profile/pantheon.ts). */
export interface PantheonStatus {
  soul: string
  god: string
  act: number
  /** "The Sand Pit, a side area of The Oasis" */
  where: string
  /** the side area to look for, when the god is in one ("The Sand Pit", or
   *  "a side area" where we don't have its name) */
  side?: string
  /** ticked as unlocked on this character */
  unlocked: boolean
  /** you're standing where its god is fought */
  here: boolean
}

/** A one-shot build decision you've reached the point for (profile/run.ts). */
export type { ChoiceDue } from './profile/run.ts'

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
}

/** One profile opened in the editor. */
export interface EditorProfileLoad {
  id: string
  path: string
  /** the bundled example: saving it creates a new profile of yours */
  bundled: boolean
  profile: Profile | null
  errors: string[]
}

/** Outcome of importing shared routes: which acts landed, and everything that
 *  didn't — a bad act is reported, never fatal to the rest. */
export interface RouteImportResult {
  written: number[]
  errors: string[]
}

export interface EditorSaveResult {
  ok: boolean
  errors: string[]
  path?: string
  /** a profile save: the id it landed under (new when the example was saved) */
  id?: string
}

/** Auto-update state machine, pushed to the renderer as it changes. */
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'disabled'; reason: string }
  | { state: 'checking' }
  | { state: 'current'; version: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  /** A newer release exists but its files aren't attached yet (the build is
   *  still running). Retried on the next check; not a failure. */
  | { state: 'publishing'; version: string | null }
  | { state: 'error'; message: string }
