// Where the compact strip sits on screen and how it grows. Pure (no Electron
// imports, unit-tested in tests/strip-place.test.ts); overlay.ts applies it.
//
// Path of Exile lays out its UI by the screen's height: the flasks and the
// panels on the left are anchored to the left edge, the skill bar and the
// inventory to the right, all scaled with the height. Measured on a
// 2560 x 1440 game (October 2026) with every combination of vendor, reward,
// stash, world map, character sheet and inventory open, the band between the
// flask buttons and the skill bar, under the vendor window and over the XP
// bar, stays free. Its edges, as fractions of the screen height:

/** the band's left edge, from the screen's left */
const BAND_LEFT = 0.653
/** the band's right edge, from the screen's right */
const BAND_RIGHT = 0.498
/** the top of the XP bar, from the screen's top: the strip's bottom stays above it */
const XP_BAR_TOP = 0.965
/** the strip's width as a share of the height: room for a gem, its colour
 *  and its source at the game's text size */
const STRIP_WIDTH = 0.333

/** The game's text size, as a share of the screen height: 20 px on 1440. */
export const GAME_TEXT = 20 / 1440

/** The text size steps, Smaller to Bigger, around the game's own. */
export const STRIP_TEXT_STEPS = [0.8, 0.9, 1, 1.15, 1.3] as const
/** The step that matches the game. */
export const STRIP_TEXT_DEFAULT = 2

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** The strip's text size in px on a display this tall. */
export function stripFontSize(displayHeight: number, step: number): number {
  const factor = STRIP_TEXT_STEPS[step] ?? STRIP_TEXT_STEPS[STRIP_TEXT_DEFAULT]
  return Math.round(displayHeight * GAME_TEXT * factor * 10) / 10
}

/** Where the strip starts: in the free band over the XP bar, its bottom on the
 *  bar. On a screen too narrow for the band (4:3), the middle. */
export function defaultStripBounds(display: Rect, height: number): Rect {
  const h = display.height
  const width = Math.round(h * STRIP_WIDTH)
  const left = h * BAND_LEFT
  const right = display.width - h * BAND_RIGHT
  const centre = right - left >= width ? (left + right) / 2 : display.width / 2
  return {
    x: Math.round(display.x + centre - width / 2),
    y: Math.round(display.y + h * XP_BAR_TOP - height),
    width,
    height
  }
}

/**
 * The strip's new rectangle once its content is `height` tall. It grows away
 * from the screen edge it sits nearer to: in the lower half its bottom stays
 * put (over the XP bar it grows upward), in the upper half its top does. Then
 * it is kept on the display, so a line more never pushes it off the screen.
 */
export function anchoredResize(current: Rect, height: number, display: Rect): Rect {
  const h = Math.min(Math.round(height), display.height)
  const lower = current.y + current.height / 2 > display.y + display.height / 2
  let y = lower ? current.y + current.height - h : current.y
  y = Math.min(Math.max(y, display.y), display.y + display.height - h)
  const x = Math.min(Math.max(current.x, display.x), display.x + display.width - current.width)
  return { x, y, width: current.width, height: h }
}
