// Renderer-side type for the preload bridge (window.overlay). Kept in sync by
// hand with electron/preload.ts + electron/channels.ts — the two build graphs
// are intentionally decoupled, so this is not imported from electron/.

interface OverlayStateBridge {
  visible: boolean
  clickThrough: boolean
  moveMode: boolean
  settingsOpen: boolean
}

interface AppInfoBridge {
  version: string
  electron: string
  isDev: boolean
}

interface HotkeyBindingsBridge {
  toggleVisibility: string
  toggleClickThrough: string
  toggleMoveMode: string
  stepForward: string
  stepBack: string
}

interface AppSettingsBridge {
  bounds: { x?: number; y?: number; width: number; height: number }
  opacity: number
  clickThrough: boolean
  hotkeys: HotkeyBindingsBridge
  clientTxtPath: string | null
  characterName: string | null
  logLanguage: string
}

interface SettingsPatchBridge {
  opacity?: number
  clickThrough?: boolean
  hotkeys?: HotkeyBindingsBridge
  clientTxtPath?: string | null
  characterName?: string | null
}

interface SettingsSetResultBridge {
  failed: string[]
}

interface AreaStateBridge {
  areaId: string | null
  name: string
  areaLevel: number | null
  ts: number
}

interface LevelUpBridge {
  name: string
  charClass: string
  level: number
  isBound: boolean
  ts: number
}

interface WatcherStatusBridge {
  state: 'off' | 'missing' | 'watching' | 'error'
  path: string | null
  sizeBytes: number | null
}

interface TrackerStateBridge {
  area: AreaStateBridge | null
  character: string | null
  charClass: string | null
  level: number | null
}

interface LogEventSummaryBridge {
  kind: 'area' | 'levelup'
  ts: number
  text: string
}

interface LogSnapshotBridge {
  status: WatcherStatusBridge
  state: TrackerStateBridge
  recent: LogEventSummaryBridge[]
}

type StepTypeBridge =
  | 'quest'
  | 'waypoint'
  | 'trial'
  | 'town'
  | 'boss'
  | 'kill'
  | 'enter'
  | 'hint'

interface RouteStepBridge {
  id: string
  type: StepTypeBridge
  areaId?: string
  zone?: string
  text: string
  hints?: string[]
  rewardHint?: boolean
}

interface RouteBridge {
  act: number
  name?: string
  steps: RouteStepBridge[]
}

interface GuideStateBridge {
  route: RouteBridge | null
  errors: string[]
  doneIds: string[]
  cursorIndex: number
  cursorStepId: string | null
}

interface OverlayBridge {
  getState(): Promise<OverlayStateBridge>
  onState(cb: (state: OverlayStateBridge) => void): () => void
  getLogSnapshot(): Promise<LogSnapshotBridge>
  onLogStatus(cb: (status: WatcherStatusBridge) => void): () => void
  onLogSnapshot(cb: (snap: LogSnapshotBridge) => void): () => void
  onAreaEntered(cb: (area: AreaStateBridge) => void): () => void
  onLevelUp(cb: (ev: LevelUpBridge) => void): () => void
  getGuide(): Promise<GuideStateBridge>
  onGuideState(cb: (state: GuideStateBridge) => void): () => void
  guideToggleStep(stepId: string): void
  guideReset(): void
  exitMoveMode(): void
  setSettingsOpen(open: boolean): void
  resizeBy(dx: number, dy: number): void
  getSettings(): Promise<AppSettingsBridge>
  setSettings(patch: SettingsPatchBridge): Promise<SettingsSetResultBridge>
  pauseHotkeys(): void
  resumeHotkeys(): void
  pickClientTxt(): Promise<string | null>
  getAppInfo(): Promise<AppInfoBridge>
}

interface Window {
  overlay?: OverlayBridge
}
