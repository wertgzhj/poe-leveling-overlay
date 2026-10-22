// Whether a release tag is the next version — pure, unit-tested. The build
// workflow runs it (scripts/check-release-tag.ts) before building a tag, because
// a release is the one step with no review: whatever its tag says becomes the
// app's version for everyone who updates.
//
// The tag must be exactly one of the three versions that can follow the last
// published release: the next patch, minor or major. That turns "v19.0.0" for
// "v0.19.0" — which happened, and would have stranded every installation on
// 19.0.0, since the updater only ever moves up — into a failed build with the
// right three names in the message. A release that was deleted doesn't count,
// so after a botched one the same three names apply again.

export interface Version {
  major: number
  minor: number
  patch: number
}

/** vMAJOR.MINOR.PATCH, digits only, no leading zeros; anything else is null. */
export function parseTag(tag: string): Version | null {
  const m = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag.trim())
  return m ? { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) } : null
}

export function formatTag(v: Version): string {
  return `v${v.major}.${v.minor}.${v.patch}`
}

function compare(a: Version, b: Version): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch
}

/** The three versions that may follow `v`. */
export function nextTags(v: Version): string[] {
  return [
    formatTag({ major: v.major, minor: v.minor, patch: v.patch + 1 }),
    formatTag({ major: v.major, minor: v.minor + 1, patch: 0 }),
    formatTag({ major: v.major + 1, minor: 0, patch: 0 })
  ]
}

/**
 * Null when `tag` may be released after `published` (the tags of the published,
 * non-prerelease releases — `tag`'s own release may be among them), else what
 * is wrong, in words for the person who typed the tag.
 */
export function checkReleaseTag(tag: string, published: readonly string[]): string | null {
  const next = parseTag(tag)
  if (!next) return `"${tag}" is not a release tag — it must look like v0.19.1 (v, then three numbers).`
  const previous = published
    .filter((t) => t.trim() !== tag.trim())
    .map(parseTag)
    .filter((v): v is Version => v !== null)
  // The very first release has nothing to follow.
  if (previous.length === 0) return null
  const latest = previous.reduce((a, b) => (compare(b, a) > 0 ? b : a))
  const allowed = nextTags(latest)
  if (allowed.includes(formatTag(next))) return null
  return (
    `${tag} can't follow the last release, ${formatTag(latest)}. ` +
    `The next version is one of: ${allowed.join(', ')}.`
  )
}
