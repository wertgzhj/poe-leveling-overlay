# PoE Leveling Overlay

A **ToS-compliant** desktop overlay that helps you level through the Path of Exile 1
campaign — route, quest rewards, vendor purchases and skill-tree stages, generated
semi-automatically from a Path of Building import.

<!-- SCREENSHOT: drop one in here — it's the first thing anyone decides on.
     Take it in Windowed Fullscreen with the Gems tab open mid-campaign, save it
     as docs/screenshot.png, and replace this comment with:
         ![The overlay on top of Act 1](docs/screenshot.png)
     A short GIF of the stage flipping on level-up works even better. -->

*Not affiliated with or endorsed by Grinding Gear Games.*

## What it does

- **Reads your game log, so it keeps up on its own.** Zone and level come from
  `Client.txt`; the guide advances as you enter zones and the Gems tab flips
  stages as you level. Close and reopen mid-session and it resumes where you are.
  It flags a zone that's well above or below your level, and switching characters
  brings back that character's build profile.
- **Tells you which gems to get, and where from.** Quest rewards and vendor buys
  in one chronological list, rewards first so you never pay for a gem a quest
  hands over. Socket colours are computed, prices shown, "pick one" quest choices
  flagged, and gems your class already starts with are never listed to buy.
- **Imports your Path of Building build** — paste an export code or a `pobb.in`
  link and it writes the stages for you.
- **Tracks all twelve Trials of Ascendancy**, auto-checking each one the moment
  you finish it, and telling you when a Labyrinth is ready to run.
