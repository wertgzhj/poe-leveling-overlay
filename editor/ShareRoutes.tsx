import { useState } from 'react'
import { Btn } from './ui'

// Swapping routes between players. The overlay ships an engine and empty
// skeletons on purpose — route content is written by whoever uses it — and this
// is what makes that workable rather than lonely: you can hand yours to someone
// else, and take theirs.
//
// The exchange format is the route JSON, not a compressed code. A route you take
// from a stranger is something you should be able to read before you run it.

export function ShareRoutes({ onImported }: { onImported: () => void }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [result, setResult] = useState<RouteImportResultBridge | null>(null)
  const [copied, setCopied] = useState(false)

  const exportAll = (): void => {
    void window.overlay?.editorExportRoutes().then((json) => {
      setText(json)
      setResult(null)
      setCopied(false)
      void navigator.clipboard?.writeText(json).then(
        () => setCopied(true),
        () => setCopied(false) // clipboard denied — the textarea still has it
      )
    })
  }

  const importAll = (): void => {
    const payload = text.trim()
    if (!payload) return
    void window.overlay?.editorImportRoutes(payload).then((res) => {
      setResult(res ?? null)
      if (res?.written.length) onImported()
    })
  }

  if (!open) {
    return (
      <div>
        <Btn onClick={() => setOpen(true)} title="Export your routes, or import someone else's">
          Share routes…
        </Btn>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-overlay-border bg-black/20 p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-overlay-muted">
          Share routes
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Btn onClick={exportAll} title="Put all ten acts in the box below, ready to send">
            Export mine
          </Btn>
          <Btn variant="primary" onClick={importAll} disabled={!text.trim()} title="Validate and save what's in the box">
            Import
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
          setResult(null)
          setCopied(false)
        }}
        rows={8}
        placeholder="Paste an exported bundle or a single actN.json here, then press Import."
        className="w-full resize-y rounded border border-overlay-border bg-black/30 px-2 py-1 font-mono text-[11px] text-overlay-text outline-none focus:border-overlay-accent"
      />

      <div className="text-xs">
        {copied && <span className="text-emerald-400">Copied to the clipboard.</span>}
        {result && <ImportResult result={result} />}
        {!copied && !result && (
          <span className="text-overlay-muted">
            Importing overwrites the acts in the file — your other acts are untouched.
          </span>
        )}
      </div>
    </div>
  )
}

function ImportResult({ result }: { result: RouteImportResultBridge }): React.JSX.Element {
  const acts = result.written
  return (
    <div className="flex flex-col gap-0.5">
      {acts.length > 0 && (
        <span className="text-emerald-400">
          Imported {acts.length === 1 ? 'Act' : 'Acts'} {acts.join(', ')} — the overlay reloaded.
        </span>
      )}
      {result.errors.map((err, i) => (
        <span key={i} className="text-red-300">
          · {err}
        </span>
      ))}
      {acts.length === 0 && result.errors.length === 0 && (
        <span className="text-overlay-muted">Nothing to import.</span>
      )}
    </div>
  )
}
