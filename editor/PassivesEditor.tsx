import { useEffect, useState } from 'react'
import type { PassivePlan } from '../electron/profile/tree.ts'
import { movePassive, setStageOrder } from './model'
import { Btn } from './ui'

// The order of a build's passive points, stage by stage — the import works it
// out (nearest notable first), and here it can be changed. Which nodes a
// stage takes comes from the PoB build and isn't edited here: re-import for
// that. The main process has the tree, so it names the nodes, checks the order
// against the tree and re-sorts a stage (ipc.ts → tree.ts checkPlan/resortStage).

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

  const resort = (stage: number): void => {
    void window.overlay?.editorPassivesResort(plan, charClass, stage).then((take) => {
      if (take) onChange(setStageOrder(plan, stage, take))
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
  const pending = check.stages.some((s, i) => s.take.map((r) => r.id).join() !== plan.stages[i]?.take.join())

  // Point numbers run across the stages, the way the overlay counts them.
  const firsts = check.stages.map((_, si) => check.stages.slice(0, si).reduce((n, s) => n + s.take.length, 0))
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-overlay-muted">
        The order the overlay names your next points in. ↑ ↓ move a node within its stage.{' '}
        <span className="text-warn">⚠</span> marks a node nothing before it connects to — the game won’t let you
        take it there. <i>Re-sort</i> puts a stage back in the worked-out order: the nearest notable first.
      </p>
      {check.stages.map((stage, si) => {
        const first = firsts[si]
        const last = first + stage.take.length
        const bad = stage.take.filter((r) => r.unlinked).length
        return (
          <details
            key={si}
            open={bad > 0}
            className="rounded-md border border-overlay-border bg-overlay-panel/60 p-2"
          >
            <summary className="cursor-pointer text-sm">
              <span className="font-semibold">{stage.label ?? `Stage ${si + 1}`}</span>
              <span className="text-xs text-overlay-muted">
                {' '}
                · points {first + 1}–{last}
              </span>
              {bad > 0 && <span className="text-xs text-warn"> · ⚠ {bad} not connected</span>}
            </summary>
            <div className="mt-2 flex flex-col gap-0.5">
              {stage.refund.length > 0 && (
                <p className="mb-1 text-xs text-warn">
                  Respec first: {stage.refund.map((n) => n.name).join(' · ')}
                </p>
              )}
              {stage.take.map((row, i) => (
                <div key={`${row.id}-${i}`} className="flex items-center gap-2 text-sm">
                  <span className="w-8 text-right font-mono text-xs text-overlay-muted">{first + i + 1}</span>
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
                    disabled={pending || i === 0}
                    onClick={() => onChange(movePassive(plan, si, i, i - 1))}
                  />
                  <MoveButton
                    label="↓"
                    title="Later"
                    disabled={pending || i === stage.take.length - 1}
                    onClick={() => onChange(movePassive(plan, si, i, i + 1))}
                  />
                </div>
              ))}
              <div className="mt-1">
                <Btn onClick={() => resort(si)} title="Back to the nearest-notable-first order">
                  Re-sort
                </Btn>
              </div>
            </div>
          </details>
        )
      })}
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
