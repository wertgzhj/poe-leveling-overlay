import { useOverlayStore } from '../stores/overlayStore'
import { formatAccelerator } from '../lib/accelerator'

// P0 placeholder panel. Later phases replace this with the Guide / Gem / Tree
// panels (plan §4). Its job now is to prove the transparent window renders and
// that overlay state (visibility, click-through, move mode) reaches the UI.

function StateChip({ label, on }: { label: string; on: boolean }): React.JSX.Element {
  return (
    <span
      className={
        'rounded px-2 py-0.5 text-[11px] font-medium ' +
        (on ? 'bg-overlay-accent/20 text-overlay-accent' : 'bg-white/5 text-overlay-muted')
      }
    >
      {label}
    </span>
  )
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

export function DummyPanel(): React.JSX.Element {
  const { visible, clickThrough, moveMode, appVersion, opacity, hotkeys } = useOverlayStore()

  if (!visible) return <div />

  return (
    <div className="flex h-screen w-screen items-start justify-center p-2">
      <div
        className={
          'relative w-full overflow-hidden rounded-[10px] border bg-overlay-panel/95 shadow-lg backdrop-blur-sm ' +
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
          <div className="flex items-center gap-2">
            <span className="text-overlay-accent">◆</span>
            <span className="text-sm font-semibold tracking-wide">PoE Leveling Overlay</span>
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
            <button
              className="no-drag rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-overlay-muted hover:text-overlay-text"
              title="Settings"
              onClick={() => window.overlay?.setSettingsOpen(true)}
            >
              ⚙
            </button>
          </div>
        </header>

        <div className="space-y-3 px-3 pb-3 text-overlay-text">
          <p className="text-xs text-overlay-muted">
            Phase&nbsp;P0 scaffold. The route, gem and tree panels arrive in later phases.
          </p>

          <div className="flex flex-wrap gap-1.5">
            <StateChip label="Visible" on={visible} />
            <StateChip label={clickThrough ? 'Click-through' : 'Interactive'} on={!clickThrough} />
            <StateChip label="Move mode" on={moveMode} />
          </div>

          <div className="rounded-md bg-black/25 p-2">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-overlay-muted">
              Hotkeys
            </div>
            <dl className="space-y-1 text-xs">
              <Hotkey combo={hotkeys.toggleVisibility} desc="Show / hide overlay" />
              <Hotkey combo={hotkeys.toggleClickThrough} desc="Toggle click-through" />
              <Hotkey combo={hotkeys.toggleMoveMode} desc="Move / resize mode" />
            </dl>
          </div>

          <p className="text-[10px] text-overlay-muted">
            {moveMode
              ? 'Drag the title bar to move · drag the bottom-right corner to resize.'
              : 'Run the game in Windowed Fullscreen so the overlay stays visible. Open ⚙ to rebind keys.'}
          </p>
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

function Hotkey({ combo, desc }: { combo: string; desc: string }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <dd className="text-overlay-text">{desc}</dd>
      <dt className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-overlay-muted">
        {formatAccelerator(combo)}
      </dt>
    </div>
  )
}
