import Store from 'electron-store'
import type { TrackerSnapshot } from './log/tracker.ts'

// Persistent, user-editable settings. electron-store writes JSON into the OS
// userData folder (docs/plan.md §3). No personal data beyond local file paths
// and the optional in-game character name (§11.1).

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

export interface AppSettings {
  bounds: OverlayBounds
  /** 0.4–1.0, applied to the overlay panel */
  opacity: number
  /** when true the overlay is transparent to mouse input (game gets the clicks) */
  clickThrough: boolean
  hotkeys: HotkeyBindings
  /** absolute path to the game's Client.txt (P1 log watching) */
  clientTxtPath: string | null
  /** explicit character binding for level-ups; null = adopt heuristically (§8) */
  characterName: string | null
  /** log-pattern language (data/log-patterns/<lang>.json); v1 ships 'en' */
  logLanguage: string
}

/** Everything persisted, including non-setting state (resume snapshot §8,
 *  per-character guide progress). */
interface StoreSchema extends AppSettings {
  progress: TrackerSnapshot | null
  guideProgress: Record<string, string[]>
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
  characterName: null,
  logLanguage: 'en',
  progress: null,
  guideProgress: {}
}

export const store = new Store<StoreSchema>({ name: 'settings', defaults })

/** Stored hotkeys merged over defaults — a settings.json written by an older
 *  version lacks newly added bindings, and electron-store defaults don't merge
 *  inside nested objects. */
export function getHotkeys(): HotkeyBindings {
  return { ...defaults.hotkeys, ...store.get('hotkeys') }
}

export function getSettings(): AppSettings {
  return {
    bounds: store.get('bounds'),
    opacity: store.get('opacity'),
    clickThrough: store.get('clickThrough'),
    hotkeys: getHotkeys(),
    clientTxtPath: store.get('clientTxtPath'),
    characterName: store.get('characterName'),
    logLanguage: store.get('logLanguage')
  }
}
