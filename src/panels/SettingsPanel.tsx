import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useOverlayStore } from '../stores/overlayStore'
import { acceleratorFromEvent, formatAccelerator } from '../lib/accelerator'
import { HEADING, OPACITY_READABLE, button, panelSurface } from '../lib/ui'
import { Legend } from './gems/Legend'
import { GemShortNames } from './GemShortNames'
import { MulePicker } from './MulePicker'

type HotkeyField = keyof HotkeyBindingsBridge

const HOTKEY_FIELDS: ReadonlyArray<readonly [HotkeyField, string]> = [
  ['toggleVisibility', 'Show / hide overlay'],
  ['toggleClickThrough', 'Toggle click-through'],
  ['toggleMoveMode', 'Move / resize mode'],
  ['stepForward', 'Guide: next step'],
  ['stepBack', 'Guide: previous step']
]

// In the tab bar's order (see TAB_ORDER).
const TAB_FIELDS: ReadonlyArray<readonly [keyof VisibleTabsBridge, string]> = [
  ['gems', 'Gems'],
  ['trials', 'Trials'],
  ['guide', 'Guide']
]

// The game's stash/vendor search box length — 250 characters, confirmed in game
// (October 2026): a 250-character paste went in whole, and that is where the box
// stops. The community regex tools still quote 50, which is five times too
// tight: a typical levelling regex is ~49 characters on its own. Only drives a
// warning colour, never a block.
const SEARCH_BOX_LIMIT = 250

// One shared empty list, so the store selector's shallow compare doesn't see a
// "new" library on every render before the first profile snapshot arrives.
const NO_PROFILES: LibraryEntryBridge[] = []

/** How a profile reads in the dropdown: its name, then what it's for. */
function profileLabel(e: LibraryEntryBridge): string {
  if (e.errors.length > 0) return `${e.name} — won't load`
  const what = e.bundled ? 'example' : (e.ascendancy ?? e.charClass)
  return what ? `${e.name} — ${what}` : e.name
}

function hasModifier(accelerator: string): boolean {
  return /(CommandOrControl|CmdOrCtrl|Control|Ctrl|Alt|AltGr|Shift|Super|Meta)/.test(accelerator)
}

