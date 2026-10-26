import { Fragment, useEffect, useRef, useState } from 'react'
import { button, HEADING, panelSurface, TAG, TAG_TONE } from '../src/lib/ui'

// The run timer window: the run in progress — its clock, where the time went,
// the act splits against your best — and the runs before it. Everything is
// worked out in the main process (electron/timer/engine.ts); this page only
// ticks the clock on between log lines.

const CATEGORY_LABEL: Record<TimeCategoryBridge, string> = {
  zone: 'Zones',
  town: 'Towns',
  hideout: 'Hideout',
  lab: 'Lab',
  mule: 'Mule',
  loading: 'Loading',
  other: 'Other'
}
const LAB_NAME: Record<string, string> = { normal: 'Normal', cruel: 'Cruel', merciless: 'Merciless' }
/** In the act table, where the width is a clock's: the tooltip has the rest. */
const LAB_SHORT: Record<string, string> = { normal: 'N', cruel: 'C', merciless: 'M' }
const CATEGORY_ORDER: TimeCategoryBridge[] = ['zone', 'town', 'hideout', 'lab', 'mule', 'loading', 'other']

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
  const panelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  useFitHeight(panelRef, scrollRef, contentRef)

  const surface = panelSurface(opacity)
  return (
    <div className="flex h-screen w-screen items-start justify-center p-2">
      <div
        ref={panelRef}
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

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <div ref={contentRef}>
            {!snap ? null : view === 'live' ? <LiveView snap={snap} now={now} /> : <RunsView snap={snap} />}
          </div>
        </div>
        {moveMode && <ResizeGrip />}
      </div>
    </div>
  )
}

function LiveView({ snap, now }: { snap: RunTimerSnapshotBridge; now: number }): React.JSX.Element {
  const live = snap.live
  if (!live) {
    const solo = runById(snap, snap.best.solo)
    const party = runById(snap, snap.best.party)
    return (
      <p className="py-3 text-xs text-overlay-muted">
        No run yet. A run starts when a new character enters the Twilight Strand, and ends when
        Kitava falls in Act 10.
        {(solo || party) && ' Best so far: '}
        {solo && (
          <>
            solo <span className="font-mono text-overlay-text">{fmt(solo.total)}</span>
            {party ? ', ' : '.'}
          </>
        )}
        {party && (
          <>
            party <span className="font-mono text-overlay-text">{fmt(party.total)}</span>.
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
  // Compared with the best of its kind: solo until partymates show up — the
  // start of a run can't tell.
  const kind = kindOf(live) ?? 'solo'
  const best = runById(snap, snap.best[kind])

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
          run? Levelling past 3 or reaching the Coast makes it a new run; coming back here makes it
          a mule, and its time joins this run as mule time.
        </p>
      )}

      <Breakdown byCategory={byCategory} total={total} />
      <RunFacts run={live} />
      <Splits acts={acts} labs={live.labSplits ?? []} zones={live.zones} best={best} kind={kind} live />
      <EndRunButton />
    </div>
  )
}

/** Stop here and start over: the run is kept under Runs as it stands. Asks
 *  first — there's no undo. */
function EndRunButton(): React.JSX.Element {
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="flex justify-end">
      {confirm ? (
        <span className="flex items-center gap-1.5 text-[11px] text-overlay-muted">
          End this run? It's kept under Runs.
          <button
            className={button('primary', 'sm')}
            onClick={() => {
              setConfirm(false)
              window.overlay?.endRun()
            }}
          >
            End run
          </button>
          <button className={button('quiet', 'sm')} onClick={() => setConfirm(false)}>
            Keep going
          </button>
        </span>
      ) : (
        <button
          className={button('quiet', 'sm')}
          title="Stop this run and keep it under Runs. The next Twilight Strand starts a new one."
          onClick={() => setConfirm(true)}
        >
          End run…
        </button>
      )}
    </div>
  )
}

