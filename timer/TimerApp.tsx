import { useEffect, useState } from 'react'
import { button, HEADING, panelSurface, TAG, TAG_TONE } from '../src/lib/ui'

// The run timer window: the run in progress — its clock, where the time went,
// the act splits against your best — and the runs before it. Everything is
// worked out in the main process (electron/timer/engine.ts); this page only
// ticks the clock on between log lines.

const CATEGORY_LABEL: Record<TimeCategoryBridge, string> = {
  zone: 'Zones',
  town: 'Towns',
  hideout: 'Hideout',
  lab: 'Labyrinth',
  loading: 'Loading',
  other: 'Other'
}
const CATEGORY_ORDER: TimeCategoryBridge[] = ['zone', 'town', 'hideout', 'lab', 'loading', 'other']

export function TimerApp(): React.JSX.Element {
  const [snap, setSnap] = useState<RunTimerSnapshotBridge | null>(null)
  const [moveMode, setMoveMode] = useState(false)
  const [opacity, setOpacity] = useState(0.95)
  const [view, setView] = useState<'live' | 'runs'>('live')
  const now = useNow(1000)

  useEffect(() => {
    const api = window.overlay
    if (!api) return
    void api.getRunTimer().then(setSnap)
    void api.getState().then((s) => setMoveMode(s.moveMode))
    void api.getSettings().then((s) => setOpacity(s.opacity))
    const subs = [api.onRunTimer(setSnap), api.onState((s) => setMoveMode(s.moveMode))]
    return () => subs.forEach((unsub) => unsub())
  }, [])
  useHoverReporting()

  const surface = panelSurface(opacity)
  return (
    <div className="flex h-screen w-screen items-start justify-center p-2">
      <div
        data-interactive
        className={
          'relative flex max-h-full w-full flex-col overflow-hidden ' +
          surface.className +
          (moveMode ? 'border-overlay-accent' : 'border-overlay-border')
        }
        style={surface.style}
      >
        <header
          className={
            'flex items-center justify-between gap-2 px-3 py-1.5 ' +
            (moveMode ? 'drag-region cursor-move bg-overlay-accent/10' : '')
          }
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-overlay-accent">◆</span>
            <span className="truncate text-sm font-semibold tracking-wide">Run timer</span>
          </div>
          <div className="flex items-center gap-1">
            {moveMode ? (
              <button className={'no-drag ' + button('primary', 'sm')} onClick={() => window.overlay?.exitMoveMode()}>
                Done
              </button>
            ) : (
              <>
                <ViewButton label="Live" active={view === 'live'} onClick={() => setView('live')} />
                <ViewButton
                  label={`Runs${snap?.history.length ? ` ${snap.history.length}` : ''}`}
                  active={view === 'runs'}
                  onClick={() => setView('runs')}
                />
              </>
            )}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {!snap ? null : view === 'live' ? <LiveView snap={snap} now={now} /> : <RunsView snap={snap} />}
        </div>
        {moveMode && <ResizeGrip />}
      </div>
    </div>
  )
}

