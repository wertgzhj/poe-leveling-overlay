import { Fragment, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useOverlayStore } from '../stores/overlayStore'
import { formatAccelerator } from '../lib/accelerator'
import { UpdateBanner } from './UpdateBanner'
import { VersionBadge } from './VersionBadge'

// Main overlay panel (guide + gems) with a shared chrome and a tab switch.
// Steps/stage auto-advance from the log; interacting needs interactive mode
// (Ctrl+Shift+C) while forward/back hotkeys work regardless.

const TYPE_ICONS: Record<StepTypeBridge, string> = {
  quest: '❗',
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
  R: 'bg-red-500',
  G: 'bg-green-500',
  B: 'bg-blue-600',
  W: 'bg-white/30'
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

// One hue, rising intensity: the pricier the gem, the brighter the gold. A ramp
// rather than a palette — "this one actually costs something" reads at a glance
// without having to learn five colours, and the word carries the meaning anyway.
const COST_TONE: Record<string, string> = {
  Wisdom: 'text-overlay-muted',
  Transmutation: 'text-overlay-accent/60',
  Alteration: 'text-overlay-accent/75',
  Chance: 'text-overlay-accent/90',
  Alchemy: 'text-overlay-accent'
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
  const [flash, setFlash] = useState<string | null>(null)
  const onClick = (): void => {
    void window.overlay?.detectCharacter().then((found) => {
      setFlash(found ? `✓ ${found.name}` : 'no level-up yet')
      window.setTimeout(() => setFlash(null), 3000)
    })
  }
  return (
    <button
      onClick={onClick}
      title="Detect the character you're logged in as (from your most recent level-up)"
      className="no-drag max-w-[45%] shrink-0 truncate rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-overlay-muted hover:text-overlay-text"
    >
      {flash ?? '⟳ character'}
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
      className={
        'shrink-0 rounded px-1 text-[10px] font-medium ' +
        (under ? 'bg-red-400/15 text-red-300' : 'bg-white/10 text-overlay-muted')
      }
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
                className="no-drag rounded bg-overlay-accent/20 px-2 py-0.5 text-[11px] text-overlay-accent"
                onClick={() => window.overlay?.exitMoveMode()}
              >
                Done
              </button>
            )}
            {isDev && (
              <button
                className="no-drag rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-overlay-muted hover:text-overlay-text"
                title="Log events (dev)"
                onClick={() => patch({ debugOpen: true })}
              >
                🐞
              </button>
            )}
            <button
              className="no-drag rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-overlay-muted hover:text-overlay-text"
              title="Settings"
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
                  ? 'bg-amber-400'
                  : 'bg-emerald-400')
            }
          />
          <span className={'min-w-0 flex-1 truncate' + (languageMismatch ? ' text-amber-300' : '')}>
            {trackerLine(logStatus, tracked, languageMismatch)}
          </span>
          {zoneFit && !languageMismatch && <ZoneFitTag fit={zoneFit} />}
          <DetectCharButton />
        </div>

        <TrialHint />

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
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
        'no-drag rounded-t px-2.5 py-1 text-[11px] font-medium ' +
        (active ? 'bg-overlay-accent/15 text-overlay-accent' : 'text-overlay-muted hover:text-overlay-text')
      }
    >
      {label}
      {badge && <span className="ml-1 text-[10px] text-overlay-muted">{badge}</span>}
      {flag && <span className="ml-1 text-red-400">•</span>}
    </button>
  )
}

