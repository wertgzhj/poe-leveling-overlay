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
| P5 | Class-aware gem-source engine | ✅ | ✅ | — (data still partial, see below) |
| P6 | Trials tracker | ✅ | ✅ | auto-check on entering a trial zone |
| P6 | Packaged Windows release (installer + portable) | ✅ | icon + CI build | double-click launch |
| — | Visual route/profile editor (separate window) | ✅ | pure edit ops | window opens, edit → save → overlay reloads |

¹ P0 is overlay/window behaviour that only exists on Windows; there's no headless test,
only the bundle build. Everything else marked ✅ has real unit/integration tests.

**Automated:** `npm test` (parser, tracker, watcher, guide, profile, PoB, trials),
`npm run typecheck`, `npm run build`; CI runs all of these on every push/PR (`ci.yml`).

## Manual test steps (Windows, with the game)

Get the app: **Actions → Build Windows → latest run → Artifacts → `windows-build`**,
unzip, run the setup or portable exe (SmartScreen → *More info → Run anyway*).
Or from source: `npm ci && npm run make-icon && npm run dev`.

Then, in Path of Exile (**Windowed Fullscreen**):

1. **Overlay (P0):** it stays on top of the game; `Ctrl+Shift+O/C/M` toggle
   visibility / click-through / move mode; drag to reposition (move mode); check it
   still behaves at non-100% DPI and on a second monitor.
2. **Settings (P0.5):** ⚙ → set the `Client.txt` path (Browse), rebind a hotkey
   (click it, press a combo), adjust opacity. Changes take effect immediately.
3. **Tracking (P1):** the tracker strip shows your current zone and level as you play;
   restart the overlay mid-session — it resumes zone + level.
4. **Guide (P2):** the Guide tab auto-advances as you enter zones; a portal to town
   and back does **not** skip steps; `Ctrl+Shift+N/P` correct the step; it crosses into
   Act 2's skeleton. (Acts 2–10 are placeholders to replace — see the README.)
5. **Gems (P3/P4):** point Settings → Build profile at a profile, or paste a PoB
   code/link into *Import from Path of Building*; the Gems tab shows the current
   stage's links with colours and flips stages when you level.
6. **Trials (P6):** entering a trial zone (e.g. The Lower Prison) checks it off on the
   Trials tab; click any trial to correct it.
7. **Editor:** tray → *Edit routes & profile…* (or the button in Settings) opens a
   normal window. Add/edit a step on an act, hit **Save** — the Guide tab reflects it
   without a restart. Same for the Profile tab → the Gems tab.

**Report format:** for anything off, tell me the tab/feature + what you saw vs. expected
(and for tracking issues, a couple of lines from the 🐞 dev panel).

## Open follow-ups (not blocking)

- **Gem source data:** `data/gems.json` `sources` is empty — the class-aware resolver is
  built and tested, but the data (per-class quest/vendor availability) needs a pull from
  poewiki, which is blocked from the build sandbox. Run on a reachable machine or ask me
  for a fetch script. Until then, reward/buy hints come from a profile's authored
  `gemPlan.source` (incl. PoB import).
- **Your route content:** Acts 2–10 ship as fallback skeletons — replace them in
  `data/campaign/actN.json` (or per-act overrides in the userData `routes/` folder).
- **Optional GUI editor:** route/profile content is file-based by choice; a visual
  editor window is available to build if wanted.
- **Code signing:** the release is unsigned (SmartScreen warning) — a paid cert is the
  fix; backlog.

## Releasing (long-term)

- **Dev build:** Actions → *Build Windows* → *Run workflow*. Artifact only, version stays
  `0.0.0`, no release.
- **Real release:** push a tag `vX.Y.Z` (e.g. `v0.1.0`). The workflow builds with that
  version and publishes a GitHub Release with both exes attached. `package.json` is never
  bumped for dev — the tag is the source of truth for release versions.
