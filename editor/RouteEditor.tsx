import { useEffect, useState } from 'react'
import {
  STEP_TYPES,
  addStepAfter,
  deleteStep,
  moveStep,
  serializeRoute,
  updateStep,
  type RouteDraft,
  type StepDraft,
  type StepType
} from './model'
import { Btn, Select, TextInput, SaveResult } from './ui'

const ACTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

function draftForAct(routes: EditorRouteEntryBridge[], act: number): RouteDraft {
  const entry = routes.find((r) => r.act === act)
  if (entry?.route) {
    return {
      act,
      name: entry.route.name,
      steps: entry.route.steps.map((s) => ({
        id: s.id,
        type: s.type as StepType,
        areaId: s.areaId,
        zone: s.zone,
        text: s.text,
        hints: s.hints,
        rewardHint: s.rewardHint
      }))
    }
  }
  return { act, name: `Act ${act}`, steps: [] }
}

export function RouteEditor({
  routes,
  onSaved
}: {
  routes: EditorRouteEntryBridge[]
  onSaved: () => void
}): React.JSX.Element {
  const [act, setAct] = useState(1)
  const [draft, setDraft] = useState<RouteDraft>(() => draftForAct(routes, 1))
  const [dirty, setDirty] = useState(false)
  const [result, setResult] = useState<EditorSaveResultBridge | null>(null)

  // (Re)load the draft when the act changes or files reload after a save.
  useEffect(() => {
    setDraft(draftForAct(routes, act))
    setDirty(false)
    setResult(null)
  }, [act, routes])

  const edit = (next: RouteDraft): void => {
    setDraft(next)
    setDirty(true)
    setResult(null)
  }

  const switchAct = (a: number): void => {
    if (dirty && !window.confirm('Discard unsaved changes to this act?')) return
    setAct(a)
  }

  const save = (): void => {
    void window.overlay?.editorSaveRoute(act, serializeRoute(draft)).then((res) => {
      setResult(res ?? null)
      if (res?.ok) {
        setDirty(false)
        onSaved()
      }
    })
  }

  const source = routes.find((r) => r.act === act)?.source ?? 'missing'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1">
        {ACTS.map((a) => {
          const s = routes.find((r) => r.act === a)?.source
          return (
            <button
              key={a}
              onClick={() => switchAct(a)}
              title={s === 'override' ? 'your edited copy' : s === 'bundled' ? 'built-in fallback' : 'no file'}
              className={
                'rounded px-2.5 py-1 text-sm ' +
                (a === act
                  ? 'bg-overlay-accent/20 text-overlay-accent'
                  : 'bg-white/5 text-overlay-muted hover:text-overlay-text') +
                (s === 'override' ? ' ring-1 ring-overlay-accent/40' : '')
              }
            >
              {a}
            </button>
          )
        })}
        <span className="ml-2 text-xs text-overlay-muted">
          Act {act} · {source === 'override' ? 'your copy' : source === 'bundled' ? 'built-in fallback (edit to override)' : 'new'}
          {dirty && <span className="ml-2 text-overlay-accent">● unsaved</span>}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-overlay-muted">Act name</label>
        <TextInput
          value={draft.name ?? ''}
          onChange={(v) => edit({ ...draft, name: v })}
          placeholder={`Act ${act}`}
          className="w-48"
        />
        <div className="ml-auto flex items-center gap-2">
          <SaveResult result={result} />
          <Btn variant="primary" onClick={save} disabled={!dirty} title="Validate + save to your routes folder">
            Save Act {act}
          </Btn>
        </div>
      </div>

      <ol className="flex flex-col gap-2">
        {draft.steps.map((step, i) => (
          <StepRow
            key={step.id}
            step={step}
            index={i}
            count={draft.steps.length}
            onChange={(patch) => edit(updateStep(draft, i, patch))}
            onMove={(dir) => edit(moveStep(draft, i, i + dir))}
            onDelete={() => edit(deleteStep(draft, i))}
            onAddAfter={() => edit(addStepAfter(draft, i))}
          />
        ))}
        {draft.steps.length === 0 && (
          <li className="text-sm text-overlay-muted">No steps yet.</li>
        )}
      </ol>

      <div>
        <Btn onClick={() => edit(addStepAfter(draft, draft.steps.length - 1))}>+ Add step</Btn>
      </div>

      <p className="text-xs text-overlay-muted">
        Steps match the zone you enter by <b>areaId</b> (from the overlay's 🐞 panel) or by{' '}
        <b>zone</b> name. Only <code>hint</code> steps may have neither. Saving writes to your
        editable copy; the overlay reloads immediately.
      </p>
    </div>
  )
}

function StepRow({
  step,
  index,
  count,
  onChange,
  onMove,
  onDelete,
  onAddAfter
}: {
  step: StepDraft
  index: number
  count: number
  onChange: (patch: Partial<StepDraft>) => void
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
  onAddAfter: () => void
}): React.JSX.Element {
  return (
    <li className="rounded-md border border-overlay-border bg-overlay-panel/60 p-2">
      <div className="flex items-start gap-2">
        <span className="w-6 pt-1 text-right text-xs text-overlay-muted">{index + 1}</span>
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Select value={step.type} options={STEP_TYPES} onChange={(t) => onChange({ type: t })} />
            <TextInput
              value={step.text}
              onChange={(v) => onChange({ text: v })}
              placeholder="what to do here"
              className="min-w-[16rem] flex-1"
            />
            <label className="flex items-center gap-1 text-xs text-overlay-muted">
              <input
                type="checkbox"
                checked={!!step.rewardHint}
                onChange={(e) => onChange({ rewardHint: e.target.checked })}
              />
              reward
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <TextInput
              value={step.areaId ?? ''}
              onChange={(v) => onChange({ areaId: v })}
              placeholder="areaId (e.g. 1_1_2)"
              mono
              className="w-40"
            />
            <TextInput
              value={step.zone ?? ''}
              onChange={(v) => onChange({ zone: v })}
              placeholder="zone name (e.g. The Coast)"
              className="w-52"
            />
            <TextInput
              value={(step.hints ?? []).join(' | ')}
              onChange={(v) => onChange({ hints: v.split('|').map((h) => h.trim()) })}
              placeholder="hints, separated by |"
              className="min-w-[12rem] flex-1"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            <Btn onClick={() => onMove(-1)} disabled={index === 0} title="Move up">
              ↑
            </Btn>
            <Btn onClick={() => onMove(1)} disabled={index === count - 1} title="Move down">
              ↓
            </Btn>
          </div>
          <div className="flex gap-1">
            <Btn onClick={onAddAfter} title="Add a step below">
              +
            </Btn>
            <Btn variant="danger" onClick={onDelete} title="Delete step">
              ✕
            </Btn>
          </div>
        </div>
      </div>
    </li>
  )
}
