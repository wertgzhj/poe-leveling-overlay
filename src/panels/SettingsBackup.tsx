import { useState } from 'react'
import { button } from '../lib/ui'
import { fromSettings, useOverlayStore } from '../stores/overlayStore'

// Settings → Backup: how you set the overlay up, to a file and back
// (electron/settings-backup.ts). Not in it: the Client.txt path, your
// character, the window positions, what's tracked per character. Loading
// says what it would change before it does.

export function SettingsBackup(): React.JSX.Element {
  const patch = useOverlayStore((s) => s.patch)
  const [loaded, setLoaded] = useState<SettingsBackupLoadBridge | null>(null)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  const save = (): void => {
    void window.overlay?.saveSettingsBackup().then((saved) => {
      if (saved) setNote({ ok: true, text: 'Saved.' })
    })
  }

  const open = (): void => {
    setNote(null)
    void window.overlay?.openSettingsBackup().then((res) => {
      if (!res) return // dialog cancelled
      if (!res.patch) setNote({ ok: false, text: res.errors.join('; ') })
      else if (res.changes.length === 0) setNote({ ok: true, text: 'That backup is what you have now.' })
      else setLoaded(res)
    })
  }

  const apply = (): void => {
    if (!loaded?.patch) return
    const api = window.overlay
    if (!api) return
    // The same checks as any change made here (settings:set); then the store
    // takes what was actually stored.
    void api
      .setSettings(loaded.patch)
      .then((res) => api.getSettings().then((s) => ({ res, s })))
      .then(({ res, s }) => {
        patch(fromSettings(s))
        setLoaded(null)
        setNote(
          res.failed.length
            ? { ok: false, text: `Loaded, but these hotkeys are taken: ${res.failed.join(', ')}` }
            : { ok: true, text: 'Loaded.' }
        )
      })
  }

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <button className={button('ghost', 'md')} onClick={save}>
          Save to a file…
        </button>
        <button className={button('ghost', 'md')} onClick={open}>
          Load from a file…
        </button>
      </div>
      {loaded && (
        <div className="mt-2 rounded border border-overlay-accent/40 bg-overlay-accent/10 p-2">
          <p className="text-[11px] text-overlay-text">This backup changes:</p>
          <ul className="mt-0.5 list-inside list-disc text-[11px] text-overlay-muted">
            {loaded.changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="mt-1.5 flex gap-1.5">
            <button className={button('primary', 'md')} onClick={apply}>
              Load it
            </button>
            <button className={button('ghost', 'md')} onClick={() => setLoaded(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {note && <p className={'mt-1.5 text-[10px] ' + (note.ok ? 'text-ok' : 'text-danger')}>{note.text}</p>}
      <p className="mt-1.5 text-[10px] text-overlay-muted">
        How you set the overlay up: hotkeys, what it shows and says, regexes, short names, sizes. Not in it:
        the Client.txt path, your character, where the windows sit, or what’s tracked per character.
      </p>
    </>
  )
}
