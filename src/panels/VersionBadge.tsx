import { useOverlayStore } from '../stores/overlayStore'

// Always-visible version corner of the overlay. Quiet while nothing is
// happening (just "vX.Y.Z"); turns into a live hint while an update downloads
// and into a one-click "install now" pill once it's ready — clicking it
// restarts straight into the new version, no further prompts. Complements the
// UpdateBanner: the banner can be dismissed, the badge keeps the hint around.
export function VersionBadge(): React.JSX.Element | null {
  const appVersion = useOverlayStore((s) => s.appVersion)
  const update = useOverlayStore((s) => s.update)
  if (!appVersion) return null

  if (update?.state === 'ready') {
    return (
      <button
        onClick={() => window.overlay?.installUpdate()}
        title="New version downloaded — click to restart & update now"
        className="fixed bottom-1 right-2 flex items-center gap-1 rounded-full border border-overlay-accent/50 bg-overlay-accent/20 px-2 py-0.5 text-[10px] font-medium text-overlay-accent hover:bg-overlay-accent/35"
      >
        v{appVersion} → v{update.version}
        <span className="animate-pulse">⬆</span>
      </button>
    )
  }

  if (update?.state === 'downloading') {
    return (
      <span className="pointer-events-none fixed bottom-1 right-2 text-[10px] text-overlay-accent/90">
        v{appVersion} · ⬇ {update.percent}%
      </span>
    )
  }

  return (
    <span
      title={update?.state === 'error' ? `Update check failed: ${update.message}` : undefined}
      className="pointer-events-none fixed bottom-1 right-2 text-[10px] text-overlay-muted/70"
    >
      v{appVersion}
      {update?.state === 'error' && <span className="ml-1 text-amber-400/80">!</span>}
    </span>
  )
}
