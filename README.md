# PoE Leveling Overlay

A **ToS-compliant** desktop overlay that helps you level through the Path of Exile 1
campaign: route, quest rewards, vendor purchases and skill-tree stages, generated
semi-automatically from a Path of Building import.

<!-- SCREENSHOT: drop one in here, it's the first thing anyone decides on.
     Take it in Windowed Fullscreen with the Gems tab open mid-campaign, save it
     as docs/screenshot.png, and replace this comment with:
         ![The overlay on top of Act 1](docs/screenshot.png)
     A short GIF of the stage flipping on level-up works even better. -->

*Not affiliated with or endorsed by Grinding Gear Games.*

## What it does

- **Reads your game log, so it keeps up on its own.** Zone and level come from
  `Client.txt`; the guide advances as you enter zones and the Gems tab flips
  stages as you level. Close and reopen mid-session and it resumes where you are.
  It flags a zone that's well above or below your level, switching characters
  brings back that character's build profile, and a new character that reuses
  last league's name starts its run over instead of inheriting the old one's.
- **Tells you which gems to get, and where from.** Quest rewards and vendor buys
  in one chronological list, rewards first so you never pay for a gem a quest
  hands over. Socket colours are computed, prices shown, "pick one" quest choices
  flagged, gems your class already starts with are never listed to buy, and an
  optional mule (a throwaway level-1 alt) is planned in. Settings → *Gems tab*
  explains every colour in words, and takes your own **short names** for gems:
  `CwDT` instead of Cast when Damage Taken: shown in the Gems tab with the full
  name in the tooltip. Rewards a later stage needs show up when their quest does,
  so you take them for free; *Rewards for later stages* there limits them to 10 or
  20 levels ahead of you, or switches them off. *Vendor* in the header copies the gems to buy now as one search, to
  paste into the vendor's search box: they light up in its stock. Optionally
  (Settings → *Copy without a click*) a town copies the vendor search or your own
  regex, and a level-up the tree search, never over something you copied
  yourself.
- **Imports your Path of Building build**: paste an export code or a `pobb.in`
  link and it writes the stages for you, after you've checked where each one starts.
- **Says which passive to take next.** A build's PoB trees (one per levelling
  milestone) become an ordered list: under the gems, the node your newest point
  goes on (by level and the Books of Skill you used) with the few after it and
  the three before (points you may have saved up on a run), masteries by the
  effect your build picked, attribute nodes as STR, DEX and INT, a
  respec when the build drops nodes, and the next ascendancy points after each
  Labyrinth. Click a name to copy it for the in-game tree's search box, or
  open *Map* for that piece of the tree, your points numbered. The order
  is worked out at import, and you can change it in the editor.
- **Tracks all twelve Trials of Ascendancy**, auto-checking each one the moment
  you finish it, telling you when a Labyrinth is ready to run, and noticing when
  you've beaten it.
- **Shows only what you want.** Settings → *What the overlay shows* has one row
  per piece of information (the zone line, the copy buttons, the trial, Labyrinth,
  bandit and Pantheon reminders, the gems to get, your links, the passives) with a
  tick for the panel and one for the voice. Off only hides it: tracking carries on.
- **Your setup, backed up.** Settings → *Backup* saves how you set the overlay up
  (hotkeys, what it shows and says, regexes, short names, sizes) to a file, and
  loads it again on another PC, saying first what it will change. Your Client.txt
  path, your character and the window positions stay out of it.
- **A compact strip, if the panel is too much** (preview: Settings → *Overlay*).
  A few lines instead of the panel, at the game's own text size: a reminder, the
  gems to get in the town you're in, where your passive point goes. It starts above the
  XP bar, where no vendor, stash or inventory window goes, grows away from the
  screen edge it sits on, and never past four lines. The full panel is on
  `Ctrl+Shift+D`. The panel's own text size can go up to 150 % there too.
