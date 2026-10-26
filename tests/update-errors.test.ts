import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyUpdateError, summarize } from '../electron/update/errors.ts'

// Shaped after the message electron-updater actually produced, checking for
// updates in the minutes between publishing a release and its build finishing.
// The user's own folder name is replaced with "someone".
const PUBLISHING = [
  'Cannot find latest.yml in the latest release artifacts (https://github.com/owner/repo/releases/download/v0.16.0/latest.yml): HttpError: 404',
  '"method: GET url: https://github.com/owner/repo/releases/download/v0.16.0/latest.yml\\n\\nPlease double check that your authentication token is correct."',
  'Headers: { "cache-control": "no-cache", "content-length": "29", "x-github-request-id": "F674:276BD5" }',
  '    at createHttpError (C:\\Users\\someone\\AppData\\Local\\Programs\\PoE Leveling Overlay\\resources\\app.asar\\node_modules\\builder-util-runtime\\out\\httpExecutor.js:53:12)'
].join('\n')

test('a release whose build is still running is "publishing", not an error', () => {
  assert.deepEqual(classifyUpdateError(new Error(PUBLISHING)), { kind: 'publishing', version: '0.16.0' })
  // The beta channel file reads the same way.
  assert.equal(
    classifyUpdateError('Cannot find beta.yml in the latest release artifacts').kind,
    'publishing'
  )
})

test('nothing from the raw error reaches the screen that shouldn\'t', () => {
  const shown = summarize('Unexpected: HttpError: 500 Headers: { "server": "github.com" }\n    at x (C:\\Users\\someone\\a.js:1:1)')
  assert.equal(shown, 'Unexpected:')
  assert.doesNotMatch(shown, /Headers|HttpError|someone|\\n/)

  // A path inside the first line is the user's folder name — it goes too.
  const withPath = summarize('ENOENT: no such file, open \'C:\\Users\\someone\\AppData\\app-update.yml\'')
  assert.doesNotMatch(withPath, /someone/)
  assert.doesNotMatch(summarize('failed reading /home/someone/.config/x'), /someone/)
  assert.doesNotMatch(summarize('failed reading /Users/someone/Library/x'), /someone/)
})

test('one line, and a short one', () => {
  assert.equal(summarize('Error: first line\nsecond line'), 'first line')
  const long = summarize('x'.repeat(500))
  assert.ok(long.length <= 140, `${long.length} chars`)
  assert.ok(long.endsWith('…'))
  assert.equal(summarize(''), 'Something went wrong. It will try again later.')
})

test('the common failures read as what they are', () => {
  assert.match(
    (classifyUpdateError(new Error('net::ERR_INTERNET_DISCONNECTED')) as { message: string }).message,
    /No connection/
  )
  assert.match((classifyUpdateError('getaddrinfo ENOTFOUND github.com') as { message: string }).message, /No connection/)
  assert.match((classifyUpdateError('HttpError: 403 rate limit exceeded') as { message: string }).message, /limiting/)
  // Whatever arrives, it never throws.
  assert.equal(classifyUpdateError(undefined).kind, 'error')
  assert.equal(classifyUpdateError({ odd: true }).kind, 'error')
})
