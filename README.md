# PoE Leveling Overlay

A **ToS-compliant** desktop overlay that helps you level through the Path of Exile 1
campaign — route, quest rewards, vendor purchases and skill-tree stages, generated
semi-automatically from a Path of Building import.

> **Project status:** early development. Phase **P0 (scaffold)** — a transparent,
> always-on-top overlay window with hotkeys and persistent settings. The route,
> gem and tree panels arrive in later phases. See [`docs/plan.md`](docs/plan.md).

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

1. Set the path to your `Client.txt`. Defaults:
   - Steam: `…\steamapps\common\Path of Exile\logs\Client.txt`
   - Standalone: `…\Grinding Gear Games\Path of Exile\logs\Client.txt`
2. Run Path of Exile in **Windowed Fullscreen** — exclusive fullscreen covers overlays.

## Hotkeys

| Action | Default | Notes |
|---|---|---|
| Show / hide overlay | `Ctrl+Shift+O` | |
| Toggle click-through | `Ctrl+Shift+C` | Click-through lets clicks reach the game |
| Move / resize mode | `Ctrl+Shift+M` | Drag the title bar; drag the corner to resize |

All hotkeys are rebindable in-app: open **Settings** (the ⚙ button in the overlay, or
the tray → *Settings…*), click a binding, and press the new combo — the change takes
effect immediately and is saved. Defaults are chosen to avoid PoE's own binds; a
combo that's already taken is flagged as a conflict. The tray also offers show/hide,
move mode, click-through, and **Quit**.

## Create a build profile

Point the app at a Path of Building export string or `pobb.in` link; it detects the
leveling stages and generates the gem plan for you, with a manual touch-up pass.
*(PoB import lands in a later phase — see the plan.)*

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
```

Requires Node 20+. The app targets Windows; `npm run package:win` builds the installer
(run on Windows or with wine).

## License

MIT — see [`LICENSE`](LICENSE).
