// Shared class strings for the overlay and the editor: one tag, one heading,
// one button — so a style can't drift between the places that use it. Colours
// come from src/styles/tokens.css; every text-on-background pair here clears
// WCAG AA (4.5:1). 10px is the smallest text anywhere.

export type Tone = 'neutral' | 'muted' | 'gold' | 'ok' | 'warn' | 'danger'

/** A small label next to a name: NEW, REWARD, PICK ONE, YOU ARE HERE, zone 32. */
export const TAG = 'inline-block rounded px-1 text-[10px] font-semibold uppercase leading-tight tracking-wide '

export const TAG_TONE: Record<Tone, string> = {
  neutral: 'bg-white/10 text-overlay-text', // 11.4:1
  muted: 'bg-white/10 text-overlay-muted', // 5.4:1
  gold: 'bg-overlay-accent/20 text-overlay-accent', // 5.3:1
  ok: 'bg-ok/15 text-ok', // 7.1:1
  warn: 'bg-warn/15 text-warn', // 7.9:1
  danger: 'bg-danger/15 text-danger' // 7.2:1
}

/** A section heading inside a tab or a settings card. Grey by default; a
 *  heading that means "now" passes text-overlay-accent instead. */
export const HEADING = 'text-[10px] font-semibold uppercase tracking-wider '

/** Buttons: a size plus a variant. Disabled fades — the one place that does. */
export const BUTTON = 'rounded disabled:opacity-40 '

export const BUTTON_SIZE = {
  /** the overlay's header and notice bars */
  sm: 'px-1.5 py-0.5 text-[11px]',
  /** Settings */
  md: 'px-2 py-1 text-[11px]',
  /** the editor window */
  lg: 'px-2 py-1 text-xs'
} as const

export const BUTTON_VARIANT = {
  /** the one action a card is for: gold, 5.3:1 */
  primary: 'bg-overlay-accent/20 font-medium text-overlay-accent enabled:hover:bg-overlay-accent/30',
  /** everything else */
  ghost: 'bg-white/10 text-overlay-text enabled:hover:bg-white/15',
  /** a tool that shouldn't draw the eye until you want it */
  quiet: 'bg-white/10 text-overlay-muted enabled:hover:text-overlay-text',
  danger: 'bg-danger/15 text-danger enabled:hover:bg-danger/25'
} as const

export function button(variant: keyof typeof BUTTON_VARIANT, size: keyof typeof BUTTON_SIZE): string {
  return BUTTON + BUTTON_SIZE[size] + ' ' + BUTTON_VARIANT[variant] + ' '
}
