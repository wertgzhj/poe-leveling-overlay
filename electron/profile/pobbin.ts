// Resolve a PoB import input to a code or XML. Handles a raw export code, a raw
// XML paste, and pobb.in / pastebin links (fetched from their raw endpoints).
// The only network in the profile pipeline (user-initiated import).

export interface ResolvedPobInput {
  code?: string
  xml?: string
  error?: string
}

/** A paste host that never answers must not leave the Import button spinning. */
const FETCH_TIMEOUT_MS = 15_000
/** A PoB export is tens of KB; anything past this isn't one, so stop reading. */
const MAX_BYTES = 4 * 1024 * 1024

export async function resolvePobInput(input: string): Promise<ResolvedPobInput> {
  const t = input.trim()
  if (!t) return { error: 'paste a Path of Building code or a pobb.in / pastebin link' }
  if (t.startsWith('<')) return { xml: t }
  if (!/^https?:\/\//i.test(t)) return { code: t }

  const raw = toRawUrl(t)
  if (!raw) {
    return { error: 'unsupported link. Paste a pobb.in or pastebin link, or the export code itself' }
  }
  try {
    const res = await fetch(raw, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    })
    // A redirect may only land on the same paste host: following it anywhere
    // would turn the importer into a way to fetch arbitrary URLs.
    if (res.url && !sameHost(res.url, raw)) {
      return { error: 'the link redirected somewhere else. Paste the export code instead' }
    }
    if (!res.ok) return { error: `could not fetch the link (HTTP ${res.status})` }
    const body = await readCapped(res, MAX_BYTES)
    if (!body) return { error: TOO_MUCH }
    const text = new TextDecoder().decode(body).trim()
    if (!text) return { error: 'the link returned nothing' }
    return text.startsWith('<') ? { xml: text } : { code: text }
  } catch (e) {
    const err = e as Error
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return { error: 'the link took too long to respond. Try again, or paste the export code' }
    }
    return { error: `could not fetch the link: ${err.message}` }
  }
}

const TOO_MUCH = 'the link returned far too much data to be a Path of Building export'

/**
 * The response body, or null once it passes `max` bytes. Stops reading right
 * there — reading it all and measuring after would let a hostile or broken
 * host fill memory first. A Content-Length over the cap is refused unread.
 */
export async function readCapped(res: Response, max: number): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > max) {
    await res.body?.cancel()
    return null
  }
  if (!res.body) return new Uint8Array()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.byteLength
  }
  return out
}

/** Same host, give or take a www. — pastebin answers on both. */
function sameHost(a: string, b: string): boolean {
  const host = (u: string): string => new URL(u).hostname.replace(/^www\./, '')
  try {
    return host(a) === host(b)
  } catch {
    return false
  }
}

function toRawUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const id = u.pathname.replace(/^\/+|\/+$/g, '')
    if (!id) return null
    if (host === 'pobb.in') return `https://pobb.in/${id}/raw`
    if (host === 'pastebin.com') return `https://pastebin.com/raw/${id}`
    return null
  } catch {
    return null
  }
}