// The trials notice bar, shown on every tab. Two things can claim it, and a
// finished Labyrinth outranks a trial you're standing in: the trial will still
// be there in a minute, whereas "you can run the Labyrinth now" is the thing
// you'd otherwise miss for an hour. Only one bar, so it never stacks.
function TrialHint(): React.JSX.Element | null {
  const trials = useOverlayStore((s) => s.trials)
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
    <div className="flex items-center gap-2 border-b border-amber-400/40 bg-amber-400/10 px-3 py-1.5">
      <span className="text-amber-300">△</span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-amber-200">
        Trial of Ascendancy in this zone — don&apos;t leave without it.
      </span>
      <button
        className="shrink-0 rounded bg-amber-400/20 px-2 py-0.5 text-[10px] font-medium text-amber-200 hover:bg-amber-400/30"
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
              <span className="text-[10px] font-semibold uppercase tracking-wider text-overlay-muted/80">
                {LAB_LABEL[t.lab]}
              </span>
              <span className="text-[10px] text-overlay-muted/70">
                {tally?.done}/{tally?.total}
              </span>
            </div>
          )}
          <button
            onClick={() => window.overlay?.trialsToggle(t.id)}
            className={
              'mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ' +
              (t.seen ? 'opacity-50' : 'bg-black/20') +
              (here && !t.seen ? ' ring-1 ring-amber-400/50' : '')
            }
          >
            <span
              className={
                'shrink-0 text-xs ' +
                (t.seen ? 'text-overlay-accent' : here ? 'text-amber-300' : 'text-overlay-muted')
              }
            >
              {t.seen ? '✓' : '△'}
            </span>
            <div className="min-w-0">
              <div className={'text-xs ' + (t.seen ? 'text-overlay-muted line-through' : 'text-overlay-text')}>
                {t.zone}
                {here && !t.seen && <span className="ml-1.5 text-[9px] text-amber-300">you are here</span>}
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
    <div className="mb-2 rounded-md border border-red-400/40 bg-red-400/10 p-2 text-[11px] text-red-300">
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
        className="mt-1.5 rounded bg-overlay-accent/15 px-2 py-0.5 text-[10px] text-overlay-accent hover:bg-overlay-accent/25"
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
              <div className="mb-1 mt-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-overlay-muted/70">
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
                : 'border border-transparent ' + (isDone ? 'opacity-45' : 'bg-black/20'))
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
                    <span className="ml-1.5 rounded bg-overlay-accent/20 px-1 py-px text-[9px] text-overlay-accent">
                      reward
                    </span>
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

// The acquisition list's left column: what a gem costs you, and how many you
// need. Fixed width and right-aligned, so every gem name starts on one line and
// the price keeps a constant distance from the gem it belongs to.
function CostCell({
  cost,
  count,
  free,
  later
}: {
  cost?: string
  count?: number
  free?: boolean
  later?: boolean
}): React.JSX.Element {
  const n = count ?? 1
  const cls = 'text-right text-[10px] ' + (later ? 'opacity-50 ' : '')

  if (free) {
    // A quest hands out exactly ONE reward. Needing the gem twice means one is
    // free and the rest you buy or find — "2× free" would be a lie, and the old
    // ×2 chip next to the name read as if the quest gave you both.
    const extra = n - 1
    return (
      <span
        className={cls + 'text-emerald-400/90'}
        title={
          extra > 0
            ? `The quest gives one — the other ${extra === 1 ? 'copy' : `${extra} copies`} you buy or find`
            : 'Free quest reward'
        }
      >
        free{extra > 0 && ` +${extra}`}
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
      className={cls + tone}
      title={cost ? `Costs ${cost}${copies} (price is provisional)` : `Buy from a vendor${copies}`}
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
  later
}: {
  act?: number
  what: string
  approx?: boolean
  later?: boolean
}): React.JSX.Element {
  const text = [act ? `A${act}` : null, what].filter(Boolean).join(' · ')
  return (
    <span
      title={text + (approx ? ' — general vendor, may show up earlier as a quest reward' : '')}
      className={'truncate text-[10px] text-overlay-muted' + (later ? ' opacity-50' : '')}
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
        <span
          title={later ? 'Coming up — you’re a bit underlevelled for this yet' : undefined}
          className={
            'min-w-0 text-xs ' +
            (e.fromLevel ? 'text-overlay-muted' : 'text-overlay-text') +
            (later ? ' opacity-50' : '')
          }
        >
          {e.gem}
          {context(e) && <span className="text-overlay-muted/80">{context(e)}</span>}
          {comingUpAt != null && !e.fromLevel && (
            <span className="text-overlay-muted"> · lvl {comingUpAt}</span>
          )}
        </span>
        <SourceCell act={group.act} what={group.quest ?? 'quest'} later={later} />
      </>
    )
  }
  const where = [group.act ? `Act ${group.act}` : null, group.quest].filter(Boolean).join(' · ')
  return (
    <div
      className={
        'col-span-3 rounded border border-amber-400/30 bg-amber-400/5 p-1.5' +
        (later ? ' opacity-50' : '')
      }
    >
      <div className="mb-0.5 flex items-center gap-1.5">
        <span className="rounded bg-amber-400/20 px-1 py-px text-[9px] font-bold uppercase tracking-wider text-amber-300">
          Pick one
        </span>
        <span className="text-[10px] text-overlay-muted">{where} — take one, buy the rest</span>
      </div>
      {group.gems.map((e) => (
        <div key={e.gem} className={'pl-1 text-xs ' + (e.fromLevel ? 'text-overlay-muted' : 'text-overlay-text')}>
          • {e.gem}
          {context(e) && <span className="text-overlay-muted/80">{context(e)}</span>}
        </div>
      ))}
    </div>
  )
}

