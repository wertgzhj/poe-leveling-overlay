import { create } from 'zustand'

interface OverlayStore {
  // interaction state (mirrors the main process via overlay:state)
  visible: boolean
  clickThrough: boolean
  moveMode: boolean
  settingsOpen: boolean
  // app + settings values
  appVersion: string
  opacity: number
  hotkeys: HotkeyBindingsBridge
  clientTxtPath: string | null
  patch: (partial: Partial<OverlayStore>) => void
}

export const useOverlayStore = create<OverlayStore>((set) => ({
  visible: true,
  clickThrough: true,
  moveMode: false,
  settingsOpen: false,
  appVersion: '',
  opacity: 0.95,
  hotkeys: {
    toggleVisibility: 'CommandOrControl+Shift+O',
    toggleClickThrough: 'CommandOrControl+Shift+C',
    toggleMoveMode: 'CommandOrControl+Shift+M'
  },
  clientTxtPath: null,
  patch: (partial) => set(partial)
}))
