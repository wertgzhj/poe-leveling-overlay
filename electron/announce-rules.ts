// Spoken announcements: which moments are worth a voice, and what it says.
// Pure (unit-tested in tests/announce.test.ts); electron/announce.ts feeds it
// and the overlay window speaks the text through the system's own voices —
// locally, nothing goes anywhere, and the game hears nothing of it
// (docs/ARCHITECTURE.md#tos-position).

import type { LabTier } from './trials/engine.ts'

/** The moments the overlay can announce, each switched on or off on its own.
 *  The bandits and the Pantheon are one kind of announcement ('choice') but two
 *  switches, like their two rows in Settings → What the overlay shows. */
export const ANNOUNCE_EVENTS = ['trial', 'gems', 'zone', 'lab', 'bandit', 'pantheon', 'passive', 'respec'] as const
export type AnnounceEvent = (typeof ANNOUNCE_EVENTS)[number]

export const ANNOUNCE_LANGS = ['en', 'de'] as const
export type AnnounceLang = (typeof ANNOUNCE_LANGS)[number]

export interface AnnounceSettings {
  /** what the announcements are worded in */
  lang: AnnounceLang
  /** a system voice by name; '' = the first one for the language */
  voice: string
  /** 0-1 */
  volume: number
  events: Record<AnnounceEvent, boolean>
}

export const DEFAULT_ANNOUNCE: AnnounceSettings = {
  lang: 'en',
  voice: '',
  volume: 0.8,
  events: {
    trial: false,
    gems: false,
    zone: false,
    lab: false,
    bandit: false,
    pantheon: false,
    passive: false,
    respec: false
  }
}

/** Stored or sent settings, made whole: anything missing or wrong is the default. */
export function sanitizeAnnounce(raw: unknown, base: AnnounceSettings = DEFAULT_ANNOUNCE): AnnounceSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof AnnounceSettings, unknown>>
  const events = { ...base.events }
  if (r.events && typeof r.events === 'object') {
    const raw = r.events as Record<string, unknown>
    // v0.34 had one switch for both choices; it carries over to each
    if (typeof raw.choice === 'boolean') events.bandit = events.pantheon = raw.choice
    for (const e of ANNOUNCE_EVENTS) {
      const v = raw[e]
      if (typeof v === 'boolean') events[e] = v
    }
  }
  return {
    lang: ANNOUNCE_LANGS.includes(r.lang as AnnounceLang) ? (r.lang as AnnounceLang) : base.lang,
    // a voice's name, as the system lists it; nothing else is read from it
    voice: typeof r.voice === 'string' ? r.voice.slice(0, 200) : base.voice,
    volume: typeof r.volume === 'number' && Number.isFinite(r.volume) ? Math.min(1, Math.max(0, r.volume)) : base.volume,
    events
  }
}

/** What the overlay knows at one moment — enough to tell what just changed. */
export interface Observed {
  character: string | null
  /** the profile shown; switching it isn't news */
  profile: string | null
  areaId: string | null
  /** a trial you haven't done is in this zone */
  trialHere: boolean
  /** the zone's level against yours, when the gap costs experience */
  zone: { verdict: 'under' | 'over'; by: number } | null
  /** the gems to buy now */
  gems: string[]
  /** Labyrinths ready to run */
  labs: LabTier[]
  /** a bandit or Pantheon choice that's due */
  choice: { id: 'bandit' | 'pantheon'; wants: string } | null
  /** the passive your newest point goes on */
  passive: string | null
  /** a respec that can be done now and isn't marked done: its key and what
   *  it takes out */
  respec: { key: string; names: string[] } | null
}

export type Announcement =
  | { event: 'trial' }
  | { event: 'gems'; gems: string[] }
  | { event: 'zone'; verdict: 'under' | 'over'; by: number }
  | { event: 'lab'; lab: LabTier }
  | { event: 'choice'; id: 'bandit' | 'pantheon'; wants: string }
  | { event: 'passive'; name: string }
  | { event: 'respec'; names: string[] }

/**
 * Turns what the overlay sees, moment by moment, into what's worth saying:
 * only changes, never the state it starts from. The first look at a character
 * or a profile is the baseline — a restart, a character switch or another
 * profile says nothing. A trial zone or a costly zone is said once per
 * character, not again when you walk back in.
 */
export class Announcer {
  private last: Observed | null = null
  private saidTrial = new Set<string>()
  private saidZone = new Set<string>()