- **Updates itself.** One click when a new version is ready.
- **A route guide you write yourself** — the app ships the engine and an in-app
  editor; the campaign route is yours (see [Author your route](#author-your-route)).

Only English game clients are supported today — see [Setup](#setup).

<details>
<summary>More</summary>

How it's built and why: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
What's verified and what still needs checking in game:
[`docs/TESTING.md`](docs/TESTING.md).
Third-party data attribution: [`NOTICE`](NOTICE).
Security and the app's network behaviour: [`SECURITY.md`](SECURITY.md).

Gem data — attributes, level requirements and per-class quest/vendor sources —
comes from the Path of Exile Wiki and is refreshed with one command
(`npm run fetch-gems`, or the *Fetch gem data* GitHub Action) after a patch.

The version in `package.json` stays `0.0.0`; a release takes its version from
the `v*` tag that builds it.

</details>

---

## What it is & ToS compliance

The overlay is a **separate window that sits on top of the game**. It only ever
**reads** the official `Client.txt` log file and **sends nothing** to the Path of
Exile process — no memory reading, no injection, no simulated input, no automation.
Hotkeys control the overlay only (the key combo is consumed system-wide and never
forwarded to the game). This mirrors long-tolerated tools like Awakened PoE Trade
and Exile Leveling. Full guardrails:
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#tos-position).

## Install (Windows)

Two double-clickable options, both produced by the **Build Windows** GitHub Action.
Run it manually (repo → Actions → *Build Windows* → *Run workflow*) for a **dev build**
— the exes land as a downloadable run **artifact** (version `0.0.0`, no release). To cut
a **real release**, push a `v*` tag (e.g. `v0.1.0`): the build takes its version from the
tag and attaches both exes to a **GitHub Release**.

- **Installer** — `PoE Leveling Overlay-<version>-setup.exe`: installs the app and adds
  Start Menu + Desktop shortcuts. Double-click the shortcut to launch.
- **Portable** — `PoE Leveling Overlay-<version>-portable.exe`: no install; double-click
  the exe directly.

The build is **unsigned**, so Windows SmartScreen warns on first run — choose
*More info → Run anyway*. (Code signing needs a paid certificate; it's a later item.)

To build it yourself on Windows: `npm ci && npm run make-icon && npm run package:win`
(output in `dist/`). See [Development](#development) for source setup.

## Updating

The **installed** build updates itself — no need to watch GitHub. On launch (and every
few hours) it checks this repo's GitHub Releases; a newer version downloads in the
background, then the overlay shows an **Update vX.Y.Z is ready — Restart & update**
prompt. One click swaps it in and reopens. You can also check on demand in
**Settings → Updates**. Nothing is installed without that click.

The running version is always visible bottom-right of the overlay (`vX.Y.Z`). While an
update downloads it shows live progress (`v0.1.0 · ⬇ 42%`), and once ready it becomes a
clickable **`v0.1.0 → v0.2.0 ⬆`** pill — clicking it updates and restarts immediately.
(If click-through is on, toggle interactive mode first — default `Ctrl+Shift+C`.)

Two things to know:

- **Releases must be publicly downloadable** for the updater to reach them. If this repo
  is private, either make it public, or point `publish.repo` in `electron-builder.yml` at
  a separate **public** releases repo. Without a reachable feed the app still runs — it
  just reports "Couldn't check" in Settings and never nags.
- Auto-update targets the **installer**; the **portable** exe doesn't self-update
  (download the new portable exe when you want to move up). Dev/unpackaged runs show
  updates as *disabled*.

## Setup

1. Set the path to your `Client.txt` (Settings → Game log). Defaults:
   - Steam: `…\steamapps\common\Path of Exile\logs\Client.txt`
   - Standalone: `…\Grinding Gear Games\Path of Exile\logs\Client.txt`
2. Run Path of Exile in **Windowed Fullscreen** — exclusive fullscreen covers overlays.
3. Run the game in **English**. Two of the three log lines the overlay reads are
   translated by the game, and only English patterns ship — on another language
   zones still track but your level never does (the overlay says so rather than
   quietly half-working). Adding a language is a data change, see below.
4. Optional: set your character name (Settings → Game log) if you play in a party,
   so a partymate's level-up can't advance your progress. Solo it auto-detects.

## Hotkeys

| Action | Default | Notes |
|---|---|---|
| Show / hide overlay | `Ctrl+Shift+O` | |
| Toggle click-through | `Ctrl+Shift+C` | Click-through lets clicks reach the game |
| Move / resize mode | `Ctrl+Shift+M` | Drag the title bar; drag the corner to resize |
| Guide: next step | `Ctrl+Shift+N` | Marks the current step done |
| Guide: previous step | `Ctrl+Shift+P` | Reopens the last completed step |

The overlay has **Guide**, **Gems** and **Trials** tabs. The Trials tab tracks all
**twelve** campaign Trials of Ascendancy — six for the **Normal** Labyrinth (Acts 1–3),
three for **Cruel** (Acts 6–7) and three for **Merciless** (Acts 8–10), grouped per
Labyrinth. It **auto-checks a trial when you finish it**: Izaro voices a plaque line
only on completion, and the zone you're standing in says which trial it was (the same
zone can host a trial in two difficulties, so the act decides). It also shows a hint
while you're in a trial's zone, tells you when a Labyrinth's trials are all
done, and you can click any trial to correct it.

Don't use one of the tabs? **Settings → Overlay → Tabs to show** hides any of them
(at least one stays on); with a single tab the switcher disappears entirely.

All hotkeys are rebindable in-app: open **Settings** (the ⚙ button in the overlay, or
the tray → *Settings…*), click a binding, and press the new combo — the change takes
effect immediately and is saved. Defaults are chosen to avoid PoE's own binds; a
combo that's already taken is flagged as a conflict. The tray also offers show/hide,
move mode, click-through, and **Quit**.

## Author your route

**Editor:** open **Edit routes & profile…** from the tray (or the button in overlay
Settings) for a visual editor — add/edit/reorder route steps per act and edit the
build profile's stages/links, with the same validation the app loads with; saves go to
your editable copies and the overlay hot-reloads. Or edit the JSON directly, as below.

**Swapping routes with someone:** *Share routes…* in the editor exports every act as
JSON you can paste anywhere, and imports the same back. Nothing is uploaded — it's
text you send yourself, and it stays readable so you can look before you run it. The
project never ships route content; this is how you get someone else's.

The route content is **yours to write** — the app ships an engine plus **fallback
skeletons for all ten acts** (`data/campaign/act1.json` … `act10.json`), which the
guide combines into one campaign that advances across act boundaries. Act 1 covers the
capture-verified zones; Acts 2–10 are rough placeholders (town + high-level notes) to
replace. Edit those files, or drop a per-act override into `<userData>/routes/actN.json`
for installed builds (override one act or all of them); the overlay **hot-reloads on
save** and shows validation problems in the panel.

- A step needs an `id` (stable — progress is saved against it), a `type`
  (`quest | waypoint | trial | town | boss | kill | enter | hint`), and a `text`.
- Steps match the zone you enter by `areaId` (preferred — run in dev and the 🐞 panel
  shows the id of every zone) or by `zone` display name until you've learned the id.
- The guide always advances to the **next open step** for the zone you entered. Town
  visits never skip pending steps, so portal trips to sell don't derail it. Hideouts
  and endgame maps are ignored entirely.
- `"rewardHint": true` marks quest-reward steps (used by the gem panel from P3 on).
- Fix mistakes with the next/previous hotkeys or by clicking a step (needs
  interactive mode, `Ctrl+Shift+C`).

## Create a build profile

The **Gems** tab shows the gems to have socketed at your current level, with socket
colours computed automatically (Str = red, Dex = green, Int = blue), plus what to buy
or take as a quest reward. It's driven by a profile JSON — like routes, you write it
yourself for now.

- Point **Settings → Build profile** at your file (or edit the bundled
  `data/profiles/example.json`); it **hot-reloads on save** with validation shown in
  the panel. Leave the setting empty to use the example.
- `meta` sets `name` + `class` (one of the seven classes). It can also record the
  two **one-shot decisions** the campaign asks for — `bandit` (`Alira` / `Kraityn` /
  `Oak` / `Kill all`) and `pantheon` (`major` / `minor`, e.g. `Soul of Lunaris`). Both
  are optional; when set, the overlay reminds you at the point you reach them (Act 2
  and Act 5) and you dismiss it with ✕. Which one is right depends entirely on the
  build and the bandits can't be changed afterwards, so the choice lives in your
  profile — the app has no opinion, and it deliberately quotes **no stats**, because
  those change between patches and a stale number is worse than none. A PoB import
  brings the bandit choice across on its own. `stages` list `range`
  (`[minLevel, maxLevel]`) and `socketGroups` (each a link of gem names) — the active
  stage switches automatically as you level. `gemPlan` records where each gem comes
  from (`questReward` / `vendor` / `drop`), which feeds the reward + buy hints.
- Socket colours come from `data/gems.json` (gem → attribute); a gem missing there
  shows a neutral pip with a `?`. It covers **828 gems** pulled from the wiki, so
  that's rare — a gem with no attribute at all (Portal, Quickstep) fits any socket.
  `fetchedAt` in that file says when the data was last pulled.

The tab reads in three columns — **cost, gem, source** — and every list shares them,
so the prices line up under each other and so do the acts:

```
  Mule   Ⓖ Momentum                       Ranger
Reward   Ⓑ Freezing Pulse                 A1 · Enemy at the Gate
Wisdom   Ⓡ Holy Flame Totem               A1 · Nessa
2× Alt   Ⓑ Summon Raging Spirit           A3 · Clarissa ≈
```

- The **cost column** says how you get a gem: `Reward` in green for a free quest
  pick, otherwise the vendor price tier (`Wisdom` / `Trans` / `Alt` / `Chance` /
  `Alch`, brighter gold the dearer it is). Prices are provisional — see
  [`docs/TESTING.md`](docs/TESTING.md#known-limitations).
- A gem needed in **two different links** shows its count there too: `2× Alt` means
  two purchases. A quest hands out exactly one reward, so a reward needed twice reads
  `Reward +1` — one free, the rest you buy or find.
- A gem another class **starts** with reads **`Mule`** in the cost column and the class
  to roll in the source column, both in turquoise — roll a level-1 character of that
  class, stash its two starting gems, delete it, and you have it for free instead of
  buying it (from `data/starting-gems.json`). Those come first in the list: it's the
  one thing you do before you start.
- A quest that offers several of your gems is one **pick**, so it gets its own box
  reading `PICK ONE, BUY REST` — with the price of the ones you don't take **and the
  vendor who has them all**. Those gems are quest rewards, so nothing else on the tab
  would ever have told you where to buy them.
- Gems you'll want later are dimmed and marked `— for later (lvl 32+)`, ordered by
  when you actually need them. A quest choice from an act you **haven't reached** is
  left out entirely rather than dimmed — at level 2 in Act 1, an Act 4 quest is not a
  preview. It appears when you get there. Before the overlay has seen a zone it shows
  everything, and entering the Twilight Strand starts the count over.
- Buys are headed by the **stop** you make them at — `A1 · Nessa`, `A3 · Siosa ·
  Library` — so what you pick up in one visit reads as one block. A vendor's stock
  grows with each quest you finish, so the same NPC can head two blocks: that's two
  trips, not a duplicate.
- **Siosa waits for the Library.** He's the earliest source for around 195 gems —
  three times Nessa, the next biggest — but you reach him by walking into Act 3's
  Library and handing over the Golden Page, not by entering the act. His stock stays
  out of the list until you've been there, and reads as **`A3 · Library`** in violet,
  because the trip is the thing you have to remember, not the man.
- Reward / buy hints come from each gem's `source` in the profile's `gemPlan`. If a
  gem has no `source`, the app looks it up by class from `data/gems.json`'s `sources`,
  filled from the Path of Exile Wiki. **Easiest way to (re)fill it:** repo → Actions →
  **Fetch gem data** → *Run workflow* — it pulls the wiki's `quest_rewards` /
  `vendor_rewards` Cargo export, verifies the tests still pass, and commits the updated
  `data/gems.json` to `main`. Local equivalent:

  ```bash
  npm run fetch-gems -- --dry-run   # preview what it would add (writes nothing)
  npm run fetch-gems                # merge quest/vendor sources into data/gems.json
  ```

  By default only gems already curated in `gems.json` get sources (add `--all` /
  tick *include uncurated* to take everything); the exact query URLs are printed.
  Sourceless gems still get the Siosa/Lilly broad-vendor fallback in the Gems tab.

**Import from Path of Building** instead of writing stages by hand: in
**Settings → Build profile → Import from Path of Building**, paste a PoB export
code or a `pobb.in` / `pastebin` link and hit **Import** — it decodes the build,
reads the class and the per-level-range skill sets, and writes an active profile
(reviewing any warnings it shows). Gem *sources* are left blank for you to fill
(full gem data is a later phase). Headless equivalent:

```bash
npm run import-pob -- "<pob code or file>" --name "My Build" --out data/profiles/mine.json
```

## Troubleshooting

- **Overlay is invisible:** switch PoE to Windowed Fullscreen; the overlay cannot draw
  over exclusive fullscreen.
- **No zone detection:** check the `Client.txt` path in Settings.
- **Zones track but the level never changes:** the game isn't running in English. The
  tracker strip turns amber and says so; switch the client to English, or add your
  language as `data/log-patterns/<lang>.json` and register it in
  `electron/log/service.ts`.
- **A gem says "drop/trade" but you can buy it:** the gem data may predate a patch —
  repo → Actions → *Fetch gem data* → *Run workflow*, then report it if it persists.
- **A hotkey does nothing:** another app may already own that combo — rebind it.

## Privacy

Local-only by design: no server, no account, no telemetry, no analytics, no crash
reporting. **Nothing about you, your characters or your game is ever sent anywhere.**
The log watcher matches only zone/level patterns and discards every other line
immediately; chat and whisper content is never parsed, stored, or displayed. Settings
and profiles are stored locally.

The app makes exactly two kinds of outbound request, both to third parties that learn
nothing but your IP:

- **GitHub**, to check for a new release (on launch and every 6h). This is the only
  one that happens on its own — it sends no data about you, and an unreachable feed
  just reports "Couldn't check".
- **pobb.in / pastebin**, only when *you* paste a link into the PoB importer.

Full details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#privacy) and
[`SECURITY.md`](SECURITY.md).

## Development

The full **development & release workflow** — how to test a change without touching
the live build, cut a release, and version it — lives in
[`CONTRIBUTING.md`](CONTRIBUTING.md).

```bash
npm install
npm run make-icon   # generate the tray/app icon (build/icon.png)
npm run dev         # launch the overlay with hot reload
npm run build       # bundle main + preload + renderer
npm run typecheck   # tsc for the main and renderer projects
npm test            # parser / tracker / watcher / guide / profile / PoB tests
npm run sanitize -- capture.txt out.log   # sanitize a Client.txt capture for fixtures
npm run import-pob -- "<pob code>" --out data/profiles/mine.json   # PoB -> profile
```

Log-format note: the shipped patterns (`data/log-patterns/en.json`) and area ids
(`data/areas/en.json`) are **provisional until validated against a real capture** —
see `data/fixtures/README.md` for the capture + sanitize workflow.

Requires Node 20+. The app targets Windows; `npm run package:win` builds the installer
(run on Windows or with wine).

## License

MIT — see [`LICENSE`](LICENSE).
