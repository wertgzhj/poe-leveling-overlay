import { globalShortcut } from 'electron'
import { getHotkeys } from './settings'
import type { OverlayController } from './overlay'
import type { GuideService } from './guide/service.ts'

/**
 * Register the global overlay hotkeys. These only ever drive the overlay — the
 * combo is consumed system-wide and never forwarded to the game (plan §2).
 * Returns the accelerators that failed to bind (e.g. already taken) so the
 * caller can surface a conflict.
 */
export function registerHotkeys(overlay: OverlayController, guide: GuideService): string[] {
  unregisterHotkeys()
  const hk = getHotkeys()

  const bindings: Array<[string, () => void]> = [
    [hk.toggleVisibility, () => overlay.toggleVisibility()],
    [hk.toggleClickThrough, () => overlay.toggleClickThrough()],
    [hk.toggleMoveMode, () => overlay.toggleMoveMode()],
    [hk.stepForward, () => guide.forward()],
    [hk.stepBack, () => guide.back()]
  ]

  const failed: string[] = []
  for (const [accelerator, handler] of bindings) {
    if (!accelerator) continue
    let ok = false
    try {
      ok = globalShortcut.register(accelerator, handler)
    } catch {
      ok = false
    }
    if (!ok) failed.push(accelerator)
  }
  return failed
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
}
