import { useEffect, useState } from 'react'
import { CLASSES, type CharClass } from './model'
import { Btn, Select, TextInput } from './ui'

// The profile library: every build you have, and what you can do with each.
// Every action names a profile by id; the main process owns the files, so
// nothing here can write or delete outside the library (electron/profile/library.ts).

type Pending =
  | { kind: 'idle' }
  | { kind: 'new'; name: string; charClass: CharClass }
  | { kind: 'rename'; name: string }
  | { kind: 'delete' }

export function ProfileLibrary({
  library,
  activeId,
  onEdit
}: {
  library: LibraryEntryBridge[]
  activeId: string | null
  onEdit: (id: string) => void
}): React.JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(activeId)
  const [pending, setPending] = useState<Pending>({ kind: 'idle' })
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  // Keep a selection that still exists; otherwise fall back to the active one.
  useEffect(() => {
    if (!selectedId || !library.some((e) => e.id === selectedId)) setSelectedId(activeId)
  }, [library, activeId, selectedId])

  const selected = library.find((e) => e.id === selectedId) ?? null

  const select = (id: string): void => {
    setSelectedId(id)
    // A half-typed rename or an armed delete belongs to the row it started on.
    setPending({ kind: 'idle' })
    setMessage(null)
  }

  const report = (res: LibraryResultBridge | null, done: string): void => {
    if (!res) return // dialog cancelled
    if (res.ok) {
      setMessage({ ok: true, text: done })
      if (res.entry) setSelectedId(res.entry.id)
      setPending({ kind: 'idle' })
    } else {
      setMessage({ ok: false, text: res.errors.join('; ') || 'That didn’t work.' })
    }
  }

  const create = (name: string, charClass: CharClass): void => {
    void window.overlay?.createProfile(name, charClass).then((res) => {
      report(res, 'Created — it starts with the class’s two starting gems. Edit it to add your stages.')
      if (res.ok && res.entry) onEdit(res.entry.id)
    })
  }

  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <p className="text-xs text-overlay-muted">
        Each profile is its own file. The active one drives the Gems tab; a character remembers the
        profile it was last played with and switches back to it by itself.
      </p>

      <ul className="flex flex-col overflow-hidden rounded border border-overlay-border">
        {library.map((e) => {
          const isActive = e.id === activeId
          const isSelected = e.id === selectedId
          return (
            <li key={e.id}>
              <button
                onClick={() => select(e.id)}
                onDoubleClick={() => onEdit(e.id)}
                className={
                  'grid w-full grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-overlay-border/60 px-3 py-2 text-left last:border-b-0 ' +
                  (isSelected ? 'bg-overlay-accent/10' : 'hover:bg-white/5')
                }
              >
                <span className={isActive ? 'text-overlay-accent' : 'text-transparent'} title={isActive ? 'Active' : undefined}>
                  ●
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-overlay-text">{e.name}</span>
                  <span className="block truncate text-[11px] text-overlay-muted">
                    {e.errors.length > 0 ? (
                      <span className="text-danger">won’t load: {e.errors[0]}</span>
                    ) : (
                      [e.ascendancy ?? e.charClass, `${e.stages} stage${e.stages === 1 ? '' : 's'}`]
                        .filter(Boolean)
                        .join(' · ')
                    )}
                  </span>
                </span>
                <span className="text-right text-[11px]">
                  {e.bundled ? (
                    <span className="text-overlay-muted">bundled · read-only</span>
                  ) : e.character ? (
                    <span className="text-overlay-muted">→ {e.character}</span>
                  ) : null}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {/* Actions for the selected profile. */}
      {selected && pending.kind === 'idle' && (
        <div className="flex flex-wrap items-center gap-2">
          <Btn
            variant="primary"
            disabled={selected.id === activeId || selected.errors.length > 0}
            title={selected.errors.length > 0 ? 'Fix the file first — it won’t load' : undefined}
            onClick={() =>
              void window.overlay?.activateProfile(selected.id).then((ok) =>
                setMessage(ok ? { ok: true, text: `${selected.name} is now active.` } : { ok: false, text: 'It won’t load.' })
              )
            }
          >
            {selected.id === activeId ? 'Active' : 'Use this one'}
          </Btn>
          <Btn onClick={() => onEdit(selected.id)}>Edit</Btn>
          <Btn onClick={() => void window.overlay?.duplicateProfile(selected.id).then((r) => report(r, 'Duplicated.'))}>
            Duplicate
          </Btn>
          {!selected.bundled && (
            <>
              <Btn onClick={() => setPending({ kind: 'rename', name: selected.name })}>Rename</Btn>
              <Btn variant="danger" onClick={() => setPending({ kind: 'delete' })}>
                Delete
              </Btn>
            </>
          )}
        </div>
      )}

      {selected && pending.kind === 'rename' && (
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            value={pending.name}
            onChange={(name) => setPending({ kind: 'rename', name })}
            className="w-72"
          />
          <Btn
            variant="primary"
            disabled={!pending.name.trim()}
            onClick={() => void window.overlay?.renameProfile(selected.id, pending.name).then((r) => report(r, 'Renamed.'))}
          >
            Rename
          </Btn>
          <Btn onClick={() => setPending({ kind: 'idle' })}>Cancel</Btn>
        </div>
      )}

      {/* Two clicks rather than a native confirm(), which blocks the editor
          window while it waits — and the recycle bin makes it undoable anyway. */}
      {selected && pending.kind === 'delete' && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-danger/40 bg-danger/10 px-3 py-2">
          <span className="text-xs text-danger">
            Delete “{selected.name}”? It goes to the recycle bin
            {selected.id === activeId ? ', and the overlay switches to the bundled example' : ''}.
          </span>
          <Btn
            variant="danger"
            onClick={() => void window.overlay?.deleteProfile(selected.id).then((r) => report(r, 'Deleted — it’s in the recycle bin.'))}
          >
            Delete
          </Btn>
          <Btn onClick={() => setPending({ kind: 'idle' })}>Cancel</Btn>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-overlay-border/60 pt-3">
        {pending.kind === 'new' ? (
          <>
            <TextInput
              value={pending.name}
              placeholder="Build name"
              onChange={(name) => setPending({ ...pending, name })}
              className="w-56"
            />
            <Select
              value={pending.charClass}
              options={CLASSES}
              onChange={(charClass) => setPending({ ...pending, charClass })}
            />
            <Btn variant="primary" onClick={() => create(pending.name, pending.charClass)}>
              Create
            </Btn>
            <Btn onClick={() => setPending({ kind: 'idle' })}>Cancel</Btn>
          </>
        ) : (
          <>
            <Btn
              onClick={() =>
                setPending({
                  kind: 'new',
                  name: '',
                  // The class you're most likely building for is the one you're on.
                  charClass: (selected?.charClass as CharClass | undefined) ?? 'Witch'
                })
              }
            >
              New profile
            </Btn>
            <Btn
              title="Copies a profile JSON from anywhere into the library. The original is left alone."
              onClick={() => void window.overlay?.importProfileFile().then((r) => report(r, 'Imported — a copy is now in the library.'))}
            >
              Import file…
            </Btn>
            <span className="text-[11px] text-overlay-muted">
              Path of Building builds import from the overlay: ⚙ → Build profile.
            </span>
          </>
        )}
      </div>

      {message && (
        <p className={'text-xs ' + (message.ok ? 'text-ok' : 'text-danger')}>{message.text}</p>
      )}
    </div>
  )
}
