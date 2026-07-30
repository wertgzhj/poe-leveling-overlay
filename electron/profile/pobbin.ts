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
    return { error: 'unsupported link — paste a pobb.in or pastebin link, or the export code itself' }
  }
  try {
    const res = await fetch(raw, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    })
    if (!res.ok) return { error: `could not fetch the link (HTTP ${res.status})` }
    const body = await res.arrayBuffer()
    if (body.byteLength > MAX_BYTES) {
      return { error: 'the link returned far too much data to be a Path of Building export' }
    }
    const text = new TextDecoder().decode(body).trim()
    if (!text) return { error: 'the link returned nothing' }
    return text.startsWith('<') ? { xml: text } : { code: text }
  } catch (e) {
    const err = e as Error
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return { error: 'the link took too long to respond — try again, or paste the export code' }
    }
    return { error: `could not fetch the link: ${err.message}` }
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
