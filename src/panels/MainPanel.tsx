import { Fragment, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useOverlayStore } from '../stores/overlayStore'
import { formatAccelerator } from '../lib/accelerator'
import { muleInstruction, sourceMark, sourceName, sourceTone, type MuleHow } from '../lib/sources'
import { BUTTON, BUTTON_SIZE, HEADING, TAG, TAG_TONE, button, type Tone } from '../lib/ui'
import { UpdateBanner } from './UpdateBanner'
import { VersionBadge } from './VersionBadge'

// Main overlay panel (guide + gems) with a shared chrome and a tab switch.
// Steps/stage auto-advance from the log; interacting needs interactive mode
// (Ctrl+Shift+C) while forward/back hotkeys work regardless.

const TYPE_ICONS: Record<StepTypeBridge, string> = {
  // Not ❗: that one is an emoji and draws red, and red means "broken" here.
  quest: '!',
  waypoint: '◈',
  trial: '△',
  town: '⌂',
  boss: '☠',
  kill: '⚔',
  enter: '➜',
  hint: '✎'
}

// Labyrinth tier names. Mirrored by hand from electron/trials/engine.ts — the
// main and renderer build graphs are intentionally decoupled (see env.d.ts).
const LAB_LABEL: Record<LabTierBridge, string> = {
  normal: 'Normal Labyrinth',
  cruel: 'Cruel Labyrinth',
  merciless: 'Merciless Labyrinth'
}

// Distinct hues + the attribute letter inside each pip, so red/green/blue stay
// unambiguous even when green and blue are hard to tell apart (colour-blind
// friendly). Green is a true green rather than emerald, blue a deep blue.
const PIP_CLASS: Record<SocketColorBridge, string> = {
  R: 'bg-red-500 text-black/80', // 4.7:1
  G: 'bg-green-500 text-black/80', // 7.0:1
  B: 'bg-blue-600 text-white', // 5.2:1
  W: 'bg-white/30 text-black/80'
}

// Vendor price tiers, shortened for the Gems tab's cost column. Mirrored by hand
// from COST_TIERS in electron/profile/gems.ts — the main and renderer build
// graphs are intentionally decoupled (see env.d.ts). An unknown tier falls back
// to its own name, so adding one there can never render a blank cell here.
const COST_SHORT: Record<string, string> = {
  Wisdom: 'Wisdom',
  Transmutation: 'Trans',
  Alteration: 'Alt',
  Chance: 'Chance',
  Alchemy: 'Alch'
}

// One ramp, grey to white: the pricier the gem, the brighter the word. Not gold
// — gold means "now" in this tab, and a price isn't a call to act. The word
// carries the meaning anyway; every step clears AA contrast.
const COST_TONE: Record<string, string> = {
  Wisdom: 'text-overlay-muted',
  Transmutation: 'text-overlay-text/70',
  Alteration: 'text-overlay-text/80',
  Chance: 'text-overlay-text/90',
  Alchemy: 'text-overlay-text'
}

function ResizeGrip(): React.JSX.Element {
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent): void => window.overlay?.resizeBy(ev.movementX, ev.movementY)
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return <div className="resize-grip" onPointerDown={onPointerDown} title="Drag to resize" />
}

// Manual "who am I logged in as?" — re-detects the character from your most
// recent level-up (the only character signal Client.txt carries) and locks
// tracking onto it. Flashes the result for a few seconds; the tracker strip
// itself also updates via the pushed snapshot. Needs interactive mode to click
// (like the ⚙ and step buttons).
function DetectCharButton(): React.JSX.Element {
  const [flash, setFlash] = useState<{ text: string; title?: string } | null>(null)
  const onClick = (): void => {
    void window.overlay?.detectCharacter().then((found) => {
      // A name pinned in Settings outranks detection, so the tick would be a
      // lie: it found the character and tracking still didn't move. Say which
      // setting is holding it instead of pretending something happened.
      setFlash(
        !found
          ? { text: 'no level-up yet' }
          : found.tracking
            ? { text: `✓ ${found.name}` }
            : {
                text: `pinned: ${found.pinnedTo}`,
                title: `You're on ${found.name}, but Settings → Game log pins tracking to ${found.pinnedTo}. Clear that field to follow whoever you're playing.`
              }
      )
      window.setTimeout(() => setFlash(null), 4000)
    })
  }
  return (
    <button
      onClick={onClick}
      title={flash?.title ?? "Detect the character you're logged in as (from your most recent level-up)"}
      className={
        // A quiet button whose text colour flashes, so the colour is set here
        // rather than by the variant — two text colours would fight.
        'no-drag max-w-[45%] shrink-0 truncate bg-white/10 enabled:hover:text-overlay-text ' + BUTTON + BUTTON_SIZE.sm + ' ' +
        (flash?.title ? 'text-warn' : 'text-overlay-muted')
      }
    >
      {flash?.text ?? '⟳ character'}
    </button>
  )
}

// One click puts the search regex from Settings on the clipboard; paste it into
// a stash or vendor search box yourself. Copying is all the overlay does — it
// never types into the game (docs/ARCHITECTURE.md#tos-position). Absent until a
// regex is set, rather than a button that explains it has nothing to do.
function RegexButton(): React.JSX.Element | null {
  const regex = useOverlayStore((s) => s.searchRegex)
  const [flash, setFlash] = useState<'copied' | 'failed' | null>(null)
  if (!regex) return null
  const onClick = (): void => {
    void window.overlay?.copySearchRegex().then((ok) => {
      setFlash(ok ? 'copied' : 'failed')
      window.setTimeout(() => setFlash(null), 1500)
    })
  }
  return (
    <button
      onClick={onClick}
      title={`Copy to clipboard, then paste into a stash or vendor search:\n${regex}`}
      className={
        // Fixed width: "✓ copied" is wider than "Regex", and the flash must not
        // shove the ⚙ next to it sideways.
        'no-drag min-w-[3.75rem] text-center bg-white/10 enabled:hover:text-overlay-text ' + BUTTON + BUTTON_SIZE.sm + ' ' +
        (flash === 'copied'
          ? 'text-ok'
          : flash === 'failed'
            ? 'text-warn'
            : 'text-overlay-muted')
      }
    >
      {flash === 'copied' ? '✓ copied' : flash === 'failed' ? 'not set' : 'Regex'}
    </button>
  )
}

function trackerLine(
  logStatus: WatcherStatusBridge | null,
  tracked: TrackerStateBridge | null,
  languageMismatch: boolean
): string {
  if (logStatus?.state !== 'watching') {
    if (logStatus?.state === 'missing') return 'Client.txt not found — check Settings'
    if (logStatus?.state === 'error') return 'Log read error — see Settings'
    return 'Set the Client.txt path in Settings to enable tracking'
  }
  // Zone lines parse (they're locale-independent) but the localized ones don't:
  // levels never arrive, so the Gems tab would sit on stage 1 forever. Say why.
  if (languageMismatch) return 'Log is not in English — set the game to English for level tracking'
  const zone = tracked?.area?.name ?? 'zone unknown'
  const char =
    tracked?.character != null
      ? `${tracked.character}${tracked.level != null ? ` · lvl ${tracked.level}` : ''}`
      : 'waiting for a level-up'
  return `${zone} — ${char}`
}

