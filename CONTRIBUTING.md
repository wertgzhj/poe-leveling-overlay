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

### No linter, on purpose (for now)

There's no ESLint setup. Not an oversight: `typescript-eslint` still declares
`typescript >=4.8.4 <6.1.0`, including its canary builds, and this project
compiles with **TypeScript 7**. Installing it anyway would mean linting the code
with a parser that doesn't know the syntax it's written in.

`tsc` covers most of what a lean config would have caught — `strict`,
`noUnusedLocals` and `noUnusedParameters` are all on, for both the main and the
renderer projects, and CI runs them on every push. Revisit when
`typescript-eslint` ships TypeScript 7 support.

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
  That box is what keeps the Beta app (below) off everyone else's install, so a
  `-beta.N` tag published *without* it ships an experiment to every user.

## The Beta app (a second install, next to the real one)

For work that spans weeks — the GGG API check is the first
([`docs/GGG-API.md`](docs/GGG-API.md)) — the throwaway artifact above isn't
enough: you want to *play* with it while the stable build keeps getting fixes.
So there's a second app.

**Cut one exactly like a release, with a `-beta.N` suffix and the pre-release box
ticked:** tag `v0.15.0-beta.1`, **Set as a pre-release ✓**, publish. It installs
**beside** your stable overlay ("PoE Leveling Overlay Beta" in the Start menu)
and keeps its own settings and per-character progress, so nothing it does can
touch the install you actually level with. The flip side: it starts empty —
point it at `Client.txt` and your profile once.

Three things make that separation work, and it's worth knowing which is which,
because two of them are cosmetic and one isn't:

| Override | What it separates |
|---|---|
| `appId` | the Windows **installation** — beta installs beside, not over |
| `productName` | what the **installer and shortcut** say |
| `extraMetadata.name` | the **userData folder** — settings and progress |

The last one is the one that matters. Electron derives `userData` from
`app.getName()`, which reads the packaged `package.json` — *not* the appId. Set
only the first two and the beta writes into your real settings.

Updates take care of themselves: electron-updater turns on `allowPrerelease` by
itself when the running version has a prerelease suffix, so the beta follows
betas and **stable installs never see them**. Promoting the work is then a normal
`v0.15.0` release with the box unticked.

Manual runs can build it too — **Actions → Build Windows → Run workflow → Beta
✓** — for an artifact you can install without publishing anything. Locally it's
`npm run package:win:beta`, which needs a POSIX-ish shell (Git Bash) on Windows:
the artifact names contain electron-builder's `${version}` placeholder and cmd
would mangle it.

> **Unverified until the first beta tag.** Nobody has cut one yet. If the beta's
> auto-update doesn't find anything, the channel file is the first suspect: a
> `0.15.0-beta.1` build asks its feed for **`beta.yml`**, so check that the
> release actually has a `beta.yml` and not just a `latest.yml`.

## Your content stays yours

Routes (`data/campaign/actN.json`) and build profiles are **yours to write**.
Edit them in the in-app editor (tray → *Edit routes & profile…*) or the JSON
directly. Ship engines, schemas and honest fallback skeletons — never import
route content from other projects.

---

For local setup and the command reference, see the
[README](README.md#development). For design rationale, see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md); for the manual test checklist,
[`docs/TESTING.md`](docs/TESTING.md).
