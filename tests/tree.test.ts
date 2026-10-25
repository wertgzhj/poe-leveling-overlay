import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { extractTree, treeVersionOf, type TreeExport } from '../scripts/tree-extract.ts'
import {
  TreeData,
  orderNodes,
  passivesView,
  planFromSpecs,
  type PassivePlan,
  type TreeFile,
  type TreeNode
} from '../electron/profile/tree.ts'
import { importPobXml } from '../electron/profile/pob.ts'
import { validateProfile } from '../electron/profile/profile.ts'
import { repoPath } from './helpers.ts'

// A small tree:
//
//   start(1) — a(2) — b(3) — FAR(4, notable)
//       \
//        c(5) — NEAR(6, notable) — m(7, mastery, same group as NEAR)
//                      \
//                       d(8) — KEY(9, keystone)
function tiny(): TreeData {
  const n = (name: string, kind: TreeNode['kind'], links: number[], group = 0): TreeNode => ({
    name,
    kind,
    stats: [`${name} stat`],
    links,
    group
  })
  const nodes: Record<string, TreeNode> = {
    1: n('START', 'start', [2, 5]),
    2: n('a', 'small', [1, 3]),
    3: n('b', 'small', [2, 4]),
    4: n('FAR', 'notable', [3], 1),
    5: n('c', 'small', [1, 6]),
    6: n('NEAR', 'notable', [5, 8], 2),
    7: { ...n('Mastery', 'mastery', [], 2), effects: { 100: ['picked effect'] } },
    8: n('d', 'small', [6, 9]),
    9: n('KEY', 'keystone', [8]),
    20: { ...n('Asc start', 'ascendancyStart', [21]), ascendancy: 'X' },
    21: { ...n('Asc one', 'small', [20, 22]), ascendancy: 'X' },
    22: { ...n('Asc two', 'notable', [21]), ascendancy: 'X' }
  }
  return new TreeData({ version: '3.29.1', treeVersion: '3_29', nodes })
}

const names = (tree: TreeData, ids: number[]): string[] => ids.map((id) => tree.node(id)?.name ?? `#${id}`)

// ---------- order ----------

test('the nearest notable first, every node on the way, its mastery right after', () => {
  const tree = tiny()
  const order = orderNodes(tree, new Set([1]), [2, 3, 4, 5, 6, 7, 8, 9])
  // NEAR is two away; then KEY, two on from NEAR, before FAR, three from the start
  assert.deepEqual(names(tree, order), ['c', 'NEAR', 'Mastery', 'd', 'KEY', 'a', 'b', 'FAR'])
})

test('a spec that drops nodes is a respec, shown before its points', () => {
  const tree = tiny()
  const plan = planFromSpecs(
    [
      { title: '10', nodes: [1, 5, 6, 2], masteries: {} },
      { title: '20', nodes: [1, 5, 6, 8, 9], masteries: {} }
    ],
    tree,
    '3_29'
  )
  assert.deepEqual(plan.stages.map((s) => s.label), ['10', '20'])
  assert.deepEqual(names(tree, plan.stages[1].take), ['d', 'KEY'])
  assert.deepEqual(names(tree, plan.stages[1].refund ?? []), ['a'])
})

test('ascendancy nodes come in their own list, in walking order', () => {
  const tree = tiny()
  const plan = planFromSpecs([{ nodes: [1, 20, 22, 21], masteries: {} }], tree, '3_29')
  assert.deepEqual(names(tree, plan.ascendancy ?? []), ['Asc one', 'Asc two'])
  assert.deepEqual(plan.stages[0]?.take ?? [], [], 'starting nodes cost no point')
})

test('a mastery shows the effect the build picked', () => {
  const tree = tiny()
  const plan = planFromSpecs([{ nodes: [1, 5, 6, 7], masteries: { 7: 100 } }], tree, '3_29')
  const view = passivesView(plan, tree, 3, 0, 0)
  assert.equal(view.next[0].name, 'Mastery')
  assert.deepEqual(view.next[0].stats, ['picked effect'])
})

// ---------- where you stand ----------

const plan: PassivePlan = {
  tree: '3_29',
  stages: [
    { label: 'early', take: [5, 6, 2] },
    { label: 'later', take: [8, 9], refund: [2] }
  ],
  ascendancy: [21, 22]
}

test('the due node follows level − 1 plus Books of Skill', () => {
  const tree = tiny()
  assert.equal(passivesView(plan, tree, 1, 0, 0).next[0].name, 'c', 'level 1: no points yet')
  assert.equal(passivesView(plan, tree, 2, 0, 0).next[0].name, 'NEAR')
  const withBook = passivesView(plan, tree, 2, 1, 0)
  assert.equal(withBook.points, 2)
  assert.equal(withBook.next[0].name, 'a')
  assert.equal(withBook.stageLabel, 'early')
  assert.equal(passivesView(plan, tree, null, 0, 0).points, 0, 'no character yet: from the start')
})

