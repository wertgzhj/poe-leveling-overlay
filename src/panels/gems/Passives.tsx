import { useState } from 'react'
import { HEADING, button } from '../../lib/ui'
import { PassiveMap } from './PassiveMap'

// The passive tree under the gems: the node for your next point (its stats in
// the tooltip — under it they were more than anyone reads mid-run), the few after
// it, a respec when one is due, and the next ascendancy points. Which node is
// due follows your points — (level - 1) plus the Books of Skill you used — the
// way the gem stage follows your level. Clicking a name copies it, to paste
// into the in-game tree's search box; nothing more (docs/ARCHITECTURE.md#tos-position).

export function Passives({ view }: { view: PassivesViewBridge }): React.JSX.Element {
  const [due, ...after] = view.next
  const [mapOpen, setMapOpen] = useState(() => {
    try {
      return localStorage.getItem(MAP_KEY) === '1'
    } catch {
      return false
    }
  })
  const toggleMap = (): void => {
    setMapOpen(!mapOpen)
    try {
      localStorage.setItem(MAP_KEY, mapOpen ? '0' : '1')
    } catch {
      // storage unavailable: it just won't be remembered
    }
  }
  const pointsTitle =
    `${view.points} passive points: level − 1` +
    (view.questPoints ? ` + ${view.questPoints} from Books of Skill` : ' (no Book of Skill used yet)')
  return (
    <div className="mt-1 rounded-md border border-overlay-border/60 bg-black/20 p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className={HEADING + 'text-overlay-muted'}>Passives</span>
          {due && (
            // a button that looks like one: the bare "▸ Map" read as a label
            <button
              onClick={toggleMap}
              aria-expanded={mapOpen}
              title={mapOpen ? 'Hide the map' : 'Show a piece of the tree around your next points'}
              className={
                'inline-flex items-center gap-1 ' +
                button('quiet', 'sm') +
                (mapOpen ? '!bg-white/15 !text-overlay-text' : '')
              }
            >
              <MapIcon />
              Map
              <span aria-hidden className="text-[8px]">
                {mapOpen ? '▲' : '▼'}
              </span>
            </button>
          )}
        </span>
        <span className="flex min-w-0 items-center gap-2 text-[10px] text-overlay-muted">
          {/* the PoB tree the next points build towards, by its name in PoB
              ("27", "33 (Lab)"): named so, it doesn't read as a level */}
          {view.stageLabel && (
            <span className="truncate" title="The tree in your PoB build the next points go towards">
              PoB tree <span className="text-overlay-text">{view.stageLabel}</span>
            </span>
          )}
          <span className="shrink-0" title={pointsTitle}>
            {Math.min(view.points, view.total)}/{view.total} pts
          </span>
        </span>
      </div>

      {view.treeMismatch && (
        <p className="mb-1 text-[10px] text-warn">
          <span aria-hidden>⚠ </span>
          {view.treeMismatch}
        </p>
      )}

      {view.refund.length > 0 && (
        <div className="mb-1.5 rounded border border-warn/40 bg-warn/10 px-1.5 py-1 text-[10px] text-warn">
          <span aria-hidden>⚠ </span>Respec first: <NodeList nodes={view.refund} />
        </div>
      )}

      {due ? (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className="shrink-0 text-[10px] text-overlay-muted" title="Your next point">
              ▸
            </span>
            <NodeName node={due} strong />
          </div>
          {after.length > 0 && (
            <p className="ml-3.5 text-[10px] leading-snug text-overlay-muted">
              then <NodeList nodes={after} arrows />
            </p>
          )}
        </>
      ) : (
        <p className="text-[10px] text-ok">✓ All {view.total} points placed. The tree is done.</p>
      )}

      {due && mapOpen && <PassiveMap points={view.points} due={due.id} />}

      {view.ascendancy && view.ascendancy.next.length > 0 && (
        <p className="mt-1.5 text-[10px] leading-snug text-overlay-muted">
          <span className={HEADING + 'mr-1 text-overlay-muted'}>
            {LAB_NAMES[view.ascendancy.labs] ?? 'Next'} Lab
          </span>
          <NodeList nodes={view.ascendancy.next} />
        </p>
      )}
    </div>
  )
}

const LAB_NAMES = ['Normal', 'Cruel', 'Merciless', 'Eternal']

/** A folded map. */
function MapIcon(): React.JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      <path d="M1.5 3.5l4-1.5 5 2 4-1.5v10l-4 1.5-5-2-4 1.5z" />
      <path d="M5.5 2v10M10.5 4v10" />
    </svg>
  )
}

/** whether you left the map open (this window's local storage; closed without it) */
const MAP_KEY = 'passives.map.open'

function NodeList({ nodes, arrows }: { nodes: PassiveNodeViewBridge[]; arrows?: boolean }): React.JSX.Element {
  return (
    <>
      {nodes.map((n, i) => (
        <span key={`${n.id}-${i}`}>
          {/* not commas: node names have them ("Physical Damage, Armour") */}
          {i > 0 && (arrows ? ' → ' : ' / ')}
          <NodeName node={n} />
        </span>
      ))}
    </>
  )
}

/** A node's name: notables and keystones stand out, masteries are italic.
 *  Click copies it; the tooltip has its stats. */
function NodeName({ node, strong }: { node: PassiveNodeViewBridge; strong?: boolean }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const big = node.kind === 'notable' || node.kind === 'keystone' || node.kind === 'jewel'
  const tone = strong ? (big ? 'text-overlay-accent' : 'text-overlay-text') : big ? 'text-overlay-text' : ''
  const title =
    [node.name + (node.kind !== 'small' ? ` (${node.kind})` : ''), ...node.stats].join('\n') +
    '\n\nClick to copy, then paste it into the passive tree search.'
  const copy = (): void => {
    void window.overlay?.copyPassive(node.id).then((ok) => {
      if (!ok) return
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    })
  }
  return (
    <button
      onClick={copy}
      title={title}
      className={
        'text-left hover:underline ' +
        tone +
        (strong ? ' text-xs font-semibold' : '') +
        (big && !strong ? ' font-medium' : '') +
        (node.kind === 'mastery' ? ' italic' : '')
      }
    >
      {copied ? '✓ copied' : node.name}
    </button>
  )
}