// Path of Exile cuts experience once your level and the zone's monster level
// differ by more than the safe range — in both directions. Under means the zone
// is dangerous AND stingy; over means you're farming for nothing. Towns and
// non-campaign instances are excluded upstream, so this only appears where it
// means something.
function ZoneFitTag({ fit }: { fit: ZoneFitBridge }): React.JSX.Element {
  const under = fit.verdict === 'under'
  return (
    <span
      title={
        under
          ? `The zone is level ${fit.areaLevel}, ${fit.by} past your safe range — tougher, and reduced experience.`
          : `The zone is level ${fit.areaLevel}, ${fit.by} below your safe range — reduced experience, move on.`
      }
      className={'shrink-0 ' + TAG + TAG_TONE[under ? 'danger' : 'muted']}
    >
      {under ? `zone ${fit.areaLevel} ▲` : `zone ${fit.areaLevel} ▼`}
    </span>
  )
}

export function MainPanel(): React.JSX.Element {
  const {
    visible,
    moveMode,
    opacity,
    isDev,
    logStatus,
    tracked,
    guide,
    profile,
    trials,
    tab,
    visibleTabs,
    languageMismatch,
    zoneFit,
    patch
  } = useOverlayStore(
    useShallow((s) => ({
      visible: s.visible,
      moveMode: s.moveMode,
      opacity: s.opacity,
      isDev: s.isDev,
      logStatus: s.logStatus,
      tracked: s.tracked,
      guide: s.guide,
      profile: s.profile,
      trials: s.trials,
      tab: s.tab,
      visibleTabs: s.visibleTabs,
      languageMismatch: s.languageMismatch,
      zoneFit: s.zoneFit,
      patch: s.patch
    }))
  )

  // Hiding the active tab falls back to the first one still shown (settings
  // guarantees at least one is on).
  const shownTabs = (['guide', 'gems', 'trials'] as const).filter((t) => visibleTabs[t])
  const activeTab = shownTabs.includes(tab) ? tab : (shownTabs[0] ?? 'guide')

  if (!visible) return <div />

  const currentAct = guide?.route?.steps[guide.cursorIndex]?.act
  const guideTitle = guide?.route
    ? currentAct
      ? `Act ${currentAct}`
      : 'Campaign'
    : 'PoE Leveling Overlay'
  const title =
    activeTab === 'gems'
      ? (profile?.meta?.name ?? 'Build')
      : activeTab === 'trials'
        ? 'Trials of Ascendancy'
        : guideTitle
  const guideHasErrors = (guide?.errors?.length ?? 0) > 0
  const profileHasErrors = (profile?.errors?.length ?? 0) > 0
  const trialsBadge = trials ? `${trials.seenCount}/${trials.total}` : undefined

  return (
    <div className="flex h-screen w-screen items-start justify-center p-2">
      <div
        data-interactive
        className={
          'relative flex max-h-full w-full flex-col overflow-hidden rounded-[10px] border bg-overlay-panel/95 shadow-lg backdrop-blur-sm ' +
          (moveMode ? 'border-overlay-accent' : 'border-overlay-border')
        }
        style={{ opacity }}
      >
        <header
          className={
            'flex items-center justify-between px-3 py-2 ' +
            (moveMode ? 'drag-region cursor-move bg-overlay-accent/10' : '')
          }
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-overlay-accent">◆</span>
            <span className="truncate text-sm font-semibold tracking-wide">{title}</span>
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
            {isDev && (
              <button
                className={'no-drag ' + button('quiet', 'sm')}
                title="Log events (dev)"
                onClick={() => patch({ debugOpen: true })}
              >
                🐞
              </button>
            )}
            <RegexButton />
            <button
              className={'no-drag ' + button('quiet', 'sm')}
              title="Settings"
              aria-label="Settings"
              onClick={() => window.overlay?.setSettingsOpen(true)}
            >
              ⚙
            </button>
          </div>
        </header>

        <UpdateBanner />

        {/* Tab switch — only the tabs enabled in Settings; hidden when just one. */}
        {shownTabs.length > 1 && (
          <div className="flex gap-1 px-2">
            {visibleTabs.guide && (
              <Tab label="Guide" active={activeTab === 'guide'} flag={guideHasErrors} onClick={() => patch({ tab: 'guide' })} />
            )}
            {visibleTabs.gems && (
              <Tab label="Gems" active={activeTab === 'gems'} flag={profileHasErrors} onClick={() => patch({ tab: 'gems' })} />
            )}
            {visibleTabs.trials && (
              <Tab label="Trials" badge={trialsBadge} active={activeTab === 'trials'} onClick={() => patch({ tab: 'trials' })} />
            )}
          </div>
        )}

        <div className="mt-1 flex items-center gap-1.5 border-y border-overlay-border/60 bg-black/20 px-3 py-1 text-[11px] text-overlay-muted">
          <span
            className={
              'inline-block h-1.5 w-1.5 shrink-0 rounded-full ' +
              (logStatus?.state !== 'watching'
                ? 'bg-white/25'
                : languageMismatch
                  ? 'bg-warn'
                  : 'bg-ok')
            }
          />
          <span className={'min-w-0 flex-1 truncate' + (languageMismatch ? ' text-warn' : '')}>
            {trackerLine(logStatus, tracked, languageMismatch)}
          </span>
          {zoneFit && !languageMismatch && <ZoneFitTag fit={zoneFit} />}
          <DetectCharButton />
        </div>

        <TrialHint />

        {/* pb-6: the version badge sits on top of the panel's bottom-right
            corner, so the content stops short of it — the Guide's "reset" ran
            underneath it. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6 pt-2">
          {activeTab === 'guide' && <GuideBody />}
          {activeTab === 'gems' && <GemBody />}
          {activeTab === 'trials' && <TrialsBody />}
        </div>

        <VersionBadge />
        {moveMode && <ResizeGrip />}
      </div>
    </div>
  )
}

function Tab({
  label,
  active,
  flag,
  badge,
  onClick
}: {
  label: string
  active: boolean
  flag?: boolean
  badge?: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={
        // flex-1 with a zero basis: equal shares of the row whatever the labels
        // say, so the tabs are thirds at every window width instead of three
        // label-sized buttons with dead space after them.
        'no-drag min-w-0 flex-1 rounded-t px-2.5 py-1 text-[11px] font-medium ' +
        (active ? 'bg-overlay-accent/15 text-overlay-accent' : 'text-overlay-muted hover:text-overlay-text')
      }
    >
      {label}
      {badge && <span className="ml-1 text-[10px] text-overlay-muted">{badge}</span>}
      {flag && <span className="ml-1 text-danger">•</span>}
    </button>
  )
}

// A small label next to a name (see TAG in lib/ui). One look for all of them,
// the colour saying what kind: gold now, green free, grey plain.
function Tag({
  tone,
  className,
  title,
  children
}: {
  tone: Tone
  className?: string
  title?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <span title={title} className={TAG + TAG_TONE[tone] + (className ? ' ' + className : '')}>
      {children}
    </span>
  )
}

// The notice bar, shown on every tab. Three things can claim it, ranked by how
// costly missing one is: a one-shot build decision (permanent), then a finished
// Labyrinth (an hour of not knowing), then a trial you're standing in (it comes
// round again). Only one bar, so it never stacks.
function TrialHint(): React.JSX.Element | null {
  const { trials, choice } = useOverlayStore(
    useShallow((s) => ({ trials: s.trials, choice: s.profile?.choiceDue ?? null }))
  )

  // A bandit or pantheon choice outranks both. It is one-shot and permanent for
  // the character — miss the bandits and that's it — whereas a Labyrinth waits
  // and a trial zone comes round again.
  if (choice) {
    return (
      <div className="flex items-center gap-2 border-b border-overlay-accent/50 bg-overlay-accent/15 px-3 py-1.5">
        <span className="text-overlay-accent" aria-hidden>◆</span>
        <span
          className="min-w-0 flex-1 truncate text-[11px] text-overlay-text"
          title={
            choice.id === 'bandit'
              ? `Act 2, "Deal with the Bandits" — your profile says ${choice.wants}. The alternatives: ${choice.options.join(', ')}. It cannot be changed afterwards.`
              : `Act 5 — the Pantheon opens up at Sin. Your profile wants ${choice.wants}. This one you can change later.`
          }
        >
          {choice.id === 'bandit' ? 'Bandits: ' : 'Pantheon: '}
          {choice.wants}
        </span>
        <button
          className="shrink-0 text-overlay-muted hover:text-overlay-text"
          title="Done — don't remind me again on this character"
          aria-label="Dismiss reminder"
          onClick={() => window.overlay?.dismissChoice(choice.id)}
        >
          ✕
        </button>
      </div>
    )
  }

  const unlocked = trials?.unlockedLabs?.[0]
  if (unlocked) {
    return (
      <div className="flex items-center gap-2 border-b border-overlay-accent/50 bg-overlay-accent/15 px-3 py-1.5">
        <span className="text-overlay-accent">⌂</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-overlay-accent">
          {LAB_LABEL[unlocked]} unlocked — Aspirants&apos; Plaza.
        </span>
        <button
          className="shrink-0 text-overlay-muted hover:text-overlay-text"
          title="Got it — don't show this again for this Labyrinth"
          aria-label="Dismiss"
          onClick={() => window.overlay?.trialsDismissLab(unlocked)}
        >
          ✕
        </button>
      </div>
    )
  }

  // Otherwise: standing in a zone that holds an uncompleted trial. Entering a
  // zone never checks a trial off (you can walk it without doing the trial), so
  // this is a reminder plus a one-click correction.
  const trial = trials?.trials.find((t) => t.id === trials.currentZoneTrialId)
  if (!trial || trial.seen) return null
  return (
    <div className="flex items-center gap-2 border-b border-warn/40 bg-warn/10 px-3 py-1.5">
      <span className="text-warn" aria-hidden>△</span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-warn">
        Trial of Ascendancy in this zone — don&apos;t leave without it.
      </span>
      <button
        className="shrink-0 rounded bg-warn/20 px-2 py-0.5 text-[10px] font-medium text-warn hover:bg-warn/30"
        title="Mark this trial as completed"
        onClick={() => window.overlay?.trialsToggle(trial.id)}
      >
        Done ✓
      </button>
    </div>
  )
}

function TrialsBody(): React.JSX.Element {
  const trials = useOverlayStore((s) => s.trials)
  if (!trials) return <p className="px-1 text-xs text-overlay-muted">Loading…</p>

  // done/total per Labyrinth, counted once instead of per row.
  const perLab = new Map<LabTierBridge, { done: number; total: number }>()
  for (const t of trials.trials) {
    const tally = perLab.get(t.lab) ?? { done: 0, total: 0 }
    tally.total++
    if (t.seen) tally.done++
    perLab.set(t.lab, tally)
  }

  return (
    <>
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[11px] text-overlay-muted">
          Campaign trials · {trials.seenCount}/{trials.total}
        </span>
        <button
          className="text-[10px] text-overlay-muted hover:text-overlay-text"
          title="Clear trials for this character"
          onClick={() => window.overlay?.trialsReset()}
        >
          reset
        </button>
      </div>
      {trials.trials.map((t, i) => {
        const here = t.id === trials.currentZoneTrialId
        // Header per Labyrinth tier — three separate labs run in the campaign.
        const newLab = i === 0 || trials.trials[i - 1].lab !== t.lab
        const tally = perLab.get(t.lab)
        return (
          <div key={`${t.id}-w`}>
          {newLab && (
            <div className="mb-1 mt-2 flex items-center justify-between px-1 first:mt-0">
              <span className={HEADING + 'text-overlay-muted'}>
                {LAB_LABEL[t.lab]}
              </span>
              <span className="text-[10px] text-overlay-muted">
                {tally?.done}/{tally?.total}
              </span>
            </div>
          )}
          <button
            onClick={() => window.overlay?.trialsToggle(t.id)}
            className={
              'mb-1 flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left ' +
              (here && !t.seen
                ? 'border-overlay-accent/60 bg-overlay-accent/10'
                : 'border-transparent ' + (t.seen ? '' : 'bg-black/20'))
            }
          >
            <span
              className={
                'shrink-0 text-xs ' +
                (t.seen ? 'text-overlay-muted' : here ? 'text-overlay-accent' : 'text-overlay-muted')
              }
            >
              {t.seen ? '✓' : '△'}
            </span>
            <div className="min-w-0">
              <div className={'text-xs ' + (t.seen ? 'text-overlay-muted line-through' : 'text-overlay-text')}>
                {t.zone}
                {here && !t.seen && <Tag tone="gold" className="ml-1.5">you are here</Tag>}
              </div>
              <div className="text-[10px] text-overlay-muted">Act {t.act}</div>
            </div>
          </button>
          </div>
        )
      })}
      <p className="mt-1 px-1 text-[10px] text-overlay-muted">
        Finishing a trial auto-checks it (Izaro&apos;s plaque line names the trial);
        the hint and a manual click are fallbacks. Each Labyrinth needs all of its
        own trials — six for Normal, three each for Cruel and Merciless.
      </p>
    </>
  )
}

function ErrorBox({ title, errors }: { title: string; errors: string[] }): React.JSX.Element {
  return (
    <div className="mb-2 rounded-md border border-danger/40 bg-danger/10 p-2 text-[11px] text-danger">
      <div className="mb-0.5 font-semibold">{title}</div>
      {errors.map((err, i) => (
        <div key={i}>· {err}</div>
      ))}
    </div>
  )
}

// The bundled routes are placeholders by design — the owner writes the real
// ones. Saying so beats letting a step called "Placeholder — add the zones you
// take" read as a broken feature, and it points at the editor that fixes it.
function SkeletonNotice({ act }: { act: number | undefined }): React.JSX.Element {
  return (
    <div className="mb-2 rounded-md border border-overlay-border/60 bg-black/25 p-2">
      <div className="text-[11px] text-overlay-text">
        {act ? `Act ${act} runs on the placeholder route.` : 'This route is a placeholder.'}
      </div>
      <p className="mt-0.5 text-[10px] leading-snug text-overlay-muted">
        The overlay ships the engine, not the route — write your own steps and they
        hot-reload as you save. Everything else (Gems, Trials) works regardless.
      </p>
      <button
        onClick={() => window.overlay?.openEditor()}
        className={'mt-1.5 ' + button('primary', 'sm')}
      >
        Open the route editor…
      </button>
    </div>
  )
}

function GuideBody(): React.JSX.Element {
  const { guide, clickThrough, hotkeys } = useOverlayStore(
    useShallow((s) => ({ guide: s.guide, clickThrough: s.clickThrough, hotkeys: s.hotkeys }))
  )
  const route = guide?.route ?? null
  const done = new Set(guide?.doneIds ?? [])
  const cursor = guide?.cursorIndex ?? 0
  const steps = route?.steps ?? []
  const start = Math.max(0, cursor - 1)
  const visibleSteps = steps.slice(start, cursor + 5)
  const currentAct = steps[cursor]?.act
  const onSkeleton = currentAct != null && (guide?.skeletonActs ?? []).includes(currentAct)

  return (
    <>
      {guide?.errors && guide.errors.length > 0 && (
        <ErrorBox title="Route file problems:" errors={guide.errors} />
      )}
      {onSkeleton && <SkeletonNotice act={currentAct} />}
      {!route && (!guide || guide.errors.length === 0) && (
        <p className="px-1 text-xs text-overlay-muted">Loading route…</p>
      )}
      {route && cursor >= steps.length && (
        <p className="px-1 text-xs text-overlay-accent">
          All steps done — refine any act in data/campaign/act&lt;N&gt;.json.
        </p>
      )}

      {visibleSteps.map((step, vi) => {
        const idx = start + vi
        const isDone = done.has(step.id)
        const isCurrent = idx === cursor
        const prevAct = vi > 0 ? visibleSteps[vi - 1].act : undefined
        const showActDivider = step.act != null && step.act !== prevAct
        return (
          <div key={step.id}>
            {showActDivider && (
              <div className={'mb-1 mt-1 px-1 ' + HEADING + 'text-overlay-muted'}>
                Act {step.act}
              </div>
            )}
          <button
            onClick={() => window.overlay?.guideToggleStep(step.id)}
            title={clickThrough ? 'Enable interactive mode (hotkey) to click steps' : 'Click to toggle'}
            className={
              'mb-1 block w-full rounded-md px-2 py-1.5 text-left ' +
              (isCurrent
                ? 'border border-overlay-accent/60 bg-overlay-accent/10'
                : 'border border-transparent ' + (isDone ? '' : 'bg-black/20'))
            }
          >
            <div className="flex items-start gap-2">
              <span className={'shrink-0 text-xs ' + (isCurrent ? 'text-overlay-accent' : 'text-overlay-muted')}>
                {isDone ? '✓' : TYPE_ICONS[step.type]}
              </span>
              <div className="min-w-0">
                <div className={'text-xs leading-snug ' + (isDone ? 'text-overlay-muted line-through' : 'text-overlay-text')}>
                  {step.text}
                  {step.rewardHint && (
                    <Tag tone="ok" className="ml-1.5">
                      reward
                    </Tag>
                  )}
                </div>
                {isCurrent &&
                  step.hints?.map((hint, i) => (
                    <div key={i} className="mt-0.5 text-[10px] text-overlay-muted">
                      ↳ {hint}
                    </div>
                  ))}
              </div>
            </div>
          </button>
          </div>
        )
      })}

      {route && (
        <div className="mt-1 flex items-center justify-between px-1 text-[10px] text-overlay-muted">
          <span>
            {formatAccelerator(hotkeys.stepForward)} next · {formatAccelerator(hotkeys.stepBack)} back
          </span>
          <button className="hover:text-overlay-text" title="Clear progress" onClick={() => window.overlay?.guideReset()}>
            reset
          </button>
        </div>
      )}
    </>
  )
}

/** "a" or "an" — every class and ascendancy name starts with a plain letter, so
 *  the vowel test is enough (Assassin, Elementalist, Inquisitor, Occultist). */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}

// The socket-colour dot. Shared by the link rows and the to-do list so a gem
// looks the same wherever it turns up. Renders an empty box of the same size
// when the colour is unknown (gems.json failed to load), so nothing shifts.
function Pip({ gem, dim }: { gem?: ColoredGemBridge; dim?: boolean }): React.JSX.Element {
  const box =
    // 9px bold, the one exception to the 10px floor: the letter repeats the
    // colour for colour-blind eyes and must fit the dot. Black on red and
    // green, white on blue — black on blue was 3.5:1.
    'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold '
  // A letterless pip still carries a zero-width space: an empty inline-flex box
  // takes its baseline from its bottom edge instead of from text, which would
  // park white pips a few pixels below the lettered ones in the to-do list.
  if (!gem) return <span className={box}>{'\u200B'}</span>
  return (
    <span
      title={
        gem.unknown
          ? 'Colour unknown — this gem is not in the gem data'
          : gem.anyColor
            ? 'No attribute requirement — fits a socket of any colour'
            : undefined
      }
      className={
        box +
        PIP_CLASS[gem.color] +
        // An "any colour" gem gets a dashed ring: white on purpose, not white
        // for lack of data. Nothing else changes about the row.
        (gem.anyColor ? ' border border-dashed border-white/50 bg-transparent' : '') +
        (dim ? ' opacity-60' : '')
      }
    >
      {gem.color === 'W' ? '\u200B' : gem.color}
    </span>
  )
}

// The acquisition list's left column: what a gem costs you, and how many you
// need. Fixed width and right-aligned, so every gem name starts on one line and
// the price keeps a constant distance from the gem it belongs to.
/** "Mule — what this alt is for": one gem per character, picked from what a
 *  fresh alt of another class gets on the Twilight Strand. On by default
 *  (Momentum, else the first gem the build needs); "No mule" turns it off for
 *  this character — in a party, an alt may not be worth it. Its own row under
 *  the character line: a choice for the whole run, so outside the stage pages. */
// The open list is drawn by the OS, not inside the select: it inherits the
// select's colour on a light system background unless each option says
// otherwise — which is how "No mule" turned grey on grey.
const OPTION = 'bg-overlay-panel text-overlay-text'

function MulePicker({
  choice
}: {
  choice: { options: MuleOptionBridge[]; chosen: string | null }
}): React.JSX.Element {
  const chosen = choice.options.find((o) => o.gem === choice.chosen) ?? null
  const short = (gem: string): string => gem.replace(/ Support$/, '')
  return (
    <div className="mb-2 flex items-center gap-1.5 px-1 text-[10px]">
      <span className={'shrink-0 ' + (chosen ? 'text-mule' : 'text-overlay-muted')}>Mule</span>
      <select
        value={choice.chosen ?? ''}
        onChange={(e) => window.overlay?.setMule(e.target.value || null)}
        title={
          chosen
            ? `${muleInstruction(chosen.classes, chosen.how)} Per character — pick another gem, or "No mule".`
            : 'Not muling on this character: every gem comes from a quest or a vendor.'
        }
        className={
          'min-w-0 flex-1 truncate rounded border border-overlay-border bg-black/30 px-1 py-0.5 text-[10px] outline-none [color-scheme:dark] focus:border-overlay-accent ' +
          (chosen ? 'text-mule' : 'text-overlay-muted')
        }
      >
        {choice.options.map((o) => (
          <option key={o.gem} value={o.gem} className={OPTION}>
            {short(o.gem)} — {o.classes[0]}
            {o.classes.length > 1 ? ` +${o.classes.length - 1}` : ''}
          </option>
        ))}
        <option value="" className={OPTION}>
          No mule
        </option>
      </select>
    </div>
  )
}

function CostCell({
  cost,
  count,
  free,
  mule,
  muleHow,
  later
}: {
  cost?: string
  count?: number
  free?: boolean
  /** the classes whose level-1 alt hands this gem over — no price to put here */
  mule?: string[]
  muleHow?: MuleHow
  later?: boolean
}): React.JSX.Element {
  const n = count ?? 1
  // "Not now" is the readable grey, never transparency: faded grey fell to
  // 2.4:1, unreadable. The "lvl N" next to the gem says why it waits.
  const cls = 'text-right text-[10px] '
  const now = (tone: string): string => (later ? 'text-overlay-muted' : tone)

  if (mule?.length) {
    return (
      <span
        className={cls + now('text-mule')}
        title={muleInstruction(mule, muleHow)}
      >
        {n > 1 && `${n}× `}
        Mule
      </span>
    )
  }

  if (free) {
    // A quest hands out exactly ONE reward. Needing the gem twice means one is
    // free and the rest you buy or find — "2× free" would be a lie, and the old
    // ×2 chip next to the name read as if the quest gave you both.
    const extra = n - 1
    return (
      <span
        className={cls + now('text-ok')}
        title={
          extra > 0
            ? `The quest gives one — the other ${extra === 1 ? 'copy' : `${extra} copies`} you buy or find`
            : 'Free quest reward'
        }
      >
        Reward{extra > 0 && ` +${extra}`}
      </span>
    )
  }

  // No known price still says "buy" rather than leaving the cell blank — an
  // empty column would silently turn a purchase into an unlabelled row.
  const short = cost ? (COST_SHORT[cost] ?? cost) : 'buy'
  const tone = (cost && COST_TONE[cost]) || 'text-overlay-muted'
  const copies = n > 1 ? ` — and you need ${n} of them` : ''
  return (
    <span
      className={cls + now(tone)}
      title={cost ? `Costs ${cost}${copies}` : `Buy from a vendor${copies}`}
    >
      {n > 1 && `${n}× `}
      {short}
    </span>
  )
}

// The acquisition list's right column, and the same column on the link rows.
// LEFT-aligned on purpose: every entry opens with "A<N> ·", so those anchors
// line up down the list. Right-aligning would put them at a different x in
// every row — the raggedness this whole layout exists to remove. Truncated
// rather than wrapped, so a long quest name can't change a row's height.
function SourceCell({
  act,
  what,
  approx,
  tone,
  title,
  later
}: {
  act?: number
  what: string
  approx?: boolean
  /** overrides the muted default — muling is turquoise on both sides of the row
   *  so it stays obvious that this one isn't part of the shopping. */
  tone?: string
  title?: string
  later?: boolean
}): React.JSX.Element {
  const named = sourceName(what)
  const text = [act ? `A${act}` : null, named].filter(Boolean).join(' · ')
  return (
    <span
      title={
        title ??
        (named === what ? text : `${text} (${what})`) +
          (approx ? ' — general vendor, may show up earlier as a quest reward' : '')
      }
      className={
        'truncate text-[10px] ' + (later ? 'text-overlay-muted' : (tone ?? sourceTone(named)))
      }
    >
      {text}
      {approx && ' ≈'}
    </span>
  )
}

// One quest's reward gems. When several of your build's gems come from the same
// quest you can only pick ONE — the rest must be bought — so that's flagged
// loudly. Act + quest are shown once per group.
//
// A row renders as three bare cells (no wrapper element) so they land directly
// in the list's grid: the columns then line up across every row, not just
// within one. A "pick one" group is a box instead and spans all three.
function RewardGroupRow({
  group,
  comingUpAt,
  later
}: {
  group: RewardGroupBridge
  comingUpAt?: number
  later?: boolean
}): React.JSX.Element {
  const context = (e: AcquisitionEntryBridge): string =>
    e.fromLevel ? ` — for later (lvl ${e.fromLevel}+)` : ''

  if (!group.pickOne) {
    const e = group.gems[0]
    return (
      <>
        <CostCell free count={e.count} later={later} />
        <GemCell entry={e} comingUpAt={comingUpAt} later={later}>
          {context(e) && <span className="text-overlay-muted">{context(e)}</span>}
        </GemCell>
        <SourceCell act={group.act} what={group.quest ?? 'quest'} later={later} />
      </>
    )
  }
  // A choice, so it keeps its own box — but on the tab's columns, not its own:
  // `subgrid` borrows the parent's tracks, so the box's border and padding shift
  // its outer edges without moving the shared column lines. That's what keeps
  // the gems and the quest name lined up with the plain rows around it.
  const rest = group.buyRest
  return (
    <div
      className={
        // A pick for later keeps its box, in grey: the choice is real, just not
        // yet — and grey stays readable where transparency did not.
        'col-span-3 grid grid-cols-subgrid items-baseline gap-x-1.5 rounded border p-1.5 ' +
        (later ? 'border-overlay-border' : 'border-overlay-accent/40 bg-overlay-accent/5')
      }
    >
      <Tag tone={later ? 'muted' : 'gold'} className="col-span-2 mb-0.5 justify-self-start">
        Pick one, buy rest
      </Tag>
      <SourceCell act={group.act} what={group.quest ?? 'quest'} later={later} />
      {/* One price for the whole group, centred against the gems it covers: the
          quest gives one, so the rest is what you actually pay. */}
      {rest && (
        <span
          style={{ gridRow: `span ${group.gems.length}` }}
          title={`The quest gives one — the other ${rest.count === 1 ? 'copy costs' : `${rest.count} copies cost`}${rest.cost ? ` ${rest.cost} each` : ' vendor money'}`}
          className={
            'self-center text-right text-[10px] ' +
            ((!later && rest.cost && COST_TONE[rest.cost]) || 'text-overlay-muted')
          }
        >
          {rest.count}× {rest.cost ? (COST_SHORT[rest.cost] ?? rest.cost) : 'buy'}
        </span>
      )}
      {group.gems.map((e) => (
        <div
          key={e.gem}
          title={e.gem + context(e)}
          className={
            'col-span-2 col-start-2 flex items-baseline gap-1.5 text-xs ' +
            (e.fromLevel || later ? 'text-overlay-muted' : 'text-overlay-text')
          }
        >
          <Pip gem={e.colored} dim={later} />
          <span className="min-w-0 truncate">
            {e.gem}
            {context(e) && <span className="text-overlay-muted">{context(e)}</span>}
          </span>
        </div>
      ))}
      {/* Where "buy rest" actually happens. Every gem in here is filed as a
          quest reward — a quest is its earliest source — so none of them ever
          reached the shopping list, and the instruction had no address. */}
      {rest && (rest.npc || rest.partial) && (
        <div className="col-span-2 col-start-2 text-[10px] text-overlay-muted">
          ↳ the rest:{' '}
          {rest.npc ? (
            <span className={sourceTone(sourceName(rest.npc))}>
              {[rest.act ? `A${rest.act}` : null, sourceName(rest.npc)].filter(Boolean).join(' · ')}
            </span>
          ) : (
            <span title="No vendor we know of stocks them — a drop or a trade">nobody sells them</span>
          )}
          {rest.npc && rest.partial && (
            <span title="At least one of these isn't sold by any vendor in the gem data">
              {' '}
              · not all of them
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// The acquisition list's middle column: the pip, the gem, and whatever else
// belongs to the gem itself (when it becomes relevant, how to mule it). The pip
// is fixed-width, so the names line up under each other too.
function GemCell({
  entry: e,
  comingUpAt,
  later,
  children
}: {
  entry: AcquisitionEntryBridge
  comingUpAt?: number
  later?: boolean
  children?: React.ReactNode
}): React.JSX.Element {
  // One row for a whole quest pick: the gems stacked, one per line — "A or B"
  // on one line truncates to "A or…" in a narrow panel — and a line under
  // them that says which to buy.
  if (e.anyOf) {
    const n = e.count ?? 1
    return (
      <div
        title={`Only the ${n > 1 ? `${n} you didn't pick` : "one you didn't pick"} — the quest gave you one of these, and the overlay can't see your inventory.`}
        className={'flex min-w-0 flex-col text-xs ' + (later ? 'text-overlay-muted' : 'text-overlay-text')}
      >
        {e.anyOf.map((g) => (
          <span key={g.gem} className="flex min-w-0 items-baseline gap-1.5">
            <Pip gem={g.colored} dim={later} />
            <span className="min-w-0 truncate">{g.gem}</span>
          </span>
        ))}
        <span className="text-[10px] text-overlay-muted">
          ↳ {n > 1 ? `the ${n} you didn't pick` : "whichever you didn't pick"}
          {children}
        </span>
      </div>
    )
  }
  return (
    <div
      title={later ? 'Coming up — you’re a bit underlevelled for this yet' : undefined}
      className={
        'flex min-w-0 items-baseline gap-1.5 text-xs ' +
        (e.fromLevel || later ? 'text-overlay-muted' : 'text-overlay-text')
      }
    >
      <Pip gem={e.colored} dim={later} />
      {/* Truncated, never wrapped: "for later (lvl 62+)" is worth knowing but
          not worth a second line, least of all in a narrow panel. The full
          text is in the tooltip. */}
      <span className="min-w-0 truncate">
        {e.gem}
        {/* You may already own this one — it lost a quest choice, and nothing
            in the log says which of them you took. Marked rather than hidden:
            a gem you still need must not vanish, and one you have shouldn't
            read as an order to go and buy it. */}
        {e.fromPickOne && (
          <span
            className="ml-1 text-[10px] text-overlay-muted"
            title="Only if you didn't pick it — it was one of the choices at that quest, and the overlay can't see your inventory."
          >
            (if not picked)
          </span>
        )}
        {children}
        {comingUpAt != null && !e.fromLevel && (
          <span className="text-overlay-muted"> · lvl {comingUpAt}</span>
        )}
      </span>
    </div>
  )
}

// A single vendor purchase in the merged acquisition box — same three cells as a
// reward row, so buys and takes read as one list. The cost column carries the
// take-it-free vs. pay-for-it distinction that the old take/buy badges did,
// without spending a second column on it (owner: cost matters a lot).
//
// A gem another class starts with is the same row with both ends swapped out:
// "Mule" where the price would be, because there isn't one, and the class you
// roll where the vendor would be, because that is where you get it. Both in
// turquoise, so muling never reads as shopping.
function BuyRow({
  entry: e,
  comingUpAt,
  later
}: {
  entry: AcquisitionEntryBridge
  comingUpAt?: number
  later?: boolean
}): React.JSX.Element {
  const mule = e.mule?.length ? e.mule : undefined
  const cells = (
    <>
      <CostCell cost={e.cost} count={e.count} mule={mule} muleHow={e.muleHow} later={later} />
      <GemCell entry={e} comingUpAt={comingUpAt} later={later} />
      {mule ? (
        <SourceCell
          what={mule.join('/')}
          tone="text-mule"
          title={`Roll a level-1 ${mule.join(' or ')}, stash its starting gems, delete it. Otherwise ${e.npc ?? 'a vendor'}${e.act ? ` in Act ${e.act}` : ''} sells it${e.cost ? ` for ${e.cost}` : ''}.`}
          later={later}
        />
      ) : (
        <SourceCell act={e.act} what={e.npc ?? 'vendor'} approx={e.fallback} later={later} />
      )}
    </>
  )
  // The mule's line is tinted turquoise as a whole, like its line in the links
  // below (LINE_TONE). A subgrid, so the cells still sit on the plan's columns.
  return mule ? (
    <div className={'col-span-3 grid grid-cols-subgrid items-baseline gap-x-1.5 rounded-sm py-px ' + LINE_TONE.mule}>
      {cells}
    </div>
  ) : (
    cells
  )
}


// The build's links, on the tab's shared columns. The pip and the gem take the
// first two together — a link row has no price, and giving up the whole cost
// column to whitespace would cost the names a third of the panel — while the
// source sits in the same column as everywhere else, which is the point.
type LinkMark = 'thisAct' | 'notYet'

// How a link row reads against the act you've reached (see LinkMark in the
// engine). The state belongs to the whole line, never to one word in it:
// this act's gems get a gold-tinted line with a gold bar on its left edge (the
// Guide's current step reads the same way); "not yet" turns the line grey.
// NEW is separate and stacks with any of them: it says what changed since the
// previous stage, whatever the gem's act. Text colours stay with what they mean — the gem name
// white, the source in its category colour — so a Library gem in the act
// you're in is gold-lined AND violet, not one or the other. Never colour
// alone: the bar is a shape, and the tooltip says it in words.
//
// The mule and a starting gem colour their whole line too, in their own
// colour: turquoise for "another class's alt hands it over", green for "you
// start with it". Neither gets an act mark, so a line is only ever one of the
// three. The words in the source column ("Mule · Ranger", "✓ start") say the
// same without colour.
const LINE_TONE = {
  thisAct: 'bg-overlay-accent/10 shadow-[inset_2px_0_0_var(--color-overlay-accent)]',
  mule: 'bg-mule/10 shadow-[inset_2px_0_0_var(--color-mule)]',
  start: 'bg-ok/10 shadow-[inset_2px_0_0_var(--color-ok)]'
} as const

function lineTone(entry: AcquisitionEntryBridge | undefined, link: LinkMark | undefined): string {
  if (entry?.mule?.length) return LINE_TONE.mule
  if (entry?.starting) return LINE_TONE.start
  return link === 'thisAct' ? LINE_TONE.thisAct : ''
}
function linkMarkTitle(mark: LinkMark | undefined, act: number | undefined): string | undefined {
  if (mark === 'thisAct') return `From Act ${act} — the act you're in.`
  if (mark === 'notYet') return `Not yet — from Act ${act}.`
  return undefined
}

function SocketGroup({
  group,
  acq,
  marks,
  fresh
}: {
  group: ColoredSocketGroupBridge
  acq: Map<string, AcquisitionEntryBridge>
  marks: Record<string, LinkMark>
  /** gems the previous stage's links don't have — they wear NEW */
  fresh: ReadonlySet<string>
}): React.JSX.Element {
  return (
    <div className="col-span-3 mb-1.5 grid grid-cols-subgrid items-center gap-x-1.5 gap-y-px rounded-md border border-overlay-border/70 bg-black/20 px-0.5 py-1">
      {group.gems.map((gem, i) => {
        const entry = acq.get(gem.name.toLowerCase())
        const mark = sourceMark(entry)
        const link = marks[gem.name.toLowerCase()]
        const notYet = link === 'notYet'
        return (
          // One line, one subgrid: the tint and the bar span all of it, and the
          // columns still line up with every other row. Every line gets the
          // same padding, highlighted or not, so the names stay aligned.
          <div
            key={i}
            title={linkMarkTitle(link, entry?.act)}
            className={
              'col-span-3 grid grid-cols-subgrid items-center gap-x-1.5 rounded-sm px-1 py-px ' + lineTone(entry, link)
            }
          >
            <div className="col-span-2 flex min-w-0 items-center gap-1.5">
              <Pip gem={gem} dim={notYet} />
              <span className={'min-w-0 truncate text-xs ' + (notYet ? 'text-overlay-muted' : 'text-overlay-text')}>
                {gem.name}
                {fresh.has(gem.name.toLowerCase()) && (
                  <Tag tone="neutral" className="ml-1" title="Not in the previous stage's links — new with this stage">
                    new
                  </Tag>
                )}
                {/* Only a genuinely unrecognised gem is flagged. A gem with no
                    attribute requirement is fully known — marking it "?" made
                    the overlay look broken on Portal, Convocation and friends. */}
                {gem.unknown && (
                  <span className="ml-1 text-[10px] text-warn" title="not in the gem data — colour guessed">
                    ?
                  </span>
                )}
              </span>
            </div>
            {/* Always rendered, even when empty: a missing cell would pull the
                next row's gem into the source column. */}
            <span title={mark?.title} className={'truncate text-[10px] ' + (notYet ? 'text-overlay-muted' : (mark?.tone ?? ''))}>
              {mark?.label}
            </span>
          </div>
        )
      })}
      {group.note && <div className="col-span-3 mt-0.5 pl-4 text-[10px] text-overlay-muted">{group.note}</div>}
    </div>
  )
}

function GemBody(): React.JSX.Element {
  const { profile, guide } = useOverlayStore(
    useShallow((s) => ({ profile: s.profile, guide: s.guide }))
  )

  if (profile?.errors && profile.errors.length > 0 && !profile.activeStage) {
    return <ErrorBox title="Profile file problems:" errors={profile.errors} />
  }
  if (!profile || !profile.meta) {
    return <p className="px-1 text-xs text-overlay-muted">No build profile — point Settings → Build profile at your file.</p>
  }

  const stage = profile.activeStage
  const cursorStep = guide?.route?.steps.find((s) => s.id === guide.cursorStepId)
  const atReward = cursorStep?.rewardHint === true
  // Manual stage paging (◀/▶): the shown stage may differ from the live one.
  const { stageCount, viewedIndex, liveIndex } = profile
  const onLiveStage = viewedIndex === liveIndex
  const canPrev = viewedIndex > 0
  const canNext = viewedIndex >= 0 && viewedIndex < stageCount - 1
  // One merged, chronologically-ordered acquisition list (rewards + buys),
  // reward-first on ties (owner: don't buy what you can take free).
  const plan = profile.acquisitions?.plan ?? []
  // gem (lowercased) -> its acquisition entry, for the inline tags on link rows.
  const acqByGem = new Map<string, AcquisitionEntryBridge>()
  for (const e of [
    ...(profile.acquisitions?.rewards ?? []),
    ...(profile.acquisitions?.purchases ?? []),
    ...(profile.acquisitions?.other ?? [])
  ]) {
    acqByGem.set(e.gem.toLowerCase(), e)
  }
  const freshGems = new Set(profile.acquisitions?.newGems ?? [])

  return (
    <>
      {profile.errors.length > 0 && <ErrorBox title="Profile file problems:" errors={profile.errors} />}
      {/* Without gem data every gem is colourless and sourceless — that looks
          like missing curation rather than a broken install, so name it. */}
      {profile.gemDataError && (
        <ErrorBox
          title="Gem data failed to load — colours and sources are unavailable:"
          errors={[profile.gemDataError, 'Reinstalling the overlay should fix this.']}
        />
      )}

      <div className="mb-2 flex items-center gap-2 px-1 text-[11px] text-overlay-muted">
        <span className="text-overlay-text">{profile.meta.class}</span>
        {profile.meta.ascendancy && <span>· {profile.meta.ascendancy}</span>}
        {profile.level != null && <span>· level {profile.level}</span>}
      </div>
      {/* Per character, not per stage: it sits with the character line, above
          the stage navigation, so paging through stages never moves it. */}
      {profile.muleChoice && <MulePicker choice={profile.muleChoice} />}

      {/* Only fires across base classes now — an Elementalist on a Witch build
          is the same character, ascended. "an Assassin" needs its own article. */}
      {profile.classMismatch && (
        <div className="mb-2 rounded-md border border-warn/40 bg-warn/10 p-1.5 text-[10px] text-warn">
          <span aria-hidden>⚠ </span>Tracked character is {article(profile.classMismatch)} {profile.classMismatch}, but this profile is
          for a {profile.meta.class}. Wrong profile loaded?
        </div>
      )}
      {/* Turquoise like every "Mule" in this tab: it's the same plan, not a
          problem. And it says what happens next, so nobody goes looking for
          a button to switch back. */}
      {profile.muling && (
        <div className="mb-2 rounded-md border border-mule/30 bg-mule/10 p-1.5 text-[10px] text-mule">
          Muling on {article(profile.muling)} {profile.muling}? Stash its starting gems, then go back to your{' '}
          {profile.meta.class} — the overlay follows on its next level-up.
        </div>
      )}

      {/* Stage navigation sits ABOVE the acquisition list so it keeps a fixed
          position — a longer or shorter buy list must not move the controls. */}
      {stage &&
        (stageCount > 1 ? (
          <div className="mb-1 flex items-center gap-1 px-1">
            <button
              disabled={!canPrev}
              onClick={() => window.overlay?.stageStep(-1)}
              title="Previous stage"
              aria-label="Previous stage"
              className="shrink-0 rounded px-1 text-xs text-overlay-muted enabled:hover:text-overlay-text disabled:opacity-40"
            >
              ◀
            </button>
            <span className={'flex-1 truncate text-center ' + HEADING + 'text-overlay-muted'}>
              {stage.label}
            </span>
            <button
              disabled={!canNext}
              onClick={() => window.overlay?.stageStep(1)}
              title="Next stage"
              aria-label="Next stage"
              className="shrink-0 rounded px-1 text-xs text-overlay-muted enabled:hover:text-overlay-text disabled:opacity-40"
            >
              ▶
            </button>
          </div>
        ) : (
          <div className={'mb-1 px-1 ' + HEADING + 'text-overlay-muted'}>
            {stage.label}
          </div>
        ))}
      {stage && !onLiveStage && (
        <button
          onClick={() => window.overlay?.stageToLive()}
          title="Return to the stage for your current level"
          className="mb-1.5 flex w-full items-center justify-center gap-1 rounded bg-white/10 px-2 py-1 text-[10px] text-overlay-text hover:bg-white/15"
        >
          Viewing {viewedIndex < liveIndex ? 'an earlier' : 'a later'} stage
          {profile.level != null ? ` · you're level ${profile.level}` : ''} — ▸ jump to current
        </button>
      )}

      {/* One column system for the whole tab: cost, gem, source. Every list is a
          `subgrid` inside it, which is what makes the alignment structural
          instead of arithmetic — a box borrows these tracks, so its own border
          and padding move its outer edges without moving the shared column
          lines. Nesting them (the "pick one" box inside the plan box) stays
          aligned for the same reason. Anything that isn't a row spans all
          three. */}
      <div className="grid grid-cols-[4rem_1fr_6.5rem] items-baseline gap-x-1.5">
        {plan.length > 0 && (
          <div
            className={
              'col-span-3 mb-2 grid grid-cols-subgrid items-baseline gap-x-1.5 gap-y-1.5 rounded-md border p-2 ' +
              (atReward ? 'border-overlay-accent/50 bg-overlay-accent/10' : 'border-overlay-border/60 bg-black/20')
            }
          >
            <div
              className={
                'col-span-3 ' + HEADING +
                (atReward ? 'text-overlay-accent' : 'text-overlay-muted')
              }
            >
              Get these gems{atReward ? ' — take rewards now' : ''}
            </div>
            {/* Rows render bare cells into this grid, so the columns line up
                across every row. Dimming a "later" row happens per cell: a
                wrapper element here would become a grid item and break them. */}
            {plan.map((item, i) => {
              // A heading each time the shopping stop changes, so what you pick
              // up in one visit reads as one block. A vendor's stock grows with
              // each quest, so the same NPC can head two blocks — that's two
              // trips, not a duplicate.
              const stop = item.kind === 'buy' ? item.stop : undefined
              const prev = plan[i - 1]
              const prevStop = prev?.kind === 'buy' ? prev.stop : undefined
              return (
                <Fragment key={i}>
                  {/* No heading for the mule: the Mule picker right above says
                      it already, and a heading made the rewards after it read
                      as part of the mule trip. */}
                  {stop && stop.key !== 'mule' && stop.key !== prevStop?.key && (
                    <div
                      className={
                        'col-span-3 mt-0.5 ' + HEADING +
                        (stop.npc && !item.later ? sourceTone(sourceName(stop.npc)) : 'text-overlay-muted')
                      }
                    >
                      {stop.npc
                        ? [stop.act ? `A${stop.act}` : null, sourceName(stop.npc)]
                            .filter(Boolean)
                            .join(' · ')
                        : stop.label}
                    </div>
                  )}
                  {item.kind === 'reward' ? (
                    <RewardGroupRow
                      group={item.group}
                      comingUpAt={item.later ? item.atLevel : undefined}
                      later={item.later}
                    />
                  ) : (
                    <BuyRow
                      entry={item.entry}
                      comingUpAt={item.later ? item.atLevel : undefined}
                      later={item.later}
                    />
                  )}
                </Fragment>
              )
            })}
            {plan.some((it) => it.kind === 'buy' && it.entry.fallback) && (
              <p className="col-span-3 text-[10px] text-overlay-muted">
                ≈ general vendor: Siosa (Act 3, after the Library) / Lilly Roth (Act 6+) sell most
                gems; you may find it earlier as a quest reward.
              </p>
            )}
          </div>
        )}

        {stage ? (
          <>
            {stage.groups.map((group, i) => (
              <SocketGroup
                key={i}
                group={group}
                acq={acqByGem}
                marks={profile.acquisitions?.linkMarks ?? {}}
                fresh={freshGems}
              />
            ))}
            {stage.note && (
              <div className="col-span-3 mb-2 px-1 text-[10px] text-overlay-muted">{stage.note}</div>
            )}
          </>
        ) : (
          <p className="col-span-3 px-1 text-xs text-overlay-muted">No stage for the current level.</p>
        )}
      </div>

      {profile.nextStage && (
        <div className="mt-2 px-1 text-[10px] text-overlay-muted">
          From level {profile.nextStage.range[0]}: {profile.nextStage.label}
        </div>
      )}
    </>
  )
}