// A single vendor purchase in the merged acquisition box — same three cells as a
// reward row, so buys and takes read as one list. The cost column carries the
// take-it-free vs. pay-for-it distinction that the old take/buy badges did,
// without spending a second column on it (owner: cost matters a lot).
function BuyRow({
  entry: e,
  comingUpAt,
  later
}: {
  entry: AcquisitionEntryBridge
  comingUpAt?: number
  later?: boolean
}): React.JSX.Element {
  return (
    <>
      <CostCell cost={e.cost} count={e.count} later={later} />
      <span
        title={later ? 'Coming up — you’re a bit underlevelled for this yet' : undefined}
        className={'min-w-0 text-xs text-overlay-text' + (later ? ' opacity-50' : '')}
      >
        {e.gem}
        {comingUpAt != null && <span className="text-overlay-muted"> · lvl {comingUpAt}</span>}
        {e.mule && e.mule.length > 0 && (
          <span
            className="text-sky-300/90"
            title={`A level-1 ${e.mule[0]} starts with this gem — roll a mule, stash it, delete the mule (free)`}
          >
            {' · mule a '}
            {e.mule.join('/')}
          </span>
        )}
      </span>
      <SourceCell act={e.act} what={e.npc ?? 'vendor'} approx={e.fallback} later={later} />
    </>
  )
}

/**
 * Short "where it comes from" tag for a gem line (sources visible right at the
 * links, not only in the lists). Same shape as the acquisition list's source
 * column — "A<N> · where" — so both share one left edge and one width.
 *
 * The full story (quest name in full, price, note) lives in the tooltip. In the
 * row itself it was a third variable-width thing competing for the tightest
 * cell on screen, and it is the reason the right-hand side used to jump between
 * "✓ start" and "🎁 A1 Enemy at the Gate".
 */
function sourceMark(
  e: AcquisitionEntryBridge | undefined
): { label: string; title: string; starting: boolean } | null {
  if (!e) return null
  if (e.starting) return { label: '✓ start', title: 'You start with this gem', starting: true }
  const act = e.act ? `A${e.act}` : null
  const inAct = e.act ? ` in Act ${e.act}` : ''
  if (e.bucket === 'reward') {
    const quest = e.quest ?? 'quest'
    return {
      label: [act, quest].filter(Boolean).join(' · '),
      title: `Free quest reward${inAct}: ${quest}`,
      starting: false
    }
  }
  if (e.bucket === 'purchase') {
    const npc = e.npc ?? 'vendor'
    return {
      label: [act, npc].filter(Boolean).join(' · '),
      title:
        `Buy from ${npc}${inAct}${e.cost ? ` · ${e.cost}` : ''}` +
        (e.fallback ? ' — general vendor, may show up earlier as a quest reward' : ''),
      starting: false
    }
  }
  const note = e.note ?? 'drop/trade'
  return { label: note, title: note, starting: false }
}

