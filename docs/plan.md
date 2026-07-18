# PoE1 Leveling Overlay — Project Plan v2

**Date:** 2026-07-16 · **Goal:** A ToS-compliant desktop overlay that supports leveling through the PoE1 campaign (route, quest rewards, vendor purchases, skill tree stages). Build profiles are created semi-automatically via PoB import.

**v2** incorporates the external plan review (2026-07-16). All edits are tracked per section in **Appendix A**.

**Status (2026-07-18):** phases **P0–P6 implemented** (P7 auto-tracking is optional and unstarted — needs the GGG OAuth email). Notable scope changes from v2, all in Appendix A: routes and build profiles are owner-authored files (no imported route data, no editor window); the gem-source *engine* is done but the bulk `sources` dataset is a pending poewiki pull; the Windows release is built in CI. Feature-by-feature status and the manual test checklist live in [`TESTING.md`](TESTING.md).

---

## 1. Goals & Non-Goals

**Goals (final scope):**
- Complete campaign guide for Acts 1–10, advancing automatically via area detection
- Build-dependent content (gems, vendor purchases, tree stages) generated from PoB import
- Build-independent content (quests, waypoints, trials, layout hints) as curated static data
- Simple configuration: one build = one profile, switchable without code changes

**Non-goals (v1):**
- No trade/pricing features, no endgame/maps, no PoE2
- No custom skill tree renderer (see §8, tree display)
- No item filter management

---

## 2. ToS Guardrails (hard, non-negotiable)

| Allowed | Forbidden |
|---|---|
| Separate overlay window on top of the game | Memory reading, injection, process hooks |
| Reading `Client.txt` (official log file) | Simulated inputs to the game (keystrokes, clicks) |
| Displaying static data & hotkeys that only control the overlay | Any form of gameplay automation |

Consequence: the tool **only reads** `Client.txt` and **sends nothing** to the PoE process. Hotkeys act on the overlay only — note that global hotkeys are *intercepted system-wide before the game sees them* (nothing is ever sent to the game, but the combo is consumed), so defaults must avoid PoE's own binds and be rebindable from P0. PoE must run in **Windowed Fullscreen** mode (exclusive fullscreen covers overlays).

Reference tools with the same approach, tolerated by GGG for years: Awakened PoE Trade, Exile Leveling, Lailloken UI.

---

## 3. Tech Stack

| Area | Choice | Rationale |
|---|---|---|
| Shell | Electron + electron-builder (Windows) | Transparent, frameless, always-on-top window; file system access & global hotkeys |
| UI | React + TypeScript + Vite | Familiar stack (same as FamilyHub) |
| Styling | Tailwind with central design tokens | Consistency, dark compact overlay design |
| State | zustand | Lightweight, sufficient for overlay state |
| Log watcher | Polling tail: seek-to-end + incremental reads of appended bytes (`fs.stat` size delta every ~250–500 ms) | `Client.txt` is append-only and grows to hundreds of MB per league — never read the full file; `fs.watch` is unreliable on Windows for files appended by another process, so polling is the **primary** mechanism, not a fallback |
| Settings/profiles | electron-store + JSON files in the userdata folder | Easy to edit, versionable |

---

## 4. Architecture

```
Main process
├── WindowManager      Overlay window: transparent, frameless, alwaysOnTop ('screen-saver' level),
│                      backgroundThrottling: false (overlay never has focus while playing!),
│                      click-through via setIgnoreMouseEvents(true, { forward: true }),
│                      move/resize mode (a click-through window cannot be dragged)
│                      + separate editor window (regular window for profile maintenance)
├── LogWatcher         Polling tail on Client.txt → events: area:entered, player:levelup
│                      Startup: backscan last ~64 KB for the most recent area/level lines (resume)
├── ProfileStore       Load/save build profiles & settings + last-known progress state
│                      (level, current step, checkedIds — survives overlay restarts)
├── ApiTracker         (optional) OAuth + GGG API refresh → progress:updated (§7)
└── Hotkeys            globalShortcut: overlay on/off, click-through, move/resize, step forward/back
                       Rebindable via SettingsPanel (P0.5); editing a bind live re-registers the
                       global shortcut. Defaults must not collide with PoE binds

Renderer (overlay)
├── GuidePanel         Current route step + upcoming steps
├── GemPanel           Loadout of the current stage (links + socket colors) + purchases/pickups
├── TreePanel          Current tree stage (list view, see §8)
├── SettingsPanel      Small in-overlay settings: hotkey rebinding (capture combo + conflict
│                      check), opacity, click-through default, Client.txt path
│                      (P0.5; grows over later phases)
└── DebugPanel         Parsed events only, in-memory (dev only, see §11.1)
```

