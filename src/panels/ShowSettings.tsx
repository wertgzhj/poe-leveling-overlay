import { Fragment, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { HEADING } from '../lib/ui'
import { useOverlayStore } from '../stores/overlayStore'
import { voicesFor } from '../lib/speak'
import { Check } from './shared'

// Settings → What the overlay shows: one row per piece of information, with a
// tick for the compact strip (while it's on), one for the panel and one for the
// voice, so "do I want the bandits?" is answered in one place. Off only hides it: tracking carries on. Below the
// table, how the voice speaks. Voice is all off until switched on.

interface Row {
  label: string
  hint: string
  /** the panel's switch; none for something only the voice says */
  show?: ShowItemBridge
  /** the strip has room for it (it shows its own zone and level, and no
   *  links or map) */
  strip?: boolean
  /** the voice's switch; none for something it doesn't say */
  voice?: AnnounceEventBridge
  /** greyed out while this one is off (the Map button without the passives) */
  needs?: ShowItemBridge
}

const GROUPS: ReadonlyArray<readonly [string, readonly Row[]]> = [
  [
    'Header',
    [
      { label: 'Zone and level', hint: 'The line under the tabs: zone, character, level. Log problems show either way.', show: 'zoneLine' },
      { label: 'Zone too hard / too easy', hint: 'When the zone’s level costs experience, and by how much', show: 'zoneFit', strip: true, voice: 'zone' },
      { label: 'Copy buttons', hint: 'Vendor, Tree and Regex in the header. Their hotkeys work either way.', show: 'copyButtons', strip: true }
    ]
  ],
  [
    'Reminders',
    [
      { label: 'Trial in this zone', hint: 'A trial you haven’t done is in this zone', show: 'trialHere', strip: true, voice: 'trial' },
      { label: 'Labyrinth unlocked', hint: 'All its trials done', show: 'lab', strip: true, voice: 'lab' },
      { label: 'Bandits', hint: 'What your build does with the bandits, when they’re due', show: 'bandit', strip: true, voice: 'bandit' },
      { label: 'Pantheon', hint: 'The gods your build wants: the reminder where one is fought, and the list in the Trials tab', show: 'pantheon', strip: true, voice: 'pantheon' }
    ]
  ],
  [
    'Gems',
    [
      { label: 'Gems to get', hint: 'The rewards to take and the gems to buy; in the strip, those of the town you’re in. Voice: their names, when a level-up makes them buyable.', show: 'gemsToGet', strip: true, voice: 'gems' },
      { label: 'Your links', hint: 'The socket groups of the stage you’re on', show: 'links' }
    ]
  ],
  [
    'Passives',
    [
      { label: 'Passive point', hint: 'The node your newest point goes on. Voice: on every level-up.', show: 'passive', strip: true, voice: 'passive' },
      { label: 'Respec', hint: 'Nodes the next PoB tree drops and masteries it switches, from when you can, until you mark it done. Voice: when it can be done.', show: 'respec', strip: true, voice: 'respec' },
      { label: 'Map button', hint: 'The tree map under the passives', show: 'passiveMap', needs: 'passive' }
    ]
  ]
]

// In the tab bar's order (see TAB_ORDER).
const TABS: ReadonlyArray<readonly [keyof VisibleTabsBridge, string]> = [
  ['gems', 'Gems tab'],
  ['trials', 'Trials tab'],
  ['guide', 'Guide tab']
]

/** The table's columns: what it's about, then a tick each; the strip's only
 *  while it's on. */
const GRID = 'grid grid-cols-[1fr_2.75rem_3.25rem] items-center gap-x-1'
const GRID_STRIP = 'grid grid-cols-[1fr_2.5rem_2.75rem_3.25rem] items-center gap-x-1'

export function ShowSettings(): React.JSX.Element {
  const { announce, showFull, showStrip, stripEnabled, visibleTabs, patch } = useOverlayStore(
    useShallow((s) => ({
      announce: s.announce,
      showFull: s.showFull,
      showStrip: s.showStrip,
      stripEnabled: s.stripEnabled,
      visibleTabs: s.visibleTabs,
      patch: s.patch
    }))
  )
  const grid = stripEnabled ? GRID_STRIP : GRID

  const setShow = (key: ShowItemBridge, on: boolean): void => {
    const next = { ...showFull, [key]: on }
    patch({ showFull: next })
    void window.overlay?.setSettings({ showFull: next })
  }
  const setStrip = (key: ShowItemBridge, on: boolean): void => {
    const next = { ...showStrip, [key]: on }
    patch({ showStrip: next })
    void window.overlay?.setSettings({ showStrip: next })
  }
  const setVoice = (event: AnnounceEventBridge, on: boolean): void => {
    const next = { ...announce, events: { ...announce.events, [event]: on } }
    patch({ announce: next })
    void window.overlay?.setSettings({ announce: next })
  }
  const setTab = (key: keyof VisibleTabsBridge, on: boolean): void => {
    const next = { ...visibleTabs, [key]: on }
    patch({ visibleTabs: next })
    void window.overlay?.setSettings({ visibleTabs: next })
  }

  return (
    <>
      <div className={grid + ' mb-1 text-[10px] text-overlay-muted'}>
        <span />
        {stripEnabled && <span className="text-center">Strip</span>}
        <span className="text-center">Panel</span>
        <span className="text-center">Voice</span>
      </div>
      {GROUPS.map(([group, rows]) => (
        <Fragment key={group}>
          <div className={'mb-1 mt-2.5 first:mt-0 ' + HEADING + 'text-overlay-muted'}>{group}</div>
          {rows.map(({ label, hint, show, strip, voice, needs }) => (
            <div key={label} className={grid + ' py-0.5'}>
              <span
                className={'text-xs text-overlay-text' + (needs ? ' pl-3' : '')}
                title={hint}
              >
                {label}
              </span>
              {stripEnabled && (
                <span className="flex justify-center">
                  {show && strip && (
                    <Check on={showStrip[show]} onChange={(on) => setStrip(show, on)} label={`Show ${label} in the strip`} />
                  )}
                </span>
              )}
              <span className="flex justify-center">
                {show && (
                  <Check
                    on={showFull[show]}
                    onChange={(on) => setShow(show, on)}
                    disabled={needs != null && !showFull[needs]}
                    label={`Show ${label} in the panel`}
                  />
                )}
              </span>
              <span className="flex items-center justify-center gap-1">
                {voice && (
                  <>
                    <Check on={announce.events[voice]} onChange={(on) => setVoice(voice, on)} label={`Say ${label}`} />
                    <button
                      onClick={() => window.overlay?.testAnnounce(voice)}
                      title="Hear it"
                      aria-label={`Hear “${label}”`}
                      className="rounded bg-white/10 px-1 text-[9px] leading-snug text-overlay-muted hover:text-overlay-text"
                    >
                      ▶
                    </button>
                  </>
                )}
              </span>
            </div>
          ))}
        </Fragment>
      ))}
      <div className={'mb-1 mt-2.5 ' + HEADING + 'text-overlay-muted'}>Tabs</div>
      {TABS.map(([key, label]) => {
        const on = visibleTabs[key]
        // Keep at least one tab: the last one on can't be switched off.
        const isLastOn = on && TABS.filter(([k]) => visibleTabs[k]).length === 1
        return (
          <div key={key} className={grid + ' py-0.5'}>
            <span className={'text-xs ' + (isLastOn ? 'text-overlay-muted' : 'text-overlay-text')}>
              {label}
              {isLastOn && <span className="ml-1 text-[10px] text-overlay-muted">(keep one)</span>}
            </span>
            {stripEnabled && <span />}
            <span className="flex justify-center">
              <Check on={on} onChange={(v) => setTab(key, v)} disabled={isLastOn} label={`Show the ${label}`} />
            </span>
            <span />
          </div>
        )
      })}
      <p className="mt-1.5 text-[10px] text-overlay-muted">
        Off only hides it: tracking carries on, so it’s up to date when you switch it back on.
      </p>

      <div className={'mb-1 mt-3 border-t border-overlay-border/60 pt-2 ' + HEADING + 'text-overlay-muted'}>Voice</div>
      <VoiceOptions />
    </>
  )
}

/** How the voice speaks: language, voice, volume. */
function VoiceOptions(): React.JSX.Element {
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
          ⚠ No {announce.lang === 'de' ? 'German' : 'English'} voice installed. Windows: Settings → Time & language →
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
      <p className="mt-1.5 text-[10px] text-overlay-muted">
        Said once, when it happens: not on a restart, not again when you walk back into a zone. Spoken by
        Windows’ own voices on this PC; the game hears nothing of it. ▶ plays an example.
      </p>
    </>
  )
}