// The build's links. Same grid as the acquisition list above, and deliberately
// the same source-column width: one vertical line runs down the whole tab
// instead of two independently ragged edges.
function SocketGroup({
  group,
  acq
}: {
  group: ColoredSocketGroupBridge
  acq: Map<string, AcquisitionEntryBridge>
}): React.JSX.Element {
  return (
    <div className="mb-1.5 grid grid-cols-[0.875rem_1fr_6.5rem] items-center gap-x-1.5 rounded-md border border-overlay-border/70 bg-black/20 p-1.5">
      {group.gems.map((gem, i) => {
        const mark = sourceMark(acq.get(gem.name.toLowerCase()))
        return (
          <Fragment key={i}>
            <span
              title={
                gem.unknown
                  ? 'Colour unknown — this gem is not in the gem data'
                  : gem.anyColor
                    ? 'No attribute requirement — fits a socket of any colour'
                    : undefined
              }
              className={
                'inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold text-black/80 ' +
                PIP_CLASS[gem.color] +
                // An "any colour" gem gets a dashed ring: white on purpose, not
                // white for lack of data. Nothing else changes about the row.
                (gem.anyColor ? ' border border-dashed border-white/50 bg-transparent' : '')
              }
            >
              {gem.color === 'W' ? '' : gem.color}
            </span>
            <span className="min-w-0 truncate text-xs text-overlay-text">
              {gem.name}
              {/* Only a genuinely unrecognised gem is flagged. A gem with no
                  attribute requirement is fully known — marking it "?" made the
                  overlay look broken on Portal, Convocation and friends. */}
              {gem.unknown && (
                <span className="ml-1 text-[9px] text-amber-400/80" title="not in the gem data — colour guessed">
                  ?
                </span>
              )}
            </span>
            {/* Always rendered, even when empty: a missing cell would pull the
                next row's pip into the source column. */}
            <span
              title={mark?.title}
              className={
                'truncate text-[9px] ' + (mark?.starting ? 'text-emerald-400/90' : 'text-overlay-muted')
              }
            >
              {mark?.label}
            </span>
          </Fragment>
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

      {profile.classMismatch && (
        <div className="mb-2 rounded-md border border-amber-400/40 bg-amber-400/10 p-1.5 text-[10px] text-amber-300">
          Tracked character is a {profile.classMismatch}, but this profile is for a {profile.meta.class}. Wrong
          profile loaded?
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
              className="shrink-0 rounded px-1 text-xs text-overlay-muted enabled:hover:text-overlay-text disabled:opacity-25"
            >
              ◀
            </button>
            <span className="flex-1 truncate text-center text-[11px] font-semibold uppercase tracking-wider text-overlay-muted">
              {stage.label}
            </span>
            <button
              disabled={!canNext}
              onClick={() => window.overlay?.stageStep(1)}
              title="Next stage"
              className="shrink-0 rounded px-1 text-xs text-overlay-muted enabled:hover:text-overlay-text disabled:opacity-25"
            >
              ▶
            </button>
          </div>
        ) : (
          <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-overlay-muted">
            {stage.label}
          </div>
        ))}
      {stage && !onLiveStage && (
        <button
          onClick={() => window.overlay?.stageToLive()}
          title="Return to the stage for your current level"
          className="mb-1.5 flex w-full items-center justify-center gap-1 rounded bg-amber-400/10 px-2 py-1 text-[10px] text-amber-200 hover:bg-amber-400/20"
        >
          Viewing {viewedIndex < liveIndex ? 'an earlier' : 'a later'} stage
          {profile.level != null ? ` · you're level ${profile.level}` : ''} — ▸ jump to current
        </button>
      )}

      {plan.length > 0 && (
        <div
          className={
            'mb-2 rounded-md border p-2 ' +
            (atReward ? 'border-overlay-accent/50 bg-overlay-accent/10' : 'border-overlay-border/60 bg-black/20')
          }
        >
          <div
            className={
              'mb-1.5 text-[10px] font-semibold uppercase tracking-wider ' +
              (atReward ? 'text-overlay-accent' : 'text-overlay-muted')
            }
          >
            Get these gems{atReward ? ' — take rewards now' : ''}
          </div>
          {/* Three fixed columns — cost, gem, source — with the rows rendering
              bare cells into this grid. The source column is the same width as
              the one on the link rows below, so the tab reads down a single
              line. Dimming a "later" row happens per cell: a wrapper element
              here would become a grid item and break the columns. */}
          <div className="grid grid-cols-[3.5rem_1fr_6.5rem] items-baseline gap-x-1.5 gap-y-1.5">
            {plan.map((item, i) =>
              item.kind === 'reward' ? (
                <RewardGroupRow
                  key={i}
                  group={item.group}
                  comingUpAt={item.later ? item.atLevel : undefined}
                  later={item.later}
                />
              ) : (
                <BuyRow
                  key={i}
                  entry={item.entry}
                  comingUpAt={item.later ? item.atLevel : undefined}
                  later={item.later}
                />
              )
            )}
          </div>
          {plan.some((it) => it.kind === 'buy' && it.entry.fallback) && (
            <p className="mt-1.5 text-[10px] text-overlay-muted">
              ≈ general vendor: Siosa (Act 3, after the Library) / Lilly Roth (Act 6+) sell most
              gems; you may find it earlier as a quest reward.
            </p>
          )}
        </div>
      )}

      {stage ? (
        <>
          {stage.groups.map((group, i) => (
            <SocketGroup key={i} group={group} acq={acqByGem} />
          ))}
          {stage.note && <div className="mb-2 px-1 text-[10px] text-overlay-muted">{stage.note}</div>}
        </>
      ) : (
        <p className="px-1 text-xs text-overlay-muted">No stage for the current level.</p>
      )}

      {profile.nextStage && (
        <div className="mt-2 px-1 text-[10px] text-overlay-muted">
          From level {profile.nextStage.range[0]}: {profile.nextStage.label}
        </div>
      )}
    </>
  )
}
