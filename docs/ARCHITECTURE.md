# Architecture

How the overlay is built and why. For using it, see the
[README](../README.md); for working on it, [`CONTRIBUTING.md`](../CONTRIBUTING.md).

## Scope

The overlay supports levelling through the Path of Exile 1 campaign: the route,
which gems to take as quest rewards, what to buy from vendors, and which gems to
have socketed at your current level. Build-specific content comes from a Path of
Building import; build-independent content (routes) is authored per install.

Deliberately out of scope: trading and pricing, endgame and maps, PoE 2, item
filters, and a skill-tree renderer.

## ToS position

This is the constraint everything else is designed around.

| Done | Never done |
|---|---|
| A separate overlay window on top of the game | Reading game memory, injection, process hooks |
| Reading `Client.txt`, the game's own log file | Sending simulated input to the game |
| Showing data, and hotkeys that control the overlay | Automating any part of gameplay |

The app **only reads** and **sends nothing** to the Path of Exile process.
Hotkeys act on the overlay alone — note that a global hotkey is consumed
system-wide before the game sees it, so the defaults avoid PoE's own binds and
everything is rebindable.

Path of Exile must run in **Windowed Fullscreen**; exclusive fullscreen covers
overlays. This mirrors long-tolerated tools like Awakened PoE Trade and Exile
Leveling.

## Stack

| Area | Choice | Why |
|---|---|---|
| Shell | Electron + electron-builder | Transparent, frameless, always-on-top window; filesystem access and global hotkeys |
| UI | React + TypeScript + Vite | — |
| Styling | Tailwind with central design tokens | Consistent dark, compact overlay |
| State | zustand | Enough for overlay state, no more |
| Log watching | Polling tail: seek to end, then read only appended bytes | `Client.txt` is append-only and reaches hundreds of MB per league, so it is never read whole. `fs.watch` is unreliable on Windows for files another process appends to, which makes polling the primary mechanism rather than a fallback |
| Settings & profiles | electron-store + JSON in the userData folder | Editable and diffable by hand |

## Processes

The main process owns everything stateful; the renderer only draws.

```
Main
├── OverlayController   The window: transparent, frameless, alwaysOnTop at
│                       'screen-saver' level, backgroundThrottling off (the
│                       overlay never holds focus while you play). Click-through
│                       via setIgnoreMouseEvents(…, { forward: true }), plus a
│                       move/resize mode — a click-through window can't be dragged.
├── LogService          Polling tail over Client.txt → parser → tracker.
│                       On start it backscans the last 64 KB to resume zone and
│                       level, then follows appended bytes.
├── GuideService        Loads act1…act10 route files, merges them into one
│                       campaign list, advances the cursor on area events.
├── ProfileService      Build profile with hot reload, gem data, and the active
│                       stage derived from the tracked character's level.
├── TrialsService       Trial-of-Ascendancy state per character.
├── UpdateService       electron-updater against this repo's GitHub Releases.
├── EditorWindow        A normal window for editing routes and profiles.
└── Hotkeys             globalShortcut: show/hide, click-through, move mode,
                        step forward/back. Rebinding re-registers live.

Renderer (overlay)          Renderer (editor)
├── MainPanel               ├── RouteEditor
│   Guide / Gems / Trials   └── ProfileEditor
├── SettingsPanel
├── UpdateBanner + VersionBadge
└── DebugPanel (dev only — parsed events, in memory, never written to disk)
```

Renderer and main are connected by an **allow-listed IPC surface**
(`electron/channels.ts`, exposed through `electron/preload.ts`). The renderer is
sandboxed with context isolation and no node integration, so those channels are
the only thing it can reach.

Logic that can be tested without Electron lives in pure modules — the log
parser, tracker and watcher, the guide and profile engines, the trials engine,
the PoB decoder — with the `*/service.ts` files holding the Electron-facing
glue. That split is why the test suite runs on plain Node.

## Data

### Campaign routes — `data/campaign/actN.json`

Steps are keyed by **`areaId`**, the act-scoped, locale-independent id the game
itself uses (`"1_1_1"`). Display names live in `data/areas/<lang>.json`, so route
data never depends on the client language.

Zone *names* are unusable as keys: Acts 6–10 reuse names from Acts 1–5 —
Lioneye's Watch (A1/A6), The Forest Encampment (A2/A7), The Sarn Encampment
(A3/A8), Highgate (A4/A9), and several zones besides — and they are localized.

