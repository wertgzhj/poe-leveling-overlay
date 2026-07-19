import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  encodePobCode,
  decodePobCode,
  importPobCode,
  importPobXml,
  parseStageTitle
} from '../electron/profile/pob.ts'
import { validateProfile } from '../electron/profile/profile.ts'
import { activeStageIndex } from '../electron/profile/engine.ts'
import { repoPath } from './helpers.ts'

function witchXml(): string {
  return readFileSync(repoPath('tests/fixtures/pob-witch.xml'), 'utf8')
}

// ---------- codec ----------

test('base64url + zlib round-trips (matches the PoB codec)', () => {
  const xml = witchXml()
  const code = encodePobCode(xml)
  assert.ok(!/[+/]/.test(code), 'code must be URL-safe base64')
  assert.equal(decodePobCode(code), xml)
})

test('decoding tolerates whitespace/newlines in a pasted code', () => {
  const code = encodePobCode('<PathOfBuilding/>')
  const messy = code.replace(/(.{20})/g, '$1\n ')
  assert.equal(decodePobCode(messy), '<PathOfBuilding/>')
})

test('a bad code is an error, not a throw', () => {
  const r = importPobCode('this-is-not-a-pob-code')
  assert.equal(r.profile, null)
  assert.equal(r.errors.length >= 1, true)
})

// ---------- import ----------

test('imports class, ascendancy and labelled stages from the fixture', () => {
  const r = importPobXml(witchXml(), { name: 'My Witch' })
  assert.deepEqual(r.errors, [])
  assert.ok(r.profile)
  const p = r.profile
  assert.equal(p.meta.name, 'My Witch')
  assert.equal(p.meta.class, 'Witch')
  assert.equal(p.meta.ascendancy, 'Elementalist')

  assert.equal(p.stages.length, 2)
  assert.deepEqual(p.stages[0].range, [1, 11])
  assert.deepEqual(p.stages[1].range, [12, 28])

  // Import output must satisfy the profile schema.
  assert.deepEqual(validateProfile(p).errors, [])
})

test('socket groups keep gem order; disabled skills are dropped', () => {
  const p = importPobXml(witchXml()).profile!
  assert.deepEqual(p.stages[0].socketGroups[0].gems, ['Frostbolt', 'Arcane Surge Support'])
  // stage 2 had a disabled Gloves skill (Frostbite) — must not appear.
  const stage2Gems = p.stages[1].socketGroups.flatMap((g) => g.gems)
  assert.ok(!stage2Gems.includes('Frostbite'))
  assert.ok(stage2Gems.includes('Freezing Pulse'))
})

test('gemPlan lists each unique gem once (sourceless — filled later)', () => {
  const p = importPobXml(witchXml()).profile!
  const gems = p.gemPlan.map((e) => e.gem).sort()
  // Flame Dash appears in both stages but is one plan entry.
  assert.equal(gems.filter((g) => g === 'Flame Dash').length, 1)
  assert.ok(p.gemPlan.every((e) => e.source === undefined))
})

test('imported stages drive the level->stage engine', () => {
  const p = importPobXml(witchXml()).profile!
  assert.equal(activeStageIndex(p, 5), 0)
  assert.equal(activeStageIndex(p, 20), 1)
})

// ---------- stage-title parsing ----------

test('parseStageTitle reads level ranges, bare ranges, acts, and open ranges', () => {
  assert.deepEqual(parseStageTitle('Level 1-12'), [1, 12])
  assert.deepEqual(parseStageTitle('Level 12–28'), [12, 28])
  assert.deepEqual(parseStageTitle('1-12'), [1, 12])
  assert.deepEqual(parseStageTitle('Act 1'), [1, 11])
  assert.deepEqual(parseStageTitle('Act 2-3'), [12, 31])
  assert.equal(parseStageTitle('Endgame'), null)
})

test('parseStageTitle tolerates Lvl/Lv shorthand and ranges inside longer titles', () => {
  assert.deepEqual(parseStageTitle('Lvl 1-11'), [1, 11])
  assert.deepEqual(parseStageTitle('Lv. 12 to 24'), [12, 24])
  assert.deepEqual(parseStageTitle('Leveling 12-24 (fire)'), [12, 24])
  assert.deepEqual(parseStageTitle('1-11 Freezing Pulse'), [1, 11])
  // Not level ranges: link counts and acts.
  assert.equal(parseStageTitle('4-link setup'), null)
  assert.deepEqual(parseStageTitle('Act 1-3 gems'), [1, 31])
})

test('overlapping labelled stages are clamped WITH a warning naming the stage', () => {
  // The owner's real case: sets "1-11" and "9-24" -> first becomes 1–8.
  const xml = `<PathOfBuilding><Build className="Witch"/><Skills>
    <SkillSet title="1-11"><Skill enabled="true"><Gem nameSpec="Fireball" level="1"/></Skill></SkillSet>
    <SkillSet title="9-24"><Skill enabled="true"><Gem nameSpec="Firestorm" level="1"/></Skill></SkillSet>
  </Skills></PathOfBuilding>`
  const r = importPobXml(xml)
  assert.ok(r.profile)
  assert.deepEqual(r.profile.stages[0].range, [1, 8])
  assert.deepEqual(r.profile.stages[1].range, [9, 24])
  assert.ok(
    r.warnings.some((w) => w.includes('"1-11"') && w.includes('1–8')),
    `expected an overlap warning, got: ${r.warnings.join(' | ')}`
  )
  assert.deepEqual(validateProfile(r.profile).errors, [])
})

test('unlabelled multi-stage builds get guessed ranges + a loud warning', () => {
  const xml = `<PathOfBuilding><Build className="Shadow"/><Skills>
    <SkillSet title="Early"><Skill enabled="true"><Gem nameSpec="Caustic Arrow" level="1"/></Skill></SkillSet>
    <SkillSet title="Late"><Skill enabled="true"><Gem nameSpec="Toxic Rain" level="1"/></Skill></SkillSet>
  </Skills></PathOfBuilding>`
  const r = importPobXml(xml)
  assert.ok(r.profile)
  assert.equal(r.profile.stages.length, 2)
  assert.ok(r.warnings.some((w) => w.includes('split them evenly')))
  // Guessed ranges are still non-overlapping / valid.
  assert.deepEqual(validateProfile(r.profile).errors, [])
})

test('older single-set PoB (no SkillSet) still imports', () => {
  const xml = `<PathOfBuilding><Build className="Marauder"/><Skills>
    <Skill enabled="true"><Gem nameSpec="Ground Slam" level="1"/></Skill>
  </Skills></PathOfBuilding>`
  const p = importPobXml(xml).profile!
  assert.equal(p.stages.length, 1)
  assert.deepEqual(p.stages[0].socketGroups[0].gems, ['Ground Slam'])
})

test('a non-PoB document is rejected cleanly', () => {
  assert.ok(importPobXml('<html><body>nope</body></html>').errors.length >= 1)
  assert.ok(importPobXml('<PathOfBuilding><Build className="Sorceress"/></PathOfBuilding>').errors[0].includes('class'))
})
