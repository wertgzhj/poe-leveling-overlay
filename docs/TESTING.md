# Testing & status

Where the project stands, what's covered by automated tests, and the manual checks
that still need a real Windows machine + a running game.

Last updated: 2026-07-28.

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
| P6 | Trials tracker (all 12: normal + cruel + merciless) | ✅ | ✅ | auto-check on finishing each trial |
| P6 | Packaged Windows release (installer + portable) | ✅ | icon + CI build | double-click launch |
| — | Visual route/profile editor (separate window) | ✅ | pure edit ops | window opens, edit → save → overlay reloads |
| — | In-app auto-update (electron-updater) | ✅ | build only | update prompt + one-click Restart on the installed build |
| — | Gems tab polish: prices, "pick one", starting gems, cost/act order | ✅ | ✅ engine | hints read right; never buy what you own/start with |
| — | Gems: stage paging (◀/▶), level-gated "coming up", ×2 copies, mule hints | ✅ | ✅ engine | paging pins/resumes; dimmed gems read right; ×2 and mule tags correct |
| — | Optional tabs (Settings → Overlay → Tabs to show) | ✅ | — | hiding a tab works; the last one can't be turned off |
| — | Gem sources: no vendor claimed for drop-only gems (Vaal/Awakened/Transfigured) | ✅ | ✅ | a drop-only gem reads "drop/trade", not "Siosa" |
| — | Non-English client detected and reported | ✅ | ✅ engine | only if you have a localized client to try |
| — | Opens on Gems; skeleton routes announce themselves | ✅ | ✅ | notice shows, editor button opens the editor |

¹ P0 is overlay/window behaviour that only exists on Windows; there's no headless test,
only the bundle build. Everything else marked ✅ has real unit/integration tests.

**Automated:** `npm test` (parser, tracker, watcher, guide, profile, PoB, trials, editor,
gem-cargo, overlay-mouse — 134 tests), `npm run typecheck`, `npm run build`; CI runs all of
these on every push/PR (`ci.yml`), plus `npm audit --omit=dev`.

## Manual test steps (Windows, with the game)

Get the app: **Actions → Build Windows → latest run → Artifacts → `windows-build`**,
unzip, run the setup or portable exe (SmartScreen → *More info → Run anyway*).
Or from source: `npm ci && npm run make-icon && npm run dev`.

Then, in Path of Exile (**Windowed Fullscreen**, **English client** — see below):

0. **First run:** the overlay opens on the **Gems** tab. The Guide tab shows a
   "runs on the placeholder route" notice with a button into the editor — that's
   expected until you write your own route; the notice disappears per act as you
   remove `"skeleton": true` from that act's file. **Check the gem pips have
   colours** (red/green/blue, not all `?`): gem data ships as a resource rather
   than inside the bundle, so a packaging mistake would show up here and nowhere
   in CI — and it would say so in a red box at the top of the tab.
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
   Game log only if you play in a party.) **Client language:** only English patterns
   ship. On another language the zone lines still parse (that log line is
   locale-independent) but levels never arrive, so the strip turns amber and says
   *"Log is not in English"* instead of leaving you guessing.
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
   **"Trial of Ascendancy in this zone"** hint (on every tab). **Completing** the
   trial **auto-checks** it — Izaro voices a plaque line only on completion, and the
   zone you're in identifies the trial. The tab lists all **twelve** campaign trials
   grouped by Labyrinth (Normal 6 / Cruel 3 / Merciless 3). Confirm it ticks the
   **right** trial at the moment you finish — especially in **Act 7's Chamber of Sins
   Level 2**, which must tick the *Cruel* entry, not the Act 2 one. **Cruel/Merciless
   zone names are provisional**: if a trial doesn't auto-check, note the zone name
   from the 🐞 panel and correct `CAMPAIGN_TRIALS` (`electron/trials/engine.ts`); the
   hint's *Done ✓* and clicking a trial remain manual fallbacks.
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

- **Gem source data: FILLED** (2026-07-19, **820 gems** with attributes, level
  requirements and per-class quest/vendor sources from poewiki). Refresh after a
  game patch with one click:
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
- **No vendor is invented for drop-only gems** (2026-07-28): the wiki lists Siosa's
  and Lilly's stock per gem, so a gem with no source genuinely isn't sold — Vaal,
  Awakened and Transfigured gems, and drop-only supports like Empower. Those read
  "drop/trade" instead of a made-up "Siosa · Act 3". The broad-vendor guess only
  returns for a `gems.json` written before the wiki fetch. If a gem you *can* buy
  shows as drop/trade, re-run **Actions → Fetch gem data** first, then report it.
- **English client only:** two of the three tracked log lines are localized by the
  game and only `data/log-patterns/en.json` ships. Another language is detected
  and reported in the tracker strip rather than silently half-working; adding a
  language is a data change (drop a file next to `en.json`, register it in
  `electron/log/service.ts`).
- **Starting gems (all 7 classes confirmed):** `data/starting-gems.json` lists the skill
  + support gem each class begins with (owner-confirmed, validated against the gem list),
  so the overlay marks them "✓ start" and never tells you to buy/quest them. Edit + rebuild
  if a patch changes them.
- **Trial auto-complete: WIRED** (2026-07-21), now covering **all twelve** campaign
  trials (Normal / Cruel / Merciless). Izaro voices a plaque line in `Client.txt`
  (`] Izaro: …`, verified from real captures) only as a trial is completed; the
  **zone** decides which trial (six lines cover twelve trials, so the line alone
  can't) and the **act** breaks ties where a zone hosts a trial in two difficulties
  (e.g. The Chamber of Sins Level 2 in Acts 2 and 7). With an unknown zone it falls
  back to the six verified normal-lab line fragments. **Cruel/Merciless zone names
  are provisional** — verify in game and correct `CAMPAIGN_TRIALS`
  (`electron/trials/engine.ts`); the manual toggle covers any miss.
- **Code signing:** the release is unsigned (SmartScreen warning) — a paid cert is the
  fix; backlog.

## Releasing (long-term)

Full workflow (testing safely, cutting a release from the GitHub UI, versioning, and
the naming/rename gotchas): **[`../CONTRIBUTING.md`](../CONTRIBUTING.md)**. In short:

- **Dev build:** Actions → *Build Windows* → *Run workflow*. Artifact only, version stays
  `0.0.0`, no release.
- **Real release:** push a tag `vX.Y.Z` (e.g. `v0.1.0`). The workflow builds with that
  version and publishes a GitHub Release with both exes plus `latest.yml` + `.blockmap`
  (the files the in-app updater reads) attached. `package.json` is never bumped for dev —
  the tag is the source of truth for release versions. Each tagged release is what
  installed builds auto-update to.
