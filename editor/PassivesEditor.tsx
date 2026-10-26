import { useEffect, useState } from 'react'
import type { PassivePlan } from '../electron/profile/tree.ts'
import { moveAscendancy, movePassive, setAscendancyOrder, setStageOrder, stageFirstPoints } from './model'
import { Btn } from './ui'

// The order of a build's passive points, stage by stage — the import works it
// out (nearest notable first), and here it can be changed. Which nodes a
// stage takes comes from the PoB build and isn't edited here: re-import for
// that. The ascendancy's nodes are one list of their own, two per Labyrinth.
// The main process has the tree, so it names the nodes, checks the order
// against the tree and re-sorts (ipc.ts → tree.ts checkPlan, resortStage,
// resortAscendancy).

export function PassivesEditor({
  plan,
  charClass,
  onChange
}: {
  plan: PassivePlan
  charClass: string
  onChange: (plan: PassivePlan) => void
}): React.JSX.Element {
  const [check, setCheck] = useState<PlanCheckBridge | null | 'loading'>('loading')

  useEffect(() => {
    let stale = false
    void window.overlay?.editorPassivesCheck(plan, charClass).then((c) => {
      if (!stale) setCheck(c ?? null)
    })
    return () => {
      stale = true
    }
  }, [plan, charClass])

  const resort = (stage: number | 'ascendancy'): void => {
    void window.overlay?.editorPassivesResort(plan, charClass, stage).then((order) => {
      if (!order) return
      onChange(stage === 'ascendancy' ? setAscendancyOrder(plan, order) : setStageOrder(plan, stage, order))
    })
  }

  if (check === 'loading') return <p className="text-xs text-overlay-muted">Reading the tree…</p>
  if (!check) {
    return (
      <p className="text-xs text-danger">
        The passive tree data couldn’t be read, so the order can’t be shown here. It’s kept as it is.
      </p>
    )
  }

  // A move shows once main has checked the new order; until then the list is
  // the old one, and a second click on it would move the wrong node.
  const ids = (rows: PlanRowBridge[]): string => rows.map((r) => r.id).join()
  const pending =
    check.stages.some((s, i) => ids(s.take) !== plan.stages[i]?.take.join()) ||
    ids(check.ascendancy) !== (plan.ascendancy ?? []).join()

  // Point numbers run across the stages, the way the overlay counts them.
  const firsts = stageFirstPoints(check.stages.map((s) => ({ take: s.take.length, refund: s.refund.length })))
  const ascBad = check.ascendancy.filter((r) => r.unlinked).length
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-overlay-muted">
        The order the overlay names your next points in. ↑ ↓ move a node within its stage.{' '}
        <span className="text-warn">⚠</span> marks a node nothing before it connects to: the game won’t let you
        take it there. <i>Re-sort</i> puts a stage back in the worked-out order: the nearest notable first.
      </p>
      {check.stages.map((stage, si) => {
        const first = firsts[si]
        const last = first + stage.take.length
        const bad = stage.take.filter((r) => r.unlinked).length
        return (
          <Fold key={si} title={stage.label ?? `Stage ${si + 1}`} detail={`points ${first + 1}-${last}`} bad={bad}>
            {stage.refund.length > 0 && (
              <p className="mb-1 text-xs text-warn">Respec first: {stage.refund.map((n) => n.name).join(' / ')}</p>
            )}
            <NodeRows
              rows={stage.take}
              label={(i) => String(first + i + 1)}
              disabled={pending}
              onMove={(from, to) => onChange(movePassive(plan, si, from, to))}
            />
            <ResortButton onClick={() => resort(si)} />
          </Fold>
        )
      })}
      {check.ascendancy.length > 0 && (
        // Two points per Labyrinth: the rows say which Lab they're for, the
        // way the overlay's Lab line counts them.
        <Fold title="Ascendancy" detail="two points per Labyrinth" bad={ascBad}>
          <NodeRows
            rows={check.ascendancy}
            label={(i) => LABS[Math.floor(i / 2)] ?? `Lab ${Math.floor(i / 2) + 1}`}
            disabled={pending}
            onMove={(from, to) => onChange(moveAscendancy(plan, from, to))}
          />
          <ResortButton onClick={() => resort('ascendancy')} />
        </Fold>
      )}
    </div>
  )
}

const LABS = ['Normal', 'Cruel', 'Merciless', 'Eternal']

/** A stage (or the ascendancy) as a fold: open by itself when something in it
 *  isn't connected. */
function Fold(props: { title: string; detail: string; bad: number; children: React.ReactNode }): React.JSX.Element {
  return (
    <details open={props.bad > 0} className="rounded-md border border-overlay-border bg-overlay-panel/60 p-2">
      <summary className="cursor-pointer text-sm">
        <span className="font-semibold">{props.title}</span>
        <span className="text-xs text-overlay-muted">, {props.detail}</span>
        {props.bad > 0 && <span className="text-xs text-warn">, ⚠ {props.bad} not connected</span>}
      </summary>
      <div className="mt-2 flex flex-col gap-0.5">{props.children}</div>
    </details>
  )
}

/** The nodes in order, each with what it is, whether it's connected there,
 *  and ↑ ↓. */
function NodeRows(props: {
  rows: PlanRowBridge[]
  label: (i: number) => string
  disabled: boolean
  onMove: (from: number, to: number) => void
}): React.JSX.Element {
  return (
    <>
      {props.rows.map((row, i) => (
        <div key={`${row.id}-${i}`} className="flex items-center gap-2 text-sm">
          <span className="w-16 text-right font-mono text-xs text-overlay-muted">{props.label(i)}</span>
          <span
            title={row.stats.join('\n')}
            className={
              'flex-1 truncate ' +
              (row.kind === 'notable' || row.kind === 'keystone' || row.kind === 'jewel'
                ? 'font-medium text-overlay-text'
                : 'text-overlay-muted') +
              (row.kind === 'mastery' ? ' italic' : '')
            }
          >
            {row.name}
            {row.unlinked && <span className="ml-2 text-xs not-italic text-warn">⚠ not connected here</span>}
          </span>
          <MoveButton
            label="↑"
            title="Earlier"
            disabled={props.disabled || i === 0}
            onClick={() => props.onMove(i, i - 1)}
          />
          <MoveButton
            label="↓"
            title="Later"
            disabled={props.disabled || i === props.rows.length - 1}
            onClick={() => props.onMove(i, i + 1)}
          />
        </div>
      ))}
    </>
  )
}

function ResortButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <div className="mt-1">
      <Btn onClick={onClick} title="Back to the nearest-notable-first order">
        Re-sort
      </Btn>
    </div>
  )
}

function MoveButton(props: {
  label: string
  title: string
  disabled: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      aria-label={props.title}
      className="w-6 rounded bg-white/10 text-xs text-overlay-text enabled:hover:bg-white/15 disabled:opacity-30"
    >
      {props.label}
    </button>
  )
}
