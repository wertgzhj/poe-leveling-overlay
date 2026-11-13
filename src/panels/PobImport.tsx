import { useState } from 'react'
// Pure modules from the main process side (no Electron imports).
import { CAMPAIGN_END } from '../../electron/profile/acts.ts'
import { rangesFromStarts } from '../../electron/profile/pob-stages.ts'
import { button } from '../lib/ui'

// Settings → Build profile: the Path of Building import, in two steps. Read
// the build, then look over where each gem set starts before it becomes a
// profile. PoB keeps one level per build, so a gem set's level comes from the
// tree it shares a loadout with (pob-stages.ts); what the build doesn't say is
// asked for here, never guessed from a name.

const SOURCE: Record<NonNullable<StageDraftBridge['from']>, string> = {
  'set-title': "from the gem set's title",
  'tree-title': "from its tree's title",
  'tree-points': "from its tree's points"
}

export function PobImport(): React.JSX.Element {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [read, setRead] = useState<PobReadResponseBridge | null>(null)
  const [starts, setStarts] = useState<string[]>([])
  /** gem sets ticked off: left out of the import, by index in PoB's order */
  const [leftOut, setLeftOut] = useState<Set<number>>(new Set())
  const [result, setResult] = useState<PobImportResponseBridge | null>(null)

  const readBuild = (): void => {
    const text = input.trim()
    if (!text || busy) return
    setBusy(true)
    setResult(null)
    setRead(null)
    void window.overlay?.readPob(text).then((r) => {
      setBusy(false)
      setRead(r)
      setStarts(r.drafts.map((d) => (d.start != null ? String(d.start) : '')))
      setLeftOut(new Set())
    })
  }

  const levels = starts.map((s) => (/^\d{1,3}$/.test(s) && Number(s) >= 1 && Number(s) <= 100 ? Number(s) : null))
  // Only the gem sets kept count: a left-out one needs no level.
  const kept = levels.map((_, i) => i).filter((i) => !leftOut.has(i))
  const keptLevels = kept.map((i) => levels[i])
  const given = keptLevels.filter((n): n is number => n != null)
  const ready = given.length > 0 && given.length === keptLevels.length
  // Each stage runs until the next one starts: shown as it will import.
  const ranges = ready ? rangesFromStarts(given, CAMPAIGN_END, []) : []
  const rangeOf = (i: number): [number, number] | undefined =>
    ranges.find((r) => kept[r.index] === i)?.range
  const toggle = (i: number): void =>
    setLeftOut((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  const importBuild = (): void => {
    if (!ready || busy) return
    setBusy(true)
    void window.overlay?.importPob(given, [...leftOut].sort((a, b) => a - b)).then((r) => {
      setBusy(false)
      setResult(r)
      // The new profile arrives with the next profile snapshot, dropdown and all.
      if (r.ok) {
        setRead(null)
        setInput('')
      }
    })
  }

  const cancel = (): void => {
    setRead(null)
    setResult(null)
  }

  const reviewing = read?.ok === true
  return (
    <>
      <label className="mt-2 block text-[11px] text-overlay-muted">Import from Path of Building</label>
      <textarea
        spellCheck={false}
        value={input}
        disabled={reviewing}
        placeholder="paste a PoB export code, or a pobb.in / pastebin link"
        onChange={(e) => setInput(e.target.value)}
        rows={2}
        className="mt-1 w-full resize-none rounded border border-overlay-border bg-black/30 px-2 py-1 font-mono text-[10px] text-overlay-text outline-none focus:border-overlay-accent disabled:opacity-50"
      />
      {!reviewing && (
        <div className="mt-1 flex items-center gap-2">
          <button onClick={readBuild} disabled={busy || input.trim().length === 0} className={button('primary', 'md')}>
            {busy ? 'Reading…' : 'Read build'}
          </button>
          <span className="text-[10px] text-overlay-muted">next: check where each stage starts</span>
        </div>
      )}
      {read && !read.ok && (
        <div className="mt-1.5 rounded-md border border-danger/40 bg-danger/10 p-1.5 text-[10px] text-danger">
          {read.errors.map((e, i) => (
            <div key={i}>- {e}</div>
          ))}
        </div>
      )}

      {reviewing && (
        <div className="mt-1.5 rounded-md border border-overlay-border bg-black/20 p-2">
          <div className="text-[11px] font-semibold">Where each stage starts</div>
          <p className="mt-0.5 text-[10px] text-overlay-muted">
            Path of Building keeps one level per build, so each gem set&apos;s level comes from the tree it
            shares a loadout with. Each stage runs until the next one starts. Untick a gem set you don&apos;t
            want (an endgame or a swap setup): a tree only it uses stays out too.
          </p>
          <div className="mt-1.5 grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-2 gap-y-1">
            {read.drafts.map((d, i) => {
              const out = leftOut.has(i)
              const open = !out && levels[i] == null
              const range = out ? undefined : rangeOf(i)
              return (
                <div key={i} className="contents">
                  <input
                    type="checkbox"
                    checked={!out}
                    onChange={() => toggle(i)}
                    aria-label={`Import ${d.label}`}
                    title={out ? 'Left out: tick to import it' : 'Untick to leave it out of the import'}
                    className="accent-overlay-accent"
                  />
                  <div className={'min-w-0 ' + (out ? 'opacity-40' : '')}>
                    <div className="truncate text-[11px]" title={d.label}>
                      {d.label} <span className="text-overlay-muted">({d.gems} gems)</span>
                    </div>
                    <div className={'truncate text-[10px] ' + (d.from ? 'text-overlay-muted' : 'text-warn')}>
                      {d.from
                        ? SOURCE[d.from] + (d.tree && d.from !== 'set-title' ? ` "${d.tree}"` : '')
                        : "the build doesn't say: enter its level"}
                    </div>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={starts[i]}
                    disabled={out}
                    aria-label={`Start level of ${d.label}`}
                    onChange={(e) => setStarts((prev) => prev.map((s, j) => (j === i ? e.target.value.trim() : s)))}
                    className={
                      'w-11 rounded border bg-black/30 px-1.5 py-0.5 text-right text-[11px] text-overlay-text outline-none focus:border-overlay-accent disabled:opacity-40 ' +
                      (open ? 'border-warn/70' : 'border-overlay-border')
                    }
                  />
                  <span className="w-12 text-right text-[10px] text-overlay-muted">
                    {out ? 'left out' : range ? `${range[0]}-${range[1]}` : ''}
                  </span>
                </div>
              )
            })}
          </div>
          {read.drafts.some((d, i) => !leftOut.has(i) && d.from === 'tree-points') && (
            <p className="mt-1.5 text-[10px] text-overlay-muted">
              A tree&apos;s points give the level it&apos;s reached by without Books of Skill, so it can be a few
              lower.
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button onClick={importBuild} disabled={busy || !ready} className={button('primary', 'md')}>
              {busy ? 'Importing…' : 'Import'}
            </button>
            <button onClick={cancel} disabled={busy} className={button('ghost', 'md')}>
              Cancel
            </button>
            <span className="text-[10px] text-overlay-muted">
              {ready
                ? 'adds a new profile and makes it active'
                : kept.length === 0
                  ? 'tick at least one gem set'
                  : 'enter a level for every stage'}
            </span>
          </div>
        </div>
      )}

      {result && (
        <div
          className={
            'mt-1.5 rounded-md p-1.5 text-[10px] ' +
            (result.ok ? 'border border-ok/40 bg-ok/10 text-ok' : 'border border-danger/40 bg-danger/10 text-danger')
          }
        >
          {result.ok ? (
            <div>Imported as a new profile, now active. See the Gems tab.</div>
          ) : (
            result.errors.map((e, i) => <div key={i}>- {e}</div>)
          )}
          {result.warnings.map((w, i) => (
            <div key={i} className="text-warn">
              ⚠ {w}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
