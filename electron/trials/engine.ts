// Ascendancy trials tracker (pure, no Electron imports — unit-tested).
// The six normal-Labyrinth Trials of Ascendancy (Acts 1–3) that gate the first
// Labyrinth. Entering a trial's zone does NOT auto-complete it (you can walk a
// zone without doing its trial — owner feedback); the tracker surfaces a "trial
// in this zone" hint. Completion IS auto-detected: Izaro speaks a DISTINCT
// plaque voice line as you finish each trial (verified from real captures), so
// each line maps straight to its trial (completeByIzaro) — no dependence on the
// zone, and his other chatter (intros, the Labyrinth fight) never counts. The
// manual toggle stays as a fallback for other client languages / misses.

export interface TrialDef {
  id: string
  act: number
  /** Zone that contains the trial — used for the "trial in this zone" hint.
   *  Matched against the entered zone name (exact or prefix). Display only. */
  zone: string
  /** A distinctive fragment of Izaro's completion plaque line for this trial,
   *  matched case-insensitively against his `] Izaro: …` line in Client.txt. */
  izaro: string
}

// Izaro plaque lines are verified from real captures (2026-07-21). The internal
// trial names (Prison/Chamber/Church/Crematorium/Hedge/Catacombs) map to these
// zones; zone names are the display hint and stay provisional (manual toggle
// covers any mismatch), but completion keys off the voice line, not the zone.
export const NORMAL_TRIALS: readonly TrialDef[] = [
  { id: 't-a1-lower-prison', act: 1, zone: 'The Lower Prison', izaro: 'strongest metal' },
  { id: 't-a2-crypt', act: 2, zone: 'The Crypt Level 1', izaro: 'Shine boldly' },
  { id: 't-a2-chamber-of-sins', act: 2, zone: 'The Chamber of Sins Level 2', izaro: 'consideration and hesitation' },
  { id: 't-a3-crematorium', act: 3, zone: 'The Crematorium', izaro: 'tempered by the flames' },
  { id: 't-a3-catacombs', act: 3, zone: 'The Catacombs', izaro: 'bear two blades' },
  { id: 't-a3-imperial-gardens', act: 3, zone: 'The Imperial Gardens', izaro: 'precisely where he stands' }
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
  /** Trial located in the zone the player is currently in (hint), else null. */
  currentZoneTrialId: string | null
}

export class TrialsEngine {
  private readonly trials: readonly TrialDef[]
  private seen = new Set<string>()
  private currentZoneTrial: string | null = null

  constructor(seenIds: string[] = [], trials: readonly TrialDef[] = NORMAL_TRIALS) {
    this.trials = trials
    const valid = new Set(trials.map((t) => t.id))
    for (const id of seenIds) if (valid.has(id)) this.seen.add(id)
  }

  snapshot(): TrialsSnapshot {
    const trials = this.trials.map((t) => ({ id: t.id, act: t.act, zone: t.zone, seen: this.seen.has(t.id) }))
    return {
      trials,
      seenCount: this.seen.size,
      total: this.trials.length,
      currentZoneTrialId: this.currentZoneTrial
    }
  }

  /** Note the zone the player entered. Marks nothing — only tracks whether the
   *  current zone contains a trial (the hint). Returns true if that changed. */
  applyZone(zoneName: string): boolean {
    const next = this.matchZone(zoneName)?.id ?? null
    if (next === this.currentZoneTrial) return false
    this.currentZoneTrial = next
    return true
  }

  /** Izaro speaks a distinct plaque line as you finish each trial — match it to
   *  the trial it belongs to and mark that one seen. Zone-independent, so his
   *  intro/Labyrinth chatter (no plaque fragment) never counts. Returns true if
   *  it newly completed a trial (idempotent / no-match otherwise). */
  completeByIzaro(line: string): boolean {
    const said = line.toLowerCase()
    const t = this.trials.find((t) => said.includes(t.izaro.toLowerCase()))
    if (!t || this.seen.has(t.id)) return false
    this.seen.add(t.id)
    return true
  }

  /** The trial located in a zone (exact or prefix name match), else null. */
  matchZone(zoneName: string): TrialDef | null {
    if (!zoneName) return null
    const entered = zoneName.trim().toLowerCase()
    for (const t of this.trials) {
      const z = t.zone.toLowerCase()
      if (entered === z || entered.startsWith(z)) return t
    }
    return null
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
