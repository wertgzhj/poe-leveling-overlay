# Testing

What the automated suite covers, what only a real Windows machine with the game
running can confirm, and which parts are known to be provisional.

## Automated

```bash
npm test        # 227 tests: parser, tracker, watcher, guide, profile,
                # PoB import, trials, editor ops, gem data, mouse passthrough,
                # search regex, profile library, update errors
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
   Updates, the editor button, Build profile, Game log, Overlay, Search regex,
   Hotkeys. The three tabs split the window into equal thirds at any size — drag
   the resize grip and they should stay even, with no dead space after "Trials".

   **Search regex.** With the field empty there is **no** Regex button in the
   header. Paste a string (a trailing line break from a web page must vanish on
   save), and the button appears beside ⚙. In interactive mode, click it: it
   reads `✓ copied` for a moment *without* nudging ⚙ sideways, and Ctrl+V in a
   stash or vendor search box pastes exactly the string. The counter turns amber
   past **250** characters — the game's search box limit, confirmed in game. (The
   community regex tools say 50; that is wrong by a factor of five.)
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
6. **Gems.** Pick a profile under Settings → Build profile, or paste a PoB code or
   link into the importer. Play a second character and give it a profile of its
   own: switching back to the first should restore the first profile without a
   trip to Settings. The tab shows the current stage's links with colours
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
   - **One mule per character, your choice.** A *Mule* dropdown sits under the
     class/level line — above the stage arrows, so paging stages never moves
     it — whenever the build has a gem another class gets by clearing the
     Twilight Strand — its starting gems, Hillock's reward, or Nessa's first
     stock — that yours doesn't. On a fresh character it defaults to
     **Momentum** (else the gem the build needs first). The chosen gem reads
     `Mule` in turquoise with the class to roll, in the list **and** the links,
     at the top of the list — and never *also* as a quest pick: on a Marauder
     muling Momentum, Mercy Mission must hand over Chance to Bleed, with no
     "pick one". Pick Chance to Bleed instead and they swap. **No mule** turns
     it off for that character: Mercy Mission is a pick between both again, and
     no `Mule` appears anywhere. The choice is per character and survives a
     restart; another character keeps its own. The `Mule` row is on the
     **opening stages only** — every stage that starts at level 4 or below
     (split 1-2 / 3-4, both show it); a stage from level 5 on doesn't repeat
     it, even when the gem is first slotted there. The open dropdown is dark with readable text.
   - A quest reward reads `Reward`, and one your build needs twice `Reward +1`.
   - **The Caged Brute gives two rewards** — a support and a skill, each its own
     pick. A Marauder build with Faster Attacks, Leap Slam and Intimidating Cry
     must show Faster Attacks as a plain `Reward` and a separate *pick one* box
     for Leap Slam / Intimidating Cry — never one box for all three. Same with
     a Path of Building import, which spells it `Faster Attacks` (no
     "Support"), and no later stage lists Faster Attacks as `(if not picked)`. Every other
     quest is one reward; a quest seen in game to give two goes in
     `TWO_REWARD_QUESTS` (`electron/profile/engine.ts`).
   - On a **fresh character in Act 1** the list holds Act 1 only. Act 2's quest
     choices must appear when you reach Act 2 and not before — and portalling
     back to Act 1's town must not make them disappear again. Rolling a new
     character with a name you used last league starts the count over rather
     than inheriting that character's act. Entering any **Act 2** zone (e.g.
     The Crypt) must bring in Act 2's rewards and Yeena's stock (Herald of Ash,
     Blood Rage) — the act is the *second* number of the area id (`1_2_…`), and
     reading the first made every zone of Acts 1-5 count as Act 1.
   - **The links at the bottom read against your act.** In Act 2: Act 2 gems
     (Herald of Ash, Cruelty) have a **gold** name; an Act 1 gem this stage
     uses for the first time (a link switch, e.g. Cleave) carries a small
     `NEW` pill; Act 1 gems you already used are plain; an Act 3 gem (Cyclone)
     is dimmed, tooltip "Not yet — from Act 3". Starting gems and the mule
     stay plain. Portalling back to Act 1's town changes nothing — it's the
     furthest act reached.
   - Buys are headed by their stop (`A1 · NESSA`). The same vendor heading twice
     is correct — their stock grows per quest, so that's two visits.
   - A `PICK ONE, BUY REST` box names where to buy the ones you don't take —
     e.g. Act 2's *Intruders in Black* (Herald of Ice / Herald of Thunder /
     Cold Snap) should point at **A2 · Yeena**, who stocks all three.
   - And once that stage rolls over, those gems must **still be on the list**,
     now as **one** buy row for the pick: the gems stacked, `↳ whichever you
     didn't pick` (or `the 2 you didn't pick`) under them. The quest gave you
     one of them; the overlay can't see which, so it can't quietly assume
     they're all handled. That row is on the **next stage only** — the stage
     after that doesn't repeat it.
     A gem from a quest that offered only *one* of your gems must NOT come back
     that way — you took it, it's done.
   - `A3 · Library` is violet and `A3 · Gravicius` rose, in the shopping rows,
     the stop headings **and** the link rows below — a rename that only colours
     in one of the three is the failure mode here.
   - **Siosa is the one to watch.** Entering Act 3 must *not* bring his stock in;
     walking into **The Library** must. He is the earliest source for around 195
     gems, so the difference is a screenful. On a non-English client the zone
     name won't match and his gems stay hidden for that character — the same
     limitation as the trial zones.
   - Ascend a character: the "wrong profile loaded?" banner must **not** appear
     for an Elementalist on a Witch build. It should still appear for a genuinely
     different base class.
   - **Mule a gem the tab tells you to** (e.g. Momentum from a Ranger on a
     Marauder build): while you're on the mule, the amber banner is replaced by a
     turquoise "Muling on a Ranger?" note. Then go back to your main: the moment
     it **levels up**, the strip, the stage and the Gems tab must be your main's
     again — not the mule's level 2. That used to stick until a restart. A
     partymate's level-up must still never move tracking.
7. **Build decisions.** With `meta.bandit` set, reaching **Act 2** shows a violet
   bar naming your choice; with `meta.pantheon` set, **Act 5** does the same. The
   bar outranks the Labyrinth and trial notices — those come round again, the
   bandits do not. ✕ dismisses it for that character, including after a restart.
   A profile that names neither must show nothing at all. Importing a PoB build
   should fill the bandit in by itself (PoB's `None` means "kill all three").
8. **Trials.** Entering a trial zone shows an amber "Trial of Ascendancy in this
   zone" hint on every tab. Finishing the trial auto-checks it — Izaro voices a
   plaque line only on completion, and the zone identifies which trial it was.
   Confirm the **right** one is ticked, especially in **Act 7's Chamber of Sins
   Level 2**, which must tick the *Cruel* entry rather than the Act 2 one.
   When the last trial of a Labyrinth is checked, the same bar switches to
   "**Normal Labyrinth unlocked**". Dismiss it with ✕ and it must stay gone —
   including after a restart — while a later Labyrinth still announces itself.
9. **Editor.** Tray → *Edit routes & profile…* opens a normal window. Add or edit
   a step, save, and the Guide tab reflects it without a restart. Same for the
   profile and the Gems tab.

   **Profiles.** Settings → Build profile → *Manage…* must open the editor **on
   the Profiles tab** — and bring it forward on that tab if it's already open.
   The things that used to go wrong, each worth one check:
   - **Import two different PoB builds.** Both must be in the list afterwards. The
     first import used to be overwritten by the second, and with it the build of
     every character that used it.
   - **Edit a profile that isn't the active one**, save, then open it again: the
     change is in *that* profile, the active one is untouched, and the overlay
     didn't switch. Saves used to land in one shared file whatever you opened.
   - **Save the bundled example** in the editor: it becomes a new profile of
     yours and becomes active; the example itself stays as it was.
   - **Delete** asks once inline (no dialog), the file is in the **recycle bin**,
     and deleting the active profile switches the overlay to the example rather
     than to nothing.
   - **New profile** for a Marauder starts with Heavy Strike + Ruthless; a
     duplicate is named "(copy)" and is bound to **no** character.
   - **Upgrading from v0.15.0** with a profile picked via the old *Browse…* from
     some other folder: after the update it is in the list as a copy, still
     active, and still remembered by its character. The original file is untouched. **Ascendancy** is a dropdown that offers only the
   chosen class's three — switch the class and a pick that no longer fits must
   clear itself rather than leave a Witch Slayer. **Bandits** and the two
   **Pantheon** fields are dropdowns too; leaving them at "— none —" must write
   no key at all rather than an empty object. **Share routes…** exports all
   ten acts into the box (and onto the clipboard); pasting one back and pressing
   Import should write the acts in the file, reload the overlay, and leave your
   other acts alone.
10. **Auto-update** (installed build only). Needs a published Release newer than
   the installed version. Launch an older build: within ~10s Settings → Updates
   shows it downloading, then the overlay offers *Restart & update*; one click
   reinstalls silently and reopens on the new version. The bottom-right version
   badge tracks the same flow and is clickable once ready. Dev and unpackaged
   runs report updates as *disabled*; an unreachable feed reports *Couldn't
   check* and never nags.

   Check for updates in the few minutes **after publishing a release, before
   its build finishes**: Settings must say *vX is still being published* in
   ordinary text — not red, no `!` on the version badge. And whatever goes
   wrong, the line is one short sentence: no HTTP headers, no stack trace, no
   `C:\Users\…` path. Those all used to be shown in full.

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
- **Vendor gem prices come from a level table.** The tier shown per gem is
  derived from its level requirement (`COST_TIERS`, `electron/profile/gems.ts`):
  Wisdom 1-7, Transmutation 8-15, Alteration 16-27, Chance 28-37, Alchemy 38+.
  Every tier was checked against a vendor in game; if GGG reprices gems, that
  table is the one place to change.
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
