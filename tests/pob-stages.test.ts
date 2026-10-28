import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadoutOf, rangesFromStarts, stageDrafts, treeTitleLevel } from '../electron/profile/pob-stages.ts'
import { importPobXml, parseStageTitle } from '../electron/profile/pob.ts'
import { validateProfile } from '../electron/profile/profile.ts'

// ---------- titles ----------

test('loadoutOf splits a title into its name and {n} ids', () => {
  assert.deepEqual(loadoutOf('28 {3,4}'), { base: '28', ids: [3, 4] })
  assert.deepEqual(loadoutOf('{ 6, 7 }'), { base: '', ids: [6, 7] })
  assert.deepEqual(loadoutOf('After Brutus'), { base: 'After Brutus', ids: [] })
  assert.deepEqual(loadoutOf(undefined), { base: '', ids: [] })
})

test('a tree title gives a level only when it leads with one', () => {
  assert.equal(treeTitleLevel('12 {1}'), 12)
  assert.equal(treeTitleLevel('33 (Lab)'), 33)
  assert.equal(treeTitleLevel('69 Map entry'), 69)
  assert.equal(treeTitleLevel('After Brutus'), null)
  assert.equal(treeTitleLevel('Act 2'), null)
  assert.equal(treeTitleLevel('1000'), null)
  assert.equal(treeTitleLevel('0'), null)
})

// ---------- drafts ----------

test('gem sets take their level from the tree they share {n} ids with', () => {
  const drafts = stageDrafts(
    [
      { title: '{1}', gems: 4 },
      { title: '{2}', gems: 5 },
      { title: '{3,4}', gems: 6 }
    ],
    [
      { title: '12 {1}', points: 11 },
      { title: '20 {2}', points: 19 },
      { title: '37 {4}', points: 36 },
      { title: '28 {3}', points: 27 }
    ],
    parseStageTitle
  )
  assert.deepEqual(
    drafts.map((d) => [d.label, d.start, d.from]),
    [
      ['12', 12, 'tree-title'],
      ['20', 20, 'tree-title'],
      // one gem set for two loadouts starts with the earlier
      ['28', 28, 'tree-title']
    ]
  )
})

test('a tree with the same title and no level in it goes by its points', () => {
  const [d] = stageDrafts([{ title: 'After Brutus', gems: 3 }], [{ title: 'After Brutus', points: 9 }], parseStageTitle)
  assert.equal(d.start, 10)
  assert.equal(d.from, 'tree-points')
  assert.equal(d.tree, 'After Brutus')
})

test('free names are never read for a level, and unlinked sets stay open', () => {
  // the sets and the trees share no titles and no ids: nothing says where a set starts
  const drafts = stageDrafts(
    [
      { title: 'After Hillock', gems: 2 },
      { title: 'After Brutus', gems: 3 }
    ],
    [
      { title: '9', points: 8 },
      { title: '22', points: 21 }
    ],
    parseStageTitle
  )
  assert.deepEqual(
    drafts.map((d) => [d.label, d.start, d.from]),
    [
      ['After Hillock', null, null],
      ['After Brutus', null, null]
    ]
  )
})

test('a range in the gem set\'s own title comes first', () => {
  const [d] = stageDrafts([{ title: 'Level 12-20 {1}', gems: 3 }], [{ title: '5 {1}', points: 4 }], parseStageTitle)
  assert.equal(d.start, 12)
  assert.equal(d.from, 'set-title')
})

test('ids only pair with ids: "{1}" doesn\'t pair with a tree titled "1"', () => {
  const [d] = stageDrafts([{ title: '{1}', gems: 1 }], [{ title: '1', points: 30 }], parseStageTitle)
  assert.equal(d.start, null)
  assert.equal(d.label, 'Stage 1')
})

// ---------- ranges ----------

test('start levels become back-to-back ranges, the first from level 1', () => {
  const w: string[] = []
  const r = rangesFromStarts([12, 4, 28], 70, w)
  assert.deepEqual(r, [
    { index: 1, range: [1, 11] },
    { index: 0, range: [12, 27] },
    { index: 2, range: [28, 70] }
  ])
  assert.deepEqual(w, [])
})

test('two stages at the same level: the later one moves up, and it says so', () => {
  const w: string[] = []
  const r = rangesFromStarts([10, 10], 70, w, ['A', 'B'])
  assert.deepEqual(r, [
    { index: 0, range: [1, 10] },
    { index: 1, range: [11, 70] }
  ])
  assert.ok(w.some((m) => m.includes('"B"') && m.includes('11')))
})

// ---------- the import ----------

const LOADOUT_XML = `<PathOfBuilding><Build className="Witch" level="4"/><Skills>
  <SkillSet id="1" title="{1}"><Skill enabled="true"><Gem nameSpec="Fireball" level="1"/></Skill></SkillSet>
  <SkillSet id="2" title="{2}"><Skill enabled="true"><Gem nameSpec="Firestorm" level="1"/></Skill></SkillSet>
  <SkillSet id="3" title="Endgame"><Skill enabled="true"><Gem nameSpec="Arc" level="1"/></Skill></SkillSet>
</Skills><Tree>
  <Spec title="12 {1}" nodes="1,2,3"/>
  <Spec title="20 {2}" nodes="1,2,3,4"/>
</Tree></PathOfBuilding>`

test('the import hands back its drafts, and the open one splits evenly until confirmed', () => {
  const r = importPobXml(LOADOUT_XML)
  assert.deepEqual(
    r.drafts?.map((d) => d.start),
    [12, 20, null]
  )
  assert.ok(r.warnings.some((w) => w.includes('split evenly')))
})

test('confirmed start levels set the stages, in level order', () => {
  const r = importPobXml(LOADOUT_XML, { starts: [12, 20, 40] })
  assert.ok(r.profile)
  assert.deepEqual(
    r.profile.stages.map((s) => [s.label, s.range]),
    [
      ['12', [1, 19]],
      ['20', [20, 39]],
      ['Endgame', [40, 70]]
    ]
  )
  assert.ok(!r.warnings.some((w) => w.includes('split evenly')))
  assert.deepEqual(validateProfile(r.profile).errors, [])
})

test('starts that don\'t match the gem sets are ignored', () => {
  const r = importPobXml(LOADOUT_XML, { starts: [12] })
  assert.ok(r.warnings.some((w) => w.includes('split evenly')))
})
