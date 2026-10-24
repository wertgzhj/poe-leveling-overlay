# Testing

What the automated suite covers, what only a real Windows machine with the game
running can confirm, and which parts are known to be provisional.

## Automated

```bash
npm test        # 316 tests: parser, tracker, watcher, guide, profile,
                # PoB import, trials, editor ops, gem data, mouse passthrough,
                # search regex, profile library, update errors, area table,
                # finding Client.txt, window and import hardening,
                # the shopping list's act scenarios, gem short names, Pantheon gods,
                # the run timer
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
   **First launch:** with no path stored (delete `clientTxtPath` from the settings
   file, or clear the field and restart), the overlay must find `Client.txt` by
   itself and start tracking — Steam, a Steam library on another drive, standalone
   or Epic. **Find** does the same on demand and says *Found* or *Not found*; on a
   machine with both a Steam and a standalone install it must pick the one you
   played last.
   All take effect immediately. The sections run in the order the work does:
   Updates, the editor button, Build profile, Game log, Overlay, Search regex, Gems tab,
   Hotkeys. The three tabs split the window into equal thirds at any size — drag
   the resize grip and they should stay even, with no dead space after "Guide".

   **Search regex.** With the field empty there is **no** Regex button in the
   header. Paste a string (a trailing line break from a web page must vanish on
   save), and the button appears beside ⚙. In interactive mode, click it: it
   reads `✓ copied` for a moment *without* nudging ⚙ sideways, and Ctrl+V in a
   stash or vendor search box pastes exactly the string. The counter turns orange
   and gains a ⚠ past **250** characters — the game's search box limit, confirmed in game. (The
   community regex tools say 50; that is wrong by a factor of five.)
4. **Tracking.** The tracker strip shows the current zone and level while
   playing. Restart the overlay mid-session — it resumes both. With no character
   pinned, rolling a fresh character (entering the Twilight Strand) switches
   tracking to it on its first level-up. Pin a name in Settings → Game log only
   when playing in a party — and while one is pinned, `⟳ character` must go
   **orange** and name the pin rather than ticking, because tracking does not
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
   - **One mule per character, your choice — in Settings → Build profile →
     Mule**, whenever the build has a gem another class gets by clearing the
     Twilight Strand — its starting gems, Hillock's reward, or Nessa's first
     stock — that yours doesn't. On a fresh character it defaults to
     **Momentum** (else the gem the build needs first). The Gems tab has **no**
     mule row and no dropdown; the chosen gem's line in the links reads
     `Mule · Ranger` — and it's never *also* a quest pick: on a Marauder
     muling Momentum, Mercy Mission must hand over Chance to Bleed, with no
     "pick one". Pick Chance to Bleed instead and they swap. **No mule** turns
     it off for that character: Mercy Mission is a pick between both again, and
     no `Mule` appears anywhere. The choice is per character and survives a
     restart; another character keeps its own. Before the log names a
     character, Settings says so instead of a dropdown. The open dropdown is
     dark with readable text.
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
     character with a name you used last league starts **the whole run** over
     on its first level-up (to 2): the act, the Trials tab, the
     guide's ticks and dismissed bandit/pantheon reminders — none inherited
     from last league's namesake. Steps ticked on the Strand before that
     level-up stay. The profile the name uses and its mule choice stay too.
     Try it both with the overlay running when you roll the character **and**
     started only after you entered the Strand: either way the new character
     is the one tracked, not last week's. Entering any **Act 2** zone (e.g.
     The Crypt) must bring in Act 2's rewards and Yeena's stock (Herald of Ash,
     Blood Rage) — the act is the *second* number of the area id (`1_2_…`), and
     reading the first made every zone of Acts 1-5 count as Act 1.
   - **The list holds the acts a stage stands for** (the scenarios agreed with
     the owner, `tests/plan-window.test.ts`):
     1. New character in Lioneye's Watch: Act 1's gems for now **and** Act 1's
        picks for later (Caged Brute box, Sunder) — no box from Act 2 on.
     2. First time in the Forest Encampment: Act 2's picks come in; an Act 1
        pick that's only for a later stage is **gone** from the list (it stays
        grey in the links).
     3. Level 38 in Act 4, ◀ back to the opening stage: Act 1 only.
     4. In Act 1, ▶ forward to an Act 2–3 stage: a preview of its Act 2 and 3
        gems.
     5. A gem the live stage wants from an act you haven't reached: not on the
        list, grey in the links, listed the moment you enter that act.
     6. Portal back to an earlier town: nothing changes.
     7. Siosa: from **Act 3** on, like Clarissa — the heading says
        `A3 · Library`, in violet.
     8. Before any zone is known, the live stage uses its own acts.
   - **The links at the bottom read against your act.** In Act 2: the lines
     of Act 2 gems (Herald of Ash, Cruelty) are **tinted gold with a gold bar
     on the left** — the whole line, the name stays white and the source keeps
     its colour. A mule gem's line is **turquoise** and a starting gem's
     **green** only on a stage where it's `NEW` — never on the first stage:
     Momentum and Ruthless on the opening stage are plain lines that say
     `Mule · Ranger` and `✓ start`; earlier-act gems are plain; an Act 3 gem
     (Cyclone) is grey (still readable), tooltip "Not yet — from Act 3".
     Portalling back to Act 1's town changes nothing — it's the furthest act
     reached.
   - **`NEW` marks what changed since the previous stage** — every gem that
     wasn't in the previous stage's links, whatever its act or line colour
     (Herald of Ash in After Fidelitas: gold line *and* `NEW`). On every stage,
     also one you page to with ◀/▶; never on the first stage. A gem that only
     moves to another link is not `NEW`. By **copy**: a stage that slots
     Autoexertion twice after one that slotted it once shows `NEW` on the
     second link's copy only, and the list asks for **one** more (`Alt`, not
     `2× Alt`).
   - **`RELINKED`** sits on a link's top edge when the link was rearranged
     since the previous stage: a gem moved in from another link, or one left
     it (e.g. Sunder replacing Ground Slam). A link that only gained new gems,
     or a wholly new link, has none — `NEW` already says it. Never on the
     first stage.
   - The ▶ of the stage switch says where the next stage starts (`lvl 56 ▶`),
     its tooltip names it; on the last stage it's greyed out with no level.
     Nothing follows the last link group but the version. No line repeats
     class, ascendancy or level under the tracker line; a paged stage says
     `Earlier stage ▸ back to yours`. A gem slotted once on this stage reads
     `Alt`, not `2× Alt`, even if a later stage slots it twice.
   - **Settings → Gems tab → Short names:** type a gem (suggestions come from
     the gem data; `Cast when Damage Taken` finds the support), a short name
     (`CwDT`, up to 24 characters), Add. The Gems tab — list, pick boxes and
     links — shows `CwDT`, hovering shows the full name. A name that isn't a
     gem says so and can't be added; ✕ removes one. The editor and every
     profile file keep the real names; NEW, RELINKED and the list work exactly
     as before.
   - **Settings → Gems tab → "▸ What the colours mean"** unfolds a legend:
     every line colour, `NEW`, the source colours and the socket pips, each
     drawn the way the real rows draw it and said in words. It stays open when
     you close and reopen Settings; a screen reader announces it as expanded
     or collapsed.
   - The list is headed by act (`A1`, `A2`), rewards and buys alike, one
     heading per town even where the vendor's stock grows per quest; only the
     Library is named (`A3 · Library`, violet). An Act 2 reward sits under
     `A2`, never under the `A1` above it. The list's title is just
     *Get these gems* — framed in gold while the guide's step is a reward.
   - A `PICK ONE, BUY REST` box has no line under its gems when the quest's
     town sells the rest — e.g. Act 2's *Intruders in Black* (Yeena stocks all
     three); `↳ buy the rest in the Library` (violet) when only Siosa does,
     `↳ buy the rest in Act N` when it's a later town. Act 3's *Lost in Love*
     on a Marauder (Vulnerability / Infernal Cry) must have **no** line:
     Clarissa sells both right after it, half an act before the Library.
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
     in one of the three is the failure mode here. Siosa's quest, *A Fixture of
     Fate*, reads `A3 · Library` too.
   - Ascend a character: the "wrong profile loaded?" banner must **not** appear
     for an Elementalist on a Witch build. It should still appear for a genuinely
     different base class.
   - **Mule a gem the tab tells you to** (e.g. Momentum from a Ranger on a
     Marauder build): while you're on the mule, the orange ⚠ banner is replaced by a
     turquoise "Muling on a Ranger?" note. Then go back to your main: the moment
     it **levels up**, the strip, the stage and the Gems tab must be your main's
     again — not the mule's level 2. That used to stick until a restart. A
     partymate's level-up must still never move tracking.
7. **Build decisions.** With `meta.bandit` set, reaching **Act 2** shows a gold
   bar naming your choice; with `meta.pantheon` set, **Act 6** does the same
   (not Act 5: the Pantheon's gods are fought in Acts 6–10). The
   bar outranks the Labyrinth and trial notices — those come round again, the
   bandits do not. ✕ dismisses it for that character, including after a restart.
   A profile that names neither must show nothing at all. Importing a PoB build
   should fill the bandit in by itself (PoB's `None` means "kill all three").
   **Pantheon gods:** with e.g. Lunaris + Shakari in the profile, the Trials tab
   has a *Pantheon* section listing both, with act and place ("Act 9 · The Sand
   Pit, a side area of The Oasis"). Entering **The Oasis** (Act 9) shows a gold
   bar "Pantheon: Shakari — The Sand Pit" with *Done ✓*; a god in the zone itself
   reads "… is here". Done ✓ or a click in the list ticks it for that character
   (and unticks on a second click); a new character starts with none. Killing
   the god ticks it by itself — Sin's farewell line says it fell. Act 6's
   Prisoner's Gate and Wetlands show their gods, Act 1's never do. The bar ranks
   below a trial in the same zone.
8. **Trials.** Entering a trial zone shows an orange △ "Trial of Ascendancy in this
   zone" hint on every tab. Finishing the trial auto-checks it — Izaro voices a
   plaque line only on completion, and the zone identifies which trial it was.
   Confirm the **right** one is ticked, especially in **Act 7's Chamber of Sins
   Level 2**, which must tick the *Cruel* entry rather than the Act 2 one, and
   **Act 6's Lower Prison**, which must tick the Cruel entry, not Act 1's. An
   endgame trial in a map says the same lines and must tick nothing.
   When the last trial of a Labyrinth is checked, the same bar switches to
   "**Normal Labyrinth unlocked**". Dismiss it with ✕ and it must stay gone —
   including after a restart — while a later Labyrinth still announces itself.
   **Beat the Labyrinth:** the moment Izaro dies in the final arena, its heading
   on the Trials tab gets a grey "✓ done", the unlock bar goes away without a ✕,
   and any of its trials you hadn't ticked are ticked. Dying to him must change
   nothing, and neither must the Eternal Labyrinth.
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

11. **Colours and accessibility.** One colour, one meaning, across the
   overlay, Settings and the editor (`src/styles/tokens.css`):
   - **Gold** — now / you / active: the active tab, the current guide step, the
     trial you stand in ("you are here" is a gold row, like the guide step),
     the list framed while the guide's step is a reward, a *Pick one* box, the
     bandit/pantheon bar.
   - **Orange + ⚠ or △** — careful: the trial-zone bar, a wrong-class or
     not-English log, a regex past 250, a hotkey without a modifier. Never
     orange without its glyph.
   - **Green** — free or done right: `Reward` in the Gems tab *and* the Guide's
     `reward` tag, `✓ start`, saved/copied messages.
   - **Red** — broken. **Turquoise** — the mule, nowhere else. **Violet** — the
     Library, nowhere else. **Rose** — Gravicius.
   - Done is **grey**, not gold: a checked trial's ✓ and a done guide step.
   - Prices run grey → white (Wisdom → Alch), not gold.
   - **"Not now" is grey, never faded:** a done guide step or trial (✓, struck
     through), a `· lvl 32+` row or *Pick one* box, a not-yet link — all stay
     readable. Only disabled buttons fade.
   - The Guide's quest steps show a plain `!`, not a red ❗. Nothing at the
     bottom of a tab (the Guide's `reset`) sits under the version number.
   - **One tag, one heading, one button** (`src/lib/ui.ts`): `NEW`,
     `REWARD`, `YOU ARE HERE` and the `zone 32` tag share one look (10px,
     upper case, filled), only the colour differs. Section headings are all
     the same size and unfilled — *Get these gems* and *Pick one, buy rest*
     alike; buttons in the header, Settings and the
     editor differ only in size.
   - **Nothing below 10px** except the letter inside a socket dot (9px bold).
     The `B` in a blue dot is white, the `R` and `G` black — all readable.
   - **Opacity fades the background, not the text.** Drag Settings → Opacity
     down to 40 % in a dark zone: the panel goes see-through but the text
     stays crisp. Below 70 % Settings shows "⚠ Below 70 %, text can be hard to
     read in bright areas" — check that claim in a bright spot (snow, a white
     effect): readable at 70 % and up, getting hard below.
   - Tab through Settings and the editor with the keyboard: the focused control
     shows a thin gold outline. The update arrow on the version badge doesn't
     pulse when Windows has animations turned off.

12. **Run timer (experimental).** Settings → *Run timer* on: a second window
   opens in the top-right corner, and hides and shows with the overlay
   (`Ctrl+Shift+O`). In move mode (`Ctrl+Shift+M`) it drags and resizes on
   its own, and comes back where you left it after a restart. Roll a
   character: the clock starts on the Twilight Strand, the current zone below
   it counts up, *Where the time went* splits zones, towns, hideout, Labyrinth
   and loading screens; deaths, claimed skill points, Labyrinths and Pantheon
   gods count up below. Close the game, or log out to character select, for a
   few minutes: that time is not in the run. Log in on another character and
   run a map: the window says *other character* and the clock waits until the
   run's character is back out in a zone. Roll a mule mid-run: the *mule or a
   new run?* note appears, and goes once you are back on your main — with no
   second run in *Runs*. Finish a run: the clock stops as Kitava falls in
   Act 10, and the run shows under *Runs* as *Best*; the next run's act splits
   compare against it. Type `/played` at the end: the run time should be a few
   minutes above it, never below. Settings → *Run timer* off: the window
   closes and nothing more is recorded.

## What the code takes as given

Every value below looks like a fact in the code. This is where each one stands,
so a wrong one can be found before it ships — the vendor prices were exactly
that once: a table everyone believed, wrong in two tiers.

- **✓ game** — checked in the game client.
- **✓ log** — checked against a real `Client.txt` (Acts 1–10, all three labs,
  ~55 new characters, captured 2026-10-22; never committed).
- **✓ data** — checked against the wiki gem data.
- **○** — not confirmed yet. Believable, but nobody has looked.

| What | Where | Status |
|---|---|---|
| The four log line patterns | `data/log-patterns/en.json` | ✓ log |
| Every campaign area id and its name, Acts 1–10 | `data/areas/en.json` | ✓ log |
| The act is the *second* number of an area id | `actFromAreaId` | ✓ log |
| The twelve trial zones and Izaro's plaque lines; Cruel and Merciless repeat the Normal lines | `CAMPAIGN_TRIALS` | ✓ log |
| Izaro's six death lines in `<1\|2\|3>_Labyrinth_boss_2_end` mean the lab is beaten; dying to him says something else | `IZARO_DEFEATED` | ✓ log — every finished run |
| A new character's first level-up is to level 2, on the Strand | `FRESH_CHARACTER_MAX_LEVEL` | ✓ log — all 46 |
| A partymate's level-up can't take the new-character reset | tracker, `onFreshCharacter` | ○ — the Strand is solo, but a group can meet from Lioneye's Watch and the Coast on. It holds because you reach level 2 on the Strand, before anyone can join; a partymate levelling first, after you leave the Strand at level 1, would take it. Not seen in the capture (8 partymates, none before level 3) — which shows it's rare, not that it can't happen |
| A mule is deleted by level 3 | `MULE_MAX_LEVEL` | ✓ log — every mule stopped at level 2 |
| Within an act, the vendor whose quest comes first sells it first (Clarissa after *Lost in Love* before Siosa after *A Fixture of Fate*) | `GemData.questRank` | ✓ data — quest order reproduced for every act |
| Vendor price tiers: Wisdom 1-7, Transmutation 8-15, Alteration 16-27, Chance 28-37, Alchemy 38+ | `COST_TIERS` | ✓ game — every tier |
| The stash/vendor search box takes 250 characters | `SEARCH_BOX_LIMIT` | ✓ game |
| The Caged Brute gives two rewards (a skill and a support) | `TWO_REWARD_QUESTS` | ✓ game. Other quests: ○ — by the data, no other quest mixes skills and supports for every class |
| The starting skill and support per class | `data/starting-gems.json` | ✓ game (owner-confirmed) |
| Quest order within an act, derived from the levels its rewards need | `GemData` | ✓ data — reproduces the real order for every act |
| `Client.txt` in Steam's default folder | `locate.ts` | ✓ game. Other Steam libraries, standalone, Epic: ○ — from the launchers' documented layouts |
| The experience safe range is `3 + level/16`, applied in both directions | `safeLevelRange`, `zoneFit` | ✓ poewiki (*Experience*: SafeZone = ⌊3 + PlayerLevel/16⌋, EffectiveDifference = max(\|player − monster\| − SafeZone, 0)) |
| The bandits are due from Act 2; the Pantheon from Act 6, where its gods start | `BANDIT_ACT`, `PANTHEON_ACT` | Bandits ○. Pantheon ✓ poewiki (*The Pantheon*: "defeat certain gods in Acts 6 through 10") |
| Where each Pantheon god is fought | `PANTHEON_GODS` (`pantheon.ts`) | Zones: owner, from poewiki's god pages; their area ids ✓ log. The side areas (Sand Pit, Spawning Ground, Valley of the Fire Drinker, Den of Despair, Garukhan's) aren't zones in the log — ✓ log, two years with those zones visited and none ever loaded — so the hint shows in the parent zone and names them in words |
| The level you reach each act at: for PoB stages named "Act N", and for which acts a stage's shopping list covers | `ACT_START_LEVEL` (`acts.ts`) | ✓ log — the median level on first entering each act's town across ten full runs; Acts 7–10 were lowered to it (49/53/59/61, from 52/58/64/67) |
| Run timer: the number after the clock in every line is a millisecond tick, and the number in `[… Client N]` is the game's process id, new at every launch | `parseStamp`, `LogClock` | ✓ log — the tick moves with the clock, and every `LOG FILE OPENING` brings a new id |
| Run timer: Act 10's Kitava falls when Sin says "May a new dawn arise!" in The Feeding Trough (`2_10_6`); the merciless resistance penalty follows within seconds. Sin says the line again for every map Kitava, so only that zone counts | `KITAVA_ARENA_ID`, `KITAVA_FALLS` | ✓ log — all ten finished campaigns; 14 s apart, once 150 s |
| Run timer: every trip to the login server — logout, character select, a disconnect, the launch — logs `Async connecting to <region>.login.pathofexile.com` | `loginServer` pattern | ✓ log |
| Run timer: you log back in where you logged out, so the first area after a login says who logged in — a zone of an act the run has reached is its character, an act beyond it isn't, a town, hideout or league area doesn't say. A map is never a campaign character | `RunTimer.onGenerated`, `isForeignArea` | ✓ log — checked against `/played` typed throughout ten campaigns: the run time stays 1–4 % above it, every run, and a parked alt in the same town was the case that made towns not count as proof |
| Run timer: what's left above `/played` grows evenly, a minute or two an hour | — | ○ — loading screens, by the size of it; `/played` isn't documented |
| Run timer: "You have received a Passive Skill Point." is a Book of Skill being used — a quest's reward claimed, not the quest done | `passivePoint` pattern | ✓ log (owner: the quest gives the book, using it gives the point). A book used after Kitava isn't in the run |
| Run timer: the game's AFK toggle is logged, ON and OFF | `afk` pattern | ✓ log |
| Run timer: a mule never leaves the Strand and Lioneye's Watch, nor levels past 3 — so either says a new character is a real run, and the old character's level-up or an Act 2+ zone says it was a mule | `RunTimer.onGenerated`, `onLevelUp` | ✓ log — ten finished campaigns, none split or merged by a mule |
| Pantheon: when a god falls, Sin bids it farewell — one line per god, the same every time; Lunaris and Solaris share one | `PANTHEON_GODS[].farewell`, `godsFallen` | ✓ log — every god, two years. An optional god left alone has none |
| Below 70 % opacity, text over a bright scene gets hard to read | `OPACITY_READABLE` | ○ — contrast arithmetic only; wants a look over snow in game |

## Known limitations

- **English clients only.** Two of the three tracked log lines are localized by
  the game, and only `data/log-patterns/en.json` ships. Another language is
  detected and reported in the tracker strip rather than silently half-working.
  Adding one is a data change: drop a file next to `en.json` and register it in
  `electron/log/service.ts`.
- **Trial zones and Izaro's lines are matched by English name.** All twelve
  are confirmed against a real capture. If GGG renames one and a trial stops
  auto-checking, the zone name from the 🐞 dev panel identifies it, and
  `CAMPAIGN_TRIALS` (`electron/trials/engine.ts`) is where it's corrected.
  Clicking a trial and the hint's *Done ✓* are the manual fallbacks.
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
