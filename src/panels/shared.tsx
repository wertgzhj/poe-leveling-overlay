import { useMemo } from 'react'
import { shortNamer } from '../lib/gem-names'
import { TAG, TAG_TONE, type Tone } from '../lib/ui'
import { useOverlayStore } from '../stores/overlayStore'

// Small pieces every tab uses: the tag, the error box, the socket pip.

// A small label next to a name (see TAG in lib/ui). One look for all of them,
// the colour saying what kind: gold now, green free, grey plain.
export function Tag({
  tone,
  className,
  title,
  children
}: {
  tone: Tone
  className?: string
  title?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <span title={title} className={TAG + TAG_TONE[tone] + (className ? ' ' + className : '')}>
      {children}
    </span>
  )
}

export function ErrorBox({ title, errors }: { title: string; errors: string[] }): React.JSX.Element {
  return (
    <div className="mb-2 rounded-md border border-danger/40 bg-danger/10 p-2 text-[11px] text-danger">
      <div className="mb-0.5 font-semibold">{title}</div>
      {errors.map((err, i) => (
        <div key={i}>· {err}</div>
      ))}
    </div>
  )
}

// Distinct hues + the attribute letter inside each pip, so red/green/blue stay
// unambiguous even when green and blue are hard to tell apart (colour-blind
// friendly). Green is a true green rather than emerald, blue a deep blue.
const PIP_CLASS: Record<SocketColorBridge, string> = {
  R: 'bg-red-500 text-black/80', // 4.7:1
  G: 'bg-green-500 text-black/80', // 7.0:1
  B: 'bg-blue-600 text-white', // 5.2:1
  W: 'bg-white/30 text-black/80'
}

// The socket-colour dot. Shared by the link rows and the to-do list so a gem
// looks the same wherever it turns up. Renders an empty box of the same size
// when the colour is unknown (gems.json failed to load), so nothing shifts.
export function Pip({ gem, dim }: { gem?: ColoredGemBridge; dim?: boolean }): React.JSX.Element {
  const box =
    // 9px bold, the one exception to the 10px floor: the letter repeats the
    // colour for colour-blind eyes and must fit the dot. Black on red and
    // green, white on blue — black on blue was 3.5:1.
    'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold '
  // A letterless pip still carries a zero-width space: an empty inline-flex box
  // takes its baseline from its bottom edge instead of from text, which would
  // park white pips a few pixels below the lettered ones in the to-do list.
  if (!gem) return <span className={box}>{'\u200B'}</span>
  return (
    <span
      title={
        gem.unknown
          ? 'Colour unknown — this gem is not in the gem data'
          : gem.anyColor
            ? 'No attribute requirement — fits a socket of any colour'
            : undefined
      }
      className={
        box +
        PIP_CLASS[gem.color] +
        // An "any colour" gem gets a dashed ring: white on purpose, not white
        // for lack of data. Nothing else changes about the row.
        (gem.anyColor ? ' border border-dashed border-white/50 bg-transparent' : '') +
        (dim ? ' opacity-60' : '')
      }
    >
      {gem.color === 'W' ? '\u200B' : gem.color}
    </span>
  )
}

/** "a" or "an" — every class and ascendancy name starts with a plain letter, so
 *  the vowel test is enough (Assassin, Elementalist, Inquisitor, Occultist). */
export function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}

/** A gem's name as you want to read it: your short name from Settings, or the
 *  name itself. Display only — never pass the result back into anything that
 *  looks a gem up (see electron/gem-names.ts). */
export function useGemName(): (gem: string) => string {
  const names = useOverlayStore((s) => s.gemNames)
  return useMemo(() => shortNamer(names), [names])
}

/** A gem name to draw, with the full name in the tooltip when it's shortened. */
export function GemName({ name }: { name: string }): React.JSX.Element {
  const shown = useGemName()(name)
  return shown === name ? <>{name}</> : <span title={name}>{shown}</span>
}

/** An on/off switch. */
export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }): React.JSX.Element {
  return (
    <button
      onClick={() => onChange(!on)}
      className={
        'relative h-4 w-7 rounded-full transition-colors ' +
        (on ? 'bg-overlay-accent/60' : 'bg-white/15')
      }
      role="switch"
      aria-checked={on}
    >
      <span
        className={
          'absolute top-0.5 h-3 w-3 rounded-full bg-overlay-text transition-all ' +
          (on ? 'left-3.5' : 'left-0.5')
        }
      />
    </button>
  )
}
