import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseRoute, combineRoutes, type Route } from '../electron/guide/route.ts'
import { GuideEngine, isCampaignAreaId } from '../electron/guide/engine.ts'
import { ProgressTracker, type AreaState } from '../electron/log/tracker.ts'
import { makeParser, loadAreaNames, loadFixtureLines, repoPath } from './helpers.ts'

function loadAct(act: number): Route {
  const { route, errors } = parseRoute(readFileSync(repoPath(`data/campaign/act${act}.json`), 'utf8'))
  assert.deepEqual(errors, [], `act${act}.json must validate`)
  assert.ok(route)
  return route
}

function starterRoute(): Route {
  return loadAct(1)
}

// ---------- validation ----------

test('starter template validates and covers the verified Act 1 zones', () => {
  const route = starterRoute()
  assert.equal(route.act, 1)
  const areaIds = route.steps.map((s) => s.areaId).filter(Boolean)
  for (const id of ['1_1_1', '1_1_town', '1_1_2', '1_1_3', '1_1_4_1']) {
    assert.ok(areaIds.includes(id), `template should reference ${id}`)
  }
  assert.ok(route.steps.some((s) => !s.areaId && s.zone), 'template shows a name-matched step')
})

test('validation reports author mistakes with useful messages', () => {
  const { route, errors } = parseRoute(
    JSON.stringify({
      act: 1,
      steps: [
        { id: 'a', type: 'kill', text: 'ok', areaId: '1_1_1' },
        { id: 'a', type: 'kill', text: 'dupe', areaId: '1_1_1' },
        { id: 'b', type: 'flytothemoon', text: 'bad type' },
        { id: 'c', type: 'quest', text: 'no area or zone' },
        { id: 'd', type: 'hint', text: 'hints may float' }
      ]
    })
  )
  assert.equal(route, null)
  assert.ok(errors.some((e) => e.includes('duplicate id "a"')))
  assert.ok(errors.some((e) => e.includes('type must be one of')))
  assert.ok(errors.some((e) => e.includes('"c"') && e.includes('areaId')))
  assert.ok(!errors.some((e) => e.includes('"d"')), 'hint steps need no area')
})

test('broken JSON yields an error, not a throw', () => {
  const { route, errors } = parseRoute('{ nope')
  assert.equal(route, null)
  assert.equal(errors.length, 1)
})

// ---------- multi-act campaign ----------

