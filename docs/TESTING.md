# Testing

What the automated suite covers, what only a real Windows machine with the game
running can confirm, and which parts are known to be provisional.

## Automated

```bash
npm test        # 170 tests: parser, tracker, watcher, guide, profile,
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
   All take effect immediately. The sections run in the order the work does:
   Updates, the editor button, Build profile, Game log, Overlay, Hotkeys. The
   three tabs split the window into equal thirds at any size — drag the resize
   grip and they should stay even, with no dead space after "Trials".
4. **Tracking.** The tracker strip shows the current zone and level while
   playing. Restart the overlay mid-session — it resumes both. With no character
   pinned, rolling a fresh character (entering the Twilight Strand) switches
   tracking to it on its first level-up. Pin a name in Settings → Game log only
   when playing in a party — and while one is pinned, `⟳ character` must go
   **amber** and name the pin rather than ticking, because tracking does not
   move. A zone whose monster level is far from yours adds a tag — `zone 32 ▲`
   in red when it outpaces your safe range, `▼` when you have outgrown it. It
   must **not** appear in towns.
   Swap characters and check both per-character stores follow **on the level-up**,
   not a zone later: the Guide's ticks and the Trials list must both be the new
   character's. Then save a route in the editor and confirm the first
   character's progress is still intact — that pairing used to file one
   character's steps under the other's name.
5. **Guide.** Advances as zones are entered; a portal to town and back must not
   skip steps; `Ctrl+Shift+N/P` correct the cursor; it crosses act boundaries.
6. **Gems.** Point Settings → Build profile at a profile, or paste a PoB code or
   link into the importer. Play a second character and point the tab at its own
   profile: switching back to the first should restore the first profile without
   a trip to Settings. The tab shows the current stage's links with colours
   and flips stages on level-up, the moment the level enters the next range.
   Close and reopen mid-session: it must show the correct stage immediately, not
   stage 1 until the next level-up.

   The tab reads in three columns — cost, gem, source — and they are one set of
   columns for the whole tab, so check them against each other rather than each
   on its own:
   - Prices end on one line, gem names start on one line, and the `A3 ·`
     prefixes start on one line — across plain rows, the `PICK ONE, BUY REST`
     box **and** the link boxes below.
   - `2× Wisdom` is the widest price and must fit its column without wrapping.
   - A long gem name (`Melee Physical Damage Support`) and a long quest name
     (`The Siren's Cadence`) truncate with `…` and keep their row one line high;
     hovering shows the full text.
   - A mulable gem reads `Mule` in turquoise with the class to roll on the
     right, in both the list and the links, and sits at the **top** of the list.
   - A quest reward reads `Reward`, and one your build needs twice `Reward +1`.
   - On a **fresh character in Act 1** the list holds Act 1 only. Act 2's quest
     choices must appear when you reach Act 2 and not before — and portalling
     back to Act 1's town must not make them disappear again. Rolling a new
     character with a name you used last league starts the count over rather
     than inheriting that character's act.
   - Buys are headed by their stop (`A1 · NESSA`). The same vendor heading twice
     is correct — their stock grows per quest, so that's two visits.
   - A `PICK ONE, BUY REST` box names where to buy the ones you don't take —
     e.g. Act 2's *Intruders in Black* (Herald of Ice / Herald of Thunder /
     Cold Snap) should point at **A2 · Yeena**, who stocks all three.
   - **Siosa is the one to watch.** Entering Act 3 must *not* bring his stock in;
     walking into **The Library** must. He is the earliest source for around 195
     gems, so the difference is a screenful. On a non-English client the zone
     name won't match and his gems stay hidden for that character — the same
     limitation as the trial zones.
   - Ascend a character: the "wrong profile loaded?" banner must **not** appear
     for an Elementalist on a Witch build. It should still appear for a genuinely
     different base class.
7. **Trials.** Entering a trial zone shows an amber "Trial of Ascendancy in this
   zone" hint on every tab. Finishing the trial auto-checks it — Izaro voices a
   plaque line only on completion, and the zone identifies which trial it was.
   Confirm the **right** one is ticked, especially in **Act 7's Chamber of Sins
   Level 2**, which must tick the *Cruel* entry rather than the Act 2 one.
   When the last trial of a Labyrinth is checked, the same bar switches to
   "**Normal Labyrinth unlocked**". Dismiss it with ✕ and it must stay gone —
   including after a restart — while a later Labyrinth still announces itself.
8. **Editor.** Tray → *Edit routes & profile…* opens a normal window. Add or edit
   a step, save, and the Guide tab reflects it without a restart. Same for the
   profile and the Gems tab. **Ascendancy** is a dropdown that offers only the
   chosen class's three — switch the class and a pick that no longer fits must
   clear itself rather than leave a Witch Slayer. **Share routes…** exports all
   ten acts into the box (and onto the clipboard); pasting one back and pressing
   Import should write the acts in the file, reload the overlay, and leave your
   other acts alone.
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

`fetchedAt` in `data/gems.json` says when the data was last pulled; it ages with
every league.

The fetch prints how many campaign-level gems came back with **no source at
all**, before and after. That number is the canary for a wiki schema drift: the
query returns HTTP 200 with rows that no longer carry the columns we read, the
merge quietly leaves gems sourceless, and nothing else would say so. It is **61**
today, 48 of them Vaal gems, which are corruption-only and belong there. Expect
it to move by a handful between leagues — a jump of hundreds means the query
broke, and anything that *lost* a source in a run is named outright. Don't
commit a refresh that reports one without checking why.

`data/starting-gems.json` (the skill and support gem each class begins with) is
maintained by hand and not touched by the refresh; the overlay marks those "✓
start" and never suggests buying them.

## Releasing

See [`../CONTRIBUTING.md`](../CONTRIBUTING.md) for the full workflow. In short: a
manual *Build Windows* run produces an artifact only, and a `v*` tag builds with
that version and publishes a Release with both exes plus `latest.yml` and the
blockmaps that the in-app updater reads.
