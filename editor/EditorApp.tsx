import { useCallback, useEffect, useState } from 'react'
import { RouteEditor } from './RouteEditor'
import { ProfileEditor } from './ProfileEditor'

export function EditorApp(): React.JSX.Element {
  const [load, setLoad] = useState<EditorLoadBridge | null>(null)
  const [tab, setTab] = useState<'routes' | 'profile'>('routes')

  const reload = useCallback(() => {
    void window.overlay?.editorLoad().then(setLoad)
  }, [])

  useEffect(() => reload(), [reload])

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-overlay-border px-4 py-2">
        <span className="text-sm font-semibold tracking-wide">
          <span className="text-overlay-accent">◆</span> Editor
        </span>
        <nav className="flex gap-1">
          {(['routes', 'profile'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                'rounded px-3 py-1 text-sm capitalize ' +
                (tab === t
                  ? 'bg-overlay-accent/15 text-overlay-accent'
                  : 'text-overlay-muted hover:text-overlay-text')
              }
            >
              {t}
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
        {!load ? (
          <p className="text-sm text-overlay-muted">Loading…</p>
        ) : tab === 'routes' ? (
          <RouteEditor routes={load.routes} onSaved={reload} />
        ) : (
          <ProfileEditor
            profile={load.profile.profile}
            path={load.profile.path}
            errors={load.profile.errors}
            onSaved={reload}
          />
        )}
      </main>
    </div>
  )
}
