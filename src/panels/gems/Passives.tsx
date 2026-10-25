import { useState } from 'react'
import { HEADING } from '../../lib/ui'

// The passive tree under the gems: the node for your next point (its stats in
// the tooltip — under it they were more than anyone reads mid-run), the few after
// it, a respec when one is due, and the next ascendancy points. Which node is
// due follows your points — (level - 1) plus the Books of Skill you used — the
// way the gem stage follows your level. Clicking a name copies it, to paste
// into the in-game tree's search box; nothing more (docs/ARCHITECTURE.md#tos-position).

export function Passives({ view }: { view: PassivesViewBridge }): React.JSX.Element {
  const [due, ...after] = view.next
  const pointsTitle =
    `${view.points} passive points: level − 1` +
    (view.questPoints ? ` + ${view.questPoints} from Books of Skill` : ' (no Book of Skill used yet)')
  return (
    <div className="mt-1 rounded-md border border-overlay-border/60 bg-black/20 p-2">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="flex items-baseline gap-1.5">
          <span className={HEADING + 'text-overlay-muted'}>Passives</span>
          {view.masteryRegex && <MasteryButton regex={view.masteryRegex} />}
        </span>
        <span className="truncate text-[10px] text-overlay-muted" title={pointsTitle}>
          {/* the PoB tree the next points build towards */}
          {view.stageLabel && <span>→ {view.stageLabel} · </span>}
          {Math.min(view.points, view.total)} / {view.total} pts
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
        <p className="text-[10px] text-ok">✓ All {view.total} points placed — the tree is done.</p>
      )}

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

/** Copies this stage's masteries as one regex for the tree's search box — it
 *  lights them all at once instead of a copy per mastery. */
function MasteryButton({ regex }: { regex: string }): React.JSX.Element {
  const [flash, setFlash] = useState(false)
  const copy = (): void => {
    void window.overlay?.copyMasteryRegex().then((ok) => {
      if (!ok) return
      setFlash(true)
      window.setTimeout(() => setFlash(false), 1200)
    })
  }
  return (
    <button
      onClick={copy}
      title={`Copy, then paste into the passive tree's search — it lights this stage's masteries:\n${regex}`}
      className={
        'rounded bg-white/10 px-1.5 text-[10px] hover:bg-white/15 ' + (flash ? 'text-ok' : 'text-overlay-muted hover:text-overlay-text')
      }
    >
      {flash ? '✓ copied' : 'Masteries'}
    </button>
  )
}

function NodeList({ nodes, arrows }: { nodes: PassiveNodeViewBridge[]; arrows?: boolean }): React.JSX.Element {
  return (
    <>
      {nodes.map((n, i) => (
        <span key={`${n.id}-${i}`}>
          {/* not commas: node names have them ("Physical Damage, Armour") */}
          {i > 0 && (arrows ? ' → ' : ' · ')}
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
    '\n\nClick to copy — paste it into the passive tree search.'
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
