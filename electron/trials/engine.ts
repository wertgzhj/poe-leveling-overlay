// Ascendancy trials tracker (pure, no Electron imports — unit-tested).
// All TWELVE campaign Trials of Ascendancy: six gating the Normal Labyrinth
// (Acts 1–3), three for Cruel (Acts 6–7) and three for Merciless (Acts 8–10).
// Entering a trial's zone does NOT auto-complete it (you can walk a zone without
// doing its trial — owner feedback); the tracker surfaces a "trial in this zone"
// hint. Completion IS auto-detected from Izaro's plaque voice line: he only
// speaks it as you finish a trial. There are just six plaque lines for twelve
// trials, so the LINE alone cannot say which one — the ZONE you're standing in
// does. Hence: an Izaro line while in a trial's zone completes THAT trial, and
// when the zone is unknown we fall back to matching the line against the six
// verified normal-lab fragments. Manual toggle remains for anything missed.

/** Which Labyrinth a trial unlocks. All three are done during the campaign. */
export type LabTier = 'normal' | 'cruel' | 'merciless'

export const LAB_LABEL: Record<LabTier, string> = {
  normal: 'Normal Labyrinth',
  cruel: 'Cruel Labyrinth',
  merciless: 'Merciless Labyrinth'
}

export interface TrialDef {
  id: string
  act: number
  lab: LabTier
  /** Zone that contains the trial. Matched against the entered zone name
   *  (exact or prefix) — the "trial in this zone" hint AND, with an Izaro line,
   *  the completion signal. */
  zone: string
  /** A distinctive fragment of Izaro's plaque line, where known. Only the six
   *  normal-lab lines are verified from real captures; cruel/merciless reuse the
   *  same six lines, so the line alone can't identify them — the zone does. */
  izaro?: string
}

// All twelve campaign trials: six for the Normal Labyrinth (Acts 1–3), three for
// Cruel (Acts 6–7) and three for Merciless (Acts 8–10). Zone names are
// provisional (the 🐞 dev panel shows each zone you enter) and the manual toggle
// covers any mismatch; completion is zone + an Izaro line, so a wrong zone name
// degrades to the plaque-line fallback rather than breaking.
export const CAMPAIGN_TRIALS: readonly TrialDef[] = [
  // Normal Labyrinth — plaque lines verified 2026-07-21.
  { id: 't-a1-lower-prison', act: 1, lab: 'normal', zone: 'The Lower Prison', izaro: 'strongest metal' },
  { id: 't-a2-crypt', act: 2, lab: 'normal', zone: 'The Crypt Level 1', izaro: 'Shine boldly' },
  { id: 't-a2-chamber-of-sins', act: 2, lab: 'normal', zone: 'The Chamber of Sins Level 2', izaro: 'consideration and hesitation' },
  { id: 't-a3-crematorium', act: 3, lab: 'normal', zone: 'The Crematorium', izaro: 'tempered by the flames' },
  { id: 't-a3-catacombs', act: 3, lab: 'normal', zone: 'The Catacombs', izaro: 'bear two blades' },
  { id: 't-a3-imperial-gardens', act: 3, lab: 'normal', zone: 'The Imperial Gardens', izaro: 'precisely where he stands' },
  // Cruel Labyrinth.
  { id: 't-a6-prison', act: 6, lab: 'cruel', zone: 'The Prison' },
  { id: 't-a7-crypt', act: 7, lab: 'cruel', zone: 'The Crypt' },
  { id: 't-a7-chamber-of-sins', act: 7, lab: 'cruel', zone: 'The Chamber of Sins Level 2' },
  // Merciless Labyrinth.
  { id: 't-a8-bath-house', act: 8, lab: 'merciless', zone: 'The Bath House' },
  { id: 't-a9-tunnel', act: 9, lab: 'merciless', zone: 'The Tunnel' },
  { id: 't-a10-ossuary', act: 10, lab: 'merciless', zone: 'The Ossuary' }
] as const

/** @deprecated kept for older imports — the six Normal-Labyrinth trials. */
export const NORMAL_TRIALS: readonly TrialDef[] = CAMPAIGN_TRIALS.filter((t) => t.lab === 'normal')

export interface TrialState {
  id: string
  act: number
  lab: LabTier
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

  constructor(seenIds: string[] = [], trials: readonly TrialDef[] = CAMPAIGN_TRIALS) {
    this.trials = trials
    const valid = new Set(trials.map((t) => t.id))
    for (const id of seenIds) if (valid.has(id)) this.seen.add(id)
  }

  snapshot(): TrialsSnapshot {
    const trials = this.trials.map((t) => ({
      id: t.id,
      act: t.act,
      lab: t.lab,
      zone: t.zone,
      seen: this.seen.has(t.id)
    }))
    return {
      trials,
      seenCount: this.seen.size,
      total: this.trials.length,
      currentZoneTrialId: this.currentZoneTrial
    }
  }

  /** Note the zone the player entered (with the act, when known — some zones
   *  host a trial in TWO difficulties, e.g. The Chamber of Sins Level 2 in Act 2
   *  and again in Act 7). Marks nothing; only tracks whether the current zone
   *  contains a trial (the hint). Returns true if that changed. */
  applyZone(zoneName: string, act?: number | null): boolean {
    const next = this.matchZone(zoneName, act)?.id ?? null
    if (next === this.currentZoneTrial) return false
    this.currentZoneTrial = next
    return true
  }

  /** Izaro spoke — he only voices a plaque as a trial is completed. The zone
   *  decides WHICH trial (six lines cover twelve trials, so the line can't):
   *  standing in a trial's zone completes that one. With no trial zone active
   *  (unknown/renamed zone) fall back to the six verified normal-lab fragments,
   *  taking the earliest still-unfinished match. Returns true if this newly
   *  completed a trial (idempotent / no-match otherwise). */
  completeByIzaro(line: string): boolean {
    const here = this.currentZoneTrial
    if (here) {
      if (this.seen.has(here)) return false
      this.seen.add(here)
      return true
    }
    const said = line.toLowerCase()
    const t = this.trials.find(
      (t) => t.izaro && said.includes(t.izaro.toLowerCase()) && !this.seen.has(t.id)
    )
    if (!t) return false
    this.seen.add(t.id)
    return true
  }

  /** The trial located in a zone (exact or prefix name match), else null. When
   *  the act is known it wins the tie between difficulties that share a zone
   *  name; without it the earliest matching trial is used. */
  matchZone(zoneName: string, act?: number | null): TrialDef | null {
    if (!zoneName) return null
    const entered = zoneName.trim().toLowerCase()
    const hits = this.trials.filter((t) => {
      const z = t.zone.toLowerCase()
      return entered === z || entered.startsWith(z)
    })
    if (hits.length === 0) return null
    if (act != null) {
      const exact = hits.find((t) => t.act === act)
      if (exact) return exact
    }
    return hits[0]
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
