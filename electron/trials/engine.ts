// Ascendancy trials tracker (pure, no Electron imports — unit-tested).
// The six normal-Labyrinth Trials of Ascendancy (Acts 1–3) that gate the first
// Labyrinth. Completion isn't logged, so this auto-marks a trial when you enter
// its zone (a good proxy) and always allows a manual toggle as correction —
// same philosophy as the route guide.

export interface TrialDef {
  id: string
  act: number
  /** Zone that contains the trial. Matched against the entered zone name
   *  (exact or prefix, so "The Crypt Level 1" matches "The Crypt Level 1"). */
  zone: string
}

// Zone names are the stable English display names; provisional until confirmed
// from real logs (the 🐞 dev panel shows each zone you enter). Manual toggle
// covers any mismatch.
export const NORMAL_TRIALS: readonly TrialDef[] = [
  { id: 't-a1-lower-prison', act: 1, zone: 'The Lower Prison' },
  { id: 't-a2-crypt', act: 2, zone: 'The Crypt Level 1' },
  { id: 't-a2-chamber-of-sins', act: 2, zone: 'The Chamber of Sins Level 2' },
  { id: 't-a3-crematorium', act: 3, zone: 'The Crematorium' },
  { id: 't-a3-catacombs', act: 3, zone: 'The Catacombs' },
  { id: 't-a3-imperial-gardens', act: 3, zone: 'The Imperial Gardens' }
] as const

export interface TrialState {
  id: string
  act: number
  zone: string
  seen: boolean
}

export interface TrialsSnapshot {
  trials: TrialState[]
  seenCount: number
  total: number
}

export class TrialsEngine {
  private readonly trials: readonly TrialDef[]
  private seen = new Set<string>()

  constructor(seenIds: string[] = [], trials: readonly TrialDef[] = NORMAL_TRIALS) {
    this.trials = trials
    const valid = new Set(trials.map((t) => t.id))
    for (const id of seenIds) if (valid.has(id)) this.seen.add(id)
  }

  snapshot(): TrialsSnapshot {
    const trials = this.trials.map((t) => ({ id: t.id, act: t.act, zone: t.zone, seen: this.seen.has(t.id) }))
    return { trials, seenCount: this.seen.size, total: this.trials.length }
  }

  /** Mark any trial whose zone matches the entered zone name. Returns true if
   *  something changed. */
  applyZone(zoneName: string): boolean {
    if (!zoneName) return false
    const entered = zoneName.trim().toLowerCase()
    let changed = false
    for (const t of this.trials) {
      const z = t.zone.toLowerCase()
      if ((entered === z || entered.startsWith(z)) && !this.seen.has(t.id)) {
        this.seen.add(t.id)
        changed = true
      }
    }
    return changed
  }

  toggle(id: string): boolean {
    if (!this.trials.some((t) => t.id === id)) return false
    if (this.seen.has(id)) this.seen.delete(id)
    else this.seen.add(id)
    return true
  }

  reset(): void {
    this.seen.clear()
  }

  seenIds(): string[] {
    return [...this.seen]
  }
}