IPC events (main → renderer): `area:entered {areaId, name, areaLevel, ts}`, `player:levelup {name, charClass, level}`, `profile:changed`, `progress:updated {checkedIds}`, `overlay:state {visible, clickThrough, moveMode}`.
Renderer → main: `settings:set {patch}` — persists the change and, when the `hotkeys` key changes, re-registers the global shortcuts without a restart.

---

## 5. Data Model (two layers)

### 5.1 Static campaign data (build-independent, curated once)

`data/campaign/act1.json … act10.json`

Steps are keyed by **`areaId`** — the act-scoped, locale-independent area id the game itself uses (e.g. `"1_1_1"`). Display names live in `data/areas/<lang>.json` (id → name), so campaign data never depends on client language. Zone *names* are unusable as keys: Acts 6–10 reuse names from Acts 1–5 (Lioneye's Watch A1/A6, The Forest Encampment A2/A7, The Sarn Encampment A3/A8, Highgate A4/A9; The Coast / The Mud Flats / Prisoner's Gate A1↔A6, The Crossroads / Chamber of Sins A2↔A7), and they are localized.

```json
{
  "act": 1,
  "steps": [
    {
      "id": "a1-twilight-strand",
      "areaId": "1_1_1",
      "type": "kill",
      "text": "Kill Hillock, then enter Lioneye's Watch",
      "hints": ["First waypoint is in town"]
    },
    {
      "id": "a1-mud-flats",
      "areaId": "1_1_3",
      "type": "quest",
      "questId": "breaking-some-eggs",
      "text": "Collect the 3 glyphs (rhoa nests)",
      "rewardHint": true
    }
  ]
}
```

(`areaId` values above are illustrative — the real ids come from the converted areas data and are validated against P1 log fixtures.)

- `type`: `quest | waypoint | trial | town | boss | kill | enter | hint`
- `rewardHint: true` → the GemPanel shows the build-specific reward choice at this step
- **Data source:** convert the route & quest data of the open-source project *exile-leveling* (MIT license — verified) into our schema instead of hand-curating all 10 acts; its data model is built on the same area ids, so keying by `areaId` falls out of the conversion. Supplement from the PoE wiki. Note: exile-leveling is a **website** — it does not read `Client.txt`; it serves as the data & PoB-import reference, not as a log-watching reference. Keep its MIT license notice (`NOTICE` file).

### 5.2 Gem availability data (static, per league patch)

`data/gems.json` — per gem: which quest rewards it (per class), when it becomes purchasable from which vendor **and for which classes** (act, NPC, prerequisite quest, classes), attribute, level requirement. **Vendor stock is class-gated in Acts 1–5** — without the class dimension the shopping list will send a Marauder to buy gems Nessa only sells to a Witch. Siosa (Act 3, after "A Fixture of Fate") and Lilly Roth (after Act 6) sell almost everything regardless of class — fallback logic. Gems with **no campaign source for the build's class** (drop-only, or off-class before Siosa/Lilly) must be representable: `{ "kind": "unobtainable", "note": "trade/drop" }` instead of an error.

**Source:** prefer exile-leveling's `seeding/` pipeline output (it already generates areas, quests, per-class quest/vendor rewards, and gems from game data via exile-export) — run or vendor it per league. If going direct instead: the original RePoE is unmaintained; use the maintained fork (e.g. lvlvllvlvllvlvl/RePoE).

### 5.3 Build profile (build-dependent, one file per build)

`profiles/<name>.json`

Two separate axes: `stages` = **loadout per level range** (guide/PoB convention "Level 1–12"), `gemPlan` = **acquisition timeline** (where each gem comes from).

```json
{
  "meta": { "name": "RF Chieftain", "class": "Marauder", "character": "MyChieftain", "pobSource": "..." },
  "stages": [
    {
      "range": [1, 11],
      "label": "Level 1–11",
      "socketGroups": [
        { "gems": ["Rolling Magma", "Arcane Surge", "Combustion"], "note": "3L as soon as available" }
      ],
      "treeSpec": { "pobSpecIndex": 0, "points": 12 }
    },
    {
      "range": [12, 27],
      "label": "Level 12–27",
      "socketGroups": [
        { "gems": ["Armageddon Brand", "Combustion", "Elemental Focus"] }
      ]
    }
  ],
  "gemPlan": [
    { "gem": "Rolling Magma", "count": 1, "source": { "kind": "questReward", "questId": "enemy-at-the-gate" } },
    { "gem": "Flame Wall", "count": 1, "source": { "kind": "vendor", "npc": "Nessa", "act": 1, "afterQuest": "breaking-some-eggs" } }
  ]
}
```

