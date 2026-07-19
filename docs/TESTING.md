# Testing & status

Where the project stands, what's covered by automated tests, and the manual checks
that still need a real Windows machine + a running game.

Last updated: 2026-07-18.

## At a glance

| Phase | Feature | Code | Auto-tested | Needs your Windows check |
|---|---|---|---|---|
| P0 | Transparent always-on-top overlay, global hotkeys, settings persistence | ✅ | build only¹ | on-top over the game, hotkeys, DPI ≠ 100%, multi-monitor |
| P0.5 | In-overlay Settings panel + live hotkey rebinding | ✅ | accelerator util | rebind flow, file pickers on screen |
| P1 | `Client.txt` LogWatcher (zone + level, restart-safe resume) | ✅ | ✅ parser/tracker/watcher + real capture | live tracking while playing |
| P2 | Route guide, auto-advance, multi-act, fallback Acts 2–10 | ✅ | ✅ engine + all 10 act files | auto-advance while playing, town round-trip |
| P3 | Build-profile gem panel (computed colours, stage switch) | ✅ | ✅ engine | panel on screen, stage switch on level-up |
| P4 | Path of Building import (code / pobb.in link) | ✅ | ✅ + CLI end-to-end | in-app import button, pobb.in fetch |
| P5 | Class-aware gem sources (engine + poewiki data) | ✅ | ✅ | reward/buy hints in the Gems tab look right |
| P6 | Trials tracker | ✅ | ✅ | auto-check on entering a trial zone |
| P6 | Packaged Windows release (installer + portable) | ✅ | icon + CI build | double-click launch |
| — | Visual route/profile editor (separate window) | ✅ | pure edit ops | window opens, edit → save → overlay reloads |
| — | In-app auto-update (electron-updater) | ✅ | build only | update prompt + one-click Restart on the installed build |

¹ P0 is overlay/window behaviour that only exists on Windows; there's no headless test,
only the bundle build. Everything else marked ✅ has real unit/integration tests.

**Automated:** `npm test` (parser, tracker, watcher, guide, profile, PoB, trials, editor,
gem-cargo — 89 tests), `npm run typecheck`, `npm run build`; CI runs all of these on every
push/PR (`ci.yml`).

## Manual test steps (Windows, with the game)

Get the app: **Actions → Build Windows → latest run → Artifacts → `windows-build`**,
unzip, run the setup or portable exe (SmartScreen → *More info → Run anyway*).
Or from source: `npm ci && npm run make-icon && npm run dev`.

Then, in Path of Exile (**Windowed Fullscreen**):

