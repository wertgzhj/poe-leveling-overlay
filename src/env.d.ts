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
  profilePath: string | null
  characterName: string | null
  logLanguage: string
}

interface SettingsPatchBridge {
  opacity?: number
  clickThrough?: boolean
  hotkeys?: HotkeyBindingsBridge
  clientTxtPath?: string | null
  profilePath?: string | null
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
  act?: number
}

interface RouteBridge {
  act: number
  name?: string
  steps: RouteStepBridge[]
}

interface GuideStateBridge {
  route: RouteBridge | null
  acts: number[]
  errors: string[]
  doneIds: string[]
  cursorIndex: number
  cursorStepId: string | null
}

type SocketColorBridge = 'R' | 'G' | 'B' | 'W'

interface ColoredGemBridge {
  name: string
  color: SocketColorBridge
  unknown: boolean
}

interface ColoredSocketGroupBridge {
  gems: ColoredGemBridge[]
  note?: string
}

interface ResolvedStageBridge {
  index: number
  label: string
  range: [number, number]
  groups: ColoredSocketGroupBridge[]
  note?: string
}

interface AcquisitionEntryBridge {
  gem: string
  count?: number
  bucket: 'reward' | 'purchase' | 'other'
  act?: number
  npc?: string
  quest?: string
  note?: string
  fallback?: boolean
  fromLevel?: number
  cost?: string
  starting?: boolean
}

interface RewardGroupBridge {
  quest?: string
  act?: number
  pickOne: boolean
  gems: AcquisitionEntryBridge[]
}

interface AcquisitionsBridge {
  rewards: AcquisitionEntryBridge[]
  purchases: AcquisitionEntryBridge[]
  other: AcquisitionEntryBridge[]
  upcoming: AcquisitionEntryBridge[]
  rewardGroups: RewardGroupBridge[]
}

interface ProfileMetaBridge {
  name: string
  class: string
  ascendancy?: string
  character?: string
  pobSource?: string
}

interface ProfileSnapshotBridge {
  meta: ProfileMetaBridge | null
  errors: string[]
  level: number | null
  classMismatch: string | null
  activeStage: ResolvedStageBridge | null
  nextStage: ResolvedStageBridge | null
  acquisitions: AcquisitionsBridge | null
}

interface PobImportResponseBridge {
  ok: boolean
  path?: string
  warnings: string[]
  errors: string[]
}

interface TrialStateBridge {
  id: string
  act: number
  zone: string
  seen: boolean
}

interface TrialsSnapshotBridge {
  trials: TrialStateBridge[]
  seenCount: number
  total: number
  currentZoneTrialId: string | null
}

// --- Editor (route/profile file editing) ---

interface SocketGroupFileBridge {
  gems: string[]
  note?: string
}

interface StageFileBridge {
  range: [number, number]
  label?: string
  socketGroups: SocketGroupFileBridge[]
  note?: string
}

interface GemSourceFileBridge {
  kind: 'questReward' | 'vendor' | 'drop' | 'unobtainable'
  questId?: string
  npc?: string
  act?: number
  afterQuest?: string
  note?: string
}

interface GemPlanFileBridge {
  gem: string
  count?: number
  source?: GemSourceFileBridge
}

interface ProfileFileBridge {
  meta: ProfileMetaBridge
  stages: StageFileBridge[]
  gemPlan: GemPlanFileBridge[]
}

interface EditorRouteEntryBridge {
  act: number
  route: RouteBridge | null
  errors: string[]
  source: 'override' | 'bundled' | 'missing'
}

interface EditorLoadBridge {
  routes: EditorRouteEntryBridge[]
  profile: { profile: ProfileFileBridge | null; errors: string[]; path: string | null }
}

interface EditorSaveResultBridge {
  ok: boolean
  errors: string[]
  path?: string
}

type UpdateStatusBridge =
  | { state: 'idle' }
  | { state: 'disabled'; reason: string }
  | { state: 'checking' }
  | { state: 'current'; version: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

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
  getProfile(): Promise<ProfileSnapshotBridge>
  onProfileState(cb: (snap: ProfileSnapshotBridge) => void): () => void
  pickProfile(): Promise<string | null>
  importPob(input: string): Promise<PobImportResponseBridge>
  getTrials(): Promise<TrialsSnapshotBridge>
  onTrialsState(cb: (snap: TrialsSnapshotBridge) => void): () => void
  trialsToggle(id: string): void
  trialsReset(): void
  exitMoveMode(): void
  setSettingsOpen(open: boolean): void
  resizeBy(dx: number, dy: number): void
  setHoverUi(over: boolean): void
  getSettings(): Promise<AppSettingsBridge>
  setSettings(patch: SettingsPatchBridge): Promise<SettingsSetResultBridge>
  pauseHotkeys(): void
  resumeHotkeys(): void
  pickClientTxt(): Promise<string | null>
  getAppInfo(): Promise<AppInfoBridge>
  openEditor(): void
  editorLoad(): Promise<EditorLoadBridge>
  editorSaveRoute(act: number, json: unknown): Promise<EditorSaveResultBridge>
  editorSaveProfile(json: unknown): Promise<EditorSaveResultBridge>
  getUpdateStatus(): Promise<UpdateStatusBridge>
  onUpdateStatus(cb: (status: UpdateStatusBridge) => void): () => void
  checkForUpdates(): void
  installUpdate(): void
}

interface Window {
  overlay?: OverlayBridge
}
