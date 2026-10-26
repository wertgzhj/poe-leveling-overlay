import { useShallow } from 'zustand/react/shallow'
import { formatAccelerator } from '../lib/accelerator'
import { button, HEADING } from '../lib/ui'
import { useOverlayStore } from '../stores/overlayStore'
import { ErrorBox, Tag } from './shared'

// The Guide tab: the route, step by step, advancing as you enter zones.

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
        The overlay ships the engine, not the route. Write your own steps and they
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

export function GuideBody(): React.JSX.Element {
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
          All steps done. Refine any act in data/campaign/act&lt;N&gt;.json.
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
            {formatAccelerator(hotkeys.stepForward)} next, {formatAccelerator(hotkeys.stepBack)} back
          </span>
          <button className="hover:text-overlay-text" title="Clear progress" onClick={() => window.overlay?.guideReset()}>
            reset
          </button>
        </div>
      )}
    </>
  )
}
