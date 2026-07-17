import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeParser, loadFixtureLines } from './helpers.ts'

const parser = makeParser()

test('parses the areaGenerated debug line (primary zone signal)', () => {
  const ev = parser.parseLine(
    '2024/01/15 10:04:30 520 cffb0734 [DEBUG Client 1234] Generating level 2 area "1_1_2" with seed 222333'
  )
  assert.deepEqual(ev, { kind: 'areaGenerated', areaId: '1_1_2', areaLevel: 2 })
})

test('parses the localized zoneEntered fallback line', () => {
  const ev = parser.parseLine(
    '2024/01/15 10:04:31 521 cffb0734 [INFO Client 1234] : You have entered The Mud Flats.'
  )
  assert.deepEqual(ev, { kind: 'zoneEntered', zoneName: 'The Mud Flats' })
})

test('parses a level-up with name and class', () => {
  const ev = parser.parseLine(
    '2024/01/15 10:02:00 300 cffb0734 [INFO Client 1234] : MyExile (Marauder) is now level 2'
  )
  assert.deepEqual(ev, { kind: 'levelUp', name: 'MyExile', charClass: 'Marauder', level: 2 })
})

test('drops chat lines before parsing — a pasted level-up cannot spoof', () => {
  const spoof =
    '2024/01/15 10:03:00 400 cffb0734 [INFO Client 1234] $Global 820: RandomTrader: MyExile (Marauder) is now level 99'
  assert.equal(parser.parseLine(spoof), null)
})

test('drops whispers, party, guild and trade chat', () => {
  const prefix = '2024/01/15 10:03:10 410 cffb0734 [INFO Client 1234] '
  for (const chat of [
    '@From SomeFriend: where are you',
    '@To SomeFriend: mud flats',
    '%PartyGuy: brb',
    '&GuildMate: hi all',
    '#TradeSpam: wtb chaos',
    '$Global 1: hello',
    'From Other: you have entered The Twilight Strand.'
  ]) {
    assert.equal(parser.parseLine(prefix + chat), null, `should drop: ${chat}`)
  }
})

test('ignores unrelated system lines', () => {
  for (const line of [
    '2024/01/15 10:00:30 140 cffb0734 [INFO Client 1234] : Hillock has been slain.',
    '2024/01/15 10:04:00 500 cffb0734 [INFO Client 1234] Connecting to instance server at 203.0.113.42:6112',
    ''
  ]) {
    assert.equal(parser.parseLine(line), null)
  }
})

test('real capture: every line parses and the event mix is right', () => {
  const lines = loadFixtureLines('act1-real.log')
  const events = lines.map((l) => parser.parseLine(l))
  events.forEach((e, i) => assert.ok(e !== null, `unparsed real line ${i + 1}: ${lines[i]}`))

  const byKind = { areaGenerated: 0, levelUp: 0, zoneEntered: 0 }
  for (const e of events) byKind[e!.kind]++
  assert.equal(byKind.levelUp, 3)
  assert.equal(byKind.areaGenerated + byKind.zoneEntered, lines.length - 3)

  // Spot checks: sub-numbered campaign id and word-id map instance.
  assert.ok(
    events.some((e) => e?.kind === 'areaGenerated' && e.areaId === '1_1_4_1' && e.areaLevel === 5)
  )
  assert.ok(
    events.some((e) => e?.kind === 'areaGenerated' && e.areaId === 'MapWorldsMemoryVault2' && e.areaLevel === 84)
  )
  assert.ok(
    events.some((e) => e?.kind === 'levelUp' && e.name === 'Exile1' && e.charClass === 'Witch' && e.level === 4)
  )
})

test('fixture sweep: expected event mix from the synthetic Act 1 log', () => {
  const events = loadFixtureLines('act1-synthetic.log')
    .map((l) => parser.parseLine(l))
    .filter((e) => e !== null)
  const kinds = events.map((e) => e.kind)
  assert.deepEqual(kinds, [
    'areaGenerated',
    'zoneEntered',
    'areaGenerated',
    'zoneEntered',
    'levelUp',
    'areaGenerated',
    'zoneEntered',
    'levelUp',
    'zoneEntered',
    'levelUp'
  ])
})