- `meta.character` (optional): the in-game character name — binds log events to *this* character (see §8, party play). If unset, first-seen level-up name + confirmation toast; the API module resolves it automatically when enabled (§7).
- `gemPlan` entries carry a `count`: leveling builds routinely socket the same gem twice (duplicate supports across links), so gem name alone is not an identity.

**Socket colors are computed, not configured:** each gem's attribute from `gems.json` (Str→red, Dex→green, Int→blue) → the GemPanel renders links and colors automatically from `socketGroups`. The active stage switches automatically via the `player:levelup` event; the next stage is shown as a preview ("from level 12: …").

From this, the app automatically generates: a **shopping list per town visit** (keyed by act + town — town names repeat across acts) and a **reward recommendation per quest** (matching gemPlan × gems.json × class).

---

## 6. PoB Import (semi-automatic)

1. **Input:** PoB export string (base64-URL → zlib inflate → XML) or pobb.in link (raw-paste endpoint). Accepted link forms decided in P4 — v1: raw string + pobb.in; poe.ninja/pob links are also in the wild (backlog).
2. **Parsing:** `<Build>` (class/ascendancy), `<Skills>` / `<SkillSet>` (newer PoB groups socket groups into skill sets, gem names/levels), `<Tree>` (specs with title + node IDs — PoB leveling builds usually contain multiple specs as stages)
3. **Stage detection:** leveling PoBs label socket groups, skill sets, and specs with **either level ranges ("Level 1–12") or acts ("Act 1", "Act 5")** — the regex accepts both conventions; act labels map to level ranges via a static act→level table. The **mapping wizard** kicks in for unlabeled or ambiguous groups, confirms spec order, and **validates stage ranges for gaps/overlaps** (imported labels are messy; normalize before saving). Hence "semi-automatic".
4. **Enrichment:** for each gem, determine the earliest source automatically (class quest reward vs. vendor purchase, class-aware per §5.2) → generate the gemPlan, manually adjustable afterwards. Gems without a campaign source for this class are marked "trade/drop — not obtainable en route", never silently dropped and never a hard error.

---

## 7. Automatic Progress Tracking (optional module)

**What `Client.txt` cannot do:** vendor purchases, quest completions, gem socketing, and passive allocations are **not logged**. The log only yields areas and level-ups.

**What the official API can do (ToS-compliant):** GGG offers an official OAuth API for third-party tools. Its character endpoints return equipped items *including socketed gems*, the main inventory, and the allocated passive tree — enough to check off most build-related plan items automatically.

| Plan item | Auto-detectable? | Source |
|---|---|---|
| Gem acquired (reward or purchase) | Yes — gem appears in inventory/sockets | Character API |
| Link setup live (planned socketGroup socketed) | Yes — compare planned vs. actual socket groups | Character API |
| Tree stage allocated | Yes — allocated node IDs vs. spec | Passive tree API |
| Level / active stage | Yes | Client.txt |
| Route step / area | Yes | Client.txt |
| Active character (name) | Yes — character list; auto-binds level-up events (§8) | Character API |
| Quest completed | No (neither logged nor exposed via API) | manual / zone heuristic |

**Design rules:**
- Event-driven refresh instead of a constant polling loop: fetch on `area:entered` (town zones) and `player:levelup`, plus a manual refresh button; respect GGG rate-limit headers with backoff.
- Expectation management: API state can lag by ~1–2 minutes → check-offs are near-real-time, not instant.
- OAuth 2.0 with PKCE (public client). Confirmed against GGG's developer docs: public clients use Authorization Code + PKCE with a **local (loopback) redirect URI** and no client secret; tokens stored locally only. Verify current scope names (e.g. `account:characters`) during implementation.
- **Registration is manual and slow:** OAuth clients are registered by emailing `oauth@grindinggear.com`; GGG treats requests as low priority (weeks, worse around league launches). The registration email is therefore sent during **P3**, not P7 (§9) — otherwise P7 starts with an indefinite external block.
- Fully optional and **off by default** — without it the tool runs 100% offline (§11.1). Manual one-click check-off (P3) remains the base mechanism and the fallback.

