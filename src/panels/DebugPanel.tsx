import { useOverlayStore } from '../stores/overlayStore'

// Dev-only event feed (plan §4/§11.1): shows *parsed* events, held in memory —
// never raw log lines, never written to disk. Reachable only when the app runs
// in dev (the 🐞 button is hidden in packaged builds).

export function DebugPanel(): React.JSX.Element {
  const { logStatus, tracked, recentEvents, patch } = useOverlayStore()

  return (
    <div className="flex h-screen w-screen items-start justify-center p-2">
      <div className="flex max-h-full w-full flex-col overflow-hidden rounded-[10px] border border-overlay-border bg-overlay-panel/95 shadow-lg backdrop-blur-sm">
        <header className="flex items-center justify-between border-b border-overlay-border px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-overlay-accent">🐞</span>
            <span className="text-sm font-semibold tracking-wide">Log events (dev)</span>
          </div>
          <button
            className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-overlay-muted hover:text-overlay-text"
            onClick={() => patch({ debugOpen: false })}
          >
            Close
          </button>
        </header>

        <div className="border-b border-overlay-border px-3 py-2 text-[11px] text-overlay-muted">
          <div>
            Watcher: <b className="text-overlay-text">{logStatus?.state ?? '–'}</b>
            {logStatus?.sizeBytes != null && ` · ${(logStatus.sizeBytes / 1048576).toFixed(1)} MB`}
          </div>
          <div className="truncate">{logStatus?.path ?? 'no Client.txt path set'}</div>
          <div>
            Tracking:{' '}
            <b className="text-overlay-text">
              {tracked?.character ?? '–'}
              {tracked?.level != null && ` (lvl ${tracked.level})`}
            </b>
            {tracked?.area && ` · ${tracked.area.name}`}
          </div>
        </div>

        <ol className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2 font-mono text-[10px]">
          {recentEvents.length === 0 && (
            <li className="text-overlay-muted">No parsed events yet.</li>
          )}
          {[...recentEvents].reverse().map((ev, i) => (
            <li key={`${ev.ts}-${i}`} className="flex gap-2">
              <span className="shrink-0 text-overlay-muted">
                {new Date(ev.ts).toLocaleTimeString()}
              </span>
              <span className={ev.kind === 'area' ? 'text-overlay-accent' : 'text-overlay-text'}>
                {ev.text}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
