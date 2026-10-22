import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { isCampaignAreaId } from '../electron/log/tracker.ts'
import { actFromAreaId } from '../electron/profile/engine.ts'
import { CAMPAIGN_TRIALS } from '../electron/trials/engine.ts'

// data/areas/en.json against the code that reads area ids, and the zone names
// other data relies on. The table comes from real captures; these tests keep
// the rest of the app agreeing with it.

const root = new URL('../', import.meta.url)
const areas: Record<string, string> = JSON.parse(readFileSync(new URL('data/areas/en.json', root), 'utf8')).areas
const ids = Object.keys(areas)

test('every listed id is a campaign id with an act, Karui Shores aside', () => {
  for (const id of ids) {
    assert.ok(isCampaignAreaId(id), id)
    if (id === '2_11_endgame_town') assert.equal(actFromAreaId(id), null)
    else assert.ok(actFromAreaId(id) != null, id)
  }
})

test('acts 1-5 are part 1, acts 6-10 part 2, and each act has its town', () => {
  for (const id of ids) {
    const act = actFromAreaId(id)
    if (act == null) continue
    assert.equal(id.startsWith(act <= 5 ? '1_' : '2_'), true, id)
  }
  for (let act = 1; act <= 10; act++) {
    assert.ok(ids.includes(`${act <= 5 ? 1 : 2}_${act}_town`), `act ${act} town`)
  }
  assert.equal(areas['1_1_1'], 'The Twilight Strand')
  assert.equal(areas['1_3_17_1'], 'The Library')
})

test("every trial's zone exists in its act", () => {
  for (const t of CAMPAIGN_TRIALS) {
    const hit = ids.find((id) => areas[id] === t.zone && actFromAreaId(id) === t.act)
    assert.ok(hit, `${t.id}: "${t.zone}" in act ${t.act}`)
  }
})

test("every zone a guide route names exists in that route's act", () => {
  const dir = new URL('data/campaign/', root)
  for (const file of readdirSync(dir)) {
    const route = JSON.parse(readFileSync(new URL(file, dir), 'utf8'))
    for (const step of route.steps as Array<{ id: string; zone?: string; areaId?: string }>) {
      if (step.areaId) assert.ok(areas[step.areaId], `${file} ${step.id}: ${step.areaId}`)
      if (!step.zone) continue
      const hit = ids.find((id) => areas[id] === step.zone && actFromAreaId(id) === route.act)
      assert.ok(hit, `${file} ${step.id}: "${step.zone}" in act ${route.act}`)
    }
  }
})
