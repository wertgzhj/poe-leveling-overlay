import { useLayoutEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
// Pure modules from the main process side (no Electron imports).
import { LAB_LABEL } from '../../electron/trials/engine.ts'
import { stripModel, type StripGem, type StripNotice } from '../../electron/strip.ts'
import { stripFontSize } from '../../electron/strip-place.ts'
import { nodeLabel, respecNames } from '../../electron/profile/tree.ts'
import { formatAccelerator } from '../lib/accelerator'
import { button, panelSurface } from '../lib/ui'
import { useOverlayStore } from '../stores/overlayStore'
import { ResizeGrip, trackerLine } from './MainPanel'
import { SearchButtons } from './SearchButtons'
import { GemName, Pip } from './shared'

// The compact strip (Settings → Overlay, preview): the header, then at most
// four lines (electron/strip.ts decides which): a reminder, what to pick up in
// this town, your next passive point. Its text matches the game's (strip-place
// .ts), so every size here is in em. The window fits itself to it: this
// reports its height, and main grows the window away from its screen edge.
// The full panel is on a hotkey, or the ⤢ in interactive mode.

const NO_GODS: PantheonStatusBridge[] = []

export function StripPanel(): React.JSX.Element {
  const s = useOverlayStore(
    useShallow((st) => ({
      opacity: st.opacity,
      moveMode: st.moveMode,
      show: st.showStrip,
      stripText: st.stripText,
      logStatus: st.logStatus,
      tracked: st.tracked,
      languageMismatch: st.languageMismatch,
      zoneFit: st.zoneFit,
      profile: st.profile,
      trials: st.trials,
      pantheon: st.profile?.pantheon ?? NO_GODS,
      fullPanelKey: st.hotkeys.toggleFullPanel
    }))
  )
  const box = useRef<HTMLDivElement>(null)

  // Tell main how tall the strip is, now and whenever a line comes or goes.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const report = (): void => window.overlay?.setStripHeight(Math.ceil(el.getBoundingClientRect().height))
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const trialId = s.trials?.currentZoneTrialId
  const trialHere = s.trials?.trials.find((t) => t.id === trialId && !t.seen)
  const god = s.pantheon.find((g) => g.here && !g.unlocked)
  const passives = s.profile?.passives
  const due = passives?.next[0]
  const onLive = s.profile ? s.profile.viewedIndex === s.profile.liveIndex : false
  const model = stripModel({
    areaId: s.tracked?.area?.areaId ?? null,
    show: s.show,
    choice: s.profile?.choiceDue ? { id: s.profile.choiceDue.id, wants: s.profile.choiceDue.wants } : null,
    lab: s.trials?.unlockedLabs?.[0] ?? null,
    trial: trialHere?.id ?? null,
    god: god ? { soul: god.soul, side: god.side } : null,
    // the live stage's list: a stage paged to in the panel isn't where you are
    plan: onLive ? (s.profile?.acquisitions?.plan ?? []) : [],
    respec: passives?.respec
      ? {
          key: passives.respec.key,
          names: respecNames(passives.respec, true),
          after: passives.respec.after ? nodeLabel(passives.respec.after) : null
        }
      : null,
    passive:
      passives && due
        ? { name: (due.kind === 'mastery' ? 'M ' : '') + nodeLabel(due), points: passives.points, total: passives.total }
        : null
  })

  const watching = s.logStatus?.state === 'watching' && !s.languageMismatch
  const level = s.tracked?.level
  const surface = panelSurface(s.opacity)
  return (
    <div ref={box} className="p-1">
      <div
        data-interactive
        className={
          'relative overflow-hidden leading-snug ' +
          surface.className +
          (s.moveMode ? 'border-overlay-accent' : 'border-overlay-border')
        }
        style={{ ...surface.style, fontSize: stripFontSize(window.screen.height, s.stripText) }}
      >
        <header
          className={
            'flex items-center gap-[0.5em] px-[0.6em] py-[0.35em] ' +
            (s.moveMode ? 'drag-region cursor-move bg-overlay-accent/10' : '')
          }
        >
          <span className="text-overlay-accent" aria-hidden>
            ◆
          </span>
          {watching ? (
            <span className="min-w-0 flex-1 truncate">
              {level != null && <span className="text-overlay-muted">lvl {level} | </span>}
              {s.tracked?.area?.name ?? 'zone unknown'}
            </span>
          ) : (
            // the log is missing or not in English: say so, where the zone goes
            <span className="min-w-0 flex-1 truncate text-[0.8em] text-warn">
              {trackerLine(s.logStatus, s.tracked, s.languageMismatch)}
            </span>
          )}
          {watching && s.show.zoneFit && s.zoneFit && (
            <span
              className={
                'shrink-0 rounded px-[0.3em] text-[0.7em] font-semibold ' +
                (s.zoneFit.verdict === 'under' ? 'bg-danger/15 text-danger' : 'bg-white/10 text-overlay-muted')
              }
              title={`The zone is level ${s.zoneFit.areaLevel}`}
            >
              zone {s.zoneFit.areaLevel} {s.zoneFit.verdict === 'under' ? '▲' : '▼'}
            </span>
          )}
          {s.moveMode ? (
            <button className={'no-drag ' + button('primary', 'sm')} onClick={() => window.overlay?.exitMoveMode()}>
              Done
            </button>
          ) : (
            <>
              {s.show.copyButtons && <SearchButtons compact />}
              <button
                className="no-drag shrink-0 rounded bg-white/10 px-[0.5em] py-[0.2em] text-[0.85em] leading-none text-overlay-muted hover:text-overlay-text"
                title={`The full panel${s.fullPanelKey ? ` (${formatAccelerator(s.fullPanelKey)})` : ''}`}
                aria-label="Open the full panel"
                onClick={() => window.overlay?.toggleFullPanel()}
              >
                ⤢
              </button>
            </>
          )}
        </header>

        {model.notice && <NoticeLine notice={model.notice} />}
        {model.gems.length > 0 && (
          <div className="grid grid-cols-[auto_auto_1fr_auto] items-baseline gap-x-[0.45em] gap-y-[0.15em] border-t border-overlay-border/60 px-[0.6em] py-[0.3em]">
            {model.gems.map((g, i) => (
              <GemLine key={i} gem={g} />
            ))}
            {model.more > 0 && (
              <span className="col-span-4 pl-[0.2em] text-[0.75em] text-overlay-muted">
                +{model.more} more in the full panel
              </span>
            )}
          </div>
        )}
        {model.passive && (
          <div className="flex items-baseline gap-[0.5em] border-t border-overlay-border/60 px-[0.6em] py-[0.3em]">
            <span className="shrink-0 text-[0.65em] font-semibold uppercase tracking-wider text-overlay-muted">
              Passive
            </span>
            <span className="min-w-0 flex-1 truncate">
              {model.passive.name}{' '}
              <span className="text-overlay-muted">
                {model.passive.points}/{model.passive.total}
              </span>
            </span>
          </div>
        )}
        {s.moveMode && <ResizeGrip />}
      </div>
    </div>
  )
}

const HOW: Record<StripGem['how'], { label: string; tone: string }> = {
  take: { label: 'Take', tone: 'text-ok' },
  pick: { label: 'Pick 1', tone: 'text-ok' },
  buy: { label: 'Buy', tone: 'text-overlay-muted' }
}

/** One thing to pick up: how, the gem(s), and from whom. Four cells of the
 *  block's grid, so the columns line up. */
function GemLine({ gem }: { gem: StripGem }): React.JSX.Element {
  const how = HOW[gem.how]
  return (
    <>
      <span className={'text-right text-[0.75em] ' + how.tone}>{how.label}</span>
      <Pip gem={gem.gems[0]?.colored} scaled />
      <span className="min-w-0 truncate">
        {gem.gems.map((g, i) => (
          <span key={g.name}>
            {i > 0 && <span className="text-overlay-muted"> or </span>}
            <GemName name={g.name} />
          </span>
        ))}
      </span>
      <span className="max-w-[9em] truncate text-right text-[0.75em] text-overlay-muted">{gem.from ?? ''}</span>
    </>
  )
}

/** The one reminder, with its button: Done for a trial, a respec or a god,
 *  ✕ for a choice or a Labyrinth. */
function NoticeLine({ notice }: { notice: StripNotice }): React.JSX.Element {
  // a trial and a respec are things to do: orange
  const trial = notice.kind === 'trial' || notice.kind === 'respec'
  const text =
    notice.kind === 'respec'
      ? `Respec${notice.after ? ` after ${notice.after}` : ''}: ${notice.names.join(', ')}`
      :
    notice.kind === 'choice'
      ? `${notice.id === 'bandit' ? 'Bandits' : 'Pantheon'}: ${notice.wants}`
      : notice.kind === 'lab'
        ? `${LAB_LABEL[notice.lab]} unlocked`
        : notice.kind === 'trial'
          ? 'Trial in this zone'
          : `Pantheon: ${notice.soul.replace(/^Soul of (the )?/, '')}${notice.side ? ` in ${notice.side}` : ' is here'}`
  const act = (): void => {
    if (notice.kind === 'choice' || notice.kind === 'respec') window.overlay?.dismissChoice(notice.kind === 'respec' ? notice.key : notice.id)
    else if (notice.kind === 'lab') window.overlay?.trialsDismissLab(notice.lab)
    else if (notice.kind === 'trial') window.overlay?.trialsToggle(notice.id)
    else window.overlay?.togglePantheon(notice.soul)
  }
  const done = notice.kind === 'trial' || notice.kind === 'respec' || notice.kind === 'god'
  return (
    <div
      className={
        'flex items-center gap-[0.5em] border-t px-[0.6em] py-[0.3em] ' +
        (trial ? 'border-warn/40 bg-warn/10 text-warn' : 'border-overlay-accent/50 bg-overlay-accent/15')
      }
    >
      <span className={trial ? '' : 'text-overlay-accent'} aria-hidden>
        {notice.kind === 'respec' ? '⚠' : trial ? '△' : notice.kind === 'lab' ? '⌂' : '◆'}
      </span>
      <span className="min-w-0 flex-1 truncate">{text}</span>
      <button
        onClick={act}
        title={done ? 'Mark it done' : "Got it, don't remind me again"}
        aria-label={done ? 'Done' : 'Dismiss'}
        className={
          'shrink-0 rounded px-[0.4em] text-[0.7em] font-medium ' +
          (done
            ? trial
              ? 'bg-warn/20 text-warn hover:bg-warn/30'
              : 'bg-overlay-accent/20 text-overlay-accent hover:bg-overlay-accent/30'
            : 'text-overlay-muted hover:text-overlay-text')
        }
      >
        {done ? 'Done ✓' : '✕'}
      </button>
    </div>
  )
}
