// Ascendancy trials tracker (pure, no Electron imports — unit-tested).
// All TWELVE campaign Trials of Ascendancy: six gating the Normal Labyrinth
// (Acts 1–3), three for Cruel (Acts 6–7) and three for Merciless (Acts 8–10).
// Entering a trial's zone does NOT auto-complete it (you can walk a zone without
// doing its trial); the tracker surfaces a "trial in this zone"
// hint. Completion IS auto-detected from Izaro's plaque voice line: he only
// speaks it as you finish a trial. There are just six plaque lines for twelve
// trials, so the LINE alone cannot say which one — the ZONE you're standing in
// does. Hence: an Izaro line while in a trial's zone completes THAT trial, and
// when the zone is unknown we fall back to matching the line against the
// verified plaque fragments. Manual toggle remains for anything missed.

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
  /** A distinctive fragment of Izaro's plaque line. All twelve are verified
   *  from real captures: cruel/merciless reuse the six normal-lab lines, so the
   *  line alone can't identify them — the zone does. */
  izaro?: string
}

// All twelve campaign trials: six for the Normal Labyrinth (Acts 1–3), three for
// Cruel (Acts 6–7) and three for Merciless (Acts 8–10). Zones and plaque lines
// are verified against real captures (normal 2026-07-21, all twelve 2026-10-22);
// the manual toggle stays for anything missed. Completion is zone + an Izaro
// line, so a zone name that drifts degrades to the plaque-line fallback rather
// than breaking.
export const CAMPAIGN_TRIALS: readonly TrialDef[] = [
  // Normal Labyrinth.
  { id: 't-a1-lower-prison', act: 1, lab: 'normal', zone: 'The Lower Prison', izaro: 'strongest metal' },
  { id: 't-a2-crypt', act: 2, lab: 'normal', zone: 'The Crypt Level 1', izaro: 'Shine boldly' },
  { id: 't-a2-chamber-of-sins', act: 2, lab: 'normal', zone: 'The Chamber of Sins Level 2', izaro: 'consideration and hesitation' },
  { id: 't-a3-crematorium', act: 3, lab: 'normal', zone: 'The Crematorium', izaro: 'tempered by the flames' },
  { id: 't-a3-catacombs', act: 3, lab: 'normal', zone: 'The Catacombs', izaro: 'bear two blades' },
  { id: 't-a3-imperial-gardens', act: 3, lab: 'normal', zone: 'The Imperial Gardens', izaro: 'precisely where he stands' },
  // Cruel Labyrinth. Act 6's trial is in The Lower Prison, like Act 1's — the
  // act tells them apart (see matchZone). It used to say "The Prison", a zone
  // that doesn't exist, so the Act 6 trial never completed on its own.
  { id: 't-a6-prison', act: 6, lab: 'cruel', zone: 'The Lower Prison', izaro: 'strongest metal' },
  { id: 't-a7-crypt', act: 7, lab: 'cruel', zone: 'The Crypt', izaro: 'Shine boldly' },
  { id: 't-a7-chamber-of-sins', act: 7, lab: 'cruel', zone: 'The Chamber of Sins Level 2', izaro: 'consideration and hesitation' },
  // Merciless Labyrinth.
  { id: 't-a8-bath-house', act: 8, lab: 'merciless', zone: 'The Bath House', izaro: 'tempered by the flames' },
  { id: 't-a9-tunnel', act: 9, lab: 'merciless', zone: 'The Tunnel', izaro: 'bear two blades' },
  { id: 't-a10-ossuary', act: 10, lab: 'merciless', zone: 'The Ossuary', izaro: 'precisely where he stands' }
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
  /** Labyrinths whose trials are all done and that haven't been dismissed yet —
   *  the "you can run this now" notice. Ordered normal → cruel → merciless. */
  unlockedLabs: LabTier[]
}

const LAB_ORDER: readonly LabTier[] = ['normal', 'cruel', 'merciless']

export class TrialsEngine {
  private readonly trials: readonly TrialDef[]
  private seen = new Set<string>()
  private currentZoneTrial: string | null = null
  /** Whether you're in the campaign, as far as the area id says. The endgame
   *  trials in maps reuse the same six plaque lines, so out there a line must
   *  not fall back to ticking a campaign trial. */
  private inCampaign = true
  /** Labyrinths whose unlock notice has been dismissed. Persisted, because the
   *  gap between "unlocked" and "actually ran it" is often hours. */
  private dismissedLabs = new Set<LabTier>()