function RunsView({ snap }: { snap: RunTimerSnapshotBridge }): React.JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  if (snap.history.length === 0) {
    return (
      <div className="space-y-2 py-2">
        <p className="text-xs text-overlay-muted">No finished or abandoned runs yet.</p>
        <ImportRuns />
      </div>
    )
  }
  return (
    <div className="space-y-2 pt-1">
      <ImportRuns />
      <ul className="space-y-1">
        {snap.history.map((run) => {
          const expanded = open === run.id
          return (
            <li key={run.id} className="rounded bg-black/25">
              <button
                className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-xs"
                onClick={() => setOpen(expanded ? null : run.id)}
                aria-expanded={expanded}
              >
                <span className="min-w-0 truncate" title={run.charClass ?? undefined}>
                  <span className="text-overlay-muted">{fmtDate(run.startedAt)}</span> {run.character ?? '?'}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {/* PB: the best of its kind — the Party tag beside it says which. */}
                  {run.id === snap.best.solo && <span className={TAG + TAG_TONE.gold} title="Personal best, solo">PB</span>}
                  {run.id === snap.best.party && <span className={TAG + TAG_TONE.gold} title="Personal best, party">PB</span>}
                  {(run.party?.length ?? 0) > 0 && (
                    <span className={TAG + TAG_TONE.neutral} title={`With ${run.party!.join(', ')}`}>
                      Party
                    </span>
                  )}
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
                  <Splits
                    acts={run.acts}
                    labs={run.labSplits ?? []}
                    zones={run.zones}
                    best={bestFor(snap, run)}
                    kind={kindOf(run) ?? undefined}
                  />
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
    </div>
  )
}

/**
 * Old runs, read from the whole Client.txt — the campaigns finished before
 * the timer was on, or while the overlay was closed. Read on this PC, like
 * every other line; finished ones only, so test characters stay out.
 */
function ImportRuns(): React.JSX.Element {
  const [progress, setProgress] = useState<number | null>(null)
  const [result, setResult] = useState<ImportResultBridge | null>(null)
  const start = (): void => {
    const api = window.overlay
    if (!api) return
    setResult(null)
    setProgress(0)
    const unsubscribe = api.onImportProgress(setProgress)
    void api
      .importRuns()
      .then(setResult)
      .finally(() => {
        unsubscribe()
        setProgress(null)
      })
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px]">
      <span className="min-w-0 text-overlay-muted">
        {progress != null
          ? `Reading Client.txt… ${Math.round(progress * 100)} %`
          : result == null
            ? 'Campaigns from before, out of your Client.txt.'
            : result.ok
              ? result.found === 0
                ? 'No finished campaign in the log.'
                : `Found ${result.found} finished run${result.found === 1 ? '' : 's'}: ${result.added} new, ${result.replaced} updated.`
              : <span className="text-danger">{result.error}</span>}
      </span>
      <button
        className={button('quiet', 'sm')}
        disabled={progress != null}
        title="Reads your whole Client.txt on this PC for finished campaigns. Runs already here are updated, not doubled; abandoned characters stay out."
        onClick={start}
      >
        Import old runs…
      </button>
    </div>
  )
}

/** Solo or party, as the main process decides it (runKind): solo until
 *  someone has shared enough of the run's zones; null for a run kept before
 *  this was counted. */
function kindOf(run: RunSummaryBridge): 'solo' | 'party' | null {
  if (!run.party) return null
  return run.party.length > 0 ? 'party' : 'solo'
}

function runById(snap: RunTimerSnapshotBridge, id: string | null): RunSummaryBridge | null {
  return id ? (snap.history.find((r) => r.id === id) ?? null) : null
}

/** The run to compare with: the fastest of the same kind, never itself. A
 *  solo run is never held against a party one, or the other way round. */
function bestFor(snap: RunTimerSnapshotBridge, run: RunSummaryBridge): RunSummaryBridge | null {
  const kind = kindOf(run)
  if (!kind) return null
  const best = runById(snap, snap.best[kind])
  return best && best.id !== run.id ? best : null
}

/** What else makes two runs comparable: how often you died, how many quest
 *  skill points you claimed, which Labyrinths and Pantheon gods you did, and
 *  the AFK time left out of the total. */
function RunFacts({ run }: { run: RunSummaryBridge }): React.JSX.Element {
  // Short labels, the window is narrow: each says it in full on hover.
  const facts: Array<[string, string, string]> = [
    ['†', String(run.deaths), 'Deaths — your character dying, suicides included'],
    ['SP', String(run.questPoints), 'Quest skill points claimed — a Book of Skill used, not just a quest done'],
    ['Lab', `${run.labs.length}/3`, run.labs.length ? `Labyrinths beaten: ${run.labs.join(', ')}` : 'No Labyrinth beaten yet'],
    ['Gods', String(run.gods.length), run.gods.length ? `Pantheon: ${run.gods.join(', ')}` : 'No Pantheon god defeated yet']
  ]
  if (run.afk > 0) facts.push(['AFK', fmt(run.afk), 'Time the game marked you AFK — not part of the run time'])
  return (
    <div className="space-y-0.5 text-[11px]">
      <div className="flex flex-wrap gap-x-2.5 gap-y-0.5">
        {facts.map(([label, value, title]) => (
          <span key={label} title={title}>
            <span className="text-overlay-muted">{label}</span> <span className="font-mono tabular-nums">{value}</span>
          </span>
        ))}
        <Company run={run} />
      </div>
    </div>
  )
}

/** Solo or not: only party members can be in your campaign zones, whoever
 *  went to whom. One or two zones are someone porting in to hand something
 *  over. */
function Company({ run }: { run: RunSummaryBridge }): React.JSX.Element | null {
  if (!run.shared || !run.party) return null // kept before this was counted
  const party = run.party
  const visitors = Object.keys(run.shared).filter((n) => !party.includes(n)).length
  const shared = Object.entries(run.shared)
    .map(([name, n]) => `${name}: ${n} zone${n === 1 ? '' : 's'}`)
    .join(', ')
  return (
    <span className="min-w-0 truncate" title={shared ? `Zones shared — ${shared}` : 'Nobody in your zones'}>
      {party.length > 0 ? (
        <>
          <span className="text-overlay-muted">Party</span> {party.join(', ')}
        </>
      ) : (
        <>
          <span className="text-overlay-muted">Solo</span>
          {visitors > 0 && <span className="text-overlay-muted"> ·{visitors}</span>}
        </>
      )}
    </span>
  )
}

function Breakdown({ byCategory, total }: { byCategory: Record<TimeCategoryBridge, number>; total: number }): React.JSX.Element {
  return (
    <div>
      <h2 className={'mb-1 ' + HEADING + 'text-overlay-muted'}>Time</h2>
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
 *  run's mark as the time to beat. Each Labyrinth beaten is a row of its own
 *  after the act it was beaten in, against the same Labyrinth in the best run. */
function Splits({
  acts,
  labs,
  zones,
  best,
  kind,
  live = false
}: {
  acts: ActSplitBridge[]
  labs: LabSplitBridge[]
  zones: ZoneTimeBridge[]
  best: RunSummaryBridge | null
  /** what the best run is the best of, for the heading */
  kind?: 'solo' | 'party'
  live?: boolean
}): React.JSX.Element | null {
  // An act's zones show under it on a click. The act you're in shows them
  // by itself — a click hides them — and folds away once you move on.
  const [toggled, setToggled] = useState<Set<number>>(new Set())
  if (acts.length === 0) return null
  const current = live ? acts.at(-1)?.act : undefined
  const isOpen = (act: number): boolean => (act === current) !== toggled.has(act)
  const toggle = (act: number): void =>
    setToggled((prev) => {
      const next = new Set(prev)
      if (next.has(act)) next.delete(act)
      else next.add(act)
      return next
    })
  const columns = best ? 5 : 4
  return (
    <div>
      <h2 className={'mb-1 ' + HEADING + 'text-overlay-muted'}>Acts{best ? ` · vs best${kind ? ` ${kind}` : ''}` : ''}</h2>
      <table className="w-full text-[11px]">
        <thead className="text-overlay-muted">
          <tr>
            <th className="text-left font-normal">Act</th>
            <th className="pl-2 text-right font-normal">Time</th>
            <th className="pl-2 text-right font-normal">Split</th>
            {best && <th className="pl-2 text-right font-normal">±</th>}
            <th className="pl-2 text-right font-normal">Lvl</th>
          </tr>
        </thead>
        <tbody>
          {acts.map((a, i) => {
            const end = a.at + a.duration
            const done = !live || i < acts.length - 1
            const theirs = best?.acts.find((b) => b.act === a.act)
            const theirEnd = theirs ? theirs.at + theirs.duration : null
            return (
              <Fragment key={a.act}>
                <tr className={done ? '' : 'text-overlay-accent'}>
                  <td>
                    <button
                      className="whitespace-nowrap"
                      aria-expanded={isOpen(a.act)}
                      title={isOpen(a.act) ? 'Hide its zones' : 'Show its zones'}
                      onClick={() => toggle(a.act)}
                    >
                      {a.act} <span className="text-overlay-muted">{isOpen(a.act) ? '▾' : '▸'}</span>
                    </button>
                  </td>
                  <td className="whitespace-nowrap pl-2 text-right font-mono tabular-nums">{fmt(a.duration)}</td>
                  <td className="whitespace-nowrap pl-2 text-right font-mono tabular-nums">{fmt(end)}</td>
                  {best && (
                    <td className="whitespace-nowrap pl-2 text-right font-mono tabular-nums">
                      {theirEnd == null ? '—' : done ? <Delta ms={end - theirEnd} /> : <span className="text-overlay-muted">{fmt(theirEnd)}</span>}
                    </td>
                  )}
                  <td className="pl-2 text-right text-overlay-muted">{a.level ?? '—'}</td>
                </tr>
                {isOpen(a.act) &&
                  zones
                    .filter((z) => z.act === a.act)
                    .sort((x, y) => (x.order ?? 0) - (y.order ?? 0))
                    .map((z) => {
                      // Time in the zone against the same zone in the best run
                      // of this kind — how long, not when: the order differs.
                      const theirs = best?.zones.find((b) => b.act === z.act && (b.areaId ?? b.name) === (z.areaId ?? z.name))
                      return (
                        <tr key={`${z.areaId ?? z.name}@${z.act}`} className="text-overlay-muted">
                          <td colSpan={columns}>
                            {/* w-0 + min-w-full: the row takes the table's width
                                instead of widening it, so long names truncate. */}
                            <div
                              className="flex w-0 min-w-full justify-between gap-2 pl-3"
                              title={
                                'Time in the zone, loading screens apart' +
                                (best ? (theirs ? ` — best run: ${fmt(theirs.ms)}` : ' — the best run never went there') : '')
                              }
                            >
                              <span className="min-w-0 truncate">
                                {z.name}
                                {z.visits > 1 && <span> ×{z.visits}</span>}
                                {z.withParty && <span title="Shared with your party"> · party</span>}
                              </span>
                              <span className="flex shrink-0 gap-2 font-mono tabular-nums">
                                {fmt(z.ms)}
                                {best && (
                                  <span className="w-14 text-right">{theirs ? <Delta ms={z.ms - theirs.ms} /> : '—'}</span>
                                )}
                              </span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                {labs
                  .filter((l) => l.act === a.act)
                  .map((l) => {
                    const theirLab = best?.labSplits?.find((b) => b.tier === l.tier)
                    return (
                      <tr key={l.tier} className="text-overlay-muted" title={`${LAB_NAME[l.tier] ?? l.tier} Labyrinth: Aspirants' Plaza to Izaro's death, beaten in Act ${l.act}`}>
                        <td className="whitespace-nowrap pl-2">Lab {LAB_SHORT[l.tier] ?? l.tier}</td>
                        <td className="whitespace-nowrap pl-2 text-right font-mono tabular-nums">{fmt(l.duration)}</td>
                        <td className="whitespace-nowrap pl-2 text-right font-mono tabular-nums">{fmt(l.at)}</td>
                        {best && (
                          <td className="whitespace-nowrap pl-2 text-right font-mono tabular-nums">
                            {theirLab ? <Delta ms={l.at - theirLab.at} /> : '—'}
                          </td>
                        )}
                        <td className="pl-2 text-right text-overlay-muted">{l.level ?? '—'}</td>
                      </tr>
                    )
                  })}
              </Fragment>
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

/**
 * Keep the window as tall as the panel needs: it grows when an act or a
 * Labyrinth row comes in, or a run is opened under Runs, and shrinks back —
 * a scrollbar only once it would run off the screen (the main process stops
 * it at the bottom). The panel's own height plus whatever its scroller hides,
 * plus the window's padding around it.
 */
function useFitHeight(
  panel: React.RefObject<HTMLDivElement | null>,
  scroller: React.RefObject<HTMLDivElement | null>,
  content: React.RefObject<HTMLDivElement | null>
): void {
  useEffect(() => {
    const api = window.overlay
    const p = panel.current
    const s = scroller.current
    const c = content.current
    if (!api || !p || !s || !c) return
    let last = 0
    const fit = (): void => {
      const outer = p.parentElement
      const padding = outer ? parseFloat(getComputedStyle(outer).paddingTop) + parseFloat(getComputedStyle(outer).paddingBottom) : 0
      const needed = Math.ceil(p.offsetHeight - s.clientHeight + s.scrollHeight + padding)
      if (Math.abs(needed - last) < 2) return
      last = needed
      api.fitHeight(needed)
    }
    const observer = new ResizeObserver(fit)
    observer.observe(c)
    observer.observe(p)
    fit()
    return () => observer.disconnect()
  }, [panel, scroller, content])
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
  const [now, setNow] = useState(() => Date.now())
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
