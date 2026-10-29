import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  Announcer,
  DEFAULT_ANNOUNCE,
  eventOf,
  phrase,
  sample,
  sanitizeAnnounce,
  ANNOUNCE_EVENTS,
  type Observed
} from '../electron/announce-rules.ts'

const base: Observed = {
  character: 'Hero',
  profile: 'berserker',
  areaId: '1_1_2',
  trialHere: false,
  zone: null,
  gems: ['Cleave'],
  labs: [],
  choice: null,
  passive: 'Strength'
}

test('the first look, a character switch and another profile say nothing', () => {
  const a = new Announcer()
  const busy: Observed = { ...base, trialHere: true, zone: { verdict: 'under', by: 3 }, labs: ['normal'] }
  assert.deepEqual(a.observe(busy), [], 'a restart in a trial zone is the baseline')
  assert.deepEqual(a.observe({ ...busy, character: 'Alt', gems: ['Sunder'] }), [])
  assert.deepEqual(a.observe({ ...busy, character: 'Alt', profile: 'other', gems: ['Fireball'] }), [])
})

test('each change is said once', () => {
  const a = new Announcer()
  a.observe(base)
  const later = { ...base, gems: ['Cleave', 'Cruelty', 'Sunder'], passive: 'Born to Fight' }
  assert.deepEqual(a.observe(later), [
    { event: 'gems', gems: ['Cruelty', 'Sunder'] },
    { event: 'passive', name: 'Born to Fight' }
  ])
  // nothing new: nothing said
  assert.deepEqual(a.observe(later), [])
  assert.deepEqual(a.observe({ ...later, labs: ['normal'], choice: { id: 'bandit', wants: 'help Alira' } }), [
    { event: 'lab', lab: 'normal' },
    { event: 'choice', id: 'bandit', wants: 'help Alira' }
  ])
})

test('a trial zone and a costly zone are said once, not again on the way back', () => {
  const a = new Announcer()
  a.observe(base)
  const trial = { ...base, areaId: '1_1_7_1', trialHere: true }
  assert.deepEqual(a.observe(trial), [{ event: 'trial' }])
  assert.deepEqual(a.observe({ ...base, areaId: '1_1_town' }), [])
  assert.deepEqual(a.observe(trial), [], 'back in: not again')
  const low = { ...base, areaId: '1_2_1', zone: { verdict: 'over' as const, by: 4 } }
  assert.deepEqual(a.observe(low), [{ event: 'zone', verdict: 'over', by: 4 }])
  assert.deepEqual(a.observe({ ...low, zone: { verdict: 'over' as const, by: 5 } }), [], 'a level-up there: still the same zone')
})

test('what each says, in English and German', () => {
  const say = (lang: 'en' | 'de') => ANNOUNCE_EVENTS.map((e) => phrase(sample(e), lang))
  assert.deepEqual(say('en'), [
    'Trial in this zone',
    'New gems: Cleave, Cruelty',
    'Zone 5 levels too high',
    'Normal Labyrinth open',
    'Bandits: help Alira',
    'Pantheon: Soul of Lunaris',
    'Passive point: Born to Fight'
  ])
  assert.deepEqual(say('de'), [
    'Trial in dieser Zone',
    'Neue Gems: Cleave, Cruelty',
    'Zone 5 Level zu hoch',
    'Labyrinth offen: Normal',
    'Banditen: Alira helfen',
    'Pantheon: Soul of Lunaris',
    'Passivpunkt: Born to Fight'
  ])
  assert.equal(phrase({ event: 'gems', gems: ['A', 'B', 'C', 'D', 'E'] }, 'en'), 'New gems: A, B, C and 2 more')
  assert.equal(phrase({ event: 'zone', verdict: 'over', by: 1 }, 'en'), 'Zone 1 level too low')
  assert.equal(phrase({ event: 'choice', id: 'bandit', wants: 'kill all three' }, 'de'), 'Banditen: alle drei töten')
  assert.equal(phrase({ event: 'choice', id: 'pantheon', wants: 'Soul of Lunaris' }, 'de'), 'Pantheon: Soul of Lunaris')
})

test('settings are made whole: wrong or missing parts are the defaults', () => {
  assert.deepEqual(sanitizeAnnounce(undefined), DEFAULT_ANNOUNCE)
  const s = sanitizeAnnounce({ lang: 'fr', voice: 42, volume: 3, events: { gems: true, trial: 'yes', bogus: true } })
  assert.equal(s.lang, 'en')
  assert.equal(s.voice, '')
  assert.equal(s.volume, 1)
  assert.deepEqual(s.events, { ...DEFAULT_ANNOUNCE.events, gems: true })
  // a patch over what's stored keeps the rest
  const stored = { ...DEFAULT_ANNOUNCE, lang: 'de' as const, events: { ...DEFAULT_ANNOUNCE.events, lab: true } }
  assert.deepEqual(sanitizeAnnounce({ volume: 0.5 }, stored), { ...stored, volume: 0.5 })
})

test('the old single bandit/Pantheon switch carries over to both', () => {
  const on = sanitizeAnnounce({ events: { choice: true } }).events
  assert.equal(on.bandit, true)
  assert.equal(on.pantheon, true)
  // a newer setting of either wins over the old one
  const mixed = sanitizeAnnounce({ events: { choice: true, pantheon: false } }).events
  assert.deepEqual([mixed.bandit, mixed.pantheon], [true, false])
})

test('each announcement answers to its own switch', () => {
  assert.equal(eventOf({ event: 'choice', id: 'bandit', wants: 'help Alira' }), 'bandit')
  assert.equal(eventOf({ event: 'choice', id: 'pantheon', wants: 'Soul of Lunaris' }), 'pantheon')
  assert.equal(eventOf({ event: 'trial' }), 'trial')
  for (const e of ANNOUNCE_EVENTS) assert.equal(eventOf(sample(e)), e, `the ${e} sample`)
})