  observe(now: Observed): Announcement[] {
    const prev = this.last
    this.last = now
    if (!prev || prev.character !== now.character) {
      this.saidTrial.clear()
      this.saidZone.clear()
      return []
    }
    if (prev.profile !== now.profile) return []
    const out: Announcement[] = []
    const area = now.areaId
    if (now.trialHere && area && !this.saidTrial.has(area)) {
      this.saidTrial.add(area)
      out.push({ event: 'trial' })
    }
    if (now.zone && area && !this.saidZone.has(`${area}|${now.zone.verdict}`)) {
      this.saidZone.add(`${area}|${now.zone.verdict}`)
      out.push({ event: 'zone', ...now.zone })
    }
    const newGems = now.gems.filter((g) => !prev.gems.includes(g))
    if (newGems.length) out.push({ event: 'gems', gems: newGems })
    for (const lab of now.labs) if (!prev.labs.includes(lab)) out.push({ event: 'lab', lab })
    if (now.choice && now.choice.id !== prev.choice?.id) out.push({ event: 'choice', ...now.choice })
    if (now.passive && now.passive !== prev.passive) out.push({ event: 'passive', name: now.passive })
    if (now.respec && now.respec.key !== prev.respec?.key) out.push({ event: 'respec', names: now.respec.names })
    return out
  }
}

/** At most this many gem names; the rest are counted. */
const GEMS_SAID = 3

/** What an announcement says, in the language set. Short: it plays over the game. */
export function phrase(a: Announcement, lang: AnnounceLang): string {
  const de = lang === 'de'
  switch (a.event) {
    case 'trial':
      return de ? 'Trial in dieser Zone' : 'Trial in this zone'
    case 'gems': {
      const named = a.gems.slice(0, GEMS_SAID).join(', ')
      const more = a.gems.length - GEMS_SAID
      if (de) return `Neue Gems: ${named}${more > 0 ? ` und ${more} weitere` : ''}`
      return `New gems: ${named}${more > 0 ? ` and ${more} more` : ''}`
    }
    case 'zone': {
      // under: you're below the zone, so the zone is too high for you
      const high = a.verdict === 'under'
      if (de) return `Zone ${a.by} Level zu ${high ? 'hoch' : 'niedrig'}`
      return `Zone ${a.by} ${a.by === 1 ? 'level' : 'levels'} too ${high ? 'high' : 'low'}`
    }
    case 'lab': {
      const tier = a.lab[0].toUpperCase() + a.lab.slice(1)
      return de ? `Labyrinth offen: ${tier}` : `${tier} Labyrinth open`
    }
    case 'choice': {
      if (a.id === 'pantheon') return `Pantheon: ${a.wants}`
      if (!de) return `Bandits: ${a.wants}`
      // the profile's wording is English ("help Alira", "kill all three")
      const help = /^help (.+)$/i.exec(a.wants)
      return `Banditen: ${help ? `${help[1]} helfen` : /kill all/i.test(a.wants) ? 'alle drei töten' : a.wants}`
    }
    case 'passive':
      return de ? `Passivpunkt: ${a.name}` : `Passive point: ${a.name}`
    case 'respec': {
      const named = a.names.slice(0, GEMS_SAID).join(', ')
      const more = a.names.length - GEMS_SAID
      if (de) return `Achtung, Respec: ${named}${more > 0 ? ` und ${more} weitere` : ''}`
      return `Respec due: ${named}${more > 0 ? ` and ${more} more` : ''}`
    }
  }
}

/** The switch an announcement answers to. */
export function eventOf(a: Announcement): AnnounceEvent {
  return a.event === 'choice' ? a.id : a.event
}

/** An example of each, for the Settings test buttons. */
export function sample(event: AnnounceEvent): Announcement {
  switch (event) {
    case 'trial':
      return { event }
    case 'gems':
      return { event, gems: ['Cleave', 'Cruelty'] }
    case 'zone':
      return { event, verdict: 'under', by: 5 }
    case 'lab':
      return { event, lab: 'normal' }
    case 'bandit':
      return { event: 'choice', id: 'bandit', wants: 'help Alira' }
    case 'pantheon':
      return { event: 'choice', id: 'pantheon', wants: 'Soul of Lunaris' }
    case 'passive':
      return { event, name: 'Born to Fight' }
    case 'respec':
      return { event, names: ['Strength', 'Life and Armour'] }
  }
}
