// Pure decision for the overlay's click-through behaviour (no Electron imports,
// unit-tested). Given the current interaction state, decide whether the window
// should ignore the mouse — letting clicks fall through to the game underneath —
// or capture it. The actual setIgnoreMouseEvents(..., { forward: true }) call
// lives in overlay.ts; forward:true keeps mousemove flowing so the renderer can
// keep reporting hover even while the window ignores clicks.

export interface MousePassthroughState {
  /** Move/resize mode: the whole window must be grabbable. */
  moveMode: boolean
  /** The user's default "hands off" click-through preference. */
  clickThrough: boolean
  /** The Settings panel is open — it must stay usable regardless of clickThrough. */
  settingsOpen: boolean
  /** Renderer reports the cursor is over the visible panel (data-interactive). */
  hoverUi: boolean
}

/**
 * True = ignore the mouse, so clicks pass through to the game underneath.
 *
 * - Move mode grabs the whole window so you can drag/resize it.
 * - Plain click-through passes everything to the game — EXCEPT while Settings is
 *   open, which must stay interactive. Settings then falls back to the same
 *   hover-based passthrough as interactive mode: the visible panel captures the
 *   mouse, but the transparent area around it still reaches the game. (The old
 *   behaviour blocked the game across the whole window whenever Settings was
 *   open, and made the click-through toggle inert there.)
 * - Otherwise (interactive mode, or Settings open) only the panel captures; the
 *   empty area passes through, driven by the renderer's hover reports.
 */
export function shouldIgnoreMouse(state: MousePassthroughState): boolean {
  if (state.moveMode) return false
  if (state.clickThrough && !state.settingsOpen) return true
  return !state.hoverUi
}