---

## 8. Open Design Decisions & Risks

| Topic | Recommendation |
|---|---|
| **Tree display** | v1: stages as a text list (title, point count, note) + "Open in PoB" button. A custom tree renderer is a project of its own — deliberately out of scope. |
| **Area detection** | **Primary signal: the instance-generation debug line** — `Generating level <N> area "<areaId>" with seed <…>` — act-scoped area id, locale-independent, and it carries the monster level for free (enables an "underleveled" hint later, backlog). The localized `You have entered <name>.` INFO line is the fallback/cross-check only. Exact line format **verified against real fixtures at the start of P1** (see §12) — do not build on the assumed format. |
| **Quest completion detection** | `Client.txt` does not log quest completions. Progress is driven primarily by area changes; forward/back hotkey as correction. Towns are visited multiple times → always jump to the next *open* step. |
| **Party play / whose level-up?** | Level-up lines fire for **party members too**. Parse name + class from the line and bind progression to `meta.character` (§5.3): if unset, adopt the first-seen name with a confirmation toast; the API resolves it automatically when enabled (§7). Class mismatch (log says Witch, profile says Marauder) → warning toast. |
| **Restart/resume** | Overlay start mid-session must not lose state: persist last-known progress (level, current step, checkedIds) in electron-store **and** backscan the last ~64 KB of `Client.txt` on startup for the most recent area/level lines. |
| **Patch dependency** | Re-check gem/quest data per league; record the `data/` version in the profile. |
| **Client.txt path** | Configurable; defaults: Steam `...\steamapps\common\Path of Exile\logs\Client.txt`, standalone `...\Grinding Gear Games\Path of Exile\logs\Client.txt` |
| **Log lines (regex)** | With area ids as the primary zone signal, per-language patterns are only needed for `levelUp` (and the `You have entered` fallback): patterns per client language in `data/log-patterns/<lang>.json`. Language as a setting + optional auto-detection via sample lines. v1 ships `en` (level-up: `: (.+?) \((\w+)\) is now level (\d+)` — captures name + class + level; fallback zone: `] : You have entered (.+)\.`), validated against real log fixtures. Adding a language = one new pattern file, no code changes. Area *names* per language live in `data/areas/<lang>.json` for display only (v1: only `en` populated) — they are never used for matching. |

---

## 9. Phase Plan

| Phase | Content | Definition of Done |
|---|---|---|
| **P0 Scaffold** | Electron shell, transparent overlay (`backgroundThrottling: false`, alwaysOnTop `'screen-saver'` level), hotkeys (on/off, click-through via `setIgnoreMouseEvents(true, {forward:true})`, move/resize mode; defaults off PoE binds, rebinding UI lands in P0.5), settings persistence, dummy panel, README skeleton | Overlay sits on top of PoE (Windowed Fullscreen), keeps updating while the game has focus, hotkeys work; checked at DPI scaling ≠ 100% and on multi-monitor |
| **P0.5 Settings panel** | Small in-overlay `SettingsPanel` (§4): rebind the three hotkeys (capture a combo, validate the accelerator, show registration conflicts), edit opacity, click-through default, and the `Client.txt` path. `settings:set` IPC persists changes; hotkey edits re-register `globalShortcut` live. Bumped ahead of the P3 editor. | Hotkeys are rebindable from inside the overlay; a rebind takes effect without restart, survives relaunch, and a conflicting/failed bind is surfaced rather than silently dropped |
| **P1 LogWatcher** | **Starts with fixture capture:** real `Client.txt` lines (English client) through `sanitize-fixtures.ts`, then: polling tail, area-id + level-up parsing, startup backscan/resume, DebugPanel | Area changes in game appear live in the overlay; parser tests green against real fixtures; overlay restart mid-session resumes level + area correctly |
| **P2 Route format + guide** | Schema from §5.1 (areaId-keyed), GuidePanel with auto-advance + manual forward/back, **pilot: Act 1 complete** | Act 1 playable with the guide tracking along; a town visit via portal and return does **not** derail auto-advance |
| **P3 Profile schema + editor** | Build profile JSON, editor window (manual maintenance), GemPanel with generated shopping list. **In parallel: send the GGG OAuth client-registration email** (`oauth@grindinggear.com`, §7) — approval takes weeks and gates P7 | A manually created profile drives gem/reward displays in Act 1; registration email sent |
| **P4 PoB import** | Decoder, parser (Skills + SkillSets), stage detection for both label conventions + mapping wizard (incl. range gap/overlap validation), enrichment via gems.json incl. "trade/drop" marking | PoB link in → working profile out (with manual touch-up) |
| **P5 Full gem data** | gems.json for all campaign gems (source: exile-leveling seeding output / maintained RePoE fork), class logic incl. class-gated vendor stock | Reward recommendation + shopping list correct for any class |
| **P6 Full campaign** | Routes for Acts 2–10 (base: convert exile-leveling data), trials tracker, polish (opacity, position, compact mode), complete user guide incl. SmartScreen note (unsigned .exe) | Entire campaign playable with the overlay alone; README covers install → profile → play |
| **P7 Auto-tracking (optional)** | OAuth flow (PKCE, loopback redirect) against the official GGG API — registration already granted (P3), event-driven refresh (town entry, level-up, manual button), matching items/passives against the profile, character-name auto-binding | Acquired gems, live socket links, and allocated tree points check themselves off within ~1–2 min; off by default |