export function SettingsPanel(): React.JSX.Element {
  const {
    hotkeys,
    opacity,
    clickThrough,
    clientTxtPath,
    library,
    muleChoice,
    activeId,
    characterName,
    visibleTabs,
    searchRegex,
    runTimer,
    patch
  } = useOverlayStore(
    useShallow((s) => ({
      hotkeys: s.hotkeys,
      opacity: s.opacity,
      clickThrough: s.clickThrough,
      clientTxtPath: s.clientTxtPath,
      library: s.profile?.library ?? NO_PROFILES,
      muleChoice: s.profile?.muleChoice ?? null,
      activeId: s.profile?.activeId ?? null,
      characterName: s.characterName,
      visibleTabs: s.visibleTabs,
      searchRegex: s.searchRegex,
      runTimer: s.runTimer,
      patch: s.patch
    }))
  )
  const [recording, setRecording] = useState<HotkeyField | null>(null)
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const [pathDraft, setPathDraft] = useState(clientTxtPath ?? '')
  /** What the last "Find" said; cleared when the path is typed or browsed. */
  const [findResult, setFindResult] = useState<'found' | 'none' | null>(null)
  const [charDraft, setCharDraft] = useState(characterName ?? '')
  const [regexDraft, setRegexDraft] = useState(searchRegex)
  const [pobInput, setPobInput] = useState('')
  const [pobBusy, setPobBusy] = useState(false)
  const [pobResult, setPobResult] = useState<PobImportResponseBridge | null>(null)

  useEffect(() => setPathDraft(clientTxtPath ?? ''), [clientTxtPath])
  useEffect(() => setCharDraft(characterName ?? ''), [characterName])
  useEffect(() => setRegexDraft(searchRegex), [searchRegex])

  // Re-register hotkeys from stored settings when the panel closes (covers
  // closing mid-capture, which leaves them paused).
  useEffect(() => () => window.overlay?.resumeHotkeys(), [])

  // Capture a combo for the hotkey being recorded.
  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.code === 'Escape') {
        window.overlay?.resumeHotkeys()
        setRecording(null)
        return
      }
      const { accelerator } = acceleratorFromEvent(e)
      if (!accelerator) return // only modifiers held so far — keep waiting

      const next = { ...hotkeys, [recording]: accelerator }
      setRecording(null)
      patch({ hotkeys: next })
      // settings:set persists and re-registers all bindings (resumes hotkeys).
      void window.overlay?.setSettings({ hotkeys: next }).then((res) => {
        setFailed(new Set(res?.failed ?? []))
      })
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, hotkeys, patch])

  const startRecording = (field: HotkeyField): void => {
    window.overlay?.pauseHotkeys()
    setRecording(field)
  }

  const setOpacity = (value: number): void => {
    patch({ opacity: value })
    void window.overlay?.setSettings({ opacity: value })
  }

  const setClickThrough = (value: boolean): void => {
    patch({ clickThrough: value })
    void window.overlay?.setSettings({ clickThrough: value })
  }

  const setRunTimer = (value: boolean): void => {
    patch({ runTimer: value })
    void window.overlay?.setSettings({ runTimer: value })
  }

  const setVisibleTabs = (value: VisibleTabsBridge): void => {
    patch({ visibleTabs: value })
    void window.overlay?.setSettings({ visibleTabs: value })
  }

  const commitPath = (value: string): void => {
    const v = value.trim()
    patch({ clientTxtPath: v.length ? v : null })
    void window.overlay?.setSettings({ clientTxtPath: v.length ? v : null })
  }

  const find = (): void => {
    void window.overlay?.locateClientTxt().then((p) => {
      setFindResult(p ? 'found' : 'none')
      if (p) {
        setPathDraft(p)
        patch({ clientTxtPath: p })
      }
    })
  }

  const browse = (): void => {
    setFindResult(null)
    void window.overlay?.pickClientTxt().then((p) => {
      if (p) {
        setPathDraft(p)
        commitPath(p)
      }
    })
  }

  // Same rule as normalizeSearchRegex (electron/search-regex.ts), which is the
  // one that's stored: line breaks out, inner spaces kept — a space is part of
  // the pattern. Mirrored here so the field shows what was actually saved.
  const commitRegex = (value: string): void => {
    const v = value.replace(/[\r\n]+/g, '').trim()
    setRegexDraft(v)
    patch({ searchRegex: v })
    void window.overlay?.setSettings({ searchRegex: v })
  }

  const commitCharacter = (value: string): void => {
    const v = value.trim()
    patch({ characterName: v.length ? v : null })
    void window.overlay?.setSettings({ characterName: v.length ? v : null })
  }


  const importPob = (): void => {
    const input = pobInput.trim()
    if (!input || pobBusy) return
    setPobBusy(true)
    setPobResult(null)
    void window.overlay?.importPob(input).then((r) => {
      setPobBusy(false)
      setPobResult(r)
      // The new profile arrives with the next profile snapshot, dropdown and all.
      if (r?.ok) setPobInput('')
    })
  }

  // The same surface as the overlay, so dragging the slider previews it here.
  const surface = panelSurface(opacity)
  return (
    <div className="flex h-screen w-screen items-start justify-center p-2">
      <div
        data-interactive
        className={'flex max-h-full w-full flex-col overflow-hidden border-overlay-border ' + surface.className}
        style={surface.style}
      >
        <header className="flex items-center justify-between border-b border-overlay-border px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-overlay-accent">⚙</span>
            <span className="text-sm font-semibold tracking-wide">Settings</span>
          </div>
          <button
            className={button('quiet', 'md')}
            onClick={() => window.overlay?.setSettingsOpen(false)}
          >
            Close
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto px-3 py-3">
          <Section title="Updates">
            <UpdateRow />
          </Section>

          <button
            onClick={() => window.overlay?.openEditor()}
            className={'w-full ' + button('primary', 'md')}
          >
            Open route &amp; profile editor…
          </button>

          <Section title="Build profile">
            <label className="text-[11px] text-overlay-muted">Active profile</label>
            <div className="mt-1 flex gap-1.5">
              <select
                value={activeId ?? ''}
                onChange={(e) => e.target.value && void window.overlay?.activateProfile(e.target.value)}
                className="min-w-0 flex-1 rounded border border-overlay-border bg-black/30 px-2 py-1 text-[11px] text-overlay-text outline-none focus:border-overlay-accent"
              >
                {/* Only after a profile file went missing — say so instead of
                    showing some other profile as if it were active. */}
                {activeId == null && <option value="">— not in your profiles —</option>}
                {library.map((e) => (
                  <option key={e.id} value={e.id} disabled={e.errors.length > 0}>
                    {profileLabel(e)}
                  </option>
                ))}
              </select>
              <button
                onClick={() => window.overlay?.openEditor('profiles')}
                className={'shrink-0 ' + button('ghost', 'md')}
                title="New, duplicate, rename, delete — in the editor window"
              >
                Manage…
              </button>
            </div>
            <p className="mt-1 text-[10px] text-overlay-muted">
              Drives the Gems tab. A character switches back to the profile it was last played with.
            </p>
            <label className="mt-2 block text-[11px] text-overlay-muted">Mule</label>
            {muleChoice ? (
              <MulePicker choice={muleChoice} />
            ) : (
              <p className="mt-1 text-[10px] text-overlay-muted">
                Shown once the log names your character, for a build with a gem another class gets
                on the Twilight Strand.
              </p>
            )}
            <p className="mt-1 text-[10px] text-overlay-muted">
              Per character, like the profile: a level-1 alt of another class hands over a gem
              your build needs. In the Gems tab its line says <span className="text-mule">Mule · Ranger</span>.
            </p>
            <label className="mt-2 block text-[11px] text-overlay-muted">
              Import from Path of Building
            </label>
            <textarea
              spellCheck={false}
              value={pobInput}
              placeholder="paste a PoB export code, or a pobb.in / pastebin link"
              onChange={(e) => setPobInput(e.target.value)}
              rows={2}
              className="mt-1 w-full resize-none rounded border border-overlay-border bg-black/30 px-2 py-1 font-mono text-[10px] text-overlay-text outline-none focus:border-overlay-accent"
            />
            <div className="mt-1 flex items-center gap-2">
              <button
                onClick={importPob}
                disabled={pobBusy || pobInput.trim().length === 0}
                className={button('primary', 'md')}
              >
                {pobBusy ? 'Importing…' : 'Import'}
              </button>
              <span className="text-[10px] text-overlay-muted">adds a new profile and makes it active</span>
            </div>
            {pobResult && (
              <div
                className={
                  'mt-1.5 rounded-md p-1.5 text-[10px] ' +
                  (pobResult.ok
                    ? 'border border-ok/40 bg-ok/10 text-ok'
                    : 'border border-danger/40 bg-danger/10 text-danger')
                }
              >
                {pobResult.ok ? (
                  <div>Imported as a new profile — now active. See the Gems tab.</div>
                ) : (
                  pobResult.errors.map((e, i) => <div key={i}>· {e}</div>)
                )}
                {pobResult.warnings.map((w, i) => (
                  <div key={i} className="text-warn">
                    ⚠ {w}
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Game log">
            <label className="text-[11px] text-overlay-muted">Client.txt path</label>
            <div className="mt-1 flex gap-1.5">
              <input
                type="text"
                spellCheck={false}
                value={pathDraft}
                placeholder="…\Path of Exile\logs\Client.txt"
                onChange={(e) => {
                  setPathDraft(e.target.value)
                  setFindResult(null)
                }}
                onBlur={() => commitPath(pathDraft)}
                className="min-w-0 flex-1 rounded border border-overlay-border bg-black/30 px-2 py-1 font-mono text-[10px] text-overlay-text outline-none focus:border-overlay-accent"
              />
              <button
                onClick={find}
                title="Look in the Steam, standalone and Epic install folders"
                className={'shrink-0 ' + button('ghost', 'md')}
              >
                Find
              </button>
              <button
                onClick={browse}
                className={'shrink-0 ' + button('ghost', 'md')}
              >
                Browse…
              </button>
            </div>
            <p
              className={'mt-1 text-[10px] ' + (findResult === 'none' ? 'text-warn' : 'text-overlay-muted')}
              role="status"
            >
              {findResult === 'found'
                ? '✓ Found — tracking from this file.'
                : findResult === 'none'
                  ? 'Not found in the usual places — use Browse… (it’s in the game folder, under logs).'
                  : 'Used for zone/level tracking. Found by itself on first launch.'}
            </p>

            <label className="mt-2 block text-[11px] text-overlay-muted">
              Character name (optional)
            </label>
            <input
              type="text"
              spellCheck={false}
              value={charDraft}
              placeholder="auto-detect from level-ups"
              onChange={(e) => setCharDraft(e.target.value)}
              onBlur={() => commitCharacter(charDraft)}
              className="mt-1 w-full rounded border border-overlay-border bg-black/30 px-2 py-1 font-mono text-[10px] text-overlay-text outline-none focus:border-overlay-accent"
            />
            <p className="mt-1 text-[10px] text-overlay-muted">
              Binds level tracking to this character — set it if you play in a party, so a
              partymate's level-up can't advance your progress.
            </p>
          </Section>

          <Section title="Overlay">
            <div className="flex items-center justify-between">
              <span className="text-xs text-overlay-text">Opacity</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0.4}
                  max={1}
                  step={0.05}
                  value={opacity}
                  onChange={(e) => setOpacity(Number(e.target.value))}
                  aria-label="Opacity"
                  className="w-28 accent-overlay-accent"
                />
                <span className="w-8 text-right font-mono text-[11px] text-overlay-muted">
                  {Math.round(opacity * 100)}%
                </span>
              </div>
            </div>
            {/* A note, not a limit: it's your overlay. The step is 0.05, so
                compare with a little slack for float rounding. */}
            {opacity < OPACITY_READABLE - 0.001 && (
              <p className="mt-1 text-[10px] text-warn">
                ⚠ Below {Math.round(OPACITY_READABLE * 100)} %, text can be hard to read in bright areas.
              </p>
            )}
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-overlay-text">Click-through by default</span>
              <Toggle on={clickThrough} onChange={setClickThrough} />
            </div>

            <div className="mt-3 border-t border-overlay-border/60 pt-2">
              <span className="text-[11px] text-overlay-muted">Tabs to show</span>
              {TAB_FIELDS.map(([key, label]) => {
                const on = visibleTabs[key]
                // Keep at least one tab — the last one on can't be switched off.
                const isLastOn = on && TAB_FIELDS.filter(([k]) => visibleTabs[k]).length === 1
                return (
                  <div key={key} className="mt-1.5 flex items-center justify-between">
                    <span className={'text-xs ' + (isLastOn ? 'text-overlay-muted' : 'text-overlay-text')}>
                      {label}
                      {isLastOn && <span className="ml-1 text-[10px] text-overlay-muted">(keep one)</span>}
                    </span>
                    <Toggle
                      on={on}
                      onChange={(v) => !isLastOn && setVisibleTabs({ ...visibleTabs, [key]: v })}
                    />
                  </div>
                )
              })}
            </div>
          </Section>

          <Section title="Search regex">
            <input
              type="text"
              spellCheck={false}
              value={regexDraft}
              placeholder='e.g. "r-g-b|b-r-g"'
              onChange={(e) => setRegexDraft(e.target.value)}
              onBlur={() => commitRegex(regexDraft)}
              onKeyDown={(e) => e.key === 'Enter' && commitRegex(regexDraft)}
              className="w-full rounded border border-overlay-border bg-black/30 px-2 py-1 font-mono text-[10px] text-overlay-text outline-none focus:border-overlay-accent"
            />
            <div className="mt-1 flex items-start justify-between gap-2">
              <p className="text-[10px] text-overlay-muted">
                Adds a <b className="text-overlay-text">Regex</b> button to the overlay&apos;s header.
                Click it, then paste into a stash or vendor search box. The overlay only copies — the
                paste is yours.
              </p>
              {/* The game cuts the search box off; past the limit the end of the
                  pattern silently stops applying. Warn, never block — a
                  string that's too long is still yours to keep. */}
              <span
                title={`The game's search box takes ${SEARCH_BOX_LIMIT} characters; anything past that is cut off.`}
                className={
                  'shrink-0 font-mono text-[10px] ' +
                  (regexDraft.length > SEARCH_BOX_LIMIT ? 'text-warn' : 'text-overlay-muted')
                }
              >
                {/* Not colour alone: over the limit it says so. */}
                {regexDraft.length > SEARCH_BOX_LIMIT && '⚠ '}
                {regexDraft.length}/{SEARCH_BOX_LIMIT}
              </span>
            </div>
          </Section>

          <Section title="Run timer (experimental)">
            <div className="flex items-center justify-between">
              <span className="text-xs text-overlay-text">Record runs and show the timer</span>
              <Toggle on={runTimer} onChange={setRunTimer} />
            </div>
            <p className="mt-1 text-[10px] text-overlay-muted">
              Times each run from the Twilight Strand to Kitava in Act 10, zone by zone, in its own
              window. It shows and hides with the overlay and moves in move mode. Nothing is
              recorded while this is off.
            </p>
          </Section>

          <Section title="Gems tab">
            <Legend />
            <GemShortNames />
          </Section>

          <Section title="Hotkeys">
            <div className="space-y-1.5">
              {HOTKEY_FIELDS.map(([field, label]) => {
                const accel = hotkeys[field]
                const recordingThis = recording === field
                const conflict = failed.has(accel)
                return (
                  <div key={field} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-overlay-text">{label}</span>
                    <div className="flex items-center gap-2">
                      {conflict && <span className="text-[10px] text-danger">⚠ conflict</span>}
                      {!conflict && !hasModifier(accel) && (
                        <span className="text-[10px] text-warn">⚠ no modifier</span>
                      )}
                      <button
                        onClick={() => startRecording(field)}
                        className={
                          'min-w-[104px] rounded px-2 py-1 text-center font-mono text-[11px] ' +
                          (recordingThis
                            ? 'bg-overlay-accent/25 text-overlay-accent'
                            : 'bg-white/10 text-overlay-text hover:bg-white/15')
                        }
                      >
                        {recordingThis ? 'Press keys…' : formatAccelerator(accel)}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="mt-1.5 text-[10px] text-overlay-muted">
              {recording
                ? 'Press a combo (Esc to cancel). A modifier is recommended so it does not clash with the game.'
                : 'Click a binding to change it. Conflicts are shown if the combo is already taken.'}
            </p>
          </Section>
        </div>
      </div>
    </div>
  )
}

// App-update status + manual controls. The passive banner (UpdateBanner) covers
// downloading/ready during play; this is the full picture: current version,
// up-to-date/checking/error, a manual "Check now", and the Restart button.
function UpdateRow(): React.JSX.Element {
  const update = useOverlayStore((s) => s.update)
  const appVersion = useOverlayStore((s) => s.appVersion)
  const state = update?.state ?? 'idle'
  const busy = state === 'checking' || state === 'downloading'

  const line = ((): string => {
    switch (update?.state) {
      case 'disabled':
        return update.reason
      case 'checking':
        return 'Checking for updates…'
      case 'current':
        return `Up to date (v${update.version}).`
      case 'downloading':
        return `Downloading v${update.version}… ${update.percent}%`
      case 'ready':
        return `v${update.version} downloaded — restart to finish.`
      case 'publishing':
        return `${update.version ? `v${update.version}` : 'A new version'} is still being published — check again in a few minutes.`
      case 'error':
        return `Couldn't check: ${update.message}`
      default:
        return appVersion ? `Current version v${appVersion}.` : 'Checks automatically on launch.'
    }
  })()

  return (
    <>
      <div className={'text-xs ' + (state === 'error' ? 'text-danger' : 'text-overlay-text')}>{line}</div>
      <div className="mt-2 flex items-center gap-2">
        {state === 'ready' ? (
          <button
            onClick={() => window.overlay?.installUpdate()}
            className={button('primary', 'md')}
          >
            Restart &amp; update
          </button>
        ) : (
          <button
            onClick={() => window.overlay?.checkForUpdates()}
            disabled={busy || state === 'disabled'}
            className={button('ghost', 'md')}
          >
            {busy ? 'Checking…' : 'Check for updates'}
          </button>
        )}
      </div>
      {state === 'disabled' && (
        <p className="mt-1.5 text-[10px] text-overlay-muted">
          Auto-update works in the installed build. Downloads come from this project's GitHub
          Releases.
        </p>
      )}
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section>
      <h2 className={'mb-1.5 ' + HEADING + 'text-overlay-muted'}>
        {title}
      </h2>
      <div className="rounded-md bg-black/25 p-2">{children}</div>
    </section>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }): React.JSX.Element {
  return (
    <button
      onClick={() => onChange(!on)}
      className={
        'relative h-4 w-7 rounded-full transition-colors ' +
        (on ? 'bg-overlay-accent/60' : 'bg-white/15')
      }
      role="switch"
      aria-checked={on}
    >
      <span
        className={
          'absolute top-0.5 h-3 w-3 rounded-full bg-overlay-text transition-all ' +
          (on ? 'left-3.5' : 'left-0.5')
        }
      />
    </button>
  )
}
