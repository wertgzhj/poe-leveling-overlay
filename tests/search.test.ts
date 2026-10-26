import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quotedSearch, searchTerm, vendorSearch, SEARCH_BOX_LIMIT } from '../electron/profile/search.ts'
import type { AcquisitionEntry, AcquisitionItem } from '../electron/profile/engine/types.ts'

const entry = (gem: string, extra: Partial<AcquisitionEntry> = {}): AcquisitionEntry => ({
  gem,
  bucket: 'purchase',
  ...extra
})
const buy = (gem: string, extra: Partial<AcquisitionEntry> = {}, later = false): AcquisitionItem => ({
  kind: 'buy',
  entry: entry(gem, extra),
  later
})

test('a name becomes a lower-case alternative, its regex characters escaped', () => {
  assert.equal(searchTerm("Warrior's Blood"), "warrior's blood")
  assert.equal(searchTerm('a.b|c'), 'a\\.b\\|c')
  assert.equal(quotedSearch(['a', 'b', 'a']), '"a|b"')
})

test('the vendor search: what to buy now, without " Support"', () => {
  const plan: AcquisitionItem[] = [
    buy('Chance to Bleed Support'),
    buy('Cleave'),
    buy('Cyclone', {}, true), // coming up, not now
    buy('Momentum', { mule: ['Ranger'] }), // the mule buys it
    buy('Ruthless', { starting: true }),
    buy('Cruelty or Melee Physical Damage', {
      anyOf: [{ gem: 'Cruelty Support' }, { gem: 'Melee Physical Damage Support' }]
    }),
    { kind: 'reward', group: { pickOne: false, gems: [entry('Herald of Ash')] }, later: false }
  ]
  assert.equal(vendorSearch(plan), '"chance to bleed|cleave|cruelty|melee physical damage"')
})

test('the vendor search takes the gems of a pick-one quest you buy the rest of', () => {
  const plan: AcquisitionItem[] = [
    {
      kind: 'reward',
      group: { pickOne: true, gems: [entry('Cruelty'), entry('Onslaught')], buyRest: { count: 1 } },
      later: false
    }
  ]
  assert.equal(vendorSearch(plan), '"cruelty|onslaught"')
})

test('nothing to buy: no vendor search; too much: whole names up to the box', () => {
  assert.equal(vendorSearch([]), null)
  const many = Array.from({ length: 30 }, (_, i) => buy(`Some Long Gem Name ${i}`))
  const s = vendorSearch(many) ?? ''
  assert.ok(s.length <= SEARCH_BOX_LIMIT, `${s.length}`)
  assert.match(s, /\|some long gem name \d+"$/)
})
