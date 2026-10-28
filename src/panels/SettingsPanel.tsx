import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useOverlayStore } from '../stores/overlayStore'
import { acceleratorFromEvent, formatAccelerator } from '../lib/accelerator'
import { HEADING, OPACITY_READABLE, button, panelSurface } from '../lib/ui'
import { Legend } from './gems/Legend'
import { GemShortNames } from './GemShortNames'
import { MulePicker } from './MulePicker'
import { ResizeGrip } from './MainPanel'
import { Toggle } from './shared'
import { PobImport } from './PobImport'
import { SettingsBackup } from './SettingsBackup'
import { ShowSettings } from './ShowSettings'

type HotkeyField = keyof HotkeyBindingsBridge

const HOTKEY_FIELDS: ReadonlyArray<readonly [HotkeyField, string]> = [
  ['toggleVisibility', 'Show / hide overlay'],
  ['toggleTimer', 'Show / hide run timer'],
  ['toggleClickThrough', 'Toggle click-through'],
  ['toggleMoveMode', 'Move / resize mode'],
  ['toggleFullPanel', 'Full panel over the strip'],
  ['stepForward', 'Guide: next step'],
  ['stepBack', 'Guide: previous step'],
  ['copyVendor', 'Copy the Vendor search'],
  ['copyTree', 'Copy the Tree search'],
  ['copyRegex', 'Copy your regex']
]

