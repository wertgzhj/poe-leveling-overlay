import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkReleaseTag, nextTags, parseTag } from '../scripts/release-tag.ts'

// The releases as they stood when v19.0.0 slipped through.
const PUBLISHED = ['v0.17.3', 'v0.17.4', 'v0.18.0', 'v0.19.0']

test('the three next versions pass', () => {
  for (const tag of ['v0.19.1', 'v0.20.0', 'v1.0.0']) assert.equal(checkReleaseTag(tag, PUBLISHED), null, tag)
})

test('v19.0.0 for v0.19.0 is caught, and the message names the right three', () => {
  const problem = checkReleaseTag('v19.0.0', ['v0.17.4', 'v0.18.0'])
  assert.ok(problem)
  assert.match(problem, /v0\.18\.0/)
  assert.match(problem, /v0\.18\.1, v0\.19\.0, v1\.0\.0/)
})

test('going backwards or skipping is caught', () => {
  assert.ok(checkReleaseTag('v0.18.1', PUBLISHED), 'lower than the last')
  assert.ok(checkReleaseTag('v0.19.2', PUBLISHED), 'skips a patch')
  assert.ok(checkReleaseTag('v0.21.0', PUBLISHED), 'skips a minor')
  assert.ok(checkReleaseTag('v0.20.1', PUBLISHED), 'a minor bump keeps the patch at 0')
  assert.ok(checkReleaseTag('v2.0.0', PUBLISHED), 'skips a major')
})

test("the tag's own release, already published, doesn't count against it", () => {
  // Publishing creates the release and the tag together; the build sees both.
  assert.equal(checkReleaseTag('v0.19.1', [...PUBLISHED, 'v0.19.1']), null)
})

test('a deleted release no longer counts', () => {
  // v19.0.0 was deleted: the list doesn't have it, so v0.19.0 is fine again.
  assert.equal(checkReleaseTag('v0.19.0', ['v0.17.4', 'v0.18.0']), null)
})

test('only vX.Y.Z is a release tag', () => {
  for (const bad of ['0.19.1', 'v0.19', 'v0.19.1-beta', 'V0.19.1', 'v0.019.1', 'v 0.19.1', '']) {
    assert.equal(parseTag(bad), null, JSON.stringify(bad))
    assert.match(checkReleaseTag(bad, PUBLISHED) ?? '', /not a release tag/)
  }
})

test('the first release has nothing to follow; odd old tags are ignored', () => {
  assert.equal(checkReleaseTag('v0.1.0', []), null)
  assert.equal(checkReleaseTag('v0.19.1', ['test-build', ...PUBLISHED]), null)
})

test('nextTags lists patch, minor, major', () => {
  assert.deepEqual(nextTags(parseTag('v0.19.0')!), ['v0.19.1', 'v0.20.0', 'v1.0.0'])
})
