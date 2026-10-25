// The build workflow's release gate (see release-tag.ts for the rule):
//
//   node --experimental-strip-types scripts/check-release-tag.ts <tag> [published tag]...
//
// Exits 1 with the reason when the tag must not be released. The workflow
// passes the published releases' tags; nothing here talks to GitHub.

import { checkReleaseTag } from './release-tag.ts'

const [tag, ...published] = process.argv.slice(2)
if (!tag) {
  console.error('usage: check-release-tag.ts <tag> [published tag]...')
  process.exit(2)
}

const problem = checkReleaseTag(tag, published)
if (problem) {
  // ::error:: puts it at the top of the run's summary on GitHub.
  console.error(`::error title=Release tag rejected::${problem}`)
  console.error(
    'Nothing was built. Delete this release AND its tag on GitHub, then publish the release again with the right tag.'
  )
  process.exit(1)
}
console.log(`${tag} is the next version — building it.`)
