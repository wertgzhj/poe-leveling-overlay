import { useOverlayStore } from '../stores/overlayStore'

// The passive "effortless update" nudge inside the main panel. Silent until the
// updater has something worth showing: a download in progress (thin, transient)
// or a ready-to-install build (prominent, one-click restart). Everything else —
// idle/checking/up-to-date/disabled/errors — lives in Settings so normal play
// isn't interrupted. Dismiss hides it; the Settings row still offers Restart.
export function UpdateBanner(): React.JSX.Element | null {
  const update = useOverlayStore((s) => s.update)
  const dismissed = useOverlayStore((s) => s.updateDismissed)
  const patch = useOverlayStore((s) => s.patch)

  if (!update) return null

  if (update.state === 'downloading') {
    return (
      <div className="border-b border-overlay-border/60 bg-black/30 px-3 py-1">
        <div className="flex items-center justify-between text-[10px] text-overlay-muted">
          <span>Downloading update v{update.version}…</span>
          <span>{update.percent}%</span>
        </div>
        <div className="mt-1 h-0.5 w-full overflow-hidden rounded bg-white/10">
          <div
            className="h-full rounded bg-overlay-accent transition-[width] duration-300"
            style={{ width: `${update.percent}%` }}
          />
        </div>
      </div>
    )
  }

  if (update.state === 'ready' && !dismissed) {
    return (
      <div className="flex items-center gap-2 border-b border-overlay-accent/40 bg-overlay-accent/15 px-3 py-1.5">
        <span className="text-overlay-accent">⬆</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-overlay-text">
          Update <b>v{update.version}</b> is ready.
        </span>
        <button
          className="shrink-0 rounded bg-overlay-accent/25 px-2 py-0.5 text-[11px] font-medium text-overlay-accent hover:bg-overlay-accent/35"
          title="Restart now to finish updating"
          onClick={() => window.overlay?.installUpdate()}
        >
          Restart &amp; update
        </button>
        <button
          className="shrink-0 text-overlay-muted hover:text-overlay-text"
          title="Later (Settings still has the Restart button)"
          onClick={() => patch({ updateDismissed: true })}
        >
          ✕
        </button>
      </div>
    )
  }

  return null
}