Backlog (post-v1): vendor recipe hints (movement speed boots, +1 wand), lab layout links, multiple profiles per character, auto-update, code signing, underleveled/XP-penalty hint (area level from the Generating line vs. character level), poe.ninja/pob link import.

---

## 10. Repo Structure

```
poe-leveling-overlay/
├── electron/          main.ts, logWatcher.ts, hotkeys.ts, profileStore.ts, apiTracker.ts
├── src/               React app (overlay)
│   ├── panels/        Guide, Gems, Tree, Settings, Debug
│   ├── stores/        zustand
│   └── styles/        tokens.css
├── editor/            Editor window (separate Vite entry)
├── data/              campaign/, areas/ (id → name per language), gems.json, log-patterns/  (versioned, per patch)
├── profiles/          Example profile
├── scripts/           sanitize-fixtures.ts (anonymizes Client.txt fixtures)
├── docs/              this document, ADRs
├── README.md          usage guide (see §11.2)
├── NOTICE             third-party attribution (exile-leveling, MIT)
└── LICENSE            MIT
```

---

## 11. Public-Repo Readiness: Privacy & Documentation

### 11.1 Privacy by design (local-only)

No server, no account, no telemetry, no analytics, no crash reporting. The only network calls are the optional, user-initiated pobb.in fetch during PoB import and — only if explicitly enabled — the official GGG API for auto-tracking (§7). Without both, the tool runs fully offline.

| Concern | Rule |
|---|---|
| Log data | The LogWatcher matches only the configured patterns (area generation, `levelUp`, zone fallback) and discards every other line immediately. Raw log lines are never persisted and never leave the machine. Chat and whisper content is never parsed, stored, or displayed. |
| DebugPanel | Shows parsed events only, in-memory; a raw-line view exists in dev builds only and is never written to disk. |
| Log fixtures | Never commit raw `Client.txt` excerpts. `scripts/sanitize-fixtures.ts` replaces character names and strips account names, chat, whisper lines, **and instance-server IP addresses** ("Connecting to instance server at …") before anything lands in the repo. |
| Settings & profiles | Stored locally (electron-store / JSON in userdata). They contain no personal data beyond local file paths and the optional in-game character name, which never leave the machine. |
| Electron hardening | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, allow-listed IPC channels, no remote content loaded into windows. |
| Supply chain | Committed lockfile, minimal dependency surface, `npm audit` in CI. |
| GGG API (optional) | Only active when the user enables auto-tracking (§7) and completes OAuth. Requests go exclusively to the official GGG API; tokens are stored locally; no third-party servers involved. Off by default. |
| Disclosure | README contains a short "Privacy" section stating all of the above — in the default configuration, no data ever leaves the local machine. |

Issue-template hint: warn users not to paste raw log excerpts into bug reports.

### 11.2 Documentation (minimal usage guide)

`README.md` is a deliverable, not an afterthought:

1. What it is + ToS compliance statement (summary of §2) + standard fan-tool disclaimer ("not affiliated with or endorsed by Grinding Gear Games")
2. Install: download release or build from source (note: unsigned releases trigger a SmartScreen warning — document the "More info → Run anyway" path, or budget for code signing later)
3. Setup: set the `Client.txt` path, switch PoE to Windowed Fullscreen
4. Hotkey table (and how to rebind)
5. Create a build profile: PoB import in three steps
6. Troubleshooting: overlay invisible → fullscreen mode; no zone detection → path/client language
7. Privacy section (§11.1)

