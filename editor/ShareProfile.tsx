import { useState } from 'react'
import { Btn } from './ui'

// Swapping build profiles between players, like ShareRoutes: the profile as
// JSON text (electron/profile/share.ts), which you can read before you take it.
// Unlike a PoB code it carries what you made of the build here: the stages,
// the passive order, the notes. The character it belongs to stays behind.

export function ShareProfile({
  selected,
  onImported
}: {
  /** the profile the library has selected, to copy */
  selected: LibraryEntryBridge | null
  onImported: (res: LibraryResultBridge) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  const exportSelected = (): void => {
    if (!selected) return
    void window.overlay?.exportProfileText(selected.id).then((json) => {
      if (!json) {
        setNote({ ok: false, text: 'That profile can’t be read.' })
        return
      }
      setText(json)
      void navigator.clipboard?.writeText(json).then(
        () => setNote({ ok: true, text: `“${selected.name}” is on the clipboard, and in the box below.` }),
        () => setNote({ ok: true, text: `“${selected.name}” is in the box below: copy it from there.` })
      )
    })
  }

  const importText = (): void => {
    const payload = text.trim()
    if (!payload) return
    void window.overlay?.importProfileText(payload).then((res) => {
      if (!res) return
      setNote(res.ok ? { ok: true, text: 'Added to the library as a new profile.' } : { ok: false, text: res.errors.join('; ') })
      if (res.ok) {
        setText('')
        onImported(res)
      }
    })
  }

  if (!open) {
    return (
      <Btn onClick={() => setOpen(true)} title="Send a profile to someone as text, or add one you were sent">
        Share…
      </Btn>
    )
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-md border border-overlay-border bg-black/20 p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-overlay-muted">Share a profile</span>
        <div className="ml-auto flex items-center gap-2">
          <Btn onClick={exportSelected} disabled={!selected} title="Put the selected profile in the box below, ready to send">
            Copy {selected ? `“${selected.name}”` : 'selected'}
          </Btn>
          <Btn variant="primary" onClick={importText} disabled={!text.trim()} title="Check what's in the box and add it to the library">
            Add to library
          </Btn>
          <Btn onClick={() => setOpen(false)} title="Close">
            ✕
          </Btn>
        </div>
      </div>
      <textarea
        spellCheck={false}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setNote(null)
        }}
        rows={8}
        placeholder="Paste a profile someone sent you (or a profile file's content) here, then press Add to library."
        className="w-full resize-y rounded border border-overlay-border bg-black/30 px-2 py-1 font-mono text-[11px] text-overlay-text outline-none focus:border-overlay-accent"
      />
      <p className="text-[11px] text-overlay-muted">
        Your stages, passive order and notes go with it; the character it belongs to doesn’t. Adding one never
        replaces a profile you have: it comes in as a new one.
      </p>
      {note && <p className={'text-xs ' + (note.ok ? 'text-ok' : 'text-danger')}>{note.text}</p>}
    </div>
  )
}