  constructor(
    seenIds: string[] = [],
    dismissedLabs: string[] = [],
    trials: readonly TrialDef[] = CAMPAIGN_TRIALS
  ) {
    this.trials = trials
    const valid = new Set(trials.map((t) => t.id))
    for (const id of seenIds) if (valid.has(id)) this.seen.add(id)
    for (const lab of dismissedLabs) {
      if ((LAB_ORDER as readonly string[]).includes(lab)) this.dismissedLabs.add(lab as LabTier)
    }
  }

  /** Labyrinths with every trial done, minus the ones already acknowledged. */
  private unlocked(): LabTier[] {
    return LAB_ORDER.filter((lab) => {
      if (this.dismissedLabs.has(lab)) return false
      const of = this.trials.filter((t) => t.lab === lab)
      return of.length > 0 && of.every((t) => this.seen.has(t.id))
    })
  }

  /** Acknowledge a Labyrinth's unlock notice. Returns true if that changed
   *  anything, so the caller knows whether to persist and push. */
  dismissLab(lab: string): boolean {
    if (!(LAB_ORDER as readonly string[]).includes(lab)) return false
    if (this.dismissedLabs.has(lab as LabTier)) return false
    this.dismissedLabs.add(lab as LabTier)
    return true
  }

  dismissedLabIds(): string[] {
    return [...this.dismissedLabs]
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
      currentZoneTrialId: this.currentZoneTrial,
      unlockedLabs: this.unlocked()
    }
  }

  /** Note the zone the player entered (with the act, when known — some zones
   *  host a trial in TWO difficulties, e.g. The Chamber of Sins Level 2 in Act 2
   *  and again in Act 7). `campaign` is false for a zone whose id says it isn't
   *  one (a map, the Labyrinth); without an id, assume it is. Marks nothing;
   *  only tracks whether the current zone contains a trial (the hint). Returns
   *  true if that changed. */
  applyZone(zoneName: string, act?: number | null, campaign = true): boolean {
    this.inCampaign = campaign
    const next = this.matchZone(zoneName, act)?.id ?? null
    if (next === this.currentZoneTrial) return false
    this.currentZoneTrial = next
    return true
  }

  /** Izaro spoke — he only voices a plaque as a trial is completed. The zone
   *  decides WHICH trial (six lines cover twelve trials, so the line can't):
   *  standing in a trial's zone completes that one. With no trial zone active
   *  (unknown/renamed zone) fall back to the plaque fragments, taking the
   *  earliest still-unfinished match — but only in the campaign: the endgame
   *  trials say the same lines. Returns true if this newly completed a trial
   *  (idempotent / no-match otherwise). */
  completeByIzaro(line: string): boolean {
    const here = this.currentZoneTrial
    if (here) {
      if (this.seen.has(here)) return false
      this.seen.add(here)
      return true
    }
    if (!this.inCampaign) return false
    const said = line.toLowerCase()
    const t = this.trials.find(
      (t) => t.izaro && said.includes(t.izaro.toLowerCase()) && !this.seen.has(t.id)
    )
    if (!t) return false
    this.seen.add(t.id)
    return true
  }

  /** The trial located in a zone, else null. The name must match exactly (a
   *  parenthesised instance suffix is tolerated) — a free prefix match is wrong
   *  here, because zone names nest: "The Crypt Level 2" in Act 2 would otherwise
   *  match Act 7's "The Crypt" and hint at a trial that isn't there. When the act
   *  is known it wins the tie between difficulties that share a zone name;
   *  without it the earliest matching trial is used. */
  matchZone(zoneName: string, act?: number | null): TrialDef | null {
    if (!zoneName) return null
    const entered = zoneName.trim().toLowerCase()
    const hits = this.trials.filter((t) => {
      const z = t.zone.toLowerCase()
      return entered === z || entered.startsWith(`${z} (`)
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
    // Dismissals go too: with no trials done there is nothing to acknowledge,
    // and keeping them would silence the notice for a fresh character.
    this.dismissedLabs.clear()
  }

  seenIds(): string[] {
    return [...this.seen]
  }
}
