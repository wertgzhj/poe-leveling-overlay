// Renderer-side names for the preload bridge (window.overlay) and what flows
// through it. Every one points at the main process's own type — the bridge is
// `typeof api` in electron/preload.ts — so a field added there is here too,
// and a mismatch is a type error instead of a silent drift. `import()` types
// are erased at compile time: the two bundles stay separate, only the checker
// sees both. (This used to be a 456-line hand-kept copy.)

// --- overlay, settings, app ---
type OverlayBridge = import('../electron/preload.ts').OverlayApi
type OverlayStateBridge = import('../electron/channels.ts').OverlayState
type AppInfoBridge = import('../electron/channels.ts').AppInfo
type HotkeyBindingsBridge = import('../electron/settings.ts').HotkeyBindings
type VisibleTabsBridge = import('../electron/settings.ts').VisibleTabs
type AppSettingsBridge = import('../electron/settings.ts').AppSettings
type ActRegexBridge = import('../electron/search-regex.ts').ActRegex
type SettingsPatchBridge = import('../electron/settings.ts').SettingsPatch
type SettingsSetResultBridge = import('../electron/channels.ts').SettingsSetResult
type UpdateStatusBridge = import('../electron/channels.ts').UpdateStatus

// --- game log ---
type AreaStateBridge = import('../electron/log/tracker.ts').AreaState
type LevelUpBridge = import('../electron/log/tracker.ts').LevelUpEvent
type TrackerStateBridge = import('../electron/log/tracker.ts').TrackerSnapshot
type ZoneFitBridge = import('../electron/log/tracker.ts').ZoneFit
type WatcherStatusBridge = import('../electron/log/watcher.ts').WatcherStatus
type DetectedCharacterBridge = import('../electron/channels.ts').DetectedCharacter
type LogEventSummaryBridge = import('../electron/channels.ts').LogEventSummary
type LogSnapshotBridge = import('../electron/channels.ts').LogSnapshot

// --- guide ---
type StepTypeBridge = import('../electron/guide/route.ts').StepType
type RouteStepBridge = import('../electron/guide/route.ts').RouteStep
type RouteBridge = import('../electron/guide/route.ts').Route
type GuideStateBridge = import('../electron/channels.ts').GuideState

// --- gems ---
type SocketColorBridge = import('../electron/profile/gems.ts').SocketColor
type ColoredGemBridge = import('../electron/profile/gems.ts').ColoredGem
type ColoredSocketGroupBridge = import('../electron/profile/engine.ts').ColoredSocketGroup
type ResolvedStageBridge = import('../electron/profile/engine.ts').ResolvedStage
type AcquisitionEntryBridge = import('../electron/profile/engine.ts').AcquisitionEntry
type RewardGroupBridge = import('../electron/profile/engine.ts').RewardGroup
type ShoppingStopBridge = import('../electron/profile/engine.ts').ShoppingStop
type AcquisitionItemBridge = import('../electron/profile/engine.ts').AcquisitionItem
type AcquisitionsBridge = import('../electron/profile/engine.ts').Acquisitions
type MuleOptionBridge = import('../electron/profile/engine.ts').MuleOption
type ProfileMetaBridge = import('../electron/profile/profile.ts').ProfileMeta
type ChoiceDueBridge = import('../electron/channels.ts').ChoiceDue
type ProfileSnapshotBridge = import('../electron/channels.ts').ProfileSnapshot
type PantheonStatusBridge = import('../electron/channels.ts').PantheonStatus
type PassivesViewBridge = import('../electron/channels.ts').PassivesView
type PassiveNodeViewBridge = import('../electron/channels.ts').PassiveNodeView
type LibraryEntryBridge = import('../electron/profile/library.ts').LibraryEntry
type LibraryResultBridge = import('../electron/profile/library.ts').LibraryResult
type PobImportResponseBridge = import('../electron/channels.ts').PobImportResponse

// --- trials ---
type LabTierBridge = import('../electron/trials/engine.ts').LabTier
type TrialStateBridge = import('../electron/trials/engine.ts').TrialState
type TrialsSnapshotBridge = import('../electron/trials/engine.ts').TrialsSnapshot

// --- run timer ---
type TimeCategoryBridge = import('../electron/timer/engine.ts').TimeCategory
type ActSplitBridge = import('../electron/timer/engine.ts').ActSplit
type LabSplitBridge = import('../electron/timer/engine.ts').LabSplit
type ZoneTimeBridge = import('../electron/timer/engine.ts').ZoneTime
type RunSummaryBridge = import('../electron/timer/engine.ts').RunSummary
type RunTimerSnapshotBridge = import('../electron/timer/engine.ts').RunTimerSnapshot
type ImportResultBridge = import('../electron/channels.ts').ImportResult

// --- editor: profile and route files as they're written ---
type SocketGroupFileBridge = import('../electron/profile/profile.ts').SocketGroup
type StageFileBridge = import('../electron/profile/profile.ts').Stage
type GemSourceFileBridge = import('../electron/profile/profile.ts').GemSource
type GemPlanFileBridge = import('../electron/profile/profile.ts').GemPlanEntry
type ProfileFileBridge = import('../electron/profile/profile.ts').Profile
type EditorRouteEntryBridge = import('../electron/channels.ts').EditorRouteEntry
type EditorLoadBridge = import('../electron/channels.ts').EditorLoad
type PassiveMapBridge = import('../electron/channels.ts').PassiveMap
type PlanRowBridge = import('../electron/channels.ts').PlanRow
type AnnounceEventBridge = import('../electron/channels.ts').AnnounceEvent
type AnnounceSettingsBridge = import('../electron/channels.ts').AnnounceSettings
type SpokenBridge = import('../electron/channels.ts').Spoken
type PlanCheckBridge = import('../electron/channels.ts').PlanCheck
type EditorProfileLoadBridge = import('../electron/channels.ts').EditorProfileLoad
type RouteImportResultBridge = import('../electron/channels.ts').RouteImportResult
type EditorSaveResultBridge = import('../electron/channels.ts').EditorSaveResult

interface Window {
  overlay?: OverlayBridge
}
