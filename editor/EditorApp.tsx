import { useCallback, useEffect, useState } from 'react'
import { RouteEditor } from './RouteEditor'
import { ProfileEditor } from './ProfileEditor'
import { ProfileLibrary } from './ProfileLibrary'

type Tab = 'routes' | 'profiles' | 'profile'

const TABS: readonly Tab[] = ['routes', 'profiles', 'profile']

function isTab(v: unknown): v is Tab {
  return typeof v === 'string' && (TABS as readonly string[]).includes(v)
}

/** The tab to open on: "Manage profiles…" in the overlay asks for one. */
function initialTab(): Tab {
  const asked = new URLSearchParams(window.location.search).get('tab')
  return isTab(asked) ? asked : 'routes'
}

export function EditorApp(): React.JSX.Element {
  const [load, setLoad] = useState<EditorLoadBridge | null>(null)
  const [tab, setTab] = useState<Tab>(initialTab)
  // The library comes with the profile snapshot, which the main process pushes
  // to this window too — a PoB import in the overlay shows up here unasked.
  const [library, setLibrary] = useState<LibraryEntryBridge[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const reload = useCallback(() => {
    void window.overlay?.editorLoad().then(setLoad)
  }, [])

  useEffect(() => reload(), [reload])

  useEffect(() => {
    const api = window.overlay
    if (!api) return
    const apply = (snap: ProfileSnapshotBridge): void => {
      setLibrary(snap.library)
      setActiveId(snap.activeId)
    }
    void api.getProfile().then(apply)
    const offProfile = api.onProfileState(apply)
    const offTab = api.onEditorFocusTab((t) => isTab(t) && setTab(t))
    return () => {
      offProfile()
      offTab()
    }
  }, [])

  // Until you pick one, "Profile" edits the active profile — as it always did.
  const editId = editingId && library.some((e) => e.id === editingId) ? editingId : activeId
  const editing = library.find((e) => e.id === editId) ?? null

  const edit = (id: string): void => {
    setEditingId(id)
    setTab('profile')
  }

  const label = (t: Tab): string =>
    t === 'routes' ? 'Routes' : t === 'profiles' ? 'Profiles' : editing ? `Profile: ${editing.name}` : 'Profile'

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-overlay-border px-4 py-2">
        <span className="text-sm font-semibold tracking-wide">
          <span className="text-overlay-accent">◆</span> Editor
        </span>
        <nav className="flex min-w-0 gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                'max-w-[18rem] truncate rounded px-3 py-1 text-sm ' +
                (tab === t
                  ? 'bg-overlay-accent/15 text-overlay-accent'
                  : 'text-overlay-muted hover:text-overlay-text')
              }
            >
              {label(t)}
            </button>
          ))}
        </nav>
        <button
          onClick={reload}
          className="ml-auto rounded bg-white/10 px-2 py-1 text-xs text-overlay-muted hover:text-overlay-text"
          title="Reload from disk"
        >
          Reload
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-auto p-4">
        {tab === 'profiles' ? (
          <ProfileLibrary library={library} activeId={activeId} onEdit={edit} />
        ) : tab === 'profile' ? (
          editId ? (
            <ProfileEditor
              id={editId}
              isActive={editId === activeId}
              onSaved={(savedId) => savedId && setEditingId(savedId)}
            />
          ) : (
            <p className="text-sm text-overlay-muted">Pick a profile under Profiles.</p>
          )
        ) : !load ? (
          <p className="text-sm text-overlay-muted">Loading…</p>
        ) : (
          <RouteEditor routes={load.routes} onSaved={reload} />
        )}
      </main>
    </div>
  )
}