/** These may be left unset — and are, until you pick a combo. */
const OPTIONAL_FIELDS: ReadonlySet<HotkeyField> = new Set(['copyVendor', 'copyTree', 'copyRegex'])

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
  if (e.errors.length > 0) return `${e.name} (won't load)`
  const what = e.bundled ? 'example' : (e.ascendancy ?? e.charClass)
  return what ? `${e.name} (${what})` : e.name
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
    searchRegex,
    actRegexes,
    runTimer,
    moveMode,
    autoCopyTown,
    autoCopyLevelUp,
    autoCopyProtect,
    stripEnabled,
    stripText,
    panelText,
    laterRewards,
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
      searchRegex: s.searchRegex,
      actRegexes: s.actRegexes,
      runTimer: s.runTimer,
      autoCopyTown: s.autoCopyTown,
      autoCopyLevelUp: s.autoCopyLevelUp,
      autoCopyProtect: s.autoCopyProtect,
      moveMode: s.moveMode,
      stripEnabled: s.stripEnabled,
      stripText: s.stripText,
      panelText: s.panelText,
      laterRewards: s.laterRewards,
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
      // Backspace/Delete clears an optional binding back to "not set".
      const clear = OPTIONAL_FIELDS.has(recording) && (e.code === 'Backspace' || e.code === 'Delete')
      const { accelerator } = clear ? { accelerator: '' } : acceleratorFromEvent(e)
      if (accelerator == null) return // only modifiers held so far — keep waiting

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

  const setAutoCopyTown = (value: CopyChoice): void => {
    patch({ autoCopyTown: value })
    void window.overlay?.setSettings({ autoCopyTown: value })
  }
  const setAutoCopyLevelUp = (value: CopyChoice): void => {
    patch({ autoCopyLevelUp: value })
    void window.overlay?.setSettings({ autoCopyLevelUp: value })
  }
  const setAutoCopyProtect = (value: boolean): void => {
    patch({ autoCopyProtect: value })
    void window.overlay?.setSettings({ autoCopyProtect: value })
  }

  const setStrip = (value: Partial<Pick<SettingsPatchBridge, 'stripEnabled' | 'stripText' | 'panelText'>>): void => {
    patch(value)
    void window.overlay?.setSettings(value)
  }

  const setLaterRewards = (index: number): void => {
    const value = LATER_REWARDS[index][0]
    patch({ laterRewards: value })
    void window.overlay?.setSettings({ laterRewards: value })
  }

  const setRunTimer = (value: boolean): void => {
    patch({ runTimer: value })
    void window.overlay?.setSettings({ runTimer: value })
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

  // The main process stores the list cleaned (sanitizeActRegexes): rows
  // without a regex dropped. The store gets the same, so the header button and
  // the choices below see what's saved; the rows keep their draft.
  const commitActRegexes = (rows: ActRegexBridge[]): void => {
    const saved = rows
      .map((r) => ({ ...r, regex: r.regex.replace(/[\r\n]+/g, '').trim() }))
      .filter((r) => r.regex)
    patch({ actRegexes: saved })
    void window.overlay?.setSettings({ actRegexes: saved })
  }

  const commitCharacter = (value: string): void => {
    const v = value.trim()
    patch({ characterName: v.length ? v : null })
    void window.overlay?.setSettings({ characterName: v.length ? v : null })
  }


  // The same surface as the overlay, so dragging the slider previews it here.
  const surface = panelSurface(opacity)
  return (
    <div className="flex h-full w-full items-start justify-center p-2">
      <div
        data-interactive
        className={
          'relative flex max-h-full w-full flex-col overflow-hidden ' +
          surface.className +
          (moveMode ? 'border-overlay-accent' : 'border-overlay-border')
        }
        style={surface.style}
      >
        {/* Settings shares the overlay's window: in move mode its header drags
            that window and the grip resizes it, as on the main panel. */}
        <header
          className={
            'flex items-center justify-between border-b border-overlay-border px-3 py-2 ' +
            (moveMode ? 'drag-region cursor-move bg-overlay-accent/10' : '')
          }
        >
          <div className="flex items-center gap-2">
            <span className="text-overlay-accent">⚙</span>
            <span className="text-sm font-semibold tracking-wide">Settings</span>
          </div>
          <div className="flex items-center gap-1.5">
            {moveMode && (
              <button
                className={'no-drag ' + button('primary', 'sm')}
                onClick={() => window.overlay?.exitMoveMode()}
              >
                Done
              </button>
            )}
            <button
              className={'no-drag ' + button('quiet', 'md')}
              onClick={() => window.overlay?.setSettingsOpen(false)}
            >
              Close
            </button>
          </div>
        </header>

        <div className="space-y-1.5 overflow-y-auto px-3 py-3">
          <Section id="updates" title="Updates">
            <UpdateRow />
          </Section>

          <button
            onClick={() => window.overlay?.openEditor()}
            className={'w-full ' + button('primary', 'md')}
          >
            Open route &amp; profile editor…
          </button>

          <Section id="profile" title="Build profile">
            <label className="text-[11px] text-overlay-muted">Active profile</label>
            <div className="mt-1 flex gap-1.5">
              <select
                value={activeId ?? ''}
                onChange={(e) => e.target.value && void window.overlay?.activateProfile(e.target.value)}
                className="min-w-0 flex-1 rounded border border-overlay-border bg-black/30 px-2 py-1 text-[11px] text-overlay-text outline-none focus:border-overlay-accent"
              >
                {/* Only after a profile file went missing — say so instead of
                    showing some other profile as if it were active. */}
                {activeId == null && <option value="">(not in your profiles)</option>}
                {library.map((e) => (
                  <option key={e.id} value={e.id} disabled={e.errors.length > 0}>
                    {profileLabel(e)}
                  </option>
                ))}
              </select>
              <button
                onClick={() => window.overlay?.openEditor('profiles')}
                className={'shrink-0 ' + button('ghost', 'md')}
                title="New, duplicate, rename, delete: in the editor window"
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
              your build needs. In the Gems tab its line says <span className="text-mule">Mule (Ranger)</span>.
            </p>
            <PobImport />
          </Section>

          <Section id="search" title="Search & copy">
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
                Copied by <b className="text-overlay-text">Regex</b> in the overlay&apos;s header.
                Click it, then paste into a stash or vendor search box. The overlay only copies; the
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
            <div className={'mt-3 ' + HEADING + 'text-overlay-muted'}>Per act</div>
            <ActRegexRows saved={actRegexes} onCommit={commitActRegexes} />
            <div className={'mt-3 ' + HEADING + 'text-overlay-muted'}>Copy without a click</div>
            <CopyChoiceRow
              label="Entering a town"
              value={autoCopyTown}
              onChange={setAutoCopyTown}
              hasRegex={!!regexDraft.trim() || actRegexes.length > 0}
            />
            <CopyChoiceRow
              label="A level-up"
              value={autoCopyLevelUp}
              onChange={setAutoCopyLevelUp}
              hasRegex={!!regexDraft.trim() || actRegexes.length > 0}
            />
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="text-xs text-overlay-text">Keep what you copied yourself</span>
              <Toggle on={autoCopyProtect} onChange={setAutoCopyProtect} />
            </div>
            <p className="mt-1 text-[10px] text-overlay-muted">
              The button in the header lights up for what was copied.{' '}
              {autoCopyProtect
                ? 'It only replaces an empty clipboard or a search, never a whisper, an item or a link you copied.'
                : 'Off: it replaces whatever is on the clipboard, a whisper or an item you copied included.'}{' '}
              Pasting stays yours.
            </p>
          </Section>

          <Section id="log" title="Game log">
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
                ? '✓ Found. Tracking from this file.'
                : findResult === 'none'
                  ? 'Not found in the usual places. Use Browse… (it’s in the game folder, under logs).'
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
              Binds level tracking to this character. Set it if you play in a party, so a
              partymate's level-up can't advance your progress.
            </p>
          </Section>

          <Section id="overlay" title="Overlay">
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
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-overlay-text">Panel text</span>
              <Steps
                steps={PANEL_TEXT}
                value={PANEL_TEXT.findIndex(([v]) => v === panelText)}
                onChange={(i) => setStrip({ panelText: PANEL_TEXT[i][0] })}
                label="Panel text"
              />
            </div>

            <div className="mt-3 border-t border-overlay-border/60 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-overlay-text">
                  Compact strip <span className="text-[10px] text-warn">preview</span>
                </span>
                <Toggle on={stripEnabled} onChange={(v) => setStrip({ stripEnabled: v })} />
              </div>
              <p className="mt-1 text-[10px] text-overlay-muted">
                A few lines instead of the panel: a reminder, the gems to get in the town you’re in, your next
                passive point. It starts above the XP bar, where no vendor, stash or inventory window goes, and
                grows away from the screen edge it sits on. The panel is on {formatAccelerator(hotkeys.toggleFullPanel)}{' '}
                (Hotkeys). What it shows: the Strip column below.
              </p>
              {stripEnabled && (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-overlay-text">Strip text</span>
                  <Steps steps={STRIP_TEXT} value={stripText} onChange={(i) => setStrip({ stripText: i })} label="Strip text" />
                </div>
              )}
            </div>
          </Section>

          <Section id="show" title="What the overlay shows">
            <ShowSettings />
          </Section>

          <Section id="timer" title="Run timer">
            <div className="flex items-center justify-between">
              <span className="text-xs text-overlay-text">Record runs and show the timer</span>
              <Toggle on={runTimer} onChange={setRunTimer} />
            </div>
            <p className="mt-1 text-[10px] text-overlay-muted">
              Times each run from the Twilight Strand to Kitava in Act 10, zone by zone, in its own
              window. It has its own show / hide hotkey (see Hotkeys), so it can stay up while the
              overlay is hidden, and moves in move mode. Nothing is recorded while this is off.
            </p>
          </Section>

          <Section id="gems" title="Gems tab">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-overlay-text">Rewards for later stages</span>
              <Steps
                steps={LATER_REWARDS.map(([, text], i) => [i, text] as const)}
                value={LATER_REWARDS.findIndex(([v]) => v === laterRewards)}
                onChange={setLaterRewards}
                label="Rewards for later stages"
              />
            </div>
            <p className="mt-1 mb-2 text-[10px] text-overlay-muted">
              Quest rewards your build only uses in a later stage, listed when the quest comes up so you
              can take them for free. Limit them to the levels just ahead of you, or switch them off. With
              less, a free gem can pass you by, and you&apos;d buy it later.
            </p>
            <Legend />
            <GemShortNames />
          </Section>

          <Section id="hotkeys" title="Hotkeys">
            <div className="space-y-1.5">
              {HOTKEY_FIELDS.map(([field, label]) => {
                const accel = hotkeys[field] ?? ''
                const recordingThis = recording === field
                const unset = accel === ''
                const conflict = !unset && failed.has(accel)
                return (
                  <div key={field} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-overlay-text">{label}</span>
                    <div className="flex items-center gap-2">
                      {conflict && <span className="text-[10px] text-danger">⚠ conflict</span>}
                      {!conflict && !unset && !hasModifier(accel) && (
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
                        {recordingThis ? 'Press keys…' : unset ? 'not set' : formatAccelerator(accel)}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="mt-1.5 text-[10px] text-overlay-muted">
              {recording
                ? 'Press a combo (Esc to cancel; Backspace clears a Copy binding). A modifier is recommended so it does not clash with the game.'
                : 'Click a binding to change it. Conflicts are shown if the combo is already taken. The Copy ones start unset: any free combo is a shortcut somewhere else, so pick your own.'}
            </p>
          </Section>

          <Section id="backup" title="Backup">
            <SettingsBackup />
          </Section>
        </div>
        {moveMode && <ResizeGrip />}
      </div>
    </div>
  )
}

/** The panel's text sizes (settings.ts PANEL_TEXT_STEPS), as shown. */
// Settings → Gems tab: how far ahead later stages' rewards are listed
// (settings.ts LATER_REWARD_STEPS); null is all of them.
const LATER_REWARDS: ReadonlyArray<readonly [number | null, string]> = [
  [0, 'Off'],
  [10, '10 lvl'],
  [20, '20 lvl'],
  [null, 'All']
]

const PANEL_TEXT: ReadonlyArray<readonly [number, string]> = [
  [1, '100 %'],
  [1.15, '115 %'],
  [1.3, '130 %'],
  [1.5, '150 %']
]

/** The strip's text steps around the game's own (strip-place.ts STRIP_TEXT_STEPS). */
const STRIP_TEXT: ReadonlyArray<readonly [number, string]> = [
  [0, '−2'],
  [1, '−1'],
  [2, 'Game'],
  [3, '+1'],
  [4, '+2']
]

/** A row of buttons, one lit: a choice of a few steps. */
function Steps(props: {
  steps: ReadonlyArray<readonly [number, string]>
  value: number
  onChange: (index: number) => void
  label: string
}): React.JSX.Element {
  return (
    <div className="flex gap-0.5" role="radiogroup" aria-label={props.label}>
      {props.steps.map(([, text], i) => (
        <button
          key={text}
          role="radio"
          aria-checked={i === props.value}
          onClick={() => props.onChange(i)}
          className={
            'rounded px-1.5 py-0.5 text-[10px] ' +
            (i === props.value
              ? 'bg-overlay-accent/25 font-semibold text-overlay-accent'
              : 'bg-white/10 text-overlay-muted hover:text-overlay-text')
          }
        >
          {text}
        </button>
      ))}
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
        return `v${update.version} downloaded. Restart to finish.`
      case 'available':
        return `v${update.version} is out. This portable copy doesn't update itself. Download the new one.`
      case 'publishing':
        return `${update.version ? `v${update.version}` : 'A new version'} is still being published. Check again in a few minutes.`
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
        ) : state === 'available' ? (
          <button onClick={() => window.overlay?.openReleases()} className={button('primary', 'md')}>
            Open download page
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

/**
 * A Settings heading that folds: closed by default, so the panel opens on a
 * short list of headings, and each remembers whether you left it open (in this
 * window's local storage — a convenience; without it, everything starts closed).
 */
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }): React.JSX.Element {
  // keyed by id, not title: renaming a heading mustn't forget it was open
  const key = `settings.open.${id}`
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(key) === '1'
    } catch {
      return false
    }
  })
  const toggle = (): void => {
    setOpen(!open)
    try {
      localStorage.setItem(key, open ? '0' : '1')
    } catch {
      // storage unavailable: it just won't be remembered
    }
  }
  return (
    <section>
      <button
        onClick={toggle}
        aria-expanded={open}
        className={
          'flex w-full items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-white/5 ' + HEADING + 'text-overlay-muted'
        }
      >
        <span aria-hidden className="w-2.5 text-[10px]">
          {open ? '▾' : '▸'}
        </span>
        {title}
      </button>
      {open && <div className="mt-1 rounded-md bg-black/25 p-2">{children}</div>}
    </section>
  )
}

type CopyChoice = 'off' | 'vendor' | 'tree' | 'regex'

/** What a trigger copies without a click — any of the overlay's searches. */
function CopyChoiceRow({
  label,
  value,
  onChange,
  hasRegex
}: {
  label: string
  value: CopyChoice
  onChange: (v: CopyChoice) => void
  /** "your regex" can't be picked while you keep none */
  hasRegex: boolean
}): React.JSX.Element {
  return (
    <div className="mt-1 flex items-center justify-between gap-2">
      <span className="text-xs text-overlay-text">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as CopyChoice)}
        className="rounded border border-overlay-border bg-black/30 px-2 py-1 text-[11px] text-overlay-text outline-none focus:border-overlay-accent"
      >
        <option value="off">nothing</option>
        <option value="vendor">gems to buy (Vendor)</option>
        <option value="tree">passives (Tree)</option>
        <option value="regex" disabled={!hasRegex}>
          your regex
        </option>
      </select>
    </div>
  )
}

const ACTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

/**
 * Regexes for some acts only — "2-3 links" stop mattering a few acts in. The
 * rows are a draft: a new one is empty until you type its regex, and only
 * filled ones are saved (commitActRegexes). Saved on every change of an act
 * and when you leave a regex field.
 */
function ActRegexRows({
  saved,
  onCommit
}: {
  saved: ActRegexBridge[]
  onCommit: (rows: ActRegexBridge[]) => void
}): React.JSX.Element {
  const [rows, setRows] = useState(saved)
  const set = (i: number, change: Partial<ActRegexBridge>, commit: boolean): void => {
    const next = rows.map((r, j) => {
      if (j !== i) return r
      const row = { ...r, ...change }
      // "to" never before "from": moving one drags the other along
      if (change.from != null && row.to < row.from) row.to = row.from
      if (change.to != null && row.from > row.to) row.from = row.to
      return row
    })
    setRows(next)
    if (commit) onCommit(next)
  }
  const remove = (i: number): void => {
    const next = rows.filter((_, j) => j !== i)
    setRows(next)
    onCommit(next)
  }
  const add = (): void => {
    // carries on after the last range
    const from = Math.min((rows.at(-1)?.to ?? 0) + 1, 10)
    setRows([...rows, { from, to: from, regex: '' }])
  }
  const select =
    'rounded border border-overlay-border bg-black/30 px-1 py-1 text-[11px] text-overlay-text outline-none focus:border-overlay-accent'
  return (
    <>
      {rows.map((r, i) => (
        <div key={i} className="mt-1 flex items-center gap-1">
          <span className="text-[10px] text-overlay-muted">Act</span>
          <select
            aria-label="From act"
            value={r.from}
            onChange={(e) => set(i, { from: Number(e.target.value) }, true)}
            className={select}
          >
            {ACTS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-overlay-muted">to</span>
          <select
            aria-label="To act"
            value={r.to}
            onChange={(e) => set(i, { to: Number(e.target.value) }, true)}
            className={select}
          >
            {ACTS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <input
            type="text"
            spellCheck={false}
            value={r.regex}
            placeholder='e.g. "r-g-b|b-r-g"'
            title={
              r.regex.length > SEARCH_BOX_LIMIT
                ? `${r.regex.length} characters. The game's search box cuts it off after ${SEARCH_BOX_LIMIT}.`
                : undefined
            }
            onChange={(e) => set(i, { regex: e.target.value }, false)}
            onBlur={() => onCommit(rows)}
            onKeyDown={(e) => e.key === 'Enter' && onCommit(rows)}
            className={
              'min-w-0 flex-1 rounded border bg-black/30 px-2 py-1 font-mono text-[10px] text-overlay-text outline-none focus:border-overlay-accent ' +
              (r.regex.length > SEARCH_BOX_LIMIT ? 'border-warn' : 'border-overlay-border')
            }
          />
          <button
            onClick={() => remove(i)}
            title="Remove"
            aria-label="Remove"
            className="px-1 text-xs text-overlay-muted hover:text-overlay-text"
          >
            ×
          </button>
        </div>
      ))}
      <div className="mt-1 flex items-start justify-between gap-2">
        <p className="text-[10px] text-overlay-muted">
          {rows.length
            ? 'In these acts, “your regex” (the button, its hotkey, copying without a click) is the one for the act you’ve reached; elsewhere, the one above. The first range that fits wins.'
            : 'Optional: a different regex for some acts, used there instead of the one above.'}
        </p>
        <button onClick={add} className={'shrink-0 ' + button('ghost', 'sm')}>
          + Acts
        </button>
      </div>
    </>
  )
}