License: MIT (+ `NOTICE` for exile-leveling attribution). Phase integration: README skeleton ships with P0, each phase updates its affected sections, and the complete user guide is part of the P6 DoD.

---

## 12. Getting Started in Claude Code

Start the first session with this document in the repo (`docs/plan.md`) and assign **P0 only**. Keep the approach proven in FamilyHub v2: small phases, sign off each phase against its DoD, no scope creep. Core of the start prompt:

> "Read docs/plan.md. Implement phase P0 only: Electron + React + Vite + TS + Tailwind, a transparent always-on-top overlay with hotkeys for visibility and click-through, electron-store for settings. Nothing from P1+."

**At the start of P1** (not later): launch PoE once and capture real `Client.txt` lines (English client) as fixtures — including the `Generating level … area "…"` lines and a level-up in a party — and run them through `scripts/sanitize-fixtures.ts` before committing (§11.1). The parser is developed against real data, not assumed formats; the area-id line format in §8 is to be confirmed by exactly these fixtures.

---

## Appendix A: Changelog v1 → v2

Findings from the 2026-07-16 plan review, folded in per section:

- **§2 ToS:** clarified that global hotkeys intercept key combos system-wide (game never sees them) → defaults off PoE binds, rebindable from P0.
- **§3 Tech stack:** log watcher spec made concrete — polling (`fs.stat` size delta) is the *primary* mechanism (`fs.watch` unreliable on Windows for cross-process appends); seek-to-end + incremental reads mandatory (Client.txt reaches hundreds of MB).
- **§4 Architecture:** overlay window requirements added (`backgroundThrottling: false`, `'screen-saver'` alwaysOnTop level, `forward: true` click-through, move/resize mode); LogWatcher gained startup backscan; ProfileStore persists last-known progress; IPC events renamed/extended — `area:entered {areaId, name, areaLevel}`, `player:levelup {name, charClass, level}`.
- **§5.1 Campaign data:** steps now keyed by locale-independent `areaId` instead of localized zone names (zone names repeat across Acts 1–5 / 6–10 and are localized); display names moved to `data/areas/<lang>.json`; `type` enum fixed (added `kill`, `enter` — v1's own example used `kill` without declaring it); exile-leveling role clarified (website; data & PoB reference, not a log-watching reference; MIT verified, NOTICE file added).
- **§5.2 Gem data:** vendor availability modeled **per class** (class-gated stock in Acts 1–5); "unobtainable en route" (drop-only / off-class) representable; preferred source switched to exile-leveling's seeding pipeline output; RePoE original flagged unmaintained → maintained fork.
- **§5.3 Profile:** `meta.character` added (binds log events to the right character); `gemPlan` entries gained `count` (duplicate gems are common).
- **§6 PoB import:** `<SkillSet>` parsing added; stage-label regex accepts both "Level X–Y" and "Act N" conventions; wizard validates range gaps/overlaps; unobtainable gems marked instead of failing; pobb.in raw endpoint noted, poe.ninja/pob → backlog.
- **§7 Auto-tracking:** OAuth registration reality documented (email to `oauth@grindinggear.com`, low priority, weeks of lead time) → registration email moved to **P3**; public-client details confirmed (Authorization Code + PKCE, loopback redirect, no secret); character-name auto-binding added to the capability table.
- **§8 Decisions:** area detection rewritten — primary signal is the `Generating level <N> area "<id>"` debug line (act-scoped, locale-independent, carries monster level), `You have entered` demoted to fallback, exact format to be verified against P1 fixtures; new rows for **party-play level-up binding** and **restart/resume**; log-pattern localization burden reduced to the level-up line; level-up regex now captures name + class.
- **§9 Phases:** P0 DoD extended (throttling, z-order level, DPI/multi-monitor check); P1 now *starts* with fixture capture (was "before P2" — the parser phase needs the real formats) and includes resume in its DoD; P2 DoD includes a town-revisit scenario; P3 sends the GGG registration email; P6 documents SmartScreen; backlog gained underleveled hint, code signing, poe.ninja import.
- **§10 Repo:** `data/areas/` and `NOTICE` added.
- **§11 Privacy:** fixture sanitizer also strips instance-server IPs; README disclaimer ("not affiliated with GGG") added; settings row mentions the stored character name.
- **§12 Getting started:** fixture capture moved to the start of P1 and now explicitly includes the area-generation line and a party level-up.

### Post-v2 adjustments

- **2026-07-18 — release versioning from tags; dev builds stay unversioned:** the Windows workflow's manual (`workflow_dispatch`) runs are dev builds — artifact only, no GitHub Release, version stays `package.json`'s `0.0.0`. A `v*` tag is the only thing that cuts a release, and the release version is taken **from the tag** (`v0.1.0` → `0.1.0`) via `electron-builder -c.extraMetadata.version`, so `package.json` is never bumped for development. Consolidated status + manual test checklist added at `docs/TESTING.md`.
- **2026-07-18 — P6 packaged Windows release via CI:** electron-builder produces an **NSIS installer** (Start Menu + Desktop shortcuts) and a **portable single-exe**, both double-clickable; icon is a generated 256² `.ico` (make-icon now emits PNG + ICO). Built on a **Windows GitHub Actions runner** (`.github/workflows/build-windows.yml`, `workflow_dispatch` + `v*` tags → GitHub Release) because electron-builder can't target Windows from Linux without wine, and the Electron binary download is egress-blocked in the dev sandbox. Added a lightweight `ci.yml` (typecheck + tests + bundle + `npm audit`, Linux) — closes the plan's "npm audit in CI" supply-chain item. Unsigned (SmartScreen "Run anyway"); code signing remains backlog.
- **2026-07-18 — Multi-act campaign guide + fallback route skeletons (Acts 2–10):** the guide now loads `act1.json … act10.json`, each resolved from the owner's `userData/routes/` override first then the bundled `data/campaign/`, and merges them (`combineRoutes`, pure + tested) into one campaign step list tagged by act — so it advances across act boundaries instead of dead-ending after Act 1, with per-act hot reload and cross-act duplicate-id detection. Bundled Acts 2–10 are **honest fallback skeletons** (confident town/boss zones where known, high-level notes elsewhere, non-matchable placeholders as `hint` steps) explicitly meant to be rewritten — "always the possibility to write own routes" preserved via the per-act override. Panel shows the current act in the title + act dividers. Act 1 stays the capture-verified route.
- **2026-07-18 — P6 started: Trials of Ascendancy tracker (routes Acts 2–10 stay owner-authored):** the six normal-Labyrinth trials tracked as a third overlay tab — auto-checked when the log reports entering the trial's zone (name match, prefix-tolerant), manual toggle as correction, persisted per character (same pattern as the guide). Trial zones embedded in `electron/trials/engine.ts`, flagged provisional (verify from the 🐞 panel). Because the owner authors routes, P6's "routes for Acts 2–10" is *their* content, not converted data; remaining P6 items are compact/density polish and a packaged Windows release (electron-builder config present; must be built on Windows/wine). Engine unit-tested.
- **2026-07-18 — gem-data source = poewiki (owner-endorsed), but blocked from the build sandbox:** the owner confirmed poewiki.net as the source for the (still-empty) P5 gem `sources`. It's egress-blocked from this environment (403 via curl and WebFetch), so the data pass — pull attributes + `quest_rewards`/`vendor_rewards` via the wiki's Cargo export on a network that can reach it, transform into the `gems.json` `sources` schema — is a follow-up to run in a reachable environment, not routed around here.
- **2026-07-18 — P5 gem-data engine done; bulk source data deferred (sourcing decision open):** built the full class-aware gem-source layer — `data/gems.json` schema extended to `{ attr, sources: [{ kind: quest|vendor, act, quest?, npc?, classes? }] }`; `GemData.earliestSource(gem, class)` (class filter + earliest act, quest-before-vendor); acquisitions now resolve each planned gem's source **live** per class (authored `gemPlan.source` overrides, else looked up), feeding the reward recommendation + vendor shopping list "for any class" — the DoD's *logic*. Socket-colour coverage expanded to ~70 curated gems (confident, flagged). **The `sources` data is intentionally shipped empty:** accurate per-class quest/vendor availability for the full gem list can't be authored reliably by hand and needs a **verified dataset** — the remaining P5 decision is where it comes from (careful manual curation vs. converting a maintained gem-data export; the latter is "other-project data", owner's call, mirroring the routes decision). Until it's filled, reward/buy hints run off authored/PoB-imported `gemPlan.source`. Engine + resolution are unit-tested with controlled data.
- **2026-07-18 — P4 PoB import done (no editor window / mapping-wizard UI):** decode (base64url + zlib) → parse (fast-xml-parser) → our profile schema, as a pure, tested module (`electron/profile/pob.ts`) plus a headless CLI (`npm run import-pob`) and an in-overlay import field (Settings → Build profile) that also fetches `pobb.in` / `pastebin` links. Reads class/ascendancy from `<Build>` and socket groups + stage level-ranges from `<SkillSet>`/`<Skill>` titles ("Level 1-12" or "Act N", both handled; unlabelled builds get evenly-split guessed ranges + a loud warning). The plan's interactive **mapping wizard is dropped** in favour of "import always produces a valid, editable profile + warnings" — consistent with the file-authoring model (no editor window). Enrichment is partial: `gemPlan` lists each unique gem (with counts for duplicates) but leaves `source` blank until full gem data (P5). Tree specs are not imported (tree display is out of scope, §8). Verified end-to-end headlessly: a fixture encoded to a real PoB code round-trips through the CLI to a valid profile.
- **2026-07-18 — P3 built without the GGG email; profiles are owner-authored files:** the OAuth registration email (`oauth@grindinggear.com`) was **removed from P3's critical path** — it only gates P7 (optional auto-tracking) and the owner opted not to pursue it now, so P3 shipped with no GGG dependency. Following the route decision, **build profiles are hand-written JSON with hot reload** (`data/profiles/example.json`, or a `Settings → Build profile` path override; `userData`/resources when packaged) rather than a dedicated editor window — the plan's P3 "editor window" is **deferred/dropped** in favour of file authoring, consistent with how routes work and the owner's stated preference. Delivered: profile schema + validation with author-facing errors, `data/gems.json` (gem → attribute, partial; full data still P5) for computed socket colours (Str/Dex/Int → R/G/B), the pure engine (active-stage selection with gap/clamp, coloured socket groups, reward/vendor acquisition split), a **Gems tab** beside the guide (level-driven stage, next-stage preview, reward-hint highlight when the current route step is a reward step, class-mismatch warning), and per-file hot reload. PoB import (P4) will *generate* these profiles; the schema + engine it targets now exist.
- **2026-07-16 — hotkey settings bumped up:** inserted phase **P0.5 (Settings panel)** ahead of the P3 editor so hotkeys are rebindable from inside the overlay early, instead of only via the settings file. §4 restores the renderer-panel block and adds `SettingsPanel` plus the `settings:set` IPC (hotkey edits live re-register `globalShortcut`); §10 lists the panel. P0 shipped with hotkeys rebindable in config only — the UI is P0.5.
- **2026-07-17 — P2 route data is owner-authored (scope change):** the owner writes all route content themselves — **no conversion of exile-leveling route data** (§5.1's data-source note and P6's "convert exile-leveling data" no longer apply to routes; the in-game quest tracker covers quest details). P2 therefore delivers the schema, validation with author-facing errors, **hot reload on save** (`data/campaign/` in dev, `userData/routes/` override when packaged), matching by areaId *or* zone name (so steps can be authored before an id is known), the auto-advance engine (positional "next open step"; towns only advance as current/next step so portal trips never skip work; `Hideout*`/`MapWorlds*` ignored), per-character progress, forward/back hotkeys (`Ctrl+Shift+N`/`P`), and a minimal Act 1 template covering only capture-verified zones as the starting point for the owner's own writing. Gem/vendor data sourcing (§5.2, P5) is unaffected by this decision.
- **2026-07-17 — P1 fixture validation done (real capture, `data/fixtures/act1-real.log`):** the three assumed patterns (`areaGenerated`, `levelUp`, `zoneEntered`) match the live English client **verbatim**; §8's "verify against fixtures" caveat is closed for them (the chat-sigil filter stays assumption-based — chat is stripped from fixtures). Corrections learned: the campaign id scheme is sub-numbered (`1_1_2` = The Coast, `1_1_3` = The Mud Flats, `1_1_4_1` = The Submerged Passage) — unverified ids were removed from `data/areas/en.json` because a wrong id is worse than a missing one; **non-campaign instances use word ids** (`Hideout*`, `MapWorlds*`) → **P2 route matching must ignore these** (entering your hideout is not a route step); towns generate at a fixed area level (13 for Lioneye's Watch); the Generating line preceded *every* area entry in the capture, confirming the fallback path is genuinely fallback-only. Tracker hardened: the "entered" line's localized name is adopted while keeping the Generating id, so a wrong area-map entry self-heals.
