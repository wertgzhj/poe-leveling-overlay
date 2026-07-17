import { create } from 'zustand'

interface OverlayStore {
  // interaction state (mirrors the main process via overlay:state)
  visible: boolean
  clickThrough: boolean
  moveMode: boolean
  settingsOpen: boolean
  // app + settings values
  appVersion: string
  isDev: boolean
  opacity: number
  hotkeys: HotkeyBindingsBridge
  clientTxtPath: string | null
  characterName: string | null
  // log tracking (P1)
  logStatus: WatcherStatusBridge | null
  tracked: TrackerStateBridge | null
  recentEvents: LogEventSummaryBridge[]
  debugOpen: boolean
  // guide (P2)
  guide: GuideStateBridge | null
  patch: (partial: Partial<OverlayStore>) => void
  applyLogSnapshot: (snap: LogSnapshotBridge) => void
  pushEvent: (ev: LogEventSummaryBridge) => void
}

const RECENT_MAX = 100

export const useOverlayStore = create<OverlayStore>((set) => ({
  visible: true,
  clickThrough: true,
  moveMode: false,
  settingsOpen: false,
  appVersion: '',
  isDev: false,
  opacity: 0.95,
  hotkeys: {
    toggleVisibility: 'CommandOrControl+Shift+O',
    toggleClickThrough: 'CommandOrControl+Shift+C',
    toggleMoveMode: 'CommandOrControl+Shift+M',
    stepForward: 'CommandOrControl+Shift+N',
    stepBack: 'CommandOrControl+Shift+P'
  },
  clientTxtPath: null,
  characterName: null,
  logStatus: null,
  tracked: null,
  recentEvents: [],
  debugOpen: false,
  guide: null,
  patch: (partial) => set(partial),
  applyLogSnapshot: (snap) =>
    set({ logStatus: snap.status, tracked: snap.state, recentEvents: snap.recent }),
  pushEvent: (ev) =>
    set((s) => ({ recentEvents: [...s.recentEvents, ev].slice(-RECENT_MAX) }))
}))
