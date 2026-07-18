// Resolve a PoB import input to a code or XML. Handles a raw export code, a raw
// XML paste, and pobb.in / pastebin links (fetched from their raw endpoints).
// The only network in the profile pipeline (plan §11.1: user-initiated import).

export interface ResolvedPobInput {
  code?: string
  xml?: string
  error?: string
}

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
    const res = await fetch(raw, { redirect: 'follow' })
    if (!res.ok) return { error: `could not fetch the link (HTTP ${res.status})` }
    const text = (await res.text()).trim()
    if (!text) return { error: 'the link returned nothing' }
    return text.startsWith('<') ? { xml: text } : { code: text }
  } catch (e) {
    return { error: `could not fetch the link: ${(e as Error).message}` }
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