A step carries an `id` (progress is stored against it, so it must be stable), a
`type` (`quest | waypoint | trial | town | boss | kill | enter | hint`), and
`text`. `rewardHint: true` marks a step where the Gems tab should surface the
build's reward choice. `"skeleton": true` on the file marks the shipped
placeholder routes; remove it once an act is written.

Matching is by `areaId` when known and by zone name otherwise, so a route can be
authored before the ids are known.

### Gem data — `data/gems.json`

Per gem: attribute, level requirement, and where it comes from per class —
which quest rewards it, and which vendor sells it in which act after which
quest. **Vendor stock is class-gated in Acts 1–5**; without that dimension the
shopping list would send a Marauder to buy gems Nessa only sells to a Witch.

Siosa (Act 3, after *A Fixture of Fate*) and Lilly Roth (Act 6 onward) sell
almost everything to any class, and the data lists their stock explicitly — so a
gem with no source is one nobody sells, not a gap. Those show as drop/trade.

The file is generated from the Path of Exile Wiki's Cargo API
(`npm run fetch-gems`, or the *Fetch gem data* workflow) and re-run per league.
It ships as a resource rather than being bundled, and the app reports a loud
error if it can't be read.

### Build profiles — JSON, one per build

Two independent axes: `stages` is the **loadout per level range**, `gemPlan` is
the **acquisition timeline** — where each gem comes from.

```json
{
  "meta": { "name": "RF Chieftain", "class": "Marauder" },
  "stages": [
    {
      "range": [1, 11],
      "socketGroups": [{ "gems": ["Rolling Magma", "Arcane Surge Support"] }]
    }
  ],
  "gemPlan": [
    { "gem": "Rolling Magma", "source": { "kind": "questReward", "questId": "enemy-at-the-gate" } }
  ]
}
```

**Socket colours are computed, never authored** — each gem's attribute decides
it (Str → red, Dex → green, Int → blue), and a gem with no attribute requirement
gets an any-colour pip. A `gemPlan` entry may carry a `count`: levelling builds
routinely socket the same support twice, so the name alone is not an identity.

The active stage follows the tracked character's level, with the next one shown
as a preview. From this the app derives the shopping list and the reward
recommendation per quest.

## Things that shaped the design

**Area detection.** The primary signal is the instance-generation debug line
(`Generating level <N> area "<areaId>"`), which is locale-independent. The
localized "You have entered …" line is the fallback and the source of display
names.

**Quest completion is not detectable.** `Client.txt` does not log it. Progress
is driven by area changes, with hotkeys and clicking a step as the correction
mechanism. Town visits deliberately never skip pending steps, so a portal trip
to sell doesn't derail the guide.

**Party play.** Level-up lines fire for party members too, so the tracker binds
progress to one character — adopted from the most frequent name in the backscan,
or pinned explicitly in settings.

**Restart and resume.** Starting the overlay mid-session must not lose state,
so the backscan rebuilds zone, level and character from the log tail, and
progress is persisted per character.

**Client language.** Two of the three tracked lines are localized by the game.
Only English patterns ship; another language is detected and reported rather
than silently half-working.

**Levelling ranges, not acts.** Which gems are actionable now is decided by
character level against PoE's XP safe range, because level is tracked reliably
and act detection lags. Gems above that range are dimmed, never hidden.

## Privacy

No server, no account, no telemetry, no analytics, no crash reporting.

| Concern | Rule |
|---|---|
| Log data | Only the configured patterns are matched; every other line is discarded immediately. Raw lines are never persisted and never leave the machine. Chat and whisper content is never parsed, stored or displayed. |
| Debug panel | Parsed events only, in memory, dev builds only, never written to disk. |
| Log fixtures | Raw `Client.txt` excerpts are never committed. `scripts/sanitize-fixtures.ts` replaces character names and strips account names, chat, whispers and instance-server IP addresses first. |
| Settings & profiles | Local only. No personal data beyond file paths and the optional in-game character name. |
| Electron hardening | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, allow-listed IPC, no remote content in windows. |
| Supply chain | Committed lockfile, small dependency surface, `npm audit` in CI. |

Two outbound requests exist, both documented in [`SECURITY.md`](../SECURITY.md):
the update check against GitHub Releases, and the pobb.in/pastebin fetch that
only happens when you paste a link into the importer.
