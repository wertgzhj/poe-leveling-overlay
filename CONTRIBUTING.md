# Development & release workflow

How to work on the overlay and ship updates **without breaking the version your
players (and you) have installed**. Written for a solo maintainer; no ceremony.

## Contributions

This repository is maintained by one person and **doesn't take pull requests
from others**: the app updates itself on every install, so only its maintainer
changes the code. Bug reports, ideas and questions are very welcome as
[issues](https://github.com/wertgzhj/poe-leveling-overlay/issues); security
problems go privately through [`SECURITY.md`](SECURITY.md).

The rest of this file is the maintainer's own workflow.

## The one rule that keeps you safe

> **The installed app only ever moves when you publish a GitHub _Release_.**

Branches, pull requests, CI runs and dev builds are all invisible to installed
copies. Nothing reaches a player until you deliberately cut a release, so you
can experiment as much as you like. The _only_ way to break the live version is
to publish a broken **Release**, and that step is entirely in your hands.

## Day-to-day loop

1. **Branch** off `main`.
2. **Make your change.** Keep these green (CI runs all three on every PR):
   - `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
3. **Open a PR** to `main`. Wait for the ✓ check.
4. **Test it for real**: see [Test a change safely](#test-a-change-safely-before-releasing).
5. **Squash-merge** to `main`.
6. **Publish a release** when you want it live: see [Cut a release](#cut-a-release-go-live).

Merging to `main` does **not** ship anything. It just stages the change for the
next release.

### Lint: oxlint, not ESLint

`npm run lint` runs **oxlint** with its type-aware rules (`.oxlintrc.json`), and
CI runs it after the typecheck; warnings fail it too. Not ESLint:
`typescript-eslint` still declares `typescript >=4.8.4 <6.1.0`, and this
project compiles with **TypeScript 7**, which oxlint's type-aware rules run on.
Each rule that's off says why in the config.

### Writing text

No long dashes (`—`, `–`) and no centred dots (`·`) in anything people read:
the overlay, the editor, the timer, messages, README and docs. Use a colon, a
comma, a full stop or brackets for a dash, a comma or a line break for a dot,
and a plain hyphen for ranges (`Acts 1-3`). Code comments still have plenty;
clean those as you touch the file, not in a sweep.

## Test a change safely (before releasing)

Build the change as a throwaway dev build that never touches the update feed:

1. Repo → **Actions → Build Windows → Run workflow** → in **"Use workflow from"**
   pick your branch → **Run**.
2. Download the **`windows-portable`** artifact from the finished run (the
   installer is in **`windows-nsis`**), unzip it, and
   run the **portable** `.exe` in its own folder.

That build is version `0.0.0` and is an **artifact, not a release**: your
installed app and the auto-update feed are untouched. Delete it when you're done.
(The portable exe never downloads or installs an update (it only says one is
out) so it can't pull the live release over your test. Before v0.31.1 it did
download the installer and ran it on quit.)

### See what a change looks like (render check)

Every CI run takes screenshots of the overlay in over a dozen fixed scenarios
(the Gems tab in Act 2, the mule stage, a paged-back stage, the passives and
their map, Trials, Guide, Settings (also in move mode), and 40 % opacity) and
of the editor's Passive tree section and its Ascendancy fold, and attaches them to the run as the
**`render-check`** artifact. A PR's look can be checked there without running
anything. The scenarios are computed by the real engine from the real gem
data (`scripts/render-check/scenarios.ts`); only the main process is a
stand-in.

Locally: `npm run render-check` writes them to `out/render-check/` (on Linux
without a display, run it under `xvfb-run -a`). For a change that should look
**exactly** the same (a refactor) copy that folder away before the change,
then run `npm run render-check -- --compare <that folder>` after: it compares
the screenshots byte for byte and fails if any differ.

## Cut a release (go live)

The installed app auto-updates from this repo's GitHub Releases. To publish one:
no command line needed:

1. **Releases → Draft a new release**
2. **Choose a tag →** type the new version `vX.Y.Z` → **Create new tag on publish**
3. Target **`main`**, title `vX.Y.Z`, **leave "Set as a pre-release" unchecked**
4. **Publish release**

Publishing creates the tag, which triggers **Build Windows**. It builds with the
tag's version and attaches the installer, portable exe, their `.blockmap`s, and
**`latest.yml`** (the file the updater reads). Give it ~5 minutes; the release
looks empty until the build finishes and the files appear. Every install then
updates within ~10s of launch, or on demand via **Settings → Updates → Check**.

`package.json` stays `0.0.0` forever: the **tag is the source of truth** for a
release's version. (CLI alternative, if you ever want it: push a tag `git tag
v0.3.0 && git push origin v0.3.0`.)

### Versioning

Each release must be the **next** version after the last published one. The
updater compares semver and only ever moves up:

| Change | Bump | Example |
|---|---|---|
| Bug fix | patch | `v0.2.1` → `v0.2.2` |
| New feature | minor | `v0.2.1` → `v0.3.0` |

**The build checks this before building anything.** Its first step rejects a
tag that isn't exactly the next patch, minor or major after the last published
release: a typo like `v19.0.0` for `v0.19.0` would otherwise make every
installation 19.0.0 and strand it there. A rejected run fails with the three
tags that would have been right (at the top of the run's page). Then delete
the release **and** its tag (Code → Tags), and publish again with one of them.
A deleted release no longer counts, so the same three apply.

### If a release turns out broken

Don't roll back: the updater only moves **forward**. Publish a higher fix
version (e.g. `v0.3.1`) and every install moves up to it. Optionally delete the
bad release from the Releases page so it doesn't linger, but it's superseded
either way (the updater always targets the newest non-prerelease).

## Gotchas (learned the hard way)

- **No spaces in release asset filenames.** electron-builder writes `latest.yml`
  with spaces collapsed to **hyphens**, but GitHub stores uploaded assets with
  spaces collapsed to **dots**: the mismatch makes the updater **404** on the
  download. `artifactName` in `electron-builder.yml` uses a hyphenated literal
  (not `${productName}`, which has spaces) for exactly this reason. Keep it
  space-free.
- **Renaming the repo?** Update `publish.repo` in `electron-builder.yml` in the
  same change, or new builds bake a dead update-feed URL into the app.
- **Releases must be publicly downloadable** for the updater to reach them. The
  repo is public; if it ever goes private, either make it public again or point
  `publish.repo` at a separate public releases repo.
- **Pre-releases are skipped** by the updater by default: only tick
  "Set as a pre-release" for a beta you _don't_ want auto-shipped to everyone.

## Repository settings (what keeps the update feed safe)

Every install updates from this repo's Releases, so the account and the repo
settings are part of the app's security. Set once, check after GitHub changes:

- **Account:** two-factor authentication on; *Settings → Emails* → keep the
  address private and block command-line pushes that would expose it.
- **Rules (Settings → Rules → Rulesets):** `main`, changes only by pull
  request, the *check* status must pass, no force-push or deletion. Tags `v*`:
  only the maintainer may create, update or delete them (a tag *is* a release).
- **Pull requests:** creation limited to collaborators (there are none).
- **Actions (Settings → Actions → General):** workflow permissions *read*; fork
  pull requests need approval before any workflow runs.
- **Code security:** private vulnerability reporting, Dependabot alerts and
  security updates, secret scanning with push protection, CodeQL default setup.

Dependabot (`.github/dependabot.yml`) opens weekly update PRs for npm packages
and the GitHub Actions, which are pinned to commit SHAs: merge them like any
other PR, after CI.

## Optional: a beta channel (for later)

When you have outside testers, publish a test build as a GitHub **pre-release**
with a `-beta.N` suffix (e.g. `v0.3.0-beta.1`). Stable installs skip pre-releases
automatically; only a build configured with `allowPrerelease` picks them up.
Overkill for a solo dev today: the portable-artifact test above is simpler and
just as safe.

## Your content stays yours

Routes (`data/campaign/actN.json`) and build profiles are **yours to write**.
Edit them in the in-app editor (tray → *Edit routes & profile…*) or the JSON
directly. Ship engines, schemas and honest fallback skeletons, never import
route content from other projects.

---

For local setup and the command reference, see the
[README](README.md#development). For design rationale, see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md); for the manual test checklist,
[`docs/TESTING.md`](docs/TESTING.md).
