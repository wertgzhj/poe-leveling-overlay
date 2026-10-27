import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PROFILE_SHARE_FORMAT, exportProfile, parseSharedProfile } from '../electron/profile/share.ts'

const example = JSON.parse(readFileSync('data/profiles/example.json', 'utf8')) as Record<string, unknown>
const mine = { ...example, meta: { ...(example.meta as object), character: 'MyOwnCharacter' } }

test('an export is the profile, marked, without the character it belongs to', () => {
  const out = JSON.parse(exportProfile(mine)) as { format: string; profile: { meta: Record<string, unknown> } }
  assert.equal(out.format, PROFILE_SHARE_FORMAT)
  assert.equal('character' in out.profile.meta, false)
  assert.equal(out.profile.meta.name, (example.meta as { name: string }).name)
  assert.deepEqual((out.profile as Record<string, unknown>).stages, example.stages)
})

test('an export reads back as the same profile', () => {
  const { json, errors } = parseSharedProfile(exportProfile(mine))
  assert.deepEqual(errors, [])
  assert.deepEqual(json?.stages, example.stages)
})

test('a profile file pasted as it is works too, and loses its character', () => {
  const { json, errors } = parseSharedProfile(JSON.stringify(mine))
  assert.deepEqual(errors, [])
  assert.ok(json)
  assert.equal('character' in (json.meta as object), false)
})

test("what isn't a profile says why, and adds nothing", () => {
  assert.equal(parseSharedProfile('not json').json, null)
  assert.match(parseSharedProfile('not json').errors[0], /not valid JSON/)
  assert.equal(parseSharedProfile('[1, 2]').json, null)
  const broken = parseSharedProfile(JSON.stringify({ format: PROFILE_SHARE_FORMAT, profile: { meta: {} } }))
  assert.equal(broken.json, null)
  assert.ok(broken.errors.length > 0)
})
