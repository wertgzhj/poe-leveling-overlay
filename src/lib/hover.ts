// Linux has no forwarded mouse moves for a window that ignores the mouse, so
// the main process sends the cursor's position instead (electron/cursor-poll.ts).
// This turns that into the same "over the panel?" answer a pointer event gives.

/** Is the point (window coordinates) on an element that takes the mouse? */
export function overInteractive(point: { x: number; y: number } | null): boolean {
  if (!point) return false
  return !!document.elementFromPoint(point.x, point.y)?.closest('[data-interactive]')
}