- **Says what matters, if you want it to.** In the same table: a trial in this
  zone, new gems to buy, a zone that costs experience, a Labyrinth ready, the
  bandits or Pantheon due, where your new passive point goes, each switched on on its own,
  in English or German, spoken by Windows' own voices on your PC.
- **Times your runs, if you want it to.** Switch on Settings → *Run timer* and
  a small window of its own times each campaign from the Twilight Strand to
  Kitava in Act 10: zones, towns, hideout, Labyrinth and loading screens, act
  splits and Labyrinths against your best run (solo against solo, party
  against party) and the deaths, quest skill
  points, Pantheon gods and party members that make two runs comparable. It
  counts only while the run's character is in the game (not character select
  or AFK) mule time included as its own, and lands within a few percent of
  the game's own `/played`. *Import old runs* reads your finished campaigns
  from before out of `Client.txt`, on your PC.
- **Ticks your Pantheon gods by itself** as they fall.
- **Keeps your search regex one click away.** Store a stash or vendor search
  string in Settings, and **Regex** in the header (next to *Vendor* and *Tree*) copies it; paste it
  into the game yourself. The overlay never types into the game. Keep a
  different one for some acts (*Per act*) (2-3 links stop mattering a few acts
  in) and the button copies the one for the act you've reached.
