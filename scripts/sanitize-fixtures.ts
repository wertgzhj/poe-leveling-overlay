// Sanitize a real Client.txt capture before it may be committed as a fixture
// (plan §11.1): drops chat/whisper lines entirely, strips IP addresses, and
// replaces character names with ExileN placeholders.
//
//   npm run sanitize -- <input> [output]      (default output: <input>.sanitized.log)
//
// Review the output yourself before committing — the script is a safety net,
// not a guarantee.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const patternsPath = fileURLToPath(new URL('../data/log-patterns/en.json', import.meta.url))
const { patterns } = JSON.parse(readFileSync(patternsPath, 'utf8')) as {
  patterns: { chat: string; levelUp: string }
}

const [input, output] = process.argv.slice(2)
if (!input) {
  console.error('usage: npm run sanitize -- <input> [output]')
  process.exit(1)
}
const outPath = output ?? `${input}.sanitized.log`

const chatRe = new RegExp(patterns.chat)
const levelUpRe = new RegExp(patterns.levelUp)
// Lines that leak network details (instance server IPs) — §11.1 says strip IPs.
const ipLineRe = /Connect(?:ing|ed) to|instance server/i
const ipRe = /\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g
// Other lines that carry player names.
const joinedAreaRe = /\] : (?<name>\S+) has (?:joined|left) the area/

const lines = readFileSync(input, 'utf8').split(/\r?\n/)

// Pass 1: collect character names (level-ups + area joins) on non-chat lines.
const names = new Set<string>()
for (const line of lines) {
  if (chatRe.test(line)) continue
  const lvl = levelUpRe.exec(line)
  if (lvl?.groups) names.add(lvl.groups['name'].trim())
  const joined = joinedAreaRe.exec(line)
  if (joined?.groups) names.add(joined.groups['name'])
}
const replacements = new Map([...names].map((n, i) => [n, `Exile${i + 1}`] as const))

// Pass 2: drop/scrub.
let droppedChat = 0
let scrubbedIps = 0
const out: string[] = []
for (const line of lines) {
  if (line.length === 0) continue
  if (chatRe.test(line)) {
    droppedChat++
    continue
  }
  let clean = line
  if (ipLineRe.test(clean) || ipRe.test(clean)) {
    clean = clean.replace(ipRe, () => {
      scrubbedIps++
      return '0.0.0.0'
    })
  }
  for (const [name, alias] of replacements) {
    clean = clean.split(name).join(alias)
  }
  out.push(clean)
}

writeFileSync(outPath, out.join('\n') + '\n')
console.log(
  `wrote ${outPath}: ${out.length} lines kept, ${droppedChat} chat/whisper lines dropped, ` +
    `${scrubbedIps} IPs scrubbed, ${replacements.size} character names replaced`
)
if (replacements.size > 0) {
  console.log('replaced names:', [...replacements.keys()].join(', '))
}
