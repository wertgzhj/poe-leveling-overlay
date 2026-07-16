import Store from 'electron-store'

// Persistent, user-editable settings. electron-store writes JSON into the OS
// userData folder (docs/plan.md §3). No personal data beyond local file paths.

export interface HotkeyBindings {
  toggleVisibility: string
  toggleClickThrough: string
  toggleMoveMode: string
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
  /** absolute path to the game's Client.txt (used from P1 onward) */
  clientTxtPath: string | null
}

const defaults: AppSettings = {
  bounds: { width: 340, height: 480 },
  opacity: 0.95,
  clickThrough: true,
  hotkeys: {
    // Defaults deliberately avoid Path of Exile's own binds; all rebindable.
    toggleVisibility: 'CommandOrControl+Shift+O',
    toggleClickThrough: 'CommandOrControl+Shift+C',
    toggleMoveMode: 'CommandOrControl+Shift+M'
  },
  clientTxtPath: null
}

export const store = new Store<AppSettings>({ name: 'settings', defaults })

export function getSettings(): AppSettings {
  return {
    bounds: store.get('bounds'),
    opacity: store.get('opacity'),
    clickThrough: store.get('clickThrough'),
    hotkeys: store.get('hotkeys'),
    clientTxtPath: store.get('clientTxtPath')
  }
}