- **Updates itself.** One click when a new version is ready.
- **A route guide you write yourself**: the app ships the engine and an in-app
  editor; the campaign route is yours (see [Author your route](#author-your-route)).

Only English game clients are supported today: see [Setup](#setup).

<details>
<summary>More</summary>

How it's built and why: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
What's verified and what still needs checking in game:
[`docs/TESTING.md`](docs/TESTING.md).
Third-party data attribution: [`NOTICE`](NOTICE).
Security and the app's network behaviour: [`SECURITY.md`](SECURITY.md).

Gem data (attributes, level requirements and per-class quest/vendor sources) 
comes from the Path of Exile Wiki and is refreshed with one command
(`npm run fetch-gems`, or the *Fetch gem data* GitHub Action) after a patch.
The passive tree comes from Grinding Gear Games' own export and is refreshed the
same way when a league changes it (`npm run fetch-tree`, or *Fetch tree data*).

The version in `package.json` stays `0.0.0`; a release takes its version from
the `v*` tag that builds it.

</details>

---

## What it is & ToS compliance

The overlay is a **separate window that sits on top of the game**. It only ever
**reads** the official `Client.txt` log file and **sends nothing** to the Path of
Exile process: no memory reading, no injection, no simulated input, no automation.
Hotkeys control the overlay only (the key combo is consumed system-wide and never
forwarded to the game). This mirrors long-tolerated tools like Awakened PoE Trade
and Exile Leveling. Full guardrails:
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#tos-position).

## How this was built

This is a hobby project, **written almost entirely with an AI coding assistant**
(Claude Code) and steered, tested and played with by one person. It hasn't had
an outside security audit. What it does to keep that honest:

- It only **reads** one file, the game's `Client.txt`, and never touches the game
  process, see [What it is & ToS compliance](#what-it-is--tos-compliance).
- Every window runs sandboxed with no Node access; the packaged `.exe` can't be
  repurposed as a Node runtime or load code from outside its own archive.
- Every change goes through CI (typecheck, lint, ~370 tests, a dependency audit); release
  builds come from GitHub Actions, never from a personal machine, and carry a
  signed provenance record you can check (see [Install](#install-windows)).
- Its full network and file footprint is listed in [`SECURITY.md`](SECURITY.md).

Found something off? [Open an issue](https://github.com/wertgzhj/poe-leveling-overlay/issues),
or, for anything security-related, report it privately as `SECURITY.md` says.
Pull requests from others aren't taken (see [`CONTRIBUTING.md`](CONTRIBUTING.md#contributions)).

## Install (Windows)

Download one of two files from the latest
[**Release**](https://github.com/wertgzhj/poe-leveling-overlay/releases/latest):

- **Installer**, `PoE-Leveling-Overlay-<version>-setup.exe`: installs the app and adds
  Start Menu + Desktop shortcuts, and **updates itself** (see below).
- **Portable**: `PoE-Leveling-Overlay-<version>-portable.exe`: no install; double-click
  the exe directly. It doesn't update itself.

Both are built by the **Build Windows** GitHub Action; how a release is cut is in
[`CONTRIBUTING.md`](CONTRIBUTING.md#cut-a-release-go-live).

The build is **unsigned**, so Windows SmartScreen warns on first run: choose
*More info → Run anyway*. (Code signing needs a paid certificate; it's a later item.)
Only download it from this repository's Releases page. To check a download really
came from this repository's build: every release lists the files' hashes in
`SHA256SUMS.txt`, and with the [GitHub CLI](https://cli.github.com/)
`gh attestation verify <file>.exe -R wertgzhj/poe-leveling-overlay` confirms the
workflow and commit it was built from.

To build it yourself on Windows: `npm ci && npm run make-icon && npm run package:win`
(output in `dist/`). See [Development](#development) for source setup.

## Updating

The **installed** build updates itself: no need to watch GitHub. On launch (and every
few hours) it checks this repo's GitHub Releases; a newer version downloads in the
background, then the overlay shows an **Update vX.Y.Z is ready: Restart & update**
prompt. One click swaps it in and reopens. You can also check on demand in
**Settings → Updates**. Nothing is installed without that click.

The running version is always visible bottom-right of the overlay (`vX.Y.Z`). While an
update downloads it shows live progress (`v0.1.0 ⬇ 42%`), and once ready it becomes a
clickable **`v0.1.0 → v0.2.0 ⬆`** pill: clicking it updates and restarts immediately.
(If click-through is on, toggle interactive mode first: default `Ctrl+Shift+C`.)

Two things to know:

- **Releases must be publicly downloadable** for the updater to reach them. If this repo
  is private, either make it public, or point `publish.repo` in `electron-builder.yml` at
  a separate **public** releases repo. Without a reachable feed the app still runs: it
  just reports "Couldn't check" in Settings and never nags.
- Auto-update targets the **installer**; the **portable** exe doesn't self-update:
  it checks, then says a new version is out (Settings → Updates, and the version
  corner) with a button to the download page. Dev/unpackaged runs show
  updates as *disabled*.

## Setup

1. The overlay finds your `Client.txt` by itself on first launch: the Steam folder and
   every Steam library (a second drive too), the standalone client in Program Files,
   and Epic. If it can't, set the path in Settings → Game log (**Find** looks again,
   **Browse…** picks the file):
   - Steam: `…\steamapps\common\Path of Exile\logs\Client.txt`
   - Standalone: `…\Grinding Gear Games\Path of Exile\logs\Client.txt`
2. Run Path of Exile in **Windowed Fullscreen**: exclusive fullscreen covers overlays.
3. Run the game in **English**. Two of the three log lines the overlay reads are
   translated by the game, and only English patterns ship: on another language
   zones still track but your level never does (the overlay says so rather than
   quietly half-working). Adding a language is a data change, see below.
4. Optional: set your character name (Settings → Game log) if you play in a party,
   so a partymate's level-up can't advance your progress. Solo it auto-detects.

## Hotkeys

| Action | Default | Notes |
|---|---|---|
| Show / hide overlay | `Ctrl+Shift+O` | Leaves the run timer as it is |
| Show / hide run timer | `Ctrl+Shift+T` | Only while Settings → *Run timer* is on |
| Toggle click-through | `Ctrl+Shift+C` | Click-through lets clicks reach the game |
| Move / resize mode | `Ctrl+Shift+M` | Drag the title bar; drag the corner to resize |
| Full panel over the strip | `Ctrl+Shift+D` | Only while the compact strip is on; again to go back |
| Guide: next step | `Ctrl+Shift+N` | Marks the current step done |
| Guide: previous step | `Ctrl+Shift+P` | Reopens the last completed step |
| Copy the Vendor search | *not set* | The Gems tab's gems to buy, for the vendor's search box |
| Copy the Tree search | *not set* | The passives' notables and masteries, for the tree search |
| Copy your regex | *not set* | Settings → *Search & copy* |

The three Copy hotkeys start unset (any free Ctrl+Shift combo is a shortcut in some
other program, and a global hotkey takes it everywhere) so pick your own in Settings
(Backspace while recording clears one again). They copy over whatever is on the
clipboard: it's your keypress, like a click.

The overlay has **Gems**, **Trials** and **Guide** tabs, in that order: it opens on Gems,
which works out of the box, while the Guide runs on placeholder routes until you write
your own. The Trials tab tracks all
**twelve** campaign Trials of Ascendancy: six for the **Normal** Labyrinth (Acts 1-3),
three for **Cruel** (Acts 6-7) and three for **Merciless** (Acts 8-10), grouped per
Labyrinth. It **auto-checks a trial when you finish it**: Izaro voices a plaque line
only on completion, and the zone you're standing in says which trial it was (the same
zone can host a trial in two difficulties, so the act decides). It also shows a hint
while you're in a trial's zone, tells you when a Labyrinth's trials are all
done, and you can click any trial to correct it. When Izaro dies in a Labyrinth's
final arena, that Labyrinth is marked **done** and its trials are ticked with it.

Don't use one of the tabs? **Settings → What the overlay shows → Tabs** hides any of
them (at least one stays on); with a single tab the switcher disappears entirely.

All hotkeys are rebindable in-app: open **Settings** (the ⚙ button in the overlay, or
the tray → *Settings…*), click a binding, and press the new combo, the change takes
effect immediately and is saved. Defaults are chosen to avoid PoE's own binds; a
combo that's already taken is flagged as a conflict. The tray also offers show/hide,
move mode, click-through, and **Quit**.

## Author your route

**Editor:** open **Edit routes & profile…** from the tray (or the button in overlay
Settings) for a visual editor, add/edit/reorder route steps per act, manage your
build profiles and edit their stages/links, with the same validation the app loads
with; a profile saves back to its own file, and the overlay hot-reloads. Or edit the JSON directly, as below.

**Swapping routes with someone:** *Share routes…* in the editor exports every act as
JSON you can paste anywhere, and imports the same back. Nothing is uploaded: it's
text you send yourself, and it stays readable so you can look before you run it. The
project never ships route content; this is how you get someone else's.

The route content is **yours to write**: the app ships an engine plus **fallback
skeletons for all ten acts** (`data/campaign/act1.json` … `act10.json`), which the
guide combines into one campaign that advances across act boundaries. Act 1 covers the
capture-verified zones; Acts 2-10 are rough placeholders (town + high-level notes) to
replace. Edit those files, or drop a per-act override into `<userData>/routes/actN.json`
for installed builds (override one act or all of them); the overlay **hot-reloads on
save** and shows validation problems in the panel.

- A step needs an `id` (stable: progress is saved against it), a `type`
  (`quest | waypoint | trial | town | boss | kill | enter | hint`), and a `text`.
- Steps match the zone you enter by `areaId` (preferred: run in dev and the 🐞 panel
  shows the id of every zone) or by `zone` display name until you've learned the id.
- The guide always advances to the **next open step** for the zone you entered. Town
  visits never skip pending steps, so portal trips to sell don't derail it. Hideouts
  and endgame maps are ignored entirely.
- `"rewardHint": true` marks quest-reward steps: the guide tags them `REWARD`, and
  while one is the current step the Gems tab's list is framed in gold.
- Fix mistakes with the next/previous hotkeys or by clicking a step (needs
  interactive mode, `Ctrl+Shift+C`).

## Create a build profile

The **Gems** tab shows the gems to have socketed at your current level, with socket
colours computed automatically (Str = red, Dex = green, Int = blue), plus what to buy
or take as a quest reward. It's driven by a build profile: like routes, you write it
yourself (or import it from Path of Building, below).

- **Keep as many profiles as you have builds.** Switch between them in
  **Settings → Build profile**; create, duplicate, rename and delete them under
  **Manage… → Profiles** in the editor. Each is its own file in your app data, so a
  second build never overwrites the first, and a deleted one goes to the recycle bin.
  Each character remembers the profile it was last played with and switches back
  to it by itself.
- **New profile** starts from your class's two starting gems; **Import file…** copies
  a profile JSON from anywhere into your profiles (the original is left alone). The
  bundled example is read-only: saving it in the editor makes a copy of your own.
- **Share…** sends a profile to someone as text: your stages, passive order and notes,
  everything a PoB code doesn't carry, but not the character it belongs to. Pasting
  one in adds it as a new profile; it never replaces one you have.
- The active profile **hot-reloads on save** with validation shown in the panel.
- `meta` sets `name` + `class` (one of the seven classes). It can also record the
  two **one-shot decisions** the campaign asks for: `bandit` (`Alira` / `Kraityn` /
  `Oak` / `Kill all`) and `pantheon` (`major` / `minor`, e.g. `Soul of Lunaris`). Both
  are optional; when set, the overlay reminds you at the point you reach them (Act 2
  and Act 6) and you dismiss it with ✕. For the Pantheon it also knows **where each
  god is fought** (Acts 6-10, side areas named): walk into that zone and the notice
  bar says so, "Pantheon: Shakari in The Sand Pit") and the Trials tab lists your two
  powers with a tick each, per character. Upgrades aren't tracked: the map bosses
  that upgrade a power rotate with the atlas. Which one is right depends entirely on the
  build and the bandits can't be changed afterwards, so the choice lives in your
  profile: the app has no opinion, and it deliberately quotes **no stats**, because
  those change between patches and a stale number is worse than none. A PoB import
  brings the bandit choice across on its own. `stages` list `range`
  (`[minLevel, maxLevel]`) and `socketGroups` (each a link of gem names): the active
  stage switches automatically as you level. `gemPlan` records where each gem comes
  from (`questReward` / `vendor` / `drop`), which feeds the reward + buy hints.
- Socket colours come from `data/gems.json` (gem → attribute); a gem missing there
  shows a neutral pip with a `?`. It covers **828 gems** pulled from the wiki, so
  that's rare: a gem with no attribute at all (Portal, Quickstep) fits any socket.
  `fetchedAt` in that file says when the data was last pulled.

The tab reads in three columns (**cost, gem, source**) and every list shares them,
so the prices line up under each other and so do the acts:

```
Reward   Ⓑ Freezing Pulse                 A1, Enemy at the Gate
Wisdom   Ⓡ Holy Flame Totem               A1, Nessa
2× Alt   Ⓑ Summon Raging Spirit           A3, Clarissa ≈
```

- The **cost column** says how you get a gem: `Reward` in green for a free quest
  pick, otherwise the vendor's price, from grey to white the dearer it is. Vendors
  price a gem by its level requirement, and every tier was checked in game:

  | Gem level | 1-7 | 8-15 | 16-27 | 28-37 | 38+ |
  |---|---|---|---|---|---|
  | Price | `Wisdom` | `Trans` | `Alt` | `Chance` | `Alch` |

- A gem needed in **two different links** shows its count there too: `2× Alt` means
  two purchases. A quest hands out exactly one reward, so a reward needed twice reads
  `Reward +1`: one free, the rest you buy or find.
- **Muling**: rolling a throwaway level-1 character of another class for a gem it
  gets on the Twilight Strand (its starting gems, Hillock's reward, or Nessa's first
  stock): is your call, per character, in **Settings → Build profile → Mule**, next
  to the profile that's also chosen per character: the gem (Momentum by default,
  when the build uses it) or **No mule**. Solo or in a party makes no difference. The
  Gems tab doesn't list the mule as something to get; the gem's line in the links
  says `Mule (Ranger)`. It also leaves its quest pick, so that quest hands over the
  next gem you want instead.
- A quest that offers several of your gems is one **pick**, so it gets its own box
  reading `PICK ONE, BUY REST`, with the price of the ones you don't take. There's
  one gem vendor per town, so that's where; a line under the gems only appears when
  it's somewhere else: `↳ buy the rest in the Library` (violet) or `in Act 6`. (*The Caged Brute* is two picks (a
  support and a skill) and shows as two.) On the **next** stage the rest come back
  once, as one buy row reading `↳ whichever you didn't pick`: the quest handed over
  exactly one, and the overlay can't see your inventory.
- **The list holds what you can get from the acts you've reached**: for this stage,
  and quest picks for later stages. Gems you'll want later turn grey and read
  `lvl 32+` after the name (the tooltip spells it out). Anything from an act you **haven't reached** is left out:
  at level 2 in Act 1, an Act 4 quest is not a preview; it appears when you get
  there, and until then the gem waits in grey in the links below. A pick that's only
  for later shows on the stages of its own act: an Act 1 pick isn't carried onto an
  Act 2 stage.
- **Paging with ◀ ▶** shows a stage on its own terms: back, what it showed when it
  was live (the opening stage lists Act 1, however far you've got); forward, a
  preview of every act it covers. Which acts a stage covers comes from its level
  range and the level each act starts at. Before the overlay has seen a zone, the
  live stage uses its own acts too.
- The list is headed by **act** (`A1`, `A2`) rewards and buys alike, so what you
  pick up in one town reads as one block. Every town has one gem vendor; the name is in the
  source column. The one exception is **`A3, Library`**, in violet: Siosa, a second
  Act 3 vendor you walk to. He counts from Act 3 on, like the rest of the act; the
  heading says where to go. His quest, *A Fixture of Fate*, reads `Library` too.
- **The links at the bottom** are the build as it should be socketed now. A line
  from the act you're in is tinted **gold**; a gem from an act you haven't reached is
  grey. **`NEW`** marks a gem the previous stage's links didn't have, or another
  copy of one: a second Autoexertion is new, and goes on the list to buy, so you see
  what changed at a glance, on any stage you page to with ◀ ▶. **`RELINKED`** on a
  link's top edge says the link itself was rearranged: a gem moved in from another
  link, or one left it. A mule gem's line turns
  **turquoise** and a starting gem's **green** only on a stage where they're new,
  never on the first, where nothing is; the source column (`Mule (Ranger)`,
  `✓ start`) says what they are on every stage.
- Reward / buy hints come from each gem's `source` in the profile's `gemPlan`. If a
  gem has no `source`, the app looks it up by class from `data/gems.json`'s `sources`,
  filled from the Path of Exile Wiki. **Easiest way to (re)fill it:** repo → Actions →
  **Fetch gem data** → *Run workflow*, it pulls the wiki's `quest_rewards` /
  `vendor_rewards` Cargo export, verifies the tests still pass, and pushes the updated
  `data/gems.json` to a `gem-data/…` branch: open the PR from the link on the run's
  summary page. Local equivalent:

  ```bash
  npm run fetch-gems -- --dry-run   # preview what it would add (writes nothing)
  npm run fetch-gems                # merge quest/vendor sources into data/gems.json
  ```

  By default only gems already curated in `gems.json` get sources (add `--all` /
  tick *include uncurated* to take everything); the exact query URLs are printed.
  Sourceless gems still get the Siosa/Lilly broad-vendor fallback in the Gems tab.

**Import from Path of Building** instead of writing stages by hand: in
**Settings → Build profile → Import from Path of Building**, paste a PoB export
code or a `pobb.in` / `pastebin` link and hit **Read build**. It decodes the build
and lists its gem sets with the level each one starts at, for you to check before
**Import**. PoB keeps one level per build, not per gem set, so the level comes from
what the build states: a range in the gem set's title ("Level 12-20", "Act 2"), else
the tree it shares a loadout with (the same title, or the same `{1}` ids, as PoB pairs
them), by a level leading that tree's title ("12", "33 (Lab)") or else by the points
it spends. A name like "After Brutus" is never read for a level: a gem set nothing
links to is left empty for you to fill in. Each stage runs until the next one starts.
**Import** adds it as a **new** profile and makes it active: importing another build
never replaces this one (reviewing any warnings it shows). Where each gem comes from is filled in from `data/gems.json` by
class. Headless equivalent:

```bash
npm run import-pob -- "<pob code or file>" --name "My Build" --out data/profiles/mine.json
```

## Troubleshooting

- **Overlay is invisible:** switch PoE to Windowed Fullscreen; the overlay cannot draw
  over exclusive fullscreen.
- **No zone detection:** check the `Client.txt` path in Settings, **Find** looks
  for it again.
- **Zones track but the level never changes:** the game isn't running in English. The
  tracker strip turns orange and says so; switch the client to English, or add your
  language as `data/log-patterns/<lang>.json` and register it in
  `electron/log/service.ts`.
- **A gem says "drop/trade" but you can buy it:** the gem data may predate a patch,
  repo → Actions → *Fetch gem data* → *Run workflow*, then report it if it persists.
- **A hotkey does nothing:** another app may already own that combo, rebind it.
- **Text is hard to read in bright areas:** raise **Settings → Overlay → Opacity** to
  70 % or more. Below that, Settings says so: the panel can only cover the game, not
  dim it, so over snow or a bright effect a see-through background loses contrast.

## Privacy

Local-only by design: no server, no account, no telemetry, no analytics, no crash
reporting. **Nothing about you, your characters or your game is ever sent anywhere.**
The log watcher matches a fixed set of game-event lines (zones, levels, loading
screens, deaths, quest and boss messages: `data/log-patterns/en.json`) and discards
every other line immediately; chat and whisper content is never parsed, stored, or
displayed. Settings, profiles and timed runs are stored locally: runs include the
names of players who shared your zones, so that a run can say it was played in a party.

The app makes exactly two kinds of outbound request, both to third parties that learn
nothing but your IP:

- **GitHub**, to check for a new release (on launch and every 6h). This is the only
  one that happens on its own: it sends no data about you, and an unreachable feed
  just reports "Couldn't check".
- **pobb.in / pastebin**, only when *you* paste a link into the PoB importer.

Full details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#privacy) and
[`SECURITY.md`](SECURITY.md).

## Development

The full **development & release workflow** (how to test a change without touching
the live build, cut a release, and version it) lives in
[`CONTRIBUTING.md`](CONTRIBUTING.md).

```bash
npm install
npm run make-icon   # generate the tray/app icon (build/icon.png)
npm run dev         # launch the overlay with hot reload
npm run build       # bundle main + preload + renderer
npm run typecheck   # tsc for the main and renderer projects
npm run lint        # oxlint, type-aware (.oxlintrc.json)
npm test            # unit tests: log parsing, tracking, gem engine, PoB import, …
npm run sanitize -- capture.txt out.log   # sanitize a Client.txt capture for fixtures
npm run import-pob -- "<pob code>" --out data/profiles/mine.json   # PoB -> profile
```

Log-format note: the shipped patterns (`data/log-patterns/en.json`) are verified
against real captures, and so is every campaign area id in `data/areas/en.json`,
Acts 1-10. `tests/areas.test.ts` keeps the trial zones and the guide routes
agreeing with that table. See `data/fixtures/README.md` for the capture +
sanitize workflow.

Requires Node 22.6+ (the tests run TypeScript directly). The app targets Windows; `npm run package:win` builds the installer
(run on Windows or with wine).

## License

MIT: see [`LICENSE`](LICENSE).
