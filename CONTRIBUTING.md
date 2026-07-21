# Development & release workflow

How to work on the overlay and ship updates **without breaking the version your
players (and you) have installed**. Written for a solo maintainer; no ceremony.

## The one rule that keeps you safe

> **The installed app only ever moves when you publish a GitHub _Release_.**

Branches, pull requests, CI runs and dev builds are all invisible to installed
copies. Nothing reaches a player until you deliberately cut a release — so you
can experiment as much as you like. The _only_ way to break the live version is
to publish a broken **Release**, and that step is entirely in your hands.

## Day-to-day loop

1. **Branch** off `main`.
2. **Make your change.** Keep these green (CI runs all three on every PR):
   - `npm run typecheck` · `npm test` · `npm run build`
3. **Open a PR** to `main`. Wait for the ✓ check.
4. **Test it for real** — see [Test a change safely](#test-a-change-safely-before-releasing).
5. **Squash-merge** to `main`.
6. **Publish a release** when you want it live — see [Cut a release](#cut-a-release-go-live).

Merging to `main` does **not** ship anything. It just stages the change for the
next release.

## Test a change safely (before releasing)

Build the change as a throwaway dev build that never touches the update feed:

1. Repo → **Actions → Build Windows → Run workflow** → in **"Use workflow from"**
   pick your branch → **Run**.
2. Download the **`windows-build`** artifact from the finished run, unzip it, and
   run the **portable** `.exe` in its own folder.

That build is version `0.0.0` and is an **artifact, not a release** — your
installed app and the auto-update feed are untouched. Delete it when you're done.
(The portable exe never self-updates, so it can't accidentally pull the live
release over your test.)

## Cut a release (go live)

The installed app auto-updates from this repo's GitHub Releases. To publish one —
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

`package.json` stays `0.0.0` forever — the **tag is the source of truth** for a
release's version. (CLI alternative, if you ever want it: push a tag `git tag
v0.3.0 && git push origin v0.3.0`.)

### Versioning

Each release must be a **higher** version than the last (the updater compares
semver):

| Change | Bump | Example |
|---|---|---|
| Bug fix | patch | `v0.2.1` → `v0.2.2` |
| New feature | minor | `v0.2.1` → `v0.3.0` |

### If a release turns out broken

Don't roll back — the updater only moves **forward**. Publish a higher fix
version (e.g. `v0.3.1`) and every install moves up to it. Optionally delete the
bad release from the Releases page so it doesn't linger, but it's superseded
either way (the updater always targets the newest non-prerelease).

## Gotchas (learned the hard way)

- **No spaces in release asset filenames.** electron-builder writes `latest.yml`
  with spaces collapsed to **hyphens**, but GitHub stores uploaded assets with
  spaces collapsed to **dots** — the mismatch makes the updater **404** on the
  download. `artifactName` in `electron-builder.yml` uses a hyphenated literal
  (not `${productName}`, which has spaces) for exactly this reason. Keep it
  space-free.
- **Renaming the repo?** Update `publish.repo` in `electron-builder.yml` in the
  same change, or new builds bake a dead update-feed URL into the app.
- **Releases must be publicly downloadable** for the updater to reach them. The
  repo is public; if it ever goes private, either make it public again or point
  `publish.repo` at a separate public releases repo.
- **Pre-releases are skipped** by the updater by default — only tick
  "Set as a pre-release" for a beta you _don't_ want auto-shipped to everyone.

## Optional: a beta channel (for later)

When you have outside testers, publish a test build as a GitHub **pre-release**
with a `-beta.N` suffix (e.g. `v0.3.0-beta.1`). Stable installs skip pre-releases
automatically; only a build configured with `allowPrerelease` picks them up.
Overkill for a solo dev today — the portable-artifact test above is simpler and
just as safe.

## Your content stays yours

Routes (`data/campaign/actN.json`) and build profiles are **owner-authored**.
Edit them in the in-app editor (tray → *Edit routes & profile…*) or the JSON
directly. Ship engines, schemas and honest fallback skeletons — never import
route content from other projects.

---

For local setup and the command reference, see the
[README](README.md#development). For design rationale, see
[`docs/plan.md`](docs/plan.md); for the manual test checklist,
[`docs/TESTING.md`](docs/TESTING.md).
