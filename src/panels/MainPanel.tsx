import { useOverlayStore } from '../stores/overlayStore'
import { formatAccelerator } from '../lib/accelerator'
import { UpdateBanner } from './UpdateBanner'
import { VersionBadge } from './VersionBadge'

// Main overlay panel (P2 guide + P3 gems) with a shared chrome and a tab switch.
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

// Distinct hues + the attribute letter inside each pip, so red/green/blue are
// unambiguous even when the green/blue are hard to tell apart (owner feedback,
// and colour-blind friendly). Green = true green (not emerald), blue = deep blue.
const PIP_CLASS: Record<SocketColorBridge, string> = {
  R: 'bg-red-500',
  G: 'bg-green-500',
  B: 'bg-blue-600',
  W: 'bg-white/30'
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

function trackerLine(
  logStatus: WatcherStatusBridge | null,
  tracked: TrackerStateBridge | null
): string {
  if (logStatus?.state !== 'watching') {
    if (logStatus?.state === 'missing') return 'Client.txt not found — check Settings'
    if (logStatus?.state === 'error') return 'Log read error — see Settings'
    return 'Set the Client.txt path in Settings to enable tracking'
  }
  const zone = tracked?.area?.name ?? 'zone unknown'
  const char =
    tracked?.character != null
      ? `${tracked.character}${tracked.level != null ? ` · lvl ${tracked.level}` : ''}`
      : 'waiting for a level-up'
  return `${zone} — ${char}`
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
    patch
  } = useOverlayStore()

  if (!visible) return <div />

  const currentAct = guide?.route?.steps[guide.cursorIndex]?.act
  const guideTitle = guide?.route
    ? currentAct
      ? `Act ${currentAct}`
      : 'Campaign'
    : 'PoE Leveling Overlay'
  const title =
    tab === 'gems'
      ? (profile?.meta?.name ?? 'Build')
      : tab === 'trials'
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

        {/* Tab switch */}
        <div className="flex gap-1 px-2">
          <Tab label="Guide" active={tab === 'guide'} flag={guideHasErrors} onClick={() => patch({ tab: 'guide' })} />
          <Tab label="Gems" active={tab === 'gems'} flag={profileHasErrors} onClick={() => patch({ tab: 'gems' })} />
          <Tab label="Trials" badge={trialsBadge} active={tab === 'trials'} onClick={() => patch({ tab: 'trials' })} />
        </div>

        <div className="mt-1 flex items-center gap-1.5 border-y border-overlay-border/60 bg-black/20 px-3 py-1 text-[11px] text-overlay-muted">
          <span
            className={
              'inline-block h-1.5 w-1.5 shrink-0 rounded-full ' +
              (logStatus?.state === 'watching' ? 'bg-emerald-400' : 'bg-white/25')
            }
          />
          <span className="truncate">{trackerLine(logStatus, tracked)}</span>
        </div>

        <TrialHint />

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {tab === 'guide' && <GuideBody />}
          {tab === 'gems' && <GemBody />}
          {tab === 'trials' && <TrialsBody />}
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

// Shown on every tab while the player stands in a zone that contains an
// uncompleted Trial of Ascendancy — the trial is NOT auto-checked (you can walk
// a zone without doing it); completing is one click here or on the Trials tab.
function TrialHint(): React.JSX.Element | null {
  const trials = useOverlayStore((s) => s.trials)
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
  const { trials } = useOverlayStore()
  if (!trials) return <p className="px-1 text-xs text-overlay-muted">Loading…</p>

  return (
    <>
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[11px] text-overlay-muted">
          Normal Labyrinth · {trials.seenCount}/{trials.total} trials
        </span>
        <button
          className="text-[10px] text-overlay-muted hover:text-overlay-text"
          title="Clear trials for this character"
          onClick={() => window.overlay?.trialsReset()}
        >
          reset
        </button>
      </div>
      {trials.trials.map((t) => {
        const here = t.id === trials.currentZoneTrialId
        return (
          <button
            key={t.id}
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
        )
      })}
      <p className="mt-1 px-1 text-[10px] text-overlay-muted">
        Entering a trial&apos;s zone shows a hint — click the trial (or the hint&apos;s Done button)
        once you actually complete it. All six unlock the Labyrinth.
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

function GuideBody(): React.JSX.Element {
  const { guide, clickThrough, hotkeys } = useOverlayStore()
  const route = guide?.route ?? null
  const done = new Set(guide?.doneIds ?? [])
  const cursor = guide?.cursorIndex ?? 0
  const steps = route?.steps ?? []
  const start = Math.max(0, cursor - 1)
  const visibleSteps = steps.slice(start, cursor + 5)

  return (
    <>
      {guide?.errors && guide.errors.length > 0 && (
        <ErrorBox title="Route file problems:" errors={guide.errors} />
      )}
      {!route && (!guide || guide.errors.length === 0) && (
        <p className="px-1 text-xs text-overlay-muted">Loading route…</p>
      )}
      {route && cursor >= steps.length && (
        <p className="px-1 text-xs text-overlay-accent">
          All steps done — refine any act in data/campaign/act&lt;N&gt;.json.
        </p>
      )}

      {visibleSteps.map((step, vi) => {
        const idx = steps.indexOf(step)
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

// One quest's reward gems. When several of your build's gems come from the same
// quest you can only pick ONE — the rest must be bought — so that's flagged
// loudly. Act + quest are shown once per group (owner feedback).
function RewardGroupRow({ group }: { group: RewardGroupBridge }): React.JSX.Element {
  const context = (e: AcquisitionEntryBridge): string =>
    e.fromLevel ? ` — for later (lvl ${e.fromLevel}+)` : ''
  const where = [group.act ? `Act ${group.act}` : null, group.quest].filter(Boolean).join(' · ')

  if (!group.pickOne) {
    const e = group.gems[0]
    return (
      <div className={'text-xs ' + (e.fromLevel ? 'text-overlay-muted' : 'text-overlay-text')}>
        {e.gem}
        {where && <span className="text-overlay-muted"> · {where}</span>}
        {context(e) && <span className="text-overlay-muted/80">{context(e)}</span>}
      </div>
    )
  }
  return (
    <div className="rounded border border-amber-400/30 bg-amber-400/5 p-1.5">
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

/** Short "where it comes from" tag for a gem line (owner feedback: sources
 *  visible right at the links, not only in the lists). */
function sourceTag(e: AcquisitionEntryBridge | undefined): string | null {
  if (!e) return null
  if (e.starting) return '✓ start'
  if (e.bucket === 'reward') return `🎁${e.act ? ` A${e.act}` : ''} ${e.quest ?? 'quest'}`
  if (e.bucket === 'purchase') return `${e.npc ?? 'vendor'}${e.act ? ` A${e.act}` : ''}${e.fallback ? ' ≈' : ''}`
  return e.note ?? 'drop/trade'
}

function SocketGroup({
  group,
  acq
}: {
  group: ColoredSocketGroupBridge
  acq: Map<string, AcquisitionEntryBridge>
}): React.JSX.Element {
  return (
    <div className="mb-1.5 rounded-md border border-overlay-border/70 bg-black/20 p-1.5">
      {group.gems.map((gem, i) => {
        const entry = acq.get(gem.name.toLowerCase())
        const tag = sourceTag(entry)
        return (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <span
              className={
                'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-black/80 ' +
                PIP_CLASS[gem.color]
              }
            >
              {gem.color === 'W' ? '' : gem.color}
            </span>
            <span className="min-w-0 truncate text-overlay-text">{gem.name}</span>
            {gem.unknown && (
              <span className="text-[9px] text-amber-400/80" title="not in gems.json — colour guessed">?</span>
            )}
            {tag && (
              <span
                className={
                  'ml-auto shrink-0 pl-2 text-[9px] ' +
                  (entry?.starting ? 'text-emerald-400/90' : 'text-overlay-muted')
                }
              >
                {tag}
              </span>
            )}
          </div>
        )
      })}
      {group.note && <div className="mt-0.5 pl-4 text-[10px] text-overlay-muted">{group.note}</div>}
    </div>
  )
}

function GemBody(): React.JSX.Element {
  const { profile, guide } = useOverlayStore()

  if (profile?.errors && profile.errors.length > 0 && !profile.activeStage) {
    return <ErrorBox title="Profile file problems:" errors={profile.errors} />
  }
  if (!profile || !profile.meta) {
    return <p className="px-1 text-xs text-overlay-muted">No build profile — point Settings → Build profile at your file.</p>
  }

  const stage = profile.activeStage
  const cursorStep = guide?.route?.steps.find((s) => s.id === guide.cursorStepId)
  const atReward = cursorStep?.rewardHint === true
  const rewards = profile.acquisitions?.rewards ?? []
  const purchases = profile.acquisitions?.purchases ?? []
  const rewardGroups = profile.acquisitions?.rewardGroups ?? []
  // gem (lowercased) -> its acquisition entry, for the inline tags on link rows.
  const acqByGem = new Map<string, AcquisitionEntryBridge>()
  for (const e of [...rewards, ...purchases, ...(profile.acquisitions?.other ?? [])]) {
    acqByGem.set(e.gem.toLowerCase(), e)
  }

  return (
    <>
      {profile.errors.length > 0 && <ErrorBox title="Profile file problems:" errors={profile.errors} />}

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

      {rewardGroups.length > 0 && (
        <div
          className={
            'mb-2 rounded-md border p-2 ' +
            (atReward ? 'border-overlay-accent/50 bg-overlay-accent/10' : 'border-overlay-border/60 bg-black/20')
          }
        >
          <div
            className={
              'mb-1 text-[10px] font-semibold uppercase tracking-wider ' +
              (atReward ? 'text-overlay-accent' : 'text-overlay-muted')
            }
          >
            Quest rewards{atReward ? ' — take now' : ''}
          </div>
          <div className="flex flex-col gap-1.5">
            {rewardGroups.map((g, i) => (
              <RewardGroupRow key={i} group={g} />
            ))}
          </div>
        </div>
      )}

      {purchases.length > 0 && (
        <div className="mb-2 rounded-md bg-black/25 p-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-overlay-muted">
            Buy (this stage)
          </div>
          {purchases.map((e) => (
            <div key={e.gem} className="text-xs text-overlay-text">
              {e.gem}
              <span className="text-overlay-muted">
                {e.npc ? ` · ${e.npc}` : ''}
                {e.act ? ` (Act ${e.act})` : ''}
                {e.cost ? ` · ${e.cost}` : ''}
                {e.fallback && <span title="general vendor — may be available earlier"> ≈</span>}
              </span>
            </div>
          ))}
          {purchases.some((e) => e.fallback) && (
            <p className="mt-1 text-[10px] text-overlay-muted">
              ≈ general vendor: Siosa (Act 3, after the Library) / Lilly Roth (Act 6+) sell most
              gems; you may find it earlier as a quest reward.
            </p>
          )}
        </div>
      )}

      {stage ? (
        <>
          <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-overlay-muted">
            {stage.label}
          </div>
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
