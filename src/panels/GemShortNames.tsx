import { useEffect, useState } from 'react'
import { button } from '../lib/ui'
import { useOverlayStore } from '../stores/overlayStore'

// Your short names for gems, in Settings → Gems tab: "CwDT" for Cast when
// Damage Taken. Display only — the Gems tab draws them, with the full name in
// the tooltip; nothing else ever sees them (electron/gem-names.ts).

const SHORT_NAME_MAX = 24
const INPUT =
  'min-w-0 rounded border border-overlay-border bg-black/30 px-2 py-1 text-[11px] text-overlay-text outline-none focus:border-overlay-accent'

export function GemShortNames(): React.JSX.Element {
  const names = useOverlayStore((s) => s.gemNames)
  const patch = useOverlayStore((s) => s.patch)
  // Every gem's real name, for the suggestions and to know a gem when typed.
  const [gems, setGems] = useState<string[]>([])
  const [gemDraft, setGemDraft] = useState('')
  const [shortDraft, setShortDraft] = useState('')

  useEffect(() => {
    void window.overlay?.gemNameList().then((list) => setGems(list ?? []))
  }, [])

  // The gem as the data spells it, however it was typed; undefined for none.
  const typed = gemDraft.trim().toLowerCase()
  const gem = gems.find((g) => g.toLowerCase() === typed || g.toLowerCase() === `${typed} support`)
  const short = shortDraft.trim()
  const canAdd = gem != null && short.length > 0 && short.length <= SHORT_NAME_MAX && short !== gem

  const save = (next: Record<string, string>): void => {
    patch({ gemNames: next })
    void window.overlay?.setSettings({ gemNames: next })
  }
  const add = (): void => {
    if (!canAdd || !gem) return
    save({ ...names, [gem]: short })
    setGemDraft('')
    setShortDraft('')
  }
  const remove = (g: string): void => {
    const { [g]: _gone, ...rest } = names
    save(rest)
  }

  const entries = Object.entries(names).sort(([a], [b]) => a.localeCompare(b))
  return (
    <div className="mt-3">
      <div className="text-[11px] text-overlay-muted">Short names</div>
      {entries.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {entries.map(([g, s]) => (
            <li key={g} className="flex items-center gap-1.5 text-[11px]">
              <span className="shrink-0 font-semibold text-overlay-text">{s}</span>
              <span className="min-w-0 flex-1 truncate text-overlay-muted" title={g}>
                for {g.replace(/ Support$/, '')}
              </span>
              <button
                onClick={() => remove(g)}
                aria-label={`Remove the short name ${s} for ${g}`}
                title="Remove"
                className="shrink-0 px-1 text-overlay-muted hover:text-overlay-text"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1 flex gap-1.5">
        <input
          type="text"
          spellCheck={false}
          list="gem-name-list"
          value={gemDraft}
          placeholder="Gem, e.g. Cast when Damage Taken"
          aria-label="Gem"
          onChange={(e) => setGemDraft(e.target.value)}
          className={INPUT + ' flex-1'}
        />
        <input
          type="text"
          spellCheck={false}
          value={shortDraft}
          maxLength={SHORT_NAME_MAX}
          placeholder="CwDT"
          aria-label="Short name"
          onChange={(e) => setShortDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          className={INPUT + ' w-20'}
        />
        <button onClick={add} disabled={!canAdd} className={'shrink-0 ' + button('ghost', 'md')}>
          Add
        </button>
      </div>
      <datalist id="gem-name-list">
        {gems.map((g) => (
          <option key={g} value={g.replace(/ Support$/, '')} />
        ))}
      </datalist>
      <p className={'mt-1 text-[10px] ' + (gemDraft.trim() && !gem ? 'text-warn' : 'text-overlay-muted')}>
        {gemDraft.trim() && !gem
          ? 'Not a gem we know. Pick one from the suggestions.'
          : 'Shown in the Gems tab instead of the full name, which stays in the tooltip. Only here, never in your profiles.'}
      </p>
    </div>
  )
}
