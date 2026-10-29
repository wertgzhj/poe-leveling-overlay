import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { extractTree, treeVersionOf, type TreeExport } from '../scripts/tree-extract.ts'
import { passiveMap } from '../electron/profile/tree-map.ts'
import {
  TreeData,
  checkPlan,
  classStartNode,
  orderNodes,
  planPosition,
  resortAscendancy,
  resortStage,
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
  const view = passivesView(plan, tree, 4, 0, 0)
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

test('the due node is the one your newest point goes on: level − 1 plus Books of Skill', () => {
  const tree = tiny()
  assert.equal(passivesView(plan, tree, 1, 0, 0).next[0].name, 'c', 'level 1: no points yet, the first is up')
  assert.equal(passivesView(plan, tree, 2, 0, 0).next[0].name, 'c', 'level 2: the first point goes on the first node')
  assert.equal(passivesView(plan, tree, 3, 0, 0).next[0].name, 'NEAR')
  const withBook = passivesView(plan, tree, 3, 1, 0)
  assert.equal(withBook.points, 3)
  assert.equal(withBook.next[0].name, 'a')
  assert.equal(withBook.stageLabel, 'early')
  assert.equal(passivesView(plan, tree, null, 0, 0).points, 0, 'no character yet: from the start')
})

test('a respec gives its points back: the plan moves on by as many nodes', () => {
  // Like a real build: 8, 5, then a stage that refunds 2 and takes 14, then
  // one that refunds 8 and takes 33.
  const ids = (from: number, n: number): number[] => Array.from({ length: n }, (_, i) => from + i)
  const big: PassivePlan = {
    tree: '3_29',
    stages: [
      { take: ids(100, 8) },
      { take: ids(200, 5) },
      { take: ids(300, 14), refund: [100, 101] },
      { take: ids(400, 33), refund: ids(102, 6).concat([200, 201]) }
    ]
  }
  assert.deepEqual(planPosition(big, 12), { at: 12, total: 50 }, 'before any respec: one node a point')
  // 13 points: the third stage's first node is due, the respec in front of it
  assert.equal(planPosition(big, 13).at, 13)
  assert.equal(planPosition(big, 14).at, 16, 'two refunded: two further')
  // 13 + 14 - 2 = 25 allocated after the third stage: the fourth's first is due
  assert.equal(planPosition(big, 25).at, 27)
  assert.equal(planPosition(big, 26).at, 36, 'ten refunded in all: ten further')
  assert.equal(planPosition(big, 50).at, 60, 'the plan needs 60 - 10 = 50 points')
  assert.equal(planPosition(big, 0).at, 0)
})

test('the respec shows as its stage begins, then gets out of the way', () => {
  const tree = tiny()
  assert.deepEqual(passivesView(plan, tree, 4, 0, 0).refund, [], 'still in the first stage')
  assert.deepEqual(
    passivesView(plan, tree, 5, 0, 0).refund.map((n) => n.name),
    ['a']
  )
  assert.deepEqual(passivesView(plan, tree, 99, 0, 0).refund, [])
})

test('a finished plan has nothing next', () => {
  const view = passivesView(plan, tiny(), 90, 0, 0)
  assert.deepEqual(view.next, [])
  assert.equal(view.total, 4, 'five nodes, one of them refunded: four points')
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

test('each node gets its place on the tree, for the map', () => {
  const data: TreeExport = {
    groups: { 1: { x: 1000, y: -500 } },
    constants: { skillsPerOrbit: [1, 6, 16, 16, 40], orbitRadii: [0, 82, 162, 335, 493] },
    nodes: {
      10: { skill: 10, name: 'centre', group: 1, orbit: 0, orbitIndex: 0 },
      11: { skill: 11, name: 'even', group: 1, orbit: 1, orbitIndex: 3 }, // 180° of six
      12: { skill: 12, name: 'table', group: 1, orbit: 2, orbitIndex: 4 } // 90° on a 16-node orbit
    }
  }
  const file = extractTree(data, '3.29.1')
  assert.deepEqual([file.nodes['10'].x, file.nodes['10'].y], [1000, -500])
  assert.deepEqual([file.nodes['11'].x, file.nodes['11'].y], [1000, -418]) // straight down
  assert.deepEqual([file.nodes['12'].x, file.nodes['12'].y], [1162, -500]) // to the right
  assert.deepEqual(file.groups, { 1: [1000, -500] })
})

test('the shipped tree has every node placed', () => {
  const tree = shipped()
  const marauder = tree.node(47175)!
  assert.ok(marauder.x != null && marauder.y != null)
  assert.ok(tree.groupCentre(marauder.group!))
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

test('the Tree search: notables, keystones and masteries of this stage and the two before', () => {
  const tree = tiny()
  const searchPlan: PassivePlan = {
    tree: '3_29',
    stages: [{ take: [5, 6] }, { take: [7] }, { take: [8, 9] }, { take: [2, 3, 4], refund: [6] }]
  }
  // small nodes (c, d, a, b) left out: their names repeat all over a real tree
  // level 1: nothing before, and the six shown reach into stage 4
  assert.equal(passivesView(searchPlan, tree, 1, 0, 0).treeSearch, '"near|mastery|key|far"')
  assert.equal(passivesView(searchPlan, tree, 6, 0, 0).treeSearch, '"near|mastery|key|far"', 'placed ones stay in')
  // stage 4: stages 2 and 3 with it, NEAR's stage too far back — and refunded anyway
  assert.equal(passivesView(searchPlan, tree, 7, 0, 0).treeSearch, '"mastery|key|far"')
  assert.equal(passivesView(searchPlan, tree, 99, 0, 0).treeSearch, null, 'plan done')
})

test('the Tree search fits the 250-character search box, dropping the oldest stage first', () => {
  const long = (i: number): TreeNode => ({ name: `notable number ${i} ${'x'.repeat(40)}`, kind: 'notable', stats: [], links: [] })
  const nodes: Record<string, TreeNode> = {}
  for (let i = 1; i <= 12; i++) nodes[i] = long(i)
  const tree = new TreeData({ version: '3.29.1', treeVersion: '3_29', nodes })
  // three stages of two ~57-character names each
  const p: PassivePlan = { tree: '3_29', stages: [{ take: [1, 2] }, { take: [3, 4] }, { take: [5, 6] }] }
  const search = passivesView(p, tree, 5, 0, 0).treeSearch ?? ''
  assert.ok(search.length <= 250, `${search.length} characters`)
  assert.match(search, /number 3 .*number 4 .*number 5 .*number 6 /, 'current and previous stage whole')
  assert.doesNotMatch(search, /number [12] /, 'the oldest stage left out')
  // one stage longer than the box: as many whole names as fit
  const big: PassivePlan = { tree: '3_29', stages: [{ take: [1, 2, 3, 4, 5, 6] }] }
  const cut = passivesView(big, tree, 1, 0, 0).treeSearch ?? ''
  assert.ok(cut.length <= 250 && cut.endsWith('x"'), 'ends on a whole name')
})

test('the Tree search reaches ahead as far as the list shows', () => {
  const tree = tiny()
  // NEAR is due; KEY, two points on, is in the next stage — and shown under "then"
  const p: PassivePlan = { tree: '3_29', stages: [{ take: [5, 6] }, { take: [8, 9] }] }
  assert.equal(passivesView(p, tree, 2, 0, 0).treeSearch, '"near|key"')
})

// ---------- editing the order ----------

const unlinked = (tree: TreeData, plan: PassivePlan): string[][] =>
  checkPlan(plan, tree, 1).stages.map((s) => s.take.filter((r) => r.unlinked).map((r) => r.name))

test('an order the game allows has nothing flagged', () => {
  const tree = tiny()
  const plan: PassivePlan = { tree: '3_29', stages: [{ take: [5, 6, 7] }, { take: [8, 9, 2, 3, 4] }] }
  assert.deepEqual(unlinked(tree, plan), [[], []])
})

test('a node moved ahead of the way to it is flagged, and so is a mastery before its notable', () => {
  const tree = tiny()
  // KEY before d; the mastery before NEAR
  const plan: PassivePlan = { tree: '3_29', stages: [{ take: [5, 7, 6] }, { take: [9, 8] }] }
  assert.deepEqual(unlinked(tree, plan), [['Mastery'], ['KEY']])
})

test('a refunded node no longer carries what hangs off it', () => {
  const tree = tiny()
  const plan: PassivePlan = { tree: '3_29', stages: [{ take: [5, 6] }, { refund: [6], take: [8] }] }
  assert.deepEqual(unlinked(tree, plan), [[], ['d']])
})

test('without a start to walk from, nothing is flagged', () => {
  const tree = tiny()
  const plan: PassivePlan = { tree: '3_29', stages: [{ take: [9] }] }
  assert.equal(checkPlan(plan, tree, undefined).stages[0].take[0].unlinked, false)
})

test('re-sorting a stage puts it back in the import\'s order, from what came before', () => {
  const tree = tiny()
  const plan: PassivePlan = { tree: '3_29', stages: [{ take: [5, 6] }, { take: [4, 3, 2, 9, 8] }] }
  assert.deepEqual(names(tree, resortStage(plan, tree, 1, 1)), ['d', 'KEY', 'a', 'b', 'FAR'])
})

test('every class finds its start in the shipped tree', () => {
  const tree = shipped()
  assert.equal(classStartNode(tree, 'Marauder'), 47175)
  for (const cls of ['Scion', 'Ranger', 'Witch', 'Duelist', 'Templar', 'Shadow']) {
    assert.equal(tree.node(classStartNode(tree, cls)!)?.kind, 'start', cls)
  }
  assert.equal(classStartNode(tree, 'Nobody'), undefined)
})

// ---------- the map ----------

// start(1) at the centre; a(2), b(3) up a line; an orbit of three around (0,-1000): c(4), NOTE(5), d(6)
function placed(): TreeData {
  const n = (name: string, kind: TreeNode['kind'], links: number[], x: number, y: number, group = 0): TreeNode => ({
    name, kind, stats: [], links, group, x, y
  })
  const nodes: Record<string, TreeNode> = {
    1: n('START', 'start', [2], 0, 0),
    2: n('a', 'small', [1, 3], 0, -300),
    3: n('b', 'small', [2, 4], 0, -600),
    4: n('c', 'small', [3, 5], -400, -1000, 9),
    5: n('NOTE', 'notable', [4, 6], 0, -1400, 9),
    6: n('d', 'small', [5], 400, -1000, 9),
    50: n('far away', 'notable', [], 20000, 20000)
  }
  return new TreeData({ version: '3.29.1', treeVersion: '3_29', nodes, groups: { 9: [0, -1000] } })
}

test('the map marks what\'s taken, your point now and the ones after', () => {
  const tree = placed()
  const plan: PassivePlan = { tree: '3_29', stages: [{ take: [2, 3] }, { take: [4, 5, 6] }] }
  const map = passiveMap(plan, tree, 3, 1, 1.5)!
  const state = Object.fromEntries(map.nodes.map((n) => [n.name, [n.state, n.num ?? null]]))
  assert.deepEqual(state, {
    START: ['taken', null],
    a: ['taken', null],
    b: ['taken', null],
    c: ['due', 1],
    NOTE: ['next', 2],
    d: ['next', 3]
  }) // 'far away' is out of view
  // b—c is the way on; a—b is taken; c—NOTE runs along the orbit
  const onOrbit = map.links.filter((l) => l.arc)
  assert.equal(onOrbit.length, 2)
  assert.ok(onOrbit.every((l) => l.arc!.r === 400 && l.state === 'path'))
  assert.equal(map.links.filter((l) => l.state === 'taken').length, 2) // start—a, a—b
  // the view holds every numbered node
  const [bx, by, bw, bh] = map.box
  for (const n of map.nodes.filter((n) => n.num)) assert.ok(n.x > bx && n.x < bx + bw && n.y > by && n.y < by + bh)
  assert.ok(Math.abs(bw / bh - 1.5) < 0.01)
})

test('a respec shows from when its stage begins', () => {
  const tree = placed()
  const plan: PassivePlan = { tree: '3_29', stages: [{ take: [2, 3] }, { refund: [3], take: [4, 5, 6] }] }
  const state = (points: number, name: string) =>
    passiveMap(plan, tree, points, 1, 1.5)!.nodes.find((n) => n.name === name)!.state
  assert.equal(state(2, 'b'), 'due') // its turn
  // three points: the respec is up, not done — b still there, c now
  assert.equal(state(3, 'b'), 'taken')
  assert.equal(state(3, 'c'), 'due')
  // four: b went, and its point with the new one bought c and NOTE
  assert.equal(state(4, 'b'), 'off')
  assert.equal(state(4, 'NOTE'), 'taken')
  assert.equal(state(4, 'd'), 'due')
})

test('no map once the plan is done, or without positions', () => {
  const plan: PassivePlan = { tree: '3_29', stages: [{ take: [2] }] }
  assert.equal(passiveMap(plan, placed(), 5, 1, 1.5), null)
  assert.equal(passiveMap({ tree: '3_29', stages: [{ take: [5, 6] }] }, tiny(), 0, 1, 1.5), null)
})

test('the ascendancy is checked from its own start, and re-sorts to walking order', () => {
  const tree = tiny()
  // Asc two (22) hangs off Asc one (21), which hangs off the start (20)
  const backwards: PassivePlan = { tree: '3_29', stages: [], ascendancy: [22, 21] }
  const check = checkPlan(backwards, tree, 1)
  assert.deepEqual(
    check.ascendancy.map((r) => [r.name, r.unlinked]),
    [
      ['Asc two', true],
      ['Asc one', false]
    ]
  )
  assert.deepEqual(names(tree, resortAscendancy(backwards, tree)), ['Asc one', 'Asc two'])
  assert.deepEqual(checkPlan({ tree: '3_29', stages: [] }, tree, 1).ascendancy, [])
})
