import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { LogParser, type LogPatterns } from '../electron/log/parser.ts'

export function repoPath(rel: string): string {
  return fileURLToPath(new URL(`../${rel}`, import.meta.url))
}

export function loadPatterns(lang = 'en'): LogPatterns {
  const json = JSON.parse(readFileSync(repoPath(`data/log-patterns/${lang}.json`), 'utf8'))
  return json.patterns as LogPatterns
}

export function loadAreaNames(lang = 'en'): Record<string, string> {
  const json = JSON.parse(readFileSync(repoPath(`data/areas/${lang}.json`), 'utf8'))
  return json.areas as Record<string, string>
}

export function loadFixtureLines(name: string): string[] {
  return readFileSync(repoPath(`data/fixtures/${name}`), 'utf8')
    .split('\n')
    .filter((l) => l.length > 0)
}

export function makeParser(lang = 'en'): LogParser {
  return new LogParser(loadPatterns(lang))
}

/** Poll until cond() is true or the timeout elapses. */
export async function until(cond: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('until(): condition not met in time')
    await new Promise((r) => setTimeout(r, 20))
  }
}
