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
}

interface AppSettingsBridge {
  bounds: { x?: number; y?: number; width: number; height: number }
  opacity: number
  clickThrough: boolean
  hotkeys: HotkeyBindingsBridge
  clientTxtPath: string | null
}

interface SettingsPatchBridge {
  opacity?: number
  clickThrough?: boolean
  hotkeys?: HotkeyBindingsBridge
  clientTxtPath?: string | null
}

interface SettingsSetResultBridge {
  failed: string[]
}

interface OverlayBridge {
  getState(): Promise<OverlayStateBridge>
  onState(cb: (state: OverlayStateBridge) => void): () => void
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
