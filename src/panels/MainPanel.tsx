import { useOverlayStore } from '../stores/overlayStore'
import { formatAccelerator } from '../lib/accelerator'

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

const PIP_CLASS: Record<SocketColorBridge, string> = {
  R: 'bg-red-500',
  G: 'bg-emerald-500',
  B: 'bg-sky-500',
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
    appVersion,
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

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {tab === 'guide' && <GuideBody />}
          {tab === 'gems' && <GemBody />}
          {tab === 'trials' && <TrialsBody />}
        </div>

        {moveMode && <ResizeGrip />}
      </div>

      {appVersion && (
        <span className="pointer-events-none fixed bottom-1 right-2 text-[10px] text-overlay-muted/70">
          v{appVersion}
        </span>
      )}
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
      {trials.trials.map((t) => (
        <button
          key={t.id}
          onClick={() => window.overlay?.trialsToggle(t.id)}
          className={
            'mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ' +
            (t.seen ? 'opacity-50' : 'bg-black/20')
          }
        >
          <span className={'shrink-0 text-xs ' + (t.seen ? 'text-overlay-accent' : 'text-overlay-muted')}>
            {t.seen ? '✓' : '△'}
          </span>
          <div className="min-w-0">
            <div className={'text-xs ' + (t.seen ? 'text-overlay-muted line-through' : 'text-overlay-text')}>
              {t.zone}
            </div>
            <div className="text-[10px] text-overlay-muted">Act {t.act}</div>
          </div>
        </button>
      ))}
      <p className="mt-1 px-1 text-[10px] text-overlay-muted">
        Auto-checks when you enter the zone; click to correct. All six unlock the Labyrinth.
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

function SocketGroup({ group }: { group: ColoredSocketGroupBridge }): React.JSX.Element {
  return (
    <div className="mb-1.5 rounded-md border border-overlay-border/70 bg-black/20 p-1.5">
      {group.gems.map((gem, i) => (
        <div key={i} className="flex items-center gap-1.5 text-xs">
          <span className={'inline-block h-2.5 w-2.5 shrink-0 rounded-full ' + PIP_CLASS[gem.color]} />
          <span className="text-overlay-text">{gem.name}</span>
          {gem.unknown && (
            <span className="text-[9px] text-amber-400/80" title="not in gems.json — colour guessed">?</span>
          )}
        </div>
      ))}
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

      {atReward && rewards.length > 0 && (
        <div className="mb-2 rounded-md border border-overlay-accent/50 bg-overlay-accent/10 p-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-overlay-accent">
            Quest reward — take
          </div>
          {rewards.map((e) => (
            <div key={e.gem} className="text-xs text-overlay-text">
              {e.gem}
            </div>
          ))}
        </div>
      )}

      {stage ? (
        <>
          <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-overlay-muted">
            {stage.label}
          </div>
          {stage.groups.map((group, i) => (
            <SocketGroup key={i} group={group} />
          ))}
          {stage.note && <div className="mb-2 px-1 text-[10px] text-overlay-muted">{stage.note}</div>}
        </>
      ) : (
        <p className="px-1 text-xs text-overlay-muted">No stage for the current level.</p>
      )}

      {purchases.length > 0 && (
        <div className="mt-1 rounded-md bg-black/25 p-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-overlay-muted">
            Buy (this stage)
          </div>
          {purchases.map((e) => (
            <div key={e.gem} className="text-xs text-overlay-text">
              {e.gem}
              <span className="text-overlay-muted">
                {e.npc ? ` · ${e.npc}` : ''}
                {e.act ? ` (Act ${e.act})` : ''}
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

      {profile.nextStage && (
        <div className="mt-2 px-1 text-[10px] text-overlay-muted">
          From level {profile.nextStage.range[0]}: {profile.nextStage.label}
        </div>
      )}
    </>
  )
}