test('the respec shows as its stage begins, then gets out of the way', () => {
  const tree = tiny()
  assert.deepEqual(passivesView(plan, tree, 3, 0, 0).refund, [], 'still in the first stage')
  assert.deepEqual(
    passivesView(plan, tree, 4, 0, 0).refund.map((n) => n.name),
    ['a']
  )
  assert.deepEqual(passivesView(plan, tree, 99, 0, 0).refund, [])
})

test('a finished plan has nothing next', () => {
  const view = passivesView(plan, tiny(), 90, 0, 0)
  assert.deepEqual(view.next, [])
  assert.equal(view.total, 5)
  assert.equal(view.stageLabel, null)
})

test('two ascendancy points per Labyrinth beaten', () => {
  const tree = tiny()
  // the small node on the way isn't listed, just the notable
  assert.deepEqual(passivesView(plan, tree, 5, 0, 0).ascendancy?.next.map((n) => n.name), ['Asc two'])
  assert.deepEqual(passivesView(plan, tree, 5, 0, 1).ascendancy?.next, [])
})

test('a plan for another tree says so', () => {
  const view = passivesView({ ...plan, tree: '3_28' }, tiny(), 5, 0, 0)
  assert.match(view.treeMismatch ?? '', /3\.28.*3\.29\.1/)
  assert.equal(passivesView(plan, tiny(), 5, 0, 0).treeMismatch, null)
})

// ---------- the shipped tree ----------

const shipped = (): TreeData => new TreeData(JSON.parse(readFileSync(repoPath('data/tree.json'), 'utf8')) as TreeFile)

test('the shipped tree knows every class start and links it outward', () => {
  const tree = shipped()
  const marauder = tree.node(47175)
  assert.equal(marauder?.kind, 'start')
  assert.ok((marauder?.links.length ?? 0) > 0)
  // tree and ascendancy aren't linked: no walking from one into the other
  for (const id of marauder?.links ?? []) assert.equal(tree.node(id)?.ascendancy, undefined)
})

test('the export is cut down to what the overlay shows', () => {
  const data: TreeExport = {
    nodes: {
      root: { skill: 0, name: 'root' },
      10: { skill: 10, name: 'A', stats: ['+1'], group: 1, out: ['11'], isNotable: true },
      11: { skill: 11, name: 'B', group: 1, in: ['10'], isMastery: true, masteryEffects: [{ effect: 5, stats: ['x'] }] },
      12: { skill: 12, name: 'Cluster', isProxy: true, group: 2 }
    }
  }
  const file = extractTree(data, '3.29.1')
  assert.equal(file.treeVersion, '3_29')
  assert.deepEqual(Object.keys(file.nodes).sort(), ['10', '11'])
  assert.deepEqual(file.nodes['10'], { name: 'A', kind: 'notable', stats: ['+1'], links: [11], group: 1 })
  assert.deepEqual(file.nodes['11'].links, [10])
  assert.deepEqual(file.nodes['11'].effects, { 5: ['x'] })
  assert.equal(treeVersionOf('3.30.0'), '3_30')
})

// ---------- import ----------

test('a PoB build\'s tree specs become the profile\'s passives', () => {
  const tree = shipped()
  // The nodes nearest the Marauder start, as two specs.
  const near: number[] = [47175]
  for (let i = 0; near.length < 16; i++) {
    for (const id of tree.node(near[i])?.links ?? []) if (!near.includes(id) && near.length < 16) near.push(id)
  }
  const spec = (title: string, nodes: number[]): string =>
    `<Spec title="${title}" treeVersion="3_29" classId="1" ascendClassId="0" masteryEffects="" nodes="${nodes.join(',')}"/>`
  const xml = `<PathOfBuilding>
    <Build className="Marauder" ascendClassName="None" level="10"/>
    <Skills><SkillSet title="1-10"><Skill enabled="true"><Gem nameSpec="Ground Slam"/></Skill></SkillSet></Skills>
    <Tree activeSpec="2">${spec('8', near.slice(0, 8))}${spec('15', near)}</Tree>
  </PathOfBuilding>`
  const result = importPobXml(xml, { tree })
  const passives = result.profile?.passives
  assert.ok(passives, result.errors.join('; '))
  assert.equal(passives.tree, '3_29')
  assert.deepEqual(passives.stages.map((s) => s.take.length), [7, 8], 'the class start costs nothing')
  assert.deepEqual(validateProfile(result.profile).errors, [])

  const without = importPobXml(xml)
  assert.equal(without.profile?.passives, undefined)
  assert.ok(without.warnings.some((w) => /tree data is missing/.test(w)))
})

test('a hand-edited passives block is checked', () => {
  const base = { meta: { name: 'x', class: 'Witch' }, stages: [{ range: [1, 2], socketGroups: [{ gems: ['A'] }] }] }
  assert.deepEqual(validateProfile({ ...base, passives: { tree: '3_29', stages: [{ take: [1, 2] }] } }).errors, [])
  assert.match(
    validateProfile({ ...base, passives: { tree: '3_29', stages: [{ take: ['Heart'] }] } }).errors.join(),
    /node ids/
  )
  assert.match(validateProfile({ ...base, passives: { stages: [] } }).errors.join(), /passives\.tree/)
})
