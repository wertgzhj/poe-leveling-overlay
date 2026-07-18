# PoE Leveling Overlay

A **ToS-compliant** desktop overlay that helps you level through the Path of Exile 1
campaign — route, quest rewards, vendor purchases and skill-tree stages, generated
semi-automatically from a Path of Building import.

> **Project status:** early development. Phases **P0–P5** complete; **P6** in
> progress. Transparent overlay with hotkeys, in-overlay settings, live
> `Client.txt` tracking (zone, level, restart-safe resume), a **route guide with
> auto-advance**, a **build-profile gem panel** (computed socket colours +
> class-aware reward/vendor hints), **Path of Building import**, and a **Trials of
> Ascendancy tracker**. See [`docs/plan.md`](docs/plan.md).

*Not affiliated with or endorsed by Grinding Gear Games.*

---

## What it is & ToS compliance

The overlay is a **separate window that sits on top of the game**. It only ever
**reads** the official `Client.txt` log file and **sends nothing** to the Path of
Exile process — no memory reading, no injection, no simulated input, no automation.
Hotkeys control the overlay only (the key combo is consumed system-wide and never
forwarded to the game). This mirrors long-tolerated tools like Awakened PoE Trade
and Exile Leveling. Full guardrails: [`docs/plan.md`](docs/plan.md) §2.

## Install

- **Release:** download the latest build from the Releases page (coming with a later
  phase) and run it. Windows may show a SmartScreen warning for an unsigned app —
  choose *More info → Run anyway*.
- **From source:** see [Development](#development) below.

## Setup

1. Set the path to your `Client.txt` (Settings → Game log). Defaults:
   - Steam: `…\steamapps\common\Path of Exile\logs\Client.txt`
   - Standalone: `…\Grinding Gear Games\Path of Exile\logs\Client.txt`
2. Run Path of Exile in **Windowed Fullscreen** — exclusive fullscreen covers overlays.
3. Optional: set your character name (Settings → Game log) if you play in a party,
   so a partymate's level-up can't advance your progress. Solo it auto-detects.

## Hotkeys

| Action | Default | Notes |
|---|---|---|
| Show / hide overlay | `Ctrl+Shift+O` | |
| Toggle click-through | `Ctrl+Shift+C` | Click-through lets clicks reach the game |
| Move / resize mode | `Ctrl+Shift+M` | Drag the title bar; drag the corner to resize |
| Guide: next step | `Ctrl+Shift+N` | Marks the current step done |
| Guide: previous step | `Ctrl+Shift+P` | Reopens the last completed step |

The overlay has **Guide**, **Gems** and **Trials** tabs. The Trials tab tracks the
six normal-Labyrinth Trials of Ascendancy — it auto-checks a trial when you enter its
zone, and you can click any trial to correct it; all six unlock the Labyrinth.

All hotkeys are rebindable in-app: open **Settings** (the ⚙ button in the overlay, or
the tray → *Settings…*), click a binding, and press the new combo — the change takes
effect immediately and is saved. Defaults are chosen to avoid PoE's own binds; a
combo that's already taken is flagged as a conflict. The tray also offers show/hide,
move mode, click-through, and **Quit**.

## Author your route

The route content is **yours to write** — the app deliberately ships an engine plus a
small Act 1 template, not imported guide data. Edit `data/campaign/act1.json` (or drop
an override into `<userData>/routes/act1.json` for installed builds); the overlay
**hot-reloads on save** and shows validation problems right in the panel.

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
- `meta` sets `name` + `class` (one of the seven classes). `stages` list `range`
  (`[minLevel, maxLevel]`) and `socketGroups` (each a link of gem names) — the active
  stage switches automatically as you level. `gemPlan` records where each gem comes
  from (`questReward` / `vendor` / `drop`), which feeds the reward + buy hints.
- Socket colours come from `data/gems.json` (gem → attribute); a gem missing there
  shows a neutral pip with a `?`. It covers ~70 common gems for now — add your own.
- Reward / buy hints come from each gem's `source` in the profile's `gemPlan`. If a
  gem has no `source`, the app looks it up by class from `data/gems.json`'s `sources`
  — but that field is intentionally empty until a verified gem-availability dataset is
  added (the resolver is built and class-aware; only the data is pending).

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
- **No zone detection:** check the `Client.txt` path and your client language.
- **A hotkey does nothing:** another app may already own that combo — rebind it.

## Privacy

Local-only by design: no server, no account, no telemetry, no analytics, no crash
reporting. In the default configuration **no data ever leaves your machine**. The log
watcher matches only zone/level patterns and discards every other line immediately;
chat and whisper content is never parsed, stored, or displayed. Settings and profiles
are stored locally. Full details: [`docs/plan.md`](docs/plan.md) §11.1.

## Development

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
