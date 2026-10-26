import { useEffect, useState } from 'react'
import { useOverlayStore } from '../stores/overlayStore'
import { voicesFor } from '../lib/speak'
import { Toggle } from './shared'

// Settings → Voice: which moments are said out loud, in which language and
// voice, how loud — each with a ▶ to hear it now. All off until switched on.

const EVENTS: ReadonlyArray<readonly [AnnounceEventBridge, string, string]> = [
  ['trial', 'Entering a trial zone', 'A trial you haven’t done is in this zone'],
  ['gems', 'New gems to buy', 'A level-up makes gems buyable: their names'],
  ['zone', 'Zone level costs experience', 'Too high or too low for you, and by how much'],
  ['lab', 'A Labyrinth opens', 'All its trials done'],
  ['choice', 'Bandits / Pantheon due', 'What your build picks'],
  ['passive', 'Next passive point', 'The node for your next point, on every level-up']
]

export function VoiceSettings(): React.JSX.Element {
  const announce = useOverlayStore((s) => s.announce)
  const patch = useOverlayStore((s) => s.patch)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => voicesFor(announce.lang, setVoices), [announce.lang])

  const set = (next: Partial<AnnounceSettingsBridge>): void => {
    const merged = { ...announce, ...next }
    patch({ announce: merged })
    void window.overlay?.setSettings({ announce: merged })
  }
  const select =
    'rounded border border-overlay-border bg-black/30 px-2 py-1 text-[11px] text-overlay-text outline-none focus:border-overlay-accent'

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-overlay-text">Language</span>
        <select
          value={announce.lang}
          // another language's voice can't say it: back to automatic
          onChange={(e) => set({ lang: e.target.value as AnnounceSettingsBridge['lang'], voice: '' })}
          className={select}
        >
          <option value="en">English</option>
          <option value="de">Deutsch</option>
        </select>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-xs text-overlay-text">Voice</span>
        <select
          value={announce.voice}
          onChange={(e) => set({ voice: e.target.value })}
          className={'min-w-0 max-w-[60%] ' + select}
        >
          <option value="">Automatic</option>
          {voices.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name}
            </option>
          ))}
          {/* a saved voice this PC doesn't have (any more) stays listed */}
          {announce.voice && !voices.some((v) => v.name === announce.voice) && (
            <option value={announce.voice}>{announce.voice} (not found)</option>
          )}
        </select>
      </div>
      {voices.length === 0 && (
        <p className="mt-1 text-[10px] text-warn">
          ⚠ No {announce.lang === 'de' ? 'German' : 'English'} voice installed — Windows: Settings → Time & language →
          Speech → Add voices.
        </p>
      )}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-xs text-overlay-text">Volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={announce.volume}
          onChange={(e) => set({ volume: Number(e.target.value) })}
          className="w-32 accent-[var(--color-overlay-accent)]"
          aria-label="Volume"
        />
      </div>

      <div className="mt-3 space-y-1">
        {EVENTS.map(([event, label, hint]) => (
          <div key={event} className="flex items-center justify-between gap-2" title={hint}>
            <span className="text-xs text-overlay-text">{label}</span>
            <span className="flex items-center gap-1.5">
              <button
                onClick={() => window.overlay?.testAnnounce(event)}
                title="Hear it"
                aria-label={`Hear “${label}”`}
                className="rounded bg-white/10 px-1.5 text-[10px] text-overlay-muted hover:text-overlay-text"
              >
                ▶
              </button>
              <Toggle on={announce.events[event]} onChange={(on) => set({ events: { ...announce.events, [event]: on } })} />
            </span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] text-overlay-muted">
        Said once, when it happens — not on a restart, not again when you walk back into a zone. Spoken by
        Windows’ own voices on this PC; the game hears nothing of it.
      </p>
    </>
  )
}
