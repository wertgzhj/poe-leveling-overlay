// Labyrinth tier names, from the trials engine itself (pure, no imports).
import { LAB_LABEL } from '../../electron/trials/engine.ts'
import { HEADING } from '../lib/ui'
import { useOverlayStore } from '../stores/overlayStore'
import { Tag } from './shared'

// The Trials tab: the campaign Trials of Ascendancy, per Labyrinth.

export function TrialsBody(): React.JSX.Element {
  const trials = useOverlayStore((s) => s.trials)
  if (!trials) return <p className="px-1 text-xs text-overlay-muted">Loading…</p>

  // done/total per Labyrinth, counted once instead of per row.
  const perLab = new Map<LabTierBridge, { done: number; total: number }>()
  for (const t of trials.trials) {
    const tally = perLab.get(t.lab) ?? { done: 0, total: 0 }
    tally.total++
    if (t.seen) tally.done++
    perLab.set(t.lab, tally)
  }

  return (
    <>
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[11px] text-overlay-muted">
          Campaign trials · {trials.seenCount}/{trials.total}
        </span>
        <button
          className="text-[10px] text-overlay-muted hover:text-overlay-text"
          title="Clear trials for this character"
          onClick={() => window.overlay?.trialsReset()}
        >
          reset
        </button>
      </div>
      {trials.trials.map((t, i) => {
        const here = t.id === trials.currentZoneTrialId
        // Header per Labyrinth tier — three separate labs run in the campaign.
        const newLab = i === 0 || trials.trials[i - 1].lab !== t.lab
        const tally = perLab.get(t.lab)
        const beaten = trials.completedLabs?.includes(t.lab)
        return (
          <div key={`${t.id}-w`}>
          {newLab && (
            <div className="mb-1 mt-2 flex items-center justify-between px-1 first:mt-0">
              <span className="flex items-center gap-1.5">
                <span className={HEADING + 'text-overlay-muted'}>{LAB_LABEL[t.lab]}</span>
                {beaten && (
                  <Tag tone="muted" title="Izaro is dead — this Labyrinth is done">
                    ✓ done
                  </Tag>
                )}
              </span>
              <span className="text-[10px] text-overlay-muted">
                {tally?.done}/{tally?.total}
              </span>
            </div>
          )}
          <button
            onClick={() => window.overlay?.trialsToggle(t.id)}
            className={
              'mb-1 flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left ' +
              (here && !t.seen
                ? 'border-overlay-accent/60 bg-overlay-accent/10'
                : 'border-transparent ' + (t.seen ? '' : 'bg-black/20'))
            }
          >
            <span
              className={
                'shrink-0 text-xs ' +
                (t.seen ? 'text-overlay-muted' : here ? 'text-overlay-accent' : 'text-overlay-muted')
              }
            >
              {t.seen ? '✓' : '△'}
            </span>
            <div className="min-w-0">
              <div className={'text-xs ' + (t.seen ? 'text-overlay-muted line-through' : 'text-overlay-text')}>
                {t.zone}
                {here && !t.seen && <Tag tone="gold" className="ml-1.5">you are here</Tag>}
              </div>
              <div className="text-[10px] text-overlay-muted">Act {t.act}</div>
            </div>
          </button>
          </div>
        )
      })}
      <p className="mt-1 px-1 text-[10px] text-overlay-muted">
        Finishing a trial auto-checks it (Izaro&apos;s plaque line names the trial);
        the hint and a manual click are fallbacks. Each Labyrinth needs all of its
        own trials — six for Normal, three each for Cruel and Merciless. Beating
        Izaro marks the Labyrinth done, and ticks its trials with it.
      </p>
    </>
  )
}