function LiveView({ snap, now }: { snap: RunTimerSnapshotBridge; now: number }): React.JSX.Element {
  const live = snap.live
  const best = snap.history.find((r) => r.id === snap.bestId) ?? null
  if (!live) {
    return (
      <p className="py-3 text-xs text-overlay-muted">
        No run yet. A run starts when a new character enters the Twilight Strand, and ends when
        Kitava falls in Act 10.
        {best && (
          <>
            {' '}
            Best so far: <span className="font-mono text-overlay-text">{fmt(best.total)}</span>.
          </>
        )}
      </p>
    )
  }

  // The log only speaks at loads and level-ups; between them the clock runs
  // on from the last line — until it's been quiet long enough that the game
  // has probably closed.
  const extra =
    snap.asOf != null && snap.tickUntil != null ? Math.max(0, Math.min(now, snap.tickUntil) - snap.asOf) : 0
  const stale = snap.tickUntil != null && now > snap.tickUntil
  const current = snap.current
  const total = live.total + extra
  const byCategory = { ...live.byCategory }
  if (current) byCategory[current.loading ? 'loading' : current.category] += extra
  const acts = live.acts.map((a, i) => (i === live.acts.length - 1 ? { ...a, duration: a.duration + extra } : a))
  const currentAct = acts.at(-1)

  return (
    <div className="space-y-2.5">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className={'font-mono text-3xl font-semibold tabular-nums ' + (stale ? 'text-overlay-muted' : '')}>
            {fmt(total)}
          </span>
          {currentAct && (
            <span className="text-xs text-overlay-muted">
              Act {currentAct.act} · <span className="font-mono tabular-nums">{fmt(currentAct.duration)}</span>
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-overlay-muted">
          <span className="truncate">
            {live.character ?? 'New character'}
            {live.charClass && ` (${live.charClass})`}
            {live.level != null && ` · level ${live.level}`}
          </span>
          {snap.away ? (
            <span title="Another character is playing — the run waits until its own logs back in.">
              ⏸ other character
            </span>
          ) : (
            stale && <span title="No log line for a while — the game may be closed.">⏸ paused</span>
          )}
        </div>
      </div>

      {current && (
        <div className="flex items-center justify-between gap-2 rounded bg-black/25 px-2 py-1 text-xs">
          <span className="min-w-0 truncate">{current.loading ? 'Loading…' : current.name}</span>
          {!current.loading && (
            <span className="font-mono tabular-nums text-overlay-muted">{fmt(current.ms + extra)}</span>
          )}
        </div>
      )}

      {snap.pending && (
        <p className="rounded border border-warn/40 bg-warn/10 px-2 py-1 text-[11px] text-warn">
          △ {snap.pending.character ?? 'A new character'} entered the Twilight Strand — a mule, or a new
          run? This run waits meanwhile. Levelling past 3 or reaching the Coast makes it a new run;
          coming back here makes it a mule.
        </p>
      )}

      <Breakdown byCategory={byCategory} total={total} />
      <RunFacts run={live} />
      <Splits acts={acts} best={best} live />
    </div>
  )
}

function RunsView({ snap }: { snap: RunTimerSnapshotBridge }): React.JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const best = snap.history.find((r) => r.id === snap.bestId) ?? null
  if (snap.history.length === 0) {
    return <p className="py-3 text-xs text-overlay-muted">No finished or abandoned runs yet.</p>
  }
  return (
    <ul className="space-y-1 pt-1">
      {snap.history.map((run) => {
        const expanded = open === run.id
        return (
          <li key={run.id} className="rounded bg-black/25">
            <button
              className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-xs"
              onClick={() => setOpen(expanded ? null : run.id)}
              aria-expanded={expanded}
            >
              <span className="min-w-0 truncate">
                <span className="text-overlay-muted">{fmtDate(run.startedAt)}</span> {run.character ?? '?'}
                {run.charClass && <span className="text-overlay-muted"> ({run.charClass})</span>}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {run.id === snap.bestId && <span className={TAG + TAG_TONE.gold}>Best</span>}
                {run.status === 'abandoned' && (
                  <span className={TAG + TAG_TONE.muted} title={`Stopped in Act ${run.acts.at(-1)?.act ?? 1}`}>
                    Act {run.acts.at(-1)?.act ?? 1}
                  </span>
                )}
                <span className="font-mono tabular-nums">{fmt(run.total)}</span>
              </span>
            </button>
            {expanded && (
              <div className="space-y-2 px-2 pb-2">
                <Breakdown byCategory={run.byCategory} total={run.total} />
                <RunFacts run={run} />
                <Splits acts={run.acts} best={run.id === snap.bestId ? null : best} />
                <SlowestZones run={run} />
                <div className="flex justify-end">
                  {confirm === run.id ? (
                    <span className="flex items-center gap-1.5 text-[11px] text-overlay-muted">
                      Delete this run?
                      <button className={button('danger', 'sm')} onClick={() => window.overlay?.deleteRun(run.id)}>
                        Delete
                      </button>
                      <button className={button('quiet', 'sm')} onClick={() => setConfirm(null)}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button className={button('quiet', 'sm')} onClick={() => setConfirm(run.id)}>
                      Delete…
                    </button>
                  )}
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** What else makes two runs comparable: how often you died, how many quest
 *  skill points you claimed, which Labyrinths and Pantheon gods you did, and
 *  the AFK time left out of the total. */
function RunFacts({ run }: { run: RunSummaryBridge }): React.JSX.Element {
  const facts: Array<[string, string, string]> = [
    ['Deaths', String(run.deaths), 'Your character dying, suicides included'],
    ['Skill pts', String(run.questPoints), 'Quest passive skill points claimed — a Book of Skill used, not just a quest done'],
    ['Labs', String(run.labs.length), run.labs.length ? `Beaten: ${run.labs.join(', ')}` : 'No Labyrinth beaten yet'],
    ['Gods', String(run.gods.length), run.gods.length ? run.gods.join(', ') : 'No Pantheon god defeated yet']
  ]
  if (run.afk > 0) facts.push(['AFK', fmt(run.afk), 'Time the game marked you AFK — not part of the run time'])
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
      {facts.map(([label, value, title]) => (
        <span key={label} title={title}>
          <span className="text-overlay-muted">{label}</span> <span className="font-mono tabular-nums">{value}</span>
        </span>
      ))}
    </div>
  )
}

function Breakdown({ byCategory, total }: { byCategory: Record<TimeCategoryBridge, number>; total: number }): React.JSX.Element {
  return (
    <div>
      <h2 className={'mb-1 ' + HEADING + 'text-overlay-muted'}>Where the time went</h2>
      <div className="space-y-0.5">
        {CATEGORY_ORDER.filter((c) => byCategory[c] > 0 || c === 'zone' || c === 'town').map((c) => {
          const share = total > 0 ? byCategory[c] / total : 0
          return (
            <div key={c} className="grid grid-cols-[4.5rem_1fr_3.5rem_2rem] items-center gap-1.5 text-[11px]">
              <span className="text-overlay-text">{CATEGORY_LABEL[c]}</span>
              <span className="h-1.5 overflow-hidden rounded bg-white/10">
                <span className="block h-full bg-overlay-accent/70" style={{ width: `${share * 100}%` }} />
              </span>
              <span className="text-right font-mono tabular-nums">{fmt(byCategory[c])}</span>
              <span className="text-right text-overlay-muted">{Math.round(share * 100)}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Each act's end against the same act's end in the best run. An act counts
 *  as done once the next has been entered; the one you're in shows the best
 *  run's mark as the time to beat. */
function Splits({ acts, best, live = false }: { acts: ActSplitBridge[]; best: RunSummaryBridge | null; live?: boolean }): React.JSX.Element | null {
  if (acts.length === 0) return null
  return (
    <div>
      <h2 className={'mb-1 ' + HEADING + 'text-overlay-muted'}>Acts{best ? ' · vs best' : ''}</h2>
      <table className="w-full text-[11px]">
        <thead className="text-overlay-muted">
          <tr>
            <th className="text-left font-normal">Act</th>
            <th className="text-right font-normal">Time</th>
            <th className="text-right font-normal">Split</th>
            {best && <th className="text-right font-normal">±</th>}
            <th className="text-right font-normal">Lvl</th>
          </tr>
        </thead>
        <tbody>
          {acts.map((a, i) => {
            const end = a.at + a.duration
            const done = !live || i < acts.length - 1
            const theirs = best?.acts.find((b) => b.act === a.act)
            const theirEnd = theirs ? theirs.at + theirs.duration : null
            return (
              <tr key={a.act} className={done ? '' : 'text-overlay-accent'}>
                <td>{a.act}</td>
                <td className="text-right font-mono tabular-nums">{fmt(a.duration)}</td>
                <td className="text-right font-mono tabular-nums">{fmt(end)}</td>
                {best && (
                  <td className="text-right font-mono tabular-nums">
                    {theirEnd == null ? '—' : done ? <Delta ms={end - theirEnd} /> : <span className="text-overlay-muted">{fmt(theirEnd)}</span>}
                  </td>
                )}
                <td className="text-right text-overlay-muted">{a.level ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SlowestZones({ run }: { run: RunSummaryBridge }): React.JSX.Element | null {
  const zones = run.zones.filter((z) => z.areaId == null || !/^Hideout/i.test(z.areaId)).slice(0, 6)
  if (zones.length === 0) return null
  return (
    <div>
      <h2 className={'mb-1 ' + HEADING + 'text-overlay-muted'}>Longest stays</h2>
      {zones.map((z) => (
        <div key={`${z.areaId ?? z.name}@${z.act}`} className="flex justify-between gap-2 text-[11px]">
          <span className="min-w-0 truncate">
            <span className="text-overlay-muted">A{z.act}</span> {z.name}
            {z.visits > 1 && <span className="text-overlay-muted"> ×{z.visits}</span>}
          </span>
          <span className="font-mono tabular-nums">{fmt(z.ms)}</span>
        </div>
      ))}
    </div>
  )
}

/** Ahead is good and green with a minus; behind is red with a plus. */
function Delta({ ms }: { ms: number }): React.JSX.Element {
  const ahead = ms <= 0
  return <span className={ahead ? 'text-ok' : 'text-danger'}>{(ahead ? '−' : '+') + fmt(Math.abs(ms))}</span>
}

function ViewButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }): React.JSX.Element {
  return (
    <button className={'no-drag ' + button(active ? 'primary' : 'quiet', 'sm')} aria-pressed={active} onClick={onClick}>
      {label}
    </button>
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

/** The overlay's hover reporting (see src/App.tsx): the panel takes the mouse,
 *  the transparent rest of the window passes it to the game. */
function useHoverReporting(): void {
  useEffect(() => {
    const api = window.overlay
    if (!api) return
    let over = false
    let dragging = false
    const send = (v: boolean): void => {
      if (v !== over) {
        over = v
        api.setHoverUi(v)
      }
    }
    const overUi = (e: Event): boolean => !!(e.target as Element | null)?.closest?.('[data-interactive]')
    const onOver = (e: Event): void => {
      if (dragging && !overUi(e)) return
      send(overUi(e))
    }
    const onDown = (e: Event): void => {
      dragging = true
      if (overUi(e)) send(true)
    }
    const onUp = (e: Event): void => {
      dragging = false
      send(overUi(e))
    }
    window.addEventListener('pointerover', onOver, true)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointerup', onUp, true)
    return () => {
      window.removeEventListener('pointerover', onOver, true)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointerup', onUp, true)
    }
  }, [])
}

function useNow(everyMs: number): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}

/** 1:02:03 from an hour on, 2:03 below it. */
function fmt(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

function fmtDate(wall: number): string {
  return new Date(wall).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })
}
