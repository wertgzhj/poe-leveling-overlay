import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'
import { navigationAllowed } from '../electron/navigation.ts'
import { readCapped, resolvePobInput } from '../electron/profile/pobbin.ts'
import { decodePobCode, encodePobCode, importPobXml, MAX_POB_XML_BYTES } from '../electron/profile/pob.ts'

// ---------- windows stay on their own page ----------

const OVERLAY = 'file:///C:/Program%20Files/PoE%20Overlay/resources/app.asar/out/renderer/index.html'

test('a page may reload itself, change its hash or query — nothing else', () => {
  assert.equal(navigationAllowed(OVERLAY, OVERLAY), true)
  assert.equal(navigationAllowed(OVERLAY + '#gems', OVERLAY), true)
  assert.equal(navigationAllowed(OVERLAY + '?tab=routes', OVERLAY), true)
  // The dev server: same origin, any path (Vite serves the editor beside it).
  assert.equal(navigationAllowed('http://localhost:5173/editor/index.html', 'http://localhost:5173/'), true)
})

test('anywhere else is refused', () => {
  assert.equal(navigationAllowed('https://example.com/', OVERLAY), false)
  assert.equal(navigationAllowed('file:///C:/Windows/System32/drivers/etc/hosts', OVERLAY), false)
  assert.equal(navigationAllowed('http://localhost:6666/', 'http://localhost:5173/'), false)
  assert.equal(navigationAllowed('javascript:alert(1)', OVERLAY), false)
  assert.equal(navigationAllowed('data:text/html,hi', OVERLAY), false)
  assert.equal(navigationAllowed('not a url', OVERLAY), false)
})

// ---------- downloads stop at a size ----------

function streamed(chunks: number[], headers: Record<string, string> = {}): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const n of chunks) c.enqueue(new Uint8Array(n))
      c.close()
    }
  })
  return new Response(body, { headers })
}

test('a body under the cap is read whole, in order', async () => {
  const res = new Response('hello world')
  const out = await readCapped(res, 100)
  assert.equal(new TextDecoder().decode(out!), 'hello world')
})

test('a body over the cap stops at the cap, declared or not', async () => {
  // No Content-Length: reading stops at the chunk that crosses the line.
  assert.equal(await readCapped(streamed([60, 60, 60]), 100), null)
  // A Content-Length over the cap is refused before reading anything.
  assert.equal(await readCapped(streamed([10], { 'content-length': '5000' }), 100), null)
  assert.equal((await readCapped(streamed([50, 50]), 100))?.byteLength, 100)
})

test('a paste link that redirects to another host is refused', async () => {
  const real = globalThis.fetch
  globalThis.fetch = (async () => {
    const res = new Response('eNo-code')
    Object.defineProperty(res, 'url', { value: 'https://evil.example/elsewhere' })
    return res
  }) as typeof fetch
  try {
    const r = await resolvePobInput('https://pobb.in/abc123')
    assert.match(r.error ?? '', /redirected somewhere else/)
  } finally {
    globalThis.fetch = real
  }
})

test('pastebin answering on www. is still pastebin', async () => {
  const real = globalThis.fetch
  globalThis.fetch = (async () => {
    const res = new Response('eNo-code')
    Object.defineProperty(res, 'url', { value: 'https://www.pastebin.com/raw/abc123' })
    return res
  }) as typeof fetch
  try {
    assert.deepEqual(await resolvePobInput('https://pastebin.com/abc123'), { code: 'eNo-code' })
  } finally {
    globalThis.fetch = real
  }
})

// ---------- a PoB code can't unpack to gigabytes ----------

test('a real build still decodes', () => {
  const xml = '<PathOfBuilding><Build level="90" className="Witch"/></PathOfBuilding>'
  assert.equal(decodePobCode(encodePobCode(xml)), xml)
})

test('a code that unpacks past the cap is refused, not inflated', () => {
  // ~20 KB of code that would unpack to 64 MB of zeros.
  const bomb = deflateSync(Buffer.alloc(64 * 1024 * 1024)).toString('base64')
  assert.ok(bomb.length < 100_000)
  assert.throws(() => decodePobCode(bomb), /not a Path of Building code/)
})

test('pasted XML past the cap is refused before parsing', () => {
  const r = importPobXml('<' + 'a'.repeat(MAX_POB_XML_BYTES) + '>')
  assert.equal(r.profile, null)
  assert.match(r.errors[0], /far too large/)
})
