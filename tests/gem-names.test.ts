import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SHORT_NAME_MAX, sanitizeGemNames } from '../electron/gem-names.ts'
import { GemData } from '../electron/profile/gems.ts'
import { shortNamer } from '../src/lib/gem-names.ts'

const gems = new GemData({
  'Cast when Damage Taken Support': { attr: 'str', requiredLevel: 38 },
  'Melee Physical Damage Support': { attr: 'str', requiredLevel: 18 },
  Barrage: { attr: 'dex', requiredLevel: 12 },
  'Barrage Support': { attr: 'dex', requiredLevel: 38 },
  Sunder: { attr: 'str', requiredLevel: 12 }
})
const canonical = (g: string) => gems.canonicalName(g)

test('the gem data names a gem back the way it spells it', () => {
  assert.equal(gems.canonicalName('cast when damage taken'), 'Cast when Damage Taken Support')
  assert.equal(gems.canonicalName('Cast when Damage Taken Support'), 'Cast when Damage Taken Support')
  // Two gems sharing a name: the exact one wins, as everywhere.
  assert.equal(gems.canonicalName('Barrage'), 'Barrage')
  assert.equal(gems.canonicalName('Barrage Support'), 'Barrage Support')
  assert.equal(gems.canonicalName('No Such Gem'), undefined)
  assert.ok(gems.names().includes('Sunder'))
})

test('only a real gem gets a short name, keyed the way the data spells it', () => {
  const stored = sanitizeGemNames(
    {
      'cast when damage taken': '  CwDT ',
      'Melee Physical Damage Support': 'MPD',
      'Not A Gem': 'NAG',
      Sunder: '',
      Barrage: 'Barrage', // the name itself: nothing to shorten
      'Barrage Support': 'x'.repeat(SHORT_NAME_MAX + 1),
      'Melee Physical Damage': 42
    },
    canonical
  )
  assert.deepEqual(stored, { 'Cast when Damage Taken Support': 'CwDT', 'Melee Physical Damage Support': 'MPD' })
  assert.deepEqual(sanitizeGemNames(null, canonical), {})
  assert.deepEqual(sanitizeGemNames(['CwDT'], canonical), {})
})

test('the Gems tab finds a short name however the profile spells the gem', () => {
  const named = shortNamer({ 'Cast when Damage Taken Support': 'CwDT', Barrage: 'Bar' })
  // Path of Building drops " Support".
  assert.equal(named('Cast when Damage Taken'), 'CwDT')
  assert.equal(named('Cast when Damage Taken Support'), 'CwDT')
  // A gem without one is itself.
  assert.equal(named('Sunder'), 'Sunder')
  // The skill's short name stays with the skill when written exactly.
  assert.equal(named('Barrage'), 'Bar')
})
