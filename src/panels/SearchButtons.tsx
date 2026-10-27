import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useOverlayStore } from '../stores/overlayStore'
import { formatAccelerator } from '../lib/accelerator'
import { BUTTON, BUTTON_SIZE } from '../lib/ui'

// The overlay's three searches side by side in the header, on every tab: the
// gems to buy (Vendor), the passives around your next points (Tree) and your
// own regex. Each copies; pasting is yours (docs/ARCHITECTURE.md#tos-position).
// Always all three, in the same place — one with nothing to copy is greyed
// out, not gone, so the row never shifts. Whatever copied a search — a click,
// a hotkey, a town or a level-up (Settings → Search & copy) — its button
// lights up for a moment, its copy icon a tick: the clipboard is never a guess.

type Kind = 'vendor' | 'tree' | 'regex'

/** How long a button stays lit after its search was copied. */
const LIT_MS = 3000

/** `compact`: the strip's version, letters instead of words, sized by the
 *  text around it. */
export function SearchButtons({ compact = false }: { compact?: boolean }): React.JSX.Element {
  const { vendor, tree, regex, perAct, hotkeys, copied } = useOverlayStore(
    useShallow((s) => ({
      vendor: s.profile?.vendorSearch ?? null,
      tree: s.profile?.passives?.treeSearch ?? null,
      regex: s.searchRegex,
      perAct: s.actRegexes.length > 0,
      hotkeys: s.hotkeys,
      copied: s.autoCopied
    }))
  )
  // Re-render once the light is due to go out.
  const [, tick] = useState(0)
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => tick((n) => n + 1), LIT_MS)
    return () => window.clearTimeout(t)
  }, [copied])
  // oxlint-disable-next-line react/purity -- read at render on purpose: the timeout above re-renders it
  const lit = copied && Date.now() - copied.at < LIT_MS ? copied.kind : null

  const key = (accelerator: string): string => (accelerator ? `\nHotkey: ${formatAccelerator(accelerator)}` : '')
  return (
    <div className={'no-drag flex items-center ' + (compact ? 'gap-[0.3em]' : 'gap-0.5')} role="group" aria-label="Copy a search">
      <SearchButton
        kind="vendor"
        label="Vendor"
        compact={compact}
        lit={lit === 'vendor'}
        title={
          vendor
            ? `The gems to buy now. Paste into the vendor's search:\n${vendor}${key(hotkeys.copyVendor)}`
            : 'Nothing to buy right now'
        }
        enabled={!!vendor}
      />
      <SearchButton
        kind="tree"
        label="Tree"
        compact={compact}
        lit={lit === 'tree'}
        title={
          tree
            ? `The passives around your next points. Paste into the tree's search:\n${tree}${key(hotkeys.copyTree)}`
            : 'No passive tree in this build'
        }
        enabled={!!tree}
      />
      <SearchButton
        kind="regex"
        label="Regex"
        compact={compact}
        lit={lit === 'regex'}
        title={
          regex || perAct
            ? 'Your regex. Paste into a stash or vendor search' +
              // which act's it is, only the main process knows (the act you've reached)
              (perAct ? ', the one for the act you are in.' : `:\n${regex}`) +
              key(hotkeys.copyRegex)
            : 'No regex of your own yet. Set one in Settings → Search & copy'
        }
        enabled={!!regex || perAct}
      />
    </div>
  )
}

function SearchButton(props: {
  kind: Kind
  label: string
  lit: boolean
  title: string
  enabled: boolean
  compact: boolean
}): React.JSX.Element {
  return (
    <button
      onClick={() => void window.overlay?.copySearch(props.kind)}
      disabled={!props.enabled}
      title={props.title}
      aria-label={`Copy the ${props.label} search`}
      className={
        // Fixed width, and the icon swaps in place: lit, the row mustn't shift.
        'inline-flex items-center justify-center disabled:opacity-35 ' +
        BUTTON +
        (props.compact ? 'gap-[0.25em] px-[0.5em] py-[0.2em] text-[0.85em]' : 'min-w-[4.1rem] gap-1 ' + BUTTON_SIZE.sm) +
        ' ' +
        (props.lit
          ? 'bg-ok/15 text-ok'
          : 'bg-white/10 text-overlay-text enabled:hover:bg-white/15')
      }
    >
      {/* a copy icon says what clicking does; it turns into a tick once copied */}
      {/* in the strip the icon grows with its text, fixed it was a speck at −2 */}
      {props.lit ? <TickIcon size={props.compact ? '1em' : 10} /> : <CopyIcon size={props.compact ? '1em' : 10} />}
      {props.compact ? props.label[0] : props.label}
    </button>
  )
}

const ICON = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true
} as const

/** Two sheets, one over the other: copy. */
function CopyIcon({ size }: { size: number | string }): React.JSX.Element {
  return (
    <svg {...ICON} width={size} height={size}>
      <rect x="5" y="5" width="9" height="9" rx="1.5" />
      <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
    </svg>
  )
}

function TickIcon({ size }: { size: number | string }): React.JSX.Element {
  return (
    <svg {...ICON} width={size} height={size} strokeWidth={2.2}>
      <path d="M3 8.5l3.2 3.2L13 4.5" />
    </svg>
  )
}
