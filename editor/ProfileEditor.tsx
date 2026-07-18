import { useEffect, useState } from 'react'
import {
  CLASSES,
  blankStage,
  moveItem,
  serializeProfile,
  type CharClass,
  type ProfileDraft,
  type SocketGroupDraft,
  type StageDraft
} from './model'
import { Btn, Select, TextInput, SaveResult } from './ui'

function toDraft(p: ProfileFileBridge | null): ProfileDraft {
  if (!p) {
    return { meta: { name: 'My Build', class: 'Witch' }, stages: [], gemPlan: [] }
  }
  return {
    meta: {
      name: p.meta.name,
      class: p.meta.class as CharClass,
      ascendancy: p.meta.ascendancy,
      character: p.meta.character,
      pobSource: p.meta.pobSource
    },
    stages: p.stages.map((st) => ({
      range: [st.range[0], st.range[1]],
      label: st.label,
      socketGroups: st.socketGroups.map((g) => ({ gems: [...g.gems], note: g.note })),
      note: st.note
    })),
    gemPlan: p.gemPlan
  }
}

export function ProfileEditor({
  profile,
  path,
  errors,
  onSaved
}: {
  profile: ProfileFileBridge | null
  path: string | null
  errors: string[]
  onSaved: () => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<ProfileDraft>(() => toDraft(profile))
  const [dirty, setDirty] = useState(false)
  const [result, setResult] = useState<EditorSaveResultBridge | null>(null)

  useEffect(() => {
    setDraft(toDraft(profile))
    setDirty(false)
    setResult(null)
  }, [profile])

  const edit = (next: ProfileDraft): void => {
    setDraft(next)
    setDirty(true)
    setResult(null)
  }

  const editStage = (i: number, patch: Partial<StageDraft>): void =>
    edit({ ...draft, stages: draft.stages.map((s, j) => (j === i ? { ...s, ...patch } : s)) })

  const save = (): void => {
    void window.overlay?.editorSaveProfile(serializeProfile(draft)).then((res) => {
      setResult(res ?? null)
      if (res?.ok) {
        setDirty(false)
        onSaved()
      }
    })
  }

  const addStage = (): void => {
    const from = draft.stages.length ? Math.min(90, draft.stages[draft.stages.length - 1].range[1] + 1) : 1
    edit({ ...draft, stages: [...draft.stages, blankStage(from)] })
  }

  return (
    <div className="flex flex-col gap-3">
      {errors.length > 0 && (
        <div className="rounded border border-red-400/40 bg-red-400/10 p-2 text-xs text-red-300">
          The current profile file has problems: {errors.join('; ')}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <Labeled label="Build name">
          <TextInput value={draft.meta.name} onChange={(v) => edit({ ...draft, meta: { ...draft.meta, name: v } })} className="w-56" />
        </Labeled>
        <Labeled label="Class">
          <Select value={draft.meta.class} options={CLASSES} onChange={(c) => edit({ ...draft, meta: { ...draft.meta, class: c } })} />
        </Labeled>
        <Labeled label="Ascendancy">
          <TextInput
            value={draft.meta.ascendancy ?? ''}
            onChange={(v) => edit({ ...draft, meta: { ...draft.meta, ascendancy: v } })}
            className="w-40"
            placeholder="optional"
          />
        </Labeled>
        <div className="ml-auto flex items-center gap-2">
          <SaveResult result={result} />
          <Btn variant="primary" onClick={save} disabled={!dirty} title="Validate + save and make active">
            Save profile
          </Btn>
        </div>
      </div>
      <div className="text-xs text-overlay-muted">
        {path ? `Editing: ${path}` : 'Editing the bundled example'} · saving writes an editable copy and
        makes it the active profile. {dirty && <span className="text-overlay-accent">● unsaved</span>}
      </div>

      <div className="flex flex-col gap-2">
        {draft.stages.map((stage, i) => (
          <StageCard
            key={i}
            stage={stage}
            index={i}
            count={draft.stages.length}
            onChange={(patch) => editStage(i, patch)}
            onMove={(dir) => edit({ ...draft, stages: moveItem(draft.stages, i, i + dir) })}
            onDelete={() => edit({ ...draft, stages: draft.stages.filter((_, j) => j !== i) })}
          />
        ))}
        {draft.stages.length === 0 && <p className="text-sm text-overlay-muted">No stages yet.</p>}
      </div>

      <div>
        <Btn onClick={addStage}>+ Add stage</Btn>
      </div>

      <p className="text-xs text-overlay-muted">
        Socket colours are computed from each gem's attribute (not set here). The gem plan
        ({draft.gemPlan.length} {draft.gemPlan.length === 1 ? 'entry' : 'entries'}) is preserved as-is —
        use PoB import or edit the JSON to change gem sources.
      </p>
    </div>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-overlay-muted">{label}</span>
      {children}
    </label>
  )
}

function StageCard({
  stage,
  index,
  count,
  onChange,
  onMove,
  onDelete
}: {
  stage: StageDraft
  index: number
  count: number
  onChange: (patch: Partial<StageDraft>) => void
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
}): React.JSX.Element {
  const setRange = (which: 0 | 1, v: string): void => {
    const n = Number(v)
    const range: [number, number] = [...stage.range]
    range[which] = Number.isFinite(n) ? n : range[which]
    onChange({ range })
  }
  const setGroup = (gi: number, patch: Partial<SocketGroupDraft>): void =>
    onChange({ socketGroups: stage.socketGroups.map((g, j) => (j === gi ? { ...g, ...patch } : g)) })

  return (
    <div className="rounded-md border border-overlay-border bg-overlay-panel/60 p-2">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-overlay-muted">Level</span>
        <input
          type="number"
          value={stage.range[0]}
          onChange={(e) => setRange(0, e.target.value)}
          className="w-16 rounded border border-overlay-border bg-black/30 px-1.5 py-1 text-sm outline-none focus:border-overlay-accent"
        />
        <span className="text-xs text-overlay-muted">to</span>
        <input
          type="number"
          value={stage.range[1]}
          onChange={(e) => setRange(1, e.target.value)}
          className="w-16 rounded border border-overlay-border bg-black/30 px-1.5 py-1 text-sm outline-none focus:border-overlay-accent"
        />
        <TextInput
          value={stage.label ?? ''}
          onChange={(v) => onChange({ label: v })}
          placeholder="label (optional)"
          className="w-48"
        />
        <div className="ml-auto flex gap-1">
          <Btn onClick={() => onMove(-1)} disabled={index === 0} title="Move up">
            ↑
          </Btn>
          <Btn onClick={() => onMove(1)} disabled={index === count - 1} title="Move down">
            ↓
          </Btn>
          <Btn variant="danger" onClick={onDelete} title="Delete stage">
            ✕
          </Btn>
        </div>
      </div>

      <div className="flex flex-col gap-2 pl-2">
        {stage.socketGroups.map((group, gi) => (
          <div key={gi} className="flex items-start gap-2">
            <textarea
              spellCheck={false}
              value={group.gems.join('\n')}
              onChange={(e) => setGroup(gi, { gems: e.target.value.split('\n') })}
              rows={Math.max(2, group.gems.length)}
              placeholder="one gem per line"
              className="min-w-[16rem] flex-1 resize-y rounded border border-overlay-border bg-black/30 px-2 py-1 text-xs text-overlay-text outline-none focus:border-overlay-accent"
            />
            <div className="flex flex-1 flex-col gap-1">
              <TextInput
                value={group.note ?? ''}
                onChange={(v) => setGroup(gi, { note: v })}
                placeholder="note (e.g. 3-link asap)"
              />
              <Btn
                variant="danger"
                onClick={() => onChange({ socketGroups: stage.socketGroups.filter((_, j) => j !== gi) })}
                title="Delete link"
              >
                Remove link
              </Btn>
            </div>
          </div>
        ))}
        <Btn onClick={() => onChange({ socketGroups: [...stage.socketGroups, { gems: [] }] })}>
          + Add link
        </Btn>
      </div>
    </div>
  )
}
