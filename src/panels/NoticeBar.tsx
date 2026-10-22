import { useShallow } from 'zustand/react/shallow'
// Labyrinth tier names, from the trials engine itself (pure, no imports).
import { LAB_LABEL } from '../../electron/trials/engine.ts'
import { useOverlayStore } from '../stores/overlayStore'

// The notice bar under the tracker strip, shown on every tab.

// The notice bar, shown on every tab. Three things can claim it, ranked by how
// costly missing one is: a one-shot build decision (permanent), then a finished
// Labyrinth (an hour of not knowing), then a trial you're standing in (it comes
// round again). Only one bar, so it never stacks.
export function TrialHint(): React.JSX.Element | null {
  const { trials, choice } = useOverlayStore(
    useShallow((s) => ({ trials: s.trials, choice: s.profile?.choiceDue ?? null }))
  )

  // A bandit or pantheon choice outranks both. It is one-shot and permanent for
  // the character — miss the bandits and that's it — whereas a Labyrinth waits
  // and a trial zone comes round again.
  if (choice) {
    return (
      <div className="flex items-center gap-2 border-b border-overlay-accent/50 bg-overlay-accent/15 px-3 py-1.5">
        <span className="text-overlay-accent" aria-hidden>◆</span>
        <span
          className="min-w-0 flex-1 truncate text-[11px] text-overlay-text"
          title={
            choice.id === 'bandit'
              ? `Act 2, "Deal with the Bandits" — your profile says ${choice.wants}. The alternatives: ${choice.options.join(', ')}. It cannot be changed afterwards.`
              : `Act 5 — the Pantheon opens up at Sin. Your profile wants ${choice.wants}. This one you can change later.`
          }
        >
          {choice.id === 'bandit' ? 'Bandits: ' : 'Pantheon: '}
          {choice.wants}
        </span>
        <button
          className="shrink-0 text-overlay-muted hover:text-overlay-text"
          title="Done — don't remind me again on this character"
          aria-label="Dismiss reminder"
          onClick={() => window.overlay?.dismissChoice(choice.id)}
        >
          ✕
        </button>
      </div>
    )
  }

  const unlocked = trials?.unlockedLabs?.[0]
  if (unlocked) {
    return (
      <div className="flex items-center gap-2 border-b border-overlay-accent/50 bg-overlay-accent/15 px-3 py-1.5">
        <span className="text-overlay-accent">⌂</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-overlay-accent">
          {LAB_LABEL[unlocked]} unlocked — Aspirants&apos; Plaza.
        </span>
        <button
          className="shrink-0 text-overlay-muted hover:text-overlay-text"
          title="Got it — don't show this again for this Labyrinth"
          aria-label="Dismiss"
          onClick={() => window.overlay?.trialsDismissLab(unlocked)}
        >
          ✕
        </button>
      </div>
    )
  }

  // Otherwise: standing in a zone that holds an uncompleted trial. Entering a
  // zone never checks a trial off (you can walk it without doing the trial), so
  // this is a reminder plus a one-click correction.
  const trial = trials?.trials.find((t) => t.id === trials.currentZoneTrialId)
  if (!trial || trial.seen) return null
  return (
    <div className="flex items-center gap-2 border-b border-warn/40 bg-warn/10 px-3 py-1.5">
      <span className="text-warn" aria-hidden>△</span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-warn">
        Trial of Ascendancy in this zone — don&apos;t leave without it.
      </span>
      <button
        className="shrink-0 rounded bg-warn/20 px-2 py-0.5 text-[10px] font-medium text-warn hover:bg-warn/30"
        title="Mark this trial as completed"
        onClick={() => window.overlay?.trialsToggle(trial.id)}
      >
        Done ✓
      </button>
    </div>
  )
}
