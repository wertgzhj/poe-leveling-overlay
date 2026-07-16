// Renderer-side type for the preload bridge (window.overlay). Kept in sync by
// hand with electron/preload.ts + electron/channels.ts — the two build graphs
// are intentionally decoupled, so this is not imported from electron/.

interface OverlayStateBridge {
  visible: boolean
  clickThrough: boolean
  moveMode: boolean
}

interface AppInfoBridge {
  version: string
  electron: string
  isDev: boolean
}

interface AppSettingsBridge {
  bounds: { x?: number; y?: number; width: number; height: number }
  opacity: number
  clickThrough: boolean
  hotkeys: {
    toggleVisibility: string
    toggleClickThrough: string
    toggleMoveMode: string
  }
  clientTxtPath: string | null
}

interface OverlayBridge {
  getState(): Promise<OverlayStateBridge>
  onState(cb: (state: OverlayStateBridge) => void): () => void
  exitMoveMode(): void
  resizeBy(dx: number, dy: number): void
  getSettings(): Promise<AppSettingsBridge>
  getAppInfo(): Promise<AppInfoBridge>
}

interface Window {
  overlay?: OverlayBridge
}
