// Import a Path of Building build into a profile JSON, headless.
//
//   npm run import-pob -- <code | file.txt | build.xml> [--name "My Build"] [--out data/profiles/mine.json]
//
// Without --out the profile is printed to stdout; warnings go to stderr.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { importPobCode, importPobXml } from '../electron/profile/pob.ts'

const argv = process.argv.slice(2)
let name: string | undefined
let out: string | undefined
const positional: string[] = []
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--name') name = argv[++i]
  else if (argv[i] === '--out') out = argv[++i]
  else positional.push(argv[i])
}

const arg = positional[0]
if (!arg) {
  console.error('usage: npm run import-pob -- <code|file> [--name X] [--out path]')
  process.exit(1)
}

const input = existsSync(arg) ? readFileSync(arg, 'utf8').trim() : arg
const result = input.startsWith('<') ? importPobXml(input, { name }) : importPobCode(input, { name })

for (const w of result.warnings) console.error(`warning: ${w}`)
if (!result.profile) {
  for (const e of result.errors) console.error(`error: ${e}`)
  process.exit(1)
}

const json = JSON.stringify(result.profile, null, 2) + '\n'
if (out) {
  writeFileSync(out, json)
  console.error(`wrote ${out} — ${result.profile.stages.length} stage(s), class ${result.profile.meta.class}`)
} else {
  process.stdout.write(json)
}
