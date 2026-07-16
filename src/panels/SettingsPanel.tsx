import { useEffect, useState } from 'react'
import { useOverlayStore } from '../stores/overlayStore'
import { acceleratorFromEvent, formatAccelerator } from '../lib/accelerator'

type HotkeyField = keyof HotkeyBindingsBridge

const HOTKEY_FIELDS: ReadonlyArray<readonly [HotkeyField, string]> = [
  ['toggleVisibility', 'Show / hide overlay'],
  ['toggleClickThrough', 'Toggle click-through'],
  ['toggleMoveMode', 'Move / resize mode']
]

function hasModifier(accelerator: string): boolean {
  return /(CommandOrControl|CmdOrCtrl|Control|Ctrl|Alt|AltGr|Shift|Super|Meta)/.test(accelerator)
}

export function SettingsPanel(): React.JSX.Element {
  const { hotkeys, opacity, clickThrough, clientTxtPath, patch } = useOverlayStore()
  const [recording, setRecording] = useState<HotkeyField | null>(null)
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const [pathDraft, setPathDraft] = useState(clientTxtPath ?? '')

  useEffect(() => setPathDraft(clientTxtPath ?? ''), [clientTxtPath])

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

  const commitPath = (value: string): void => {
    const v = value.trim()
    patch({ clientTxtPath: v.length ? v : null })
    void window.overlay?.setSettings({ clientTxtPath: v.length ? v : null })
  }

  const browse = (): void => {
    void window.overlay?.pickClientTxt().then((p) => {
      if (p) {
        setPathDraft(p)
        commitPath(p)
      }
    })
  }

  return (
    <div className="flex h-screen w-screen items-start justify-center p-2">
      <div
        className="flex max-h-full w-full flex-col overflow-hidden rounded-[10px] border border-overlay-border bg-overlay-panel/95 shadow-lg backdrop-blur-sm"
        style={{ opacity }}
      >
        <header className="flex items-center justify-between border-b border-overlay-border px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-overlay-accent">⚙</span>
            <span className="text-sm font-semibold tracking-wide">Settings</span>
          </div>
          <button
            className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-overlay-muted hover:text-overlay-text"
            onClick={() => window.overlay?.setSettingsOpen(false)}
          >
            Close
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto px-3 py-3">
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
                      {conflict && <span className="text-[10px] text-red-400">⚠ conflict</span>}
                      {!conflict && !hasModifier(accel) && (
                        <span className="text-[10px] text-amber-400/80">no modifier</span>
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
                  className="w-28 accent-overlay-accent"
                />
                <span className="w-8 text-right font-mono text-[11px] text-overlay-muted">
                  {Math.round(opacity * 100)}%
                </span>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-overlay-text">Click-through by default</span>
              <Toggle on={clickThrough} onChange={setClickThrough} />
            </div>
          </Section>

          <Section title="Game log">
            <label className="text-[11px] text-overlay-muted">Client.txt path</label>
            <div className="mt-1 flex gap-1.5">
              <input
                type="text"
                spellCheck={false}
                value={pathDraft}
                placeholder="…\Path of Exile\logs\Client.txt"
                onChange={(e) => setPathDraft(e.target.value)}
                onBlur={() => commitPath(pathDraft)}
                className="min-w-0 flex-1 rounded border border-overlay-border bg-black/30 px-2 py-1 font-mono text-[10px] text-overlay-text outline-none focus:border-overlay-accent"
              />
              <button
                onClick={browse}
                className="shrink-0 rounded bg-white/10 px-2 py-1 text-[11px] text-overlay-text hover:bg-white/15"
              >
                Browse…
              </button>
            </div>
            <p className="mt-1 text-[10px] text-overlay-muted">Used for zone/level tracking (from P1).</p>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section>
      <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-overlay-muted">
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
