import { globalShortcut } from 'electron'
import { getHotkeys } from './settings'
import type { OverlayController } from './overlay'
import type { GuideService } from './guide/service.ts'
import type { TimerWindow } from './timer-window.ts'
import type { SearchKind } from './channels.ts'

/**
 * Register the global overlay hotkeys. These only ever drive the overlay — the
 * combo is consumed system-wide and never forwarded to the game.
 * Returns the accelerators that failed to bind (e.g. already taken) so the
 * caller can surface a conflict.
 */
export function registerHotkeys(
  overlay: OverlayController,
  guide: GuideService,
  timer: TimerWindow,
  copySearch: (kind: SearchKind) => void
): string[] {
  unregisterHotkeys()
  const hk = getHotkeys()

  const bindings: Array<[string, () => void]> = [
    [hk.toggleVisibility, () => overlay.toggleVisibility()],
    [hk.toggleTimer, () => timer.toggle()],
    [hk.toggleClickThrough, () => overlay.toggleClickThrough()],
    [hk.toggleMoveMode, () => overlay.toggleMoveMode()],
    [hk.stepForward, () => guide.forward()],
    [hk.stepBack, () => guide.back()],
    // Copy for the game's search boxes — the clipboard only, the paste is
    // yours. Unset ('') by default, skipped below.
    [hk.copyVendor, () => copySearch('vendor')],
    [hk.copyTree, () => copySearch('tree')],
    [hk.copyRegex, () => copySearch('regex')]
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
