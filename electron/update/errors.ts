// What an update-check failure means, in a sentence a player can use (pure —
// unit-tested).
//
// electron-updater's errors are written for whoever is debugging the updater:
// the 404 for a missing latest.yml arrives as a status line, the full response
// headers and a stack trace — complete with the install path, which on Windows
// is the user's own folder (C:\Users\<name>\…). All of that used to land in
// Settings verbatim. None of it should reach the screen, and certainly not a
// screenshot someone posts while asking for help.

export type UpdateProblem =
  /** The newest release exists but its update files aren't attached yet — the
   *  few minutes after every release while the Windows build runs. Not a
   *  failure, and not something to show in red. */
  | { kind: 'publishing'; version: string | null }
  | { kind: 'error'; message: string }

const MAX_MESSAGE = 140

/** Sort a raw updater error into what it means. Never throws. */
export function classifyUpdateError(raw: unknown): UpdateProblem {
  // anything else stringifies however it does — "[object Object]" included;
  // it only has to not throw
  // oxlint-disable-next-line typescript/no-base-to-string
  const text = raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : String(raw ?? '')

  // The release page is up but the build hasn't attached its channel file yet:
  // electron-updater asks for latest.yml (or beta.yml) and GitHub answers 404.
  if (/Cannot find \w+\.yml/i.test(text) || (/\.yml\b/i.test(text) && /\b404\b/.test(text))) {
    const version = /\/download\/v?([0-9][\w.-]*)\/\w+\.yml/i.exec(text)?.[1] ?? null
    return { kind: 'publishing', version }
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|net::ERR_/i.test(text)) {
    return { kind: 'error', message: 'No connection to GitHub — it will try again later.' }
  }
  if (/\b(403|429)\b|rate limit/i.test(text)) {
    return { kind: 'error', message: 'GitHub is limiting update checks right now — it will try again later.' }
  }
  return { kind: 'error', message: summarize(text) }
}

/**
 * One line, no internals: the first line only, cut before the parts that are
 * for developers ("HttpError: …", "Headers: …", " at …"), local paths removed,
 * and capped in length. What's left says what happened, not where in the code.
 */
export function summarize(text: string): string {
  let line = (text.split(/\r?\n/)[0] ?? '').trim()
  line = line.split(/\s+(?:HttpError:|Headers:|at\s+\S+\s+\()/)[0] ?? line
  line = line
    .replace(/[A-Za-z]:\\[^\s"')]*/g, '…') // C:\Users\name\AppData\…
    .replace(/(?:\/Users|\/home|\/root)\/[^\s"')]*/g, '…') // macOS / Linux homes
    .replace(/^Error:\s*/, '')
    .trim()
  if (!line) return 'Something went wrong — it will try again later.'
  return line.length > MAX_MESSAGE ? `${line.slice(0, MAX_MESSAGE - 1).trimEnd()}…` : line
}
