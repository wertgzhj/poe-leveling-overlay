# Testing

What the automated suite covers, what only a real Windows machine with the game
running can confirm, and which parts are known to be provisional.

## Automated

```bash
npm test        # 134 tests: parser, tracker, watcher, guide, profile,
                # PoB import, trials, editor ops, gem data, mouse passthrough
npm run typecheck
npm run build
```

CI runs all three on every push and pull request, plus `npm audit --omit=dev`.

The logic lives in pure modules with no Electron imports, which is what makes
that suite meaningful — the log parser, the tracker state machine, the guide and
profile engines, the trials engine and the PoB decoder are all tested directly,
several of them against sanitized captures of a real `Client.txt`.

What automation **cannot** reach: window behaviour. Transparency, always-on-top
over a fullscreen game, click-through, global hotkeys, DPI scaling and
multi-monitor placement exist only on Windows with a display, and are covered by
the manual pass below rather than by tests.

## Manual pass (Windows, with the game running)

Get a build from **Actions → Build Windows → latest run → Artifacts →
`windows-build`**, unzip, and run the installer or the portable exe (SmartScreen
→ *More info → Run anyway*). From source: `npm ci && npm run make-icon &&
npm run dev`.

Run Path of Exile in **Windowed Fullscreen** with an **English client**.

1. **First run.** The overlay opens on the **Gems** tab. The Guide tab shows a
   "runs on the placeholder route" notice with a button into the editor — that is
   expected until a route is written, and it disappears per act as `"skeleton":
   true` is removed from that act's file. Check the gem pips have **colours**
   rather than all reading `?`: gem data ships as a resource instead of inside
   the bundle, so a packaging mistake surfaces here and nowhere in CI. It would
   also say so in a red box at the top of the tab.
2. **Overlay.** Stays on top of the game; `Ctrl+Shift+O/C/M` toggle visibility,
   click-through and move mode; drag to reposition in move mode. Check non-100%
   DPI and a second monitor. In interactive mode, clicks on the transparent area
   around the panel must reach the game — only the visible panel captures the
   mouse.
3. **Settings.** ⚙ → set the `Client.txt` path, rebind a hotkey, adjust opacity.
   All take effect immediately.
4. **Tracking.** The tracker strip shows the current zone and level while
   playing. Restart the overlay mid-session — it resumes both. With no character
   pinned, rolling a fresh character (entering the Twilight Strand) switches
   tracking to it on its first level-up. Pin a name in Settings → Game log only
   when playing in a party.
5. **Guide.** Advances as zones are entered; a portal to town and back must not
   skip steps; `Ctrl+Shift+N/P` correct the cursor; it crosses act boundaries.
6. **Gems.** Point Settings → Build profile at a profile, or paste a PoB code or
   link into the importer. The tab shows the current stage's links with colours
   and flips stages on level-up, the moment the level enters the next range.
   Close and reopen mid-session: it must show the correct stage immediately, not
   stage 1 until the next level-up.
7. **Trials.** Entering a trial zone shows an amber "Trial of Ascendancy in this
   zone" hint on every tab. Finishing the trial auto-checks it — Izaro voices a
   plaque line only on completion, and the zone identifies which trial it was.
   Confirm the **right** one is ticked, especially in **Act 7's Chamber of Sins
   Level 2**, which must tick the *Cruel* entry rather than the Act 2 one.
8. **Editor.** Tray → *Edit routes & profile…* opens a normal window. Add or edit
   a step, save, and the Guide tab reflects it without a restart. Same for the
   profile and the Gems tab.
9. **Auto-update** (installed build only). Needs a published Release newer than
   the installed version. Launch an older build: within ~10s Settings → Updates
   shows it downloading, then the overlay offers *Restart & update*; one click
   reinstalls silently and reopens on the new version. The bottom-right version
   badge tracks the same flow and is clickable once ready. Dev and unpackaged
   runs report updates as *disabled*; an unreachable feed reports *Couldn't
   check* and never nags.

## Known limitations

- **English clients only.** Two of the three tracked log lines are localized by
  the game, and only `data/log-patterns/en.json` ships. Another language is
  detected and reported in the tracker strip rather than silently half-working.
  Adding one is a data change: drop a file next to `en.json` and register it in
  `electron/log/service.ts`.
- **Cruel and Merciless trial zone names are provisional.** They are not
  confirmed against a live game. If a trial doesn't auto-check, the zone name
  from the 🐞 dev panel identifies it, and `CAMPAIGN_TRIALS`
  (`electron/trials/engine.ts`) is where it's corrected. Clicking a trial and the
  hint's *Done ✓* are the manual fallbacks.
- **Vendor gem prices are approximate.** The tier shown per gem (Wisdom /
  Transmutation / Alteration / Chance / Alchemy) is derived from its level
  requirement; the boundaries live in `COST_TIERS`
  (`electron/profile/gems.ts`) and have not been verified exhaustively in game.
- **Routes ship as placeholders.** Acts 1–10 contain thin skeletons meant to be
  replaced — in `data/campaign/actN.json`, as per-act overrides in the userData
  `routes/` folder, or in the visual editor.
- **The Windows build is unsigned**, so SmartScreen warns on first run. Code
  signing needs a paid certificate.

## Gem data

Attributes, level requirements and per-class quest/vendor sources come from the
Path of Exile Wiki. Refresh after a patch with **Actions → Fetch gem data → Run
workflow**, which pulls the wiki's Cargo export, runs the test suite as a guard,
and commits the result. Locally: `npm run fetch-gems` (`-- --dry-run` to
preview).

A gem with no source is one no vendor sells — Vaal, Awakened and Transfigured
gems, and drop-only supports like Empower — and reads "drop/trade" rather than
naming a vendor. If a gem you *can* buy shows that way, refresh the data first.

`data/starting-gems.json` (the skill and support gem each class begins with) is
maintained by hand and not touched by the refresh; the overlay marks those "✓
start" and never suggests buying them.

## Releasing

See [`../CONTRIBUTING.md`](../CONTRIBUTING.md) for the full workflow. In short: a
manual *Build Windows* run produces an artifact only, and a `v*` tag builds with
that version and publishes a Release with both exes plus `latest.yml` and the
blockmaps that the in-app updater reads.
