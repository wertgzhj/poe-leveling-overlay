import Store from 'electron-store'
import type { TrackerSnapshot } from './log/tracker.ts'

// Persistent, user-editable settings. electron-store writes JSON into the OS
// userData folder. No personal data beyond local file paths
// and the optional in-game character name.

export interface HotkeyBindings {
  toggleVisibility: string
  toggleClickThrough: string
  toggleMoveMode: string
  stepForward: string
  stepBack: string
}

export interface OverlayBounds {
  x?: number
  y?: number
  width: number
  height: number
}

/** Which of the overlay's tabs are shown. At least one is always on — the
 *  sanitizer falls back to Guide if a patch would turn them all off. */
export interface VisibleTabs {
  guide: boolean
  gems: boolean
  trials: boolean
}

export interface AppSettings {
  bounds: OverlayBounds
  /** 0.4–1.0, applied to the overlay panel */
  opacity: number
  /** when true the overlay is transparent to mouse input (game gets the clicks) */
  clickThrough: boolean
  hotkeys: HotkeyBindings
  /** absolute path to the game's Client.txt */
  clientTxtPath: string | null
  /** absolute path to the active build profile JSON; null = bundled example */
  profilePath: string | null
  /** explicit character binding for level-ups; null = adopt heuristically */
  characterName: string | null
  /** log-pattern language (data/log-patterns/<lang>.json); v1 ships 'en' */
  logLanguage: string
  /** tabs to show in the overlay (hide the ones you don't use) */
  visibleTabs: VisibleTabs
  /** A search string for the game's stash/vendor search box, copied from the
   *  overlay with one click. '' = none, and none means no button. */
  searchRegex: string
}

/** What the renderer may change through the settings channel (see ipc.ts:
 *  every field is checked there, unknown ones are ignored). */
export type SettingsPatch = Partial<
  Pick<AppSettings, 'opacity' | 'clickThrough' | 'clientTxtPath' | 'characterName' | 'visibleTabs' | 'searchRegex'>
> & { hotkeys?: Partial<HotkeyBindings> }

/** Everything persisted, including non-setting state: the resume snapshot and
 *  per-character guide progress. */
interface StoreSchema extends AppSettings {
  progress: TrackerSnapshot | null
  guideProgress: Record<string, string[]>
  trialsProgress: Record<string, string[]>
  /** character -> Labyrinth tiers whose unlock notice was dismissed. */
  trialsDismissedLabs: Record<string, string[]>
  /** character -> Labyrinth tiers beaten (Izaro's death line, see trials). */
  trialsCompletedLabs: Record<string, string[]>
  /** character -> the build profile last used for them, so switching characters
   *  switches profiles instead of making you go into Settings. Built from use;
   *  a profile that names its character (`meta.character`) declares its own. */
  profileByCharacter: Record<string, string>
  /** character -> the furthest campaign act they have reached. The gem to-do
   *  list drops anything from beyond it: at level 2 in Act 1, an Act 4 quest
   *  choice is not a preview. Monotonic — portalling to town isn't a setback. */
  actReached: Record<string, number>
  /** character -> has been to Act 3's Library. Siosa sells more gems than any
   *  other vendor and unlocks there, not on entering the act. */
  libraryReached: Record<string, boolean>
  /** character -> build decisions whose reminder was acknowledged ("bandit",
   *  "pantheon"). One-shot choices, so the notice must not come back. */
  dismissedChoices: Record<string, string[]>
  /** character -> the gem you mule on it, or null for none. Absent = the
   *  default (Momentum, else the build's first): muling generally beats a quest
   *  reward, but whether it's worth an alt is the player's call per character. */
  muleByCharacter: Record<string, string | null>
}

const defaults: StoreSchema = {
  bounds: { width: 340, height: 480 },
  opacity: 0.95,
  clickThrough: true,
  hotkeys: {
    // Defaults deliberately avoid Path of Exile's own binds; all rebindable.
    toggleVisibility: 'CommandOrControl+Shift+O',
    toggleClickThrough: 'CommandOrControl+Shift+C',
    toggleMoveMode: 'CommandOrControl+Shift+M',
    stepForward: 'CommandOrControl+Shift+N',
    stepBack: 'CommandOrControl+Shift+P'
  },
  clientTxtPath: null,
  profilePath: null,
  characterName: null,
  logLanguage: 'en',
  visibleTabs: { guide: true, gems: true, trials: true },
  searchRegex: '',
  progress: null,
  guideProgress: {},
  trialsProgress: {},
  trialsDismissedLabs: {},
  trialsCompletedLabs: {},
  profileByCharacter: {},
  actReached: {},
  libraryReached: {},
  dismissedChoices: {},
  muleByCharacter: {}
}

export const store = new Store<StoreSchema>({ name: 'settings', defaults })

/** Stored hotkeys merged over defaults — a settings.json written by an older
 *  version lacks newly added bindings, and electron-store defaults don't merge
 *  inside nested objects. */
export function getHotkeys(): HotkeyBindings {
  return { ...defaults.hotkeys, ...store.get('hotkeys') }
}

/** Stored tab visibility merged over defaults (same nested-merge gap as hotkeys),
 *  guaranteeing at least one visible tab. */
export function getVisibleTabs(): VisibleTabs {
  return sanitizeVisibleTabs(store.get('visibleTabs'))
}

/** Never let every tab be hidden — an empty overlay has no way back to Settings
 *  other than the tray, so fall back to Guide. */
export function sanitizeVisibleTabs(next: Partial<VisibleTabs> | undefined): VisibleTabs {
  const merged = { ...defaults.visibleTabs, ...next }
  const tabs: VisibleTabs = {
    guide: merged.guide !== false,
    gems: merged.gems !== false,
    trials: merged.trials !== false
  }
  return tabs.guide || tabs.gems || tabs.trials ? tabs : { ...tabs, guide: true }
}

export function getSettings(): AppSettings {
  return {
    bounds: store.get('bounds'),
    opacity: store.get('opacity'),
    clickThrough: store.get('clickThrough'),
    hotkeys: getHotkeys(),
    clientTxtPath: store.get('clientTxtPath'),
    profilePath: store.get('profilePath'),
    characterName: store.get('characterName'),
    logLanguage: store.get('logLanguage'),
    visibleTabs: getVisibleTabs(),
    searchRegex: store.get('searchRegex')
  }
}
