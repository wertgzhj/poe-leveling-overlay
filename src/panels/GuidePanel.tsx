import { useOverlayStore } from '../stores/overlayStore'
import { formatAccelerator } from '../lib/accelerator'

// Main overlay panel (P2): the route guide, with a compact tracker strip on
// top. Steps auto-advance from area events; clicking a step toggles it (needs
// interactive mode — Ctrl+Shift+C); forward/back hotkeys work regardless.

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

export function GuidePanel(): React.JSX.Element {
  const {
    visible,
    clickThrough,
    moveMode,
    appVersion,
    opacity,
    hotkeys,
    isDev,
    logStatus,
    tracked,
    guide,
    patch
  } = useOverlayStore()

  if (!visible) return <div />

  const route = guide?.route ?? null
  const done = new Set(guide?.doneIds ?? [])
  const cursor = guide?.cursorIndex ?? 0
  const steps = route?.steps ?? []
  // Window: one completed step behind, current, and the next few ahead.
  const start = Math.max(0, cursor - 1)
  const visibleSteps = steps.slice(start, cursor + 5)

  return (
    <div className="flex h-screen w-screen items-start justify-center p-2">
      <div
        className={
          'relative flex max-h-full w-full flex-col overflow-hidden rounded-[10px] border bg-overlay-panel/95 shadow-lg backdrop-blur-sm ' +
          (moveMode ? 'border-overlay-accent' : 'border-overlay-border')
        }
        style={{ opacity }}
      >
        {/* Drag handle — only grabbable in move mode (plan §4). */}
        <header
          className={
            'flex items-center justify-between px-3 py-2 ' +
            (moveMode ? 'drag-region cursor-move bg-overlay-accent/10' : '')
          }
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-overlay-accent">◆</span>
            <span className="truncate text-sm font-semibold tracking-wide">
              {route ? (route.name ?? `Act ${route.act}`) : 'PoE Leveling Overlay'}
            </span>
            {route && (
              <span className="shrink-0 text-[10px] text-overlay-muted">
                {done.size}/{steps.length}
              </span>
            )}
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

        <div className="flex items-center gap-1.5 border-y border-overlay-border/60 bg-black/20 px-3 py-1 text-[11px] text-overlay-muted">
          <span
            className={
              'inline-block h-1.5 w-1.5 shrink-0 rounded-full ' +
              (logStatus?.state === 'watching' ? 'bg-emerald-400' : 'bg-white/25')
            }
          />
          <span className="truncate">{trackerLine(logStatus, tracked)}</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {guide?.errors && guide.errors.length > 0 && (
            <div className="mb-2 rounded-md border border-red-400/40 bg-red-400/10 p-2 text-[11px] text-red-300">
              <div className="mb-0.5 font-semibold">Route file problems:</div>
              {guide.errors.map((err, i) => (
                <div key={i}>· {err}</div>
              ))}
            </div>
          )}

          {!route && (!guide || guide.errors.length === 0) && (
            <p className="px-1 text-xs text-overlay-muted">Loading route…</p>
          )}

          {route && cursor >= steps.length && (
            <p className="px-1 text-xs text-overlay-accent">
              Route complete — extend data/campaign/act1.json with your next steps.
            </p>
          )}

          {visibleSteps.map((step) => {
            const idx = steps.indexOf(step)
            const isDone = done.has(step.id)
            const isCurrent = idx === cursor
            return (
              <button
                key={step.id}
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
                    <div
                      className={
                        'text-xs leading-snug ' +
                        (isDone ? 'text-overlay-muted line-through' : 'text-overlay-text')
                      }
                    >
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
            )
          })}
        </div>

        <footer className="flex items-center justify-between border-t border-overlay-border/60 px-3 py-1.5 text-[10px] text-overlay-muted">
          <span>
            {formatAccelerator(hotkeys.stepForward)} next · {formatAccelerator(hotkeys.stepBack)} back
          </span>
          {route && (
            <button
              className="rounded px-1 hover:text-overlay-text"
              title="Clear progress for this character"
              onClick={() => window.overlay?.guideReset()}
            >
              reset
            </button>
          )}
        </footer>

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