1. **Overlay (P0):** it stays on top of the game; `Ctrl+Shift+O/C/M` toggle
   visibility / click-through / move mode; drag to reposition (move mode); check it
   still behaves at non-100% DPI and on a second monitor. In **interactive** mode,
   clicks on the empty/transparent area around the panel now reach the game — only
   the visible panel captures the mouse (the version badge sits on the panel's
   corner, not the window's).
2. **Settings (P0.5):** ⚙ → set the `Client.txt` path (Browse), rebind a hotkey
   (click it, press a combo), adjust opacity. Changes take effect immediately.
3. **Tracking (P1):** the tracker strip shows your current zone and level as you play;
   restart the overlay mid-session — it resumes zone + level. **New character:** with no
   character name pinned in Settings, starting a fresh character (entering the Twilight
   Strand) should switch tracking to it on its first level-up. (Pin a name in Settings →
   Game log only if you play in a party.)
4. **Guide (P2):** the Guide tab auto-advances as you enter zones; a portal to town
   and back does **not** skip steps; `Ctrl+Shift+N/P` correct the step; it crosses into
   Act 2's skeleton. (Acts 2–10 are placeholders to replace — see the README.)
5. **Gems (P3/P4):** point Settings → Build profile at a profile, or paste a PoB
   code/link into *Import from Path of Building*; the Gems tab shows the current
   stage's links with colours and flips stages when you level. The stage is bound
   to your **tracked level** (level-up lines in Client.txt): it switches the moment
   your level enters the next stage's range. **Restart check:** close and reopen the
   overlay mid-session — the Gems tab must show the correct stage immediately (not
   stage 1 until the next level-up).
6. **Trials (P6):** entering a trial zone (e.g. The Lower Prison) shows an amber
   **"Trial of Ascendancy in this zone"** hint (on every tab) — it is **not**
   auto-checked; click the hint's *Done ✓* (or the trial row) when you complete it.
   **Bonus capture:** when you finish a trial plaque, grab the exact `Client.txt`
   line (Select-String on `Trial` / `Ascendancy`) — with it, auto-complete can be
   wired properly.
7. **Editor:** tray → *Edit routes & profile…* (or the button in Settings) opens a
   normal window. Add/edit a step on an act, hit **Save** — the Guide tab reflects it
   without a restart. Same for the Profile tab → the Gems tab.
8. **Auto-update (installed build):** needs a **published GitHub Release** newer than the
   installed version (releases must be publicly downloadable — see below). Install an
   older version, launch it: within ~10s Settings → Updates shows it downloading, then
   the overlay shows *Update ready — Restart & update*; click it → it reinstalls silently
   and reopens on the new version. Settings → Updates also has a manual **Check** button.
   The bottom-right **version badge** should track the same flow: `vX.Y.Z` → download
   percentage → clickable `vOld → vNew ⬆` pill (click = instant update; needs
   interactive mode if click-through is on).

**Auto-update prerequisite:** the updater reads this repo's Releases, so they must be
publicly downloadable. If the repo is private, make it public **or** point `publish.repo`
in `electron-builder.yml` at a separate public releases repo. Dev/unpackaged runs show
updates as *disabled*; an unreachable feed shows *Couldn't check* and never nags.

**Report format:** for anything off, tell me the tab/feature + what you saw vs. expected
(and for tracking issues, a couple of lines from the 🐞 dev panel).

## Open follow-ups (not blocking)

- **Gem source data: FILLED** (2026-07-19, 67/70 curated gems with per-class
  quest/vendor sources from poewiki). Refresh after a game patch with one click:
  **Actions → Fetch gem data → Run workflow** (pulls the wiki's Cargo data, runs the
  tests as a guard, commits to main). Local alternative: `npm run fetch-gems`
  (`-- --dry-run` to preview). Authored `gemPlan.source` still overrides per profile.
- **Your route content:** Acts 2–10 ship as fallback skeletons — replace them in
  `data/campaign/actN.json` (or per-act overrides in the userData `routes/` folder), or
  in the visual editor (tray → *Edit routes & profile…*).
- **Auto-update needs public releases:** the in-app updater only works if this repo's
  Releases are publicly downloadable — make the repo public, or repoint `publish.repo`
  in `electron-builder.yml` at a public releases repo (see the Updating steps above).
- **Vendor gem cost tiers are provisional:** the buy list shows a price per gem
  (Wisdom / Transmutation / Alteration / Chance / Alchemy) derived from the gem's
  level requirement. Verify the tier boundaries in game and report — they live in
  `COST_TIERS` (`electron/profile/gems.ts`).
- **Starting gems (all 7 classes confirmed):** `data/starting-gems.json` lists the skill
  + support gem each class begins with (owner-confirmed, validated against the gem list),
  so the overlay marks them "✓ start" and never tells you to buy/quest them. Edit + rebuild
  if a patch changes them.
- **Trial completion line:** when you finish a trial plaque, capture the exact
  `Client.txt` line (Select-String `Trial` / `Ascendancy`) so auto-complete can be
  wired; until then completion is the one-click hint/manual toggle.
- **Code signing:** the release is unsigned (SmartScreen warning) — a paid cert is the
  fix; backlog.

## Releasing (long-term)

- **Dev build:** Actions → *Build Windows* → *Run workflow*. Artifact only, version stays
  `0.0.0`, no release.
- **Real release:** push a tag `vX.Y.Z` (e.g. `v0.1.0`). The workflow builds with that
  version and publishes a GitHub Release with both exes plus `latest.yml` + `.blockmap`
  (the files the in-app updater reads) attached. `package.json` is never bumped for dev —
  the tag is the source of truth for release versions. Each tagged release is what
  installed builds auto-update to.
