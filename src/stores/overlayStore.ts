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
  profilePath: string | null
  characterName: string | null
  visibleTabs: VisibleTabsBridge
  /** Unfinished features, off by default. Off must mean invisible. */
  experimental: ExperimentalFlagsBridge
  // log tracking
  logStatus: WatcherStatusBridge | null
  tracked: TrackerStateBridge | null
  /** The log parses only its locale-independent lines — non-English client. */
  languageMismatch: boolean
  /** Level vs. zone monster level, when the gap costs experience. */
  zoneFit: ZoneFitBridge | null
  debugOpen: boolean
  // guide
  guide: GuideStateBridge | null
  // build profile
  profile: ProfileSnapshotBridge | null
  /** Plan vs. what's actually socketed. Null until the overlay is connected to
   *  GGG — and null must render nothing, not a prompt to connect. */
  socketCheck: SocketCheckBridge | null
  // trials
  trials: TrialsSnapshotBridge | null
  // auto-update
  update: UpdateStatusBridge | null
  updateDismissed: boolean
  tab: 'guide' | 'gems' | 'trials'
  patch: (partial: Partial<OverlayStore>) => void
  applyLogSnapshot: (snap: LogSnapshotBridge) => void
}

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
  profilePath: null,
  characterName: null,
  visibleTabs: { guide: true, gems: true, trials: true },
  experimental: { gggApi: false },
  logStatus: null,
  tracked: null,
  languageMismatch: false,
  zoneFit: null,
  debugOpen: false,
  guide: null,
  profile: null,
  socketCheck: null,
  trials: null,
  update: null,
  updateDismissed: false,
  // Gems first: it works out of the box (bundled gem data + PoB import), while
  // the Guide depends on route content the user still has to write.
  tab: 'gems',
  patch: (partial) => set(partial),
  applyLogSnapshot: (snap) =>
    set({
      logStatus: snap.status,
      tracked: snap.state,
      languageMismatch: snap.languageMismatch,
      zoneFit: snap.zoneFit
    })
}))