test('all ten shipped act files validate and combine without errors', () => {
  const routes: Route[] = []
  for (let act = 1; act <= 10; act++) routes.push(loadAct(act))
  const combined = combineRoutes(routes)
  assert.deepEqual(combined.errors, [], 'act files must have unique step ids and combine cleanly')
  assert.deepEqual(combined.acts, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  // Every step is tagged with its act, in order.
  assert.ok(combined.steps.every((s) => typeof s.act === 'number'))
  assert.equal(combined.steps[0].act, 1)
  assert.equal(combined.steps.at(-1)?.act, 10)
})

test('combineRoutes concatenates by act and flags cross-act id collisions', () => {
  const a: Route = { act: 2, name: 'A2', steps: [{ id: 'x', type: 'town', zone: 'T', text: 'a' }] }
  const b: Route = { act: 1, name: 'A1', steps: [{ id: 'x', type: 'kill', zone: 'Z', text: 'b' }] }
  const combined = combineRoutes([a, b])
  // Act 1 sorts first; the Act 2 duplicate id is dropped with an error.
  assert.equal(combined.steps.length, 1)
  assert.equal(combined.steps[0].text, 'b')
  assert.equal(combined.steps[0].act, 1)
  assert.ok(combined.errors.some((e) => e.includes('duplicate step id "x"')))
})

test('a combined campaign advances across act boundaries', () => {
  const combined = combineRoutes([loadAct(1), loadAct(2)])
  const engine = new GuideEngine({ act: 1, name: 'Campaign', steps: combined.steps })
  // Walk Act 1 to the end, then enter Act 2's town.
  for (const [areaId, name] of [
    ['1_1_town', "Lioneye's Watch"],
    ['1_1_2', 'The Coast'],
    ['1_1_3', 'The Mud Flats'],
    ['1_1_4_1', 'The Submerged Passage']
  ] as const) {
    engine.applyArea({ areaId, name })
  }
  engine.forward() // clear the trailing Act 1 name-matched step
  engine.applyArea({ areaId: null, name: 'The Forest Encampment' }) // Act 2 town
  const cursor = engine.snapshot().cursorStepId
  assert.ok(cursor?.startsWith('a2-'), `expected an Act 2 step, got ${cursor}`)
})

// ---------- engine rules ----------

test('word-id instances are not campaign areas', () => {
  assert.equal(isCampaignAreaId('HideoutWorldTurtle'), false)
  assert.equal(isCampaignAreaId('MapWorldsCitySquare'), false)
  assert.equal(isCampaignAreaId('1_1_town'), true)
  assert.equal(isCampaignAreaId('1_1_4_1'), true)
})

test('entering zones advances the cursor positionally', () => {
  const engine = new GuideEngine(starterRoute())
  assert.equal(engine.snapshot().cursorStepId, 'a1-hillock')

  engine.applyArea({ areaId: '1_1_town', name: "Lioneye's Watch" }) // town right after current
  assert.equal(engine.snapshot().cursorStepId, 'a1-town-1')

  engine.applyArea({ areaId: '1_1_2', name: 'The Coast' })
  assert.equal(engine.snapshot().cursorStepId, 'a1-coast')

  engine.applyArea({ areaId: '1_1_3', name: 'The Mud Flats' })
  assert.equal(engine.snapshot().cursorStepId, 'a1-mud-flats')
})

test('DoD: a portal trip to town and back does not derail the guide', () => {
  const engine = new GuideEngine(starterRoute())
  engine.applyArea({ areaId: '1_1_town', name: "Lioneye's Watch" })
  engine.applyArea({ areaId: '1_1_2', name: 'The Coast' }) // cursor: a1-coast

  const before = engine.snapshot()
  engine.applyArea({ areaId: '1_1_town', name: "Lioneye's Watch" }) // TP to sell
  engine.applyArea({ areaId: '1_1_2', name: 'The Coast' }) // portal back
  const after = engine.snapshot()

  assert.equal(after.cursorStepId, before.cursorStepId, 'cursor unchanged by the round trip')
  assert.deepEqual(after.doneIds.sort(), before.doneIds.sort())
})

test('a later town step is not triggered by an early town visit', () => {
  const route: Route = {
    act: 1,
    steps: [
      { id: 's1', type: 'kill', areaId: '1_1_2', text: 'clear the coast' },
      { id: 's2', type: 'quest', areaId: '1_1_3', text: 'glyphs' },
      { id: 's3', type: 'town', areaId: '1_1_town', text: 'turn in quest' }
    ]
  }
  const engine = new GuideEngine(route)
  engine.applyArea({ areaId: '1_1_2', name: 'The Coast' })
  engine.applyArea({ areaId: '1_1_town', name: "Lioneye's Watch" }) // early stash trip
  assert.equal(engine.snapshot().cursorStepId, 's1', 'town step 2 ahead must not fire')

  engine.applyArea({ areaId: '1_1_3', name: 'The Mud Flats' }) // cursor -> s2
  engine.applyArea({ areaId: '1_1_town', name: "Lioneye's Watch" }) // now it's next+1
  assert.equal(engine.snapshot().cursorStepId, 's3')
})

test('name-matched steps advance when only the zone name is known', () => {
  const engine = new GuideEngine(starterRoute())
  // jump ahead: everything up to the submerged passage
  for (const [areaId, name] of [
    ['1_1_town', "Lioneye's Watch"],
    ['1_1_2', 'The Coast'],
    ['1_1_3', 'The Mud Flats'],
    ['1_1_4_1', 'The Submerged Passage']
  ] as const) {
    engine.applyArea({ areaId, name })
  }
  engine.applyArea({ areaId: '1_1_5_1', name: 'The Ledge' }) // id unknown to the route
  assert.equal(engine.snapshot().cursorStepId, 'a1-ledge')
})

test('hideout/map visits never touch the guide', () => {
  const engine = new GuideEngine(starterRoute())
  engine.applyArea({ areaId: '1_1_town', name: "Lioneye's Watch" })
  const before = engine.snapshot()
  assert.equal(engine.applyArea({ areaId: 'HideoutWorldTurtle', name: 'Cosmic Turtle Hideout' }), false)
  assert.equal(engine.applyArea({ areaId: 'MapWorldsCitySquare', name: 'City Square' }), false)
  assert.deepEqual(engine.snapshot(), before)
})

test('manual forward/back and toggling correct the cursor', () => {
  const engine = new GuideEngine(starterRoute())
  engine.forward() // hillock done by hand
  assert.equal(engine.snapshot().cursorStepId, 'a1-town-1')
  engine.back() // undo
  assert.equal(engine.snapshot().cursorStepId, 'a1-hillock')
  engine.toggle('a1-hillock')
  assert.equal(engine.snapshot().cursorStepId, 'a1-town-1')
  engine.toggle('a1-hillock')
  assert.equal(engine.snapshot().cursorStepId, 'a1-hillock')
})

test('hot reload keeps progress for surviving step ids', () => {
  const route = starterRoute()
  const engine = new GuideEngine(route, ['a1-hillock', 'a1-town-1'])
  assert.equal(engine.snapshot().cursorStepId, 'a1-coast')
  const edited: Route = { ...route, steps: route.steps.filter((s) => s.id !== 'a1-town-1') }
  engine.setRoute(edited)
  const snap = engine.snapshot()
  assert.ok(snap.doneIds.includes('a1-hillock'))
  assert.ok(!snap.doneIds.includes('a1-town-1'))
  assert.equal(snap.cursorStepId, 'a1-coast')
})

// ---------- end to end: real capture drives the guide ----------

test('real capture: the July session walks the starter route to the Submerged Passage', () => {
  const engine = new GuideEngine(starterRoute())
  const areas: AreaState[] = []
  const tracker = new ProgressTracker({
    areaNames: loadAreaNames(),
    callbacks: { onArea: (a) => areas.push(a) }
  })
  const parser = makeParser()
  for (const line of loadFixtureLines('act1-real.log')) {
    const ev = parser.parseLine(line)
    if (ev) tracker.handle(ev)
  }
  for (const a of areas) engine.applyArea({ areaId: a.areaId, name: a.name })

  const snap = engine.snapshot()
  assert.equal(snap.cursorStepId, 'a1-submerged', 'guide stands at the Submerged Passage step')
  // The final town return in the capture (stash trip) must not have skipped it.
  assert.ok(!snap.doneIds.includes('a1-submerged'))
  assert.ok(snap.doneIds.includes('a1-hillock'))
  assert.ok(snap.doneIds.includes('a1-mud-flats'))
})
