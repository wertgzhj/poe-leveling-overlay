import { create } from 'zustand'

interface OverlayStore {
  visible: boolean
  clickThrough: boolean
  moveMode: boolean
  appVersion: string
  opacity: number
  patch: (partial: Partial<OverlayStore>) => void
}

// Mirrors the main process's overlay state, kept in sync via the preload bridge.
export const useOverlayStore = create<OverlayStore>((set) => ({
  visible: true,
  clickThrough: true,
  moveMode: false,
  appVersion: '',
  opacity: 0.95,
  patch: (partial) => set(partial)
}))
