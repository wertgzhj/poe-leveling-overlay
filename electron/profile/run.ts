// A character's run: how far it got (the act) and which one-shot
// reminders it has dismissed. Pure — no Electron: it reads and writes through
// a small store interface, which the profile service backs with the settings
// file and the tests with a plain object. Everything here is keyed by
// character name, and names come back every league (see forget).

import { BANDITS, type ProfileMeta } from './profile.ts'

/** Act 2 asks you to deal with the bandits; the Pantheon's powers come from
 *  the gods you defeat in Acts 6-10 (poewiki, The Pantheon) — Tukohama, in
 *  Act 6, is the first. */
const BANDIT_ACT = 2
const PANTHEON_ACT = 6

/** A one-shot build decision the profile names and you've now reached the point
 *  for. Shown once in the notice bar, then dismissed for good. */
export interface ChoiceDue {
  id: 'bandit' | 'pantheon'
  /** what the profile decided, already phrased for the bar. */
  wants: string
  /** the alternatives, for the tooltip — you're choosing, so they matter. */
  options: string[]
}

/** What a run keeps, per character name. */
export interface RunData {
  actReached: Record<string, number>
  dismissedChoices: Record<string, string[]>
  /** The Pantheon powers this character has unlocked ("Soul of Tukohama"),
   *  ticked when Sin bids its god farewell, or by hand. */
  pantheonUnlocked: Record<string, string[]>
  questPoints: Record<string, QuestPoints>
}

/** The passive points a character got from Books of Skill, and when the last
 *  one was logged: lines up to then are ones already counted. */
export interface QuestPoints {
  count: number
  wall: number
  tick: number | null
}

export interface RunStore {
  get<K extends keyof RunData>(key: K): RunData[K]
  set<K extends keyof RunData>(key: K, value: RunData[K]): void
}

export class CharacterRuns {
  private readonly store: RunStore

  constructor(store: RunStore) {
    this.store = store
  }

  /** The furthest act this character has reached, or null when we don't know
   *  yet. Read fresh rather than cached: it moves at most nine times in a run. */
  act(name: string | null): number | null {
    if (!name) return null
    return this.store.get('actReached')[name] ?? null
  }

  /**
   * Record reaching an act. Persisted per character and monotonic on purpose:
   * campaign progress doesn't go backwards, and portalling to Act 1's town must
   * not hide the Act 5 shopping list. Returns true when it moved.
   */
  noteAct(name: string | null, act: number | null): boolean {
    if (act == null || !name) return false
    const map = this.store.get('actReached')
    if ((map[name] ?? 0) >= act) return false
    this.store.set('actReached', { ...map, [name]: act })
    return true
  }

  /**
   * A brand-new character (see LogService.addFreshCharacterListener). Names get
   * reused every league, so without this a fresh Act 1 character would inherit
   * last league's namesake's run: the Act 10 mark (the whole campaign's list
   * again) and dismissed bandit/pantheon reminders — the ones
   * that matter most, because missing the bandits is for good.
   *
   * Only the run is forgotten. Which profile the name uses and what it mules
   * are choices, not progress, and are kept elsewhere.
   *
   * This used to happen on entering the Strand, keyed by the tracked
   * character — but in auto mode the tracker lets go of the old character
   * right there, so there was no name to reset and nothing ever was.
   */
  forget(name: string): void {
    this.store.set('actReached', { ...this.store.get('actReached'), [name]: 1 })
    this.store.set('dismissedChoices', without(this.store.get('dismissedChoices'), name))
    this.store.set('pantheonUnlocked', without(this.store.get('pantheonUnlocked'), name))
    // Zero from now on: an older namesake's Book of Skill, replayed by the
    // backscan, is from before this character existed.
    this.store.set('questPoints', { ...this.store.get('questPoints'), [name]: { count: 0, wall: Date.now(), tick: null } })
  }

  /** Book of Skill points this character used. */
  questPoints(name: string | null): number {
    if (!name) return 0
    return this.store.get('questPoints')[name]?.count ?? 0
  }

  /**
   * "You have received a Passive Skill Point." for this character, written at
   * `wall`/`tick`. A line at or before the last one counted is the backscan
   * replaying it after a restart, and doesn't count again. Returns true when
   * it counted.
   */
  addQuestPoint(name: string | null, wall: number, tick: number | null): boolean {
    if (!name) return false
    const map = this.store.get('questPoints')
    const last = map[name]
    if (last && (wall < last.wall || (wall === last.wall && (tick ?? 0) <= (last.tick ?? 0)))) return false
    this.store.set('questPoints', { ...map, [name]: { count: (last?.count ?? 0) + 1, wall, tick } })
    return true
  }

  /** The Pantheon powers this character has unlocked. */
  pantheon(name: string | null): string[] {
    if (!name) return []
    return this.store.get('pantheonUnlocked')[name] ?? []
  }

  /** Mark a Pantheon power unlocked — its god fell (see godsFallen). Returns
   *  true when it wasn't already. */
  unlockPantheon(name: string | null, soul: string): boolean {
    if (!name || !soul) return false
    const map = this.store.get('pantheonUnlocked')
    const have = map[name] ?? []
    if (have.includes(soul)) return false
    this.store.set('pantheonUnlocked', { ...map, [name]: [...have, soul] })
    return true
  }

  /** Tick or untick a Pantheon power as unlocked. Returns true when it changed. */
  togglePantheon(name: string | null, soul: string): boolean {
    if (!name || !soul) return false
    const map = this.store.get('pantheonUnlocked')
    const have = map[name] ?? []
    const next = have.includes(soul) ? have.filter((s) => s !== soul) : [...have, soul]
    this.store.set('pantheonUnlocked', { ...map, [name]: next })
    return true
  }

  /**
   * A build decision the profile named and you've now reached the point for.
   * Both are one-shot and permanent for the character, which is exactly why a
   * reminder is worth a bar: forgetting the bandits costs you the choice for
   * good. A profile that says nothing gets no notice — the app has no opinion
   * on which is right, that's the whole reason the field exists.
   */
  choiceDue(name: string | null, meta: ProfileMeta | undefined): ChoiceDue | null {
    const act = this.act(name)
    if (!meta || act == null) return null
    const done = new Set(name ? (this.store.get('dismissedChoices')[name] ?? []) : [])

    // Bandits first: Act 2 comes first, and once you're past it the pantheon is
    // the only one left to nag about. Only one bar, so only one claim.
    if (meta.bandit && act >= BANDIT_ACT && !done.has('bandit')) {
      return {
        id: 'bandit',
        wants: meta.bandit === 'Kill all' ? 'kill all three' : `help ${meta.bandit}`,
        options: BANDITS.map((b) => (b === 'Kill all' ? 'kill all three' : `help ${b}`))
      }
    }
    const pantheon = meta.pantheon
    if (pantheon && act >= PANTHEON_ACT && !done.has('pantheon')) {
      return {
        id: 'pantheon',
        wants: [pantheon.major, pantheon.minor].filter(Boolean).join(' + '),
        options: []
      }
    }
    return null
  }

  /** Acknowledge a reminder. One-shot decisions, so it never comes back.
   *  Returns true when something changed. */
  dismiss(name: string | null, id: string): boolean {
    if (!name || (id !== 'bandit' && id !== 'pantheon')) return false
    const map = this.store.get('dismissedChoices')
    const done = map[name] ?? []
    if (done.includes(id)) return false
    this.store.set('dismissedChoices', { ...map, [name]: [...done, id] })
    return true
  }
}

/** A per-character map minus one character. */
function without<T>(map: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _gone, ...rest } = map
  return rest
}
