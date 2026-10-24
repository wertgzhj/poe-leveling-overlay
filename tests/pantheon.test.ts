import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PANTHEON_GODS, godsFallen, godsFor, isHere, whereIs } from '../electron/profile/pantheon.ts'
import { PANTHEON_MAJOR, PANTHEON_MINOR } from '../electron/profile/profile.ts'
import { actFromAreaId } from '../electron/profile/engine.ts'

const areas: Record<string, string> = JSON.parse(
  readFileSync(new URL('../data/areas/en.json', import.meta.url), 'utf8')
).areas

test('every Pantheon power a profile can name has a god, and only those', () => {
  const souls = PANTHEON_GODS.map((g) => g.soul).sort()
  assert.deepEqual(souls, [...PANTHEON_MAJOR, ...PANTHEON_MINOR].sort())
})

test("each god's zone is a real campaign zone, in its act, by the name it has", () => {
  for (const g of PANTHEON_GODS) {
    assert.equal(areas[g.areaId], g.zone, `${g.god}: ${g.areaId}`)
    assert.equal(actFromAreaId(g.areaId), g.act, `${g.god}: act`)
    // Acts 6-10: the Pantheon's gods are all in the campaign's second half.
    assert.ok(g.act >= 6 && g.act <= 10)
  }
})

test("a god is here by its zone's id — Act 1's Prisoner's Gate is not Act 6's", () => {
  const abberath = PANTHEON_GODS.find((g) => g.soul === 'Soul of Abberath')!
  assert.equal(isHere(abberath, '2_6_8'), true)
  assert.equal(isHere(abberath, '1_1_8'), false)
  assert.equal(isHere(abberath, null), false)
})

test('where a god is, in words', () => {
  const by = (soul: string) => PANTHEON_GODS.find((g) => g.soul === soul)!
  assert.equal(whereIs(by('Soul of Tukohama')), 'The Karui Fortress')
  assert.equal(whereIs(by('Soul of Shakari')), 'The Sand Pit, a side area of The Oasis')
  assert.equal(whereIs(by('Soul of Garukhan')), 'a side area of The Quarry')
})

test("a profile's choice names its gods, major first", () => {
  assert.deepEqual(
    godsFor({ minor: 'Soul of Shakari', major: 'Soul of Lunaris' }).map((g) => g.soul),
    ['Soul of Lunaris', 'Soul of Shakari']
  )
  assert.deepEqual(godsFor({ minor: 'Soul of Tukohama' }).map((g) => g.act), [6])
  assert.deepEqual(godsFor(undefined), [])
})

test("Sin's farewell in a god's zone says that god fell — Lunaris and Solaris together", () => {
  assert.deepEqual(
    godsFallen('The soil wants for your blood no more.', '2_6_5').map((g) => g.soul),
    ['Soul of Tukohama']
  )
  assert.deepEqual(
    godsFallen('Eclipse cold pride, flaming rage, and pass beyond this human age.', '2_8_13').map((g) => g.soul),
    ['Soul of Lunaris', 'Soul of Solaris']
  )
  // the line in another zone, or Sin's battle cry, ticks nothing
  assert.deepEqual(godsFallen('The soil wants for your blood no more.', '2_6_8'), [])
  assert.deepEqual(godsFallen('Tukohama!', '2_6_5'), [])
  // every god has its own line, but for the pair fought together
  const lines = new Set(PANTHEON_GODS.map((g) => g.farewell))
  assert.equal(lines.size, PANTHEON_GODS.length - 1)
})
