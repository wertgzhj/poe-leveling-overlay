# Architecture

How the overlay is built and why. For using it, see the
[README](../README.md); for working on it, [`CONTRIBUTING.md`](../CONTRIBUTING.md).

## Scope

The overlay supports levelling through the Path of Exile 1 campaign: the route,
which gems to take as quest rewards, what to buy from vendors, and which gems to
have socketed at your current level. Build-specific content comes from a Path of
Building import; build-independent content (routes) is authored per install.

Deliberately out of scope: trading and pricing, endgame and maps, PoE 2, and item
filters. The passive tree is in as a list (which node to take with your next
point) not as a drawn tree (yet).

## ToS position

This is the constraint everything else is designed around.

| Done | Never done |
|---|---|
| A separate overlay window on top of the game | Reading game memory, injection, process hooks |
| Reading `Client.txt`, the game's own log file | Sending simulated input to the game |
| Showing data, and hotkeys that control the overlay | Automating any part of gameplay |
| Saying it out loud (system voices, Settings → What the overlay shows) | |

The app **only reads** and **sends nothing** to the Path of Exile process.
Hotkeys act on the overlay alone: note that a global hotkey is consumed
system-wide before the game sees it, so the defaults avoid PoE's own binds and
everything is rebindable.

Path of Exile must run in **Windowed Fullscreen**; exclusive fullscreen covers
overlays. This mirrors long-tolerated tools like Awakened PoE Trade and Exile
Leveling.

## Stack

| Area | Choice | Why |
|---|---|---|
| Shell | Electron + electron-builder | Transparent, frameless, always-on-top window; filesystem access and global hotkeys |
| UI | React + TypeScript + Vite | - |
| Styling | Tailwind with central design tokens | Consistent dark, compact overlay |
| State | zustand | Enough for overlay state, no more |
| Log watching | Polling tail: seek to end, then read only appended bytes | `Client.txt` is append-only and reaches hundreds of MB per league, so it is never read whole, except on request, streamed line by line, when the run timer imports old runs. `fs.watch` is unreliable on Windows for files another process appends to, which makes polling the primary mechanism rather than a fallback |
| Settings & profiles | electron-store + JSON in the userData folder | Editable and diffable by hand |

## Processes

The main process owns everything stateful; the renderer only draws.

```
Main
├── OverlayController   The window: transparent, frameless, alwaysOnTop at
│                       'screen-saver' level, backgroundThrottling off (the
│                       overlay never holds focus while you play). Click-through
│                       via setIgnoreMouseEvents(…, { forward: true }), plus a
│                       move/resize mode, a click-through window can't be dragged.
│                       With the compact strip on, one of two views, each with
│                       its own rectangle: the strip (sized to its content,
│                       growing away from its screen edge, strip-place.ts) or
│                       the full panel (its hotkey; Settings always opens here).
├── LogService          Polling tail over Client.txt → parser → tracker.
│                       On start it backscans the last 64 KB to resume zone and
│                       level, then follows appended bytes.
├── GuideService        Loads act1…act10 route files, merges them into one
│                       campaign list, advances the cursor on area events.
├── ProfileService      Build profile with hot reload, gem data, and the active
│                       stage derived from the tracked character's level.
├── TrialsService       Trial-of-Ascendancy state per character.
├── TimerService        Off until switched on in Settings. Times each run from the
│                       Twilight Strand to Kitava in Act 10, from every
│                       line's stamp, while the run's character is in the
│                       world; keeps it in userData/runs.json.
├── TimerWindow         The run timer's own overlay window: placed on its own,
│                       shown with the overlay, following its click-through
│                       and move mode.
├── UpdateService       electron-updater against this repo's GitHub Releases.
├── EditorWindow        A normal window for editing routes and profiles.
└── Hotkeys             globalShortcut: show/hide, click-through, move mode,
                        the full panel over the strip, step forward/back.
                        Rebinding re-registers live.

Renderer (overlay)          Renderer (editor)
├── StripPanel (preview)    ├── RouteEditor
├── MainPanel (frame)       ├── ProfileEditor
│   ├── NoticeBar           └── ProfileLibrary
│   ├── GuideTab
│   ├── GemsTab (gems/: PlanRows, LinkGroup, Legend)
│   └── TrialsTab
├── SettingsPanel (MulePicker, the Gems tab legend)
├── UpdateBanner + VersionBadge
└── DebugPanel (dev only, parsed events, in memory, never written to disk)

Renderer (timer)
└── TimerApp: live clock, where the time went, act splits vs. the best run,
               past runs
```

Renderer and main are connected by an **allow-listed IPC surface**
(`electron/channels.ts`, exposed through `electron/preload.ts`). The renderer is
sandboxed with context isolation and no node integration, so those channels are
the only thing it can reach.

Logic that can be tested without Electron lives in pure modules: the log
parser, tracker and watcher, the guide and profile engines, the trials engine,
the PoB decoder, with the `*/service.ts` files holding the Electron-facing
glue. That split is why the test suite runs on plain Node.

## Data

### Campaign routes: `data/campaign/actN.json`

Steps are keyed by **`areaId`**, the act-scoped, locale-independent id the game
itself uses (`"1_1_1"`). Display names live in `data/areas/<lang>.json`, so route
data never depends on the client language.

Zone *names* are unusable as keys: Acts 6-10 reuse names from Acts 1-5
(Lioneye's Watch (A1/A6), The Forest Encampment (A2/A7), The Sarn Encampment
(A3/A8), Highgate (A4/A9), and several zones besides), and they are localized.

A step carries an `id` (progress is stored against it, so it must be stable), a
`type` (`quest | waypoint | trial | town | boss | kill | enter | hint`), and
`text`. `rewardHint: true` marks a step where the Gems tab should surface the
build's reward choice. `"skeleton": true` on the file marks the shipped
placeholder routes; remove it once an act is written.

Matching is by `areaId` when known and by zone name otherwise, so a route can be
authored before the ids are known.

### Gem data: `data/gems.json`

Per gem: attribute, level requirement, and where it comes from per class,
which quest rewards it, and which vendor sells it in which act after which
quest. **Vendor stock is class-gated in Acts 1-5**; without that dimension the
shopping list would send a Marauder to buy gems Nessa only sells to a Witch.

Siosa (Act 3, after *A Fixture of Fate*) and Lilly Roth (Act 6 onward) sell
almost everything to any class, and the data lists their stock explicitly, so a
gem with no source is one nobody sells, not a gap. Those show as drop/trade.
Where two vendors in one act sell a gem, the one whose quest comes first wins
(the quest order is derived from the reward levels, see `GemData.questRank`):
Clarissa after *Lost in Love*, not Siosa half an act later.

**Which acts a stage's list draws on** (`planWindow`, engine/acquisitions.ts):
the live stage, everything up to the furthest act reached; a stage paged back
to, its own acts (from its level range and `electron/profile/acts.ts`); one
paged forward to, a preview of its acts. Quest picks only for later stages
show on the stages of their own act.

The file is generated from the Path of Exile Wiki's Cargo API
(`npm run fetch-gems`, or the *Fetch gem data* workflow) and re-run per league.
It ships as a resource rather than being bundled, and the app reports a loud
error if it can't be read.

### Passive tree: `data/tree.json`

Per node: name, stats, kind (small, notable, keystone, mastery, jewel socket,
class/ascendancy start), mastery effects, group, links, and its place (x, y,
its group's centre out along its orbit, PoB's angle tables for the 16- and
40-node orbits); plus each group's centre, for the map's arcs. Cut down by
`scripts/fetch-tree.ts` (transform in `scripts/tree-extract.ts`, tested) from
Grinding Gear Games' own export for tool authors,
[grindinggear/skilltree-export](https://github.com/grindinggear/skilltree-export),
~700 KB of its 6.5 MB. Re-run (`npm run fetch-tree`, or the *Fetch tree data* workflow) when a league changes
the tree; a build made for another tree version gets a warning. Read at runtime,
like the gem data.

**The order is computed, not authored, and then editable.** Path of Building
stores a build's trees as specs, usually one per levelling milestone, and each
is only the *set* of allocated nodes. The import (`planFromSpecs`,
electron/profile/tree.ts) turns them into the profile's `passives`: per spec,
the new nodes in the order to take them (from what's allocated, walk to the
nearest notable, keystone or jewel socket the spec adds, taking every node on
the way, then the next nearest; a mastery right after its group's first
notable), plus the nodes the spec drops, as a respec. Ascendancy nodes are a
separate list, two per Labyrinth. It's stored as node ids, so a guide's order
can replace the computed one: in the editor's *Passive tree* section, node by
node within a stage, and the ascendancy's list (two points per Labyrinth) the
same way, checked from the ascendancy's own start (`resortAscendancy`). The editor has no tree data: main names the nodes, flags
each one nothing before it connects to (`checkPlan`, from the class's start,
refunds taken out, a mastery after a notable of its group) and re-sorts a
stage (`resortStage`) over two invoke channels, the plan validated like a
file's first.

**The map** (Passives → *Map*, `electron/profile/tree-map.ts`): main lays out
the piece of the tree around your next points, what's in view, taken by plan
(a stage's respec counted from its start), your next point and the five
after, the links between, arcs along an orbit, and the renderer only draws it
(`profile:passive-map`, asked again when the next point moves). The view is the
next points' bounding box with room around it, at least a few groups wide.

**Which node is due** follows the points the character has: level − 1, plus
every "You have received a Passive Skill Point." line (a Book of Skill used, not
the quest finished), counted per character, once each, the backscan's replays
skipped by their timestamps (`CharacterRuns.addQuestPoint`). A respec gives its
points back: from the stage that refunds nodes on, the plan is that many nodes
further along than the points (`planPosition`), and the plan's total is its
nodes less its refunds. With every point spent as a refunding stage begins,
its first node is due, the respec shown in front of it. The next
ascendancy points follow the Labyrinths the trials service saw beaten. Clicking
a node copies its name for the in-game tree's search box; the renderer asks by
node id, so it can't put arbitrary text on the clipboard.

**One place for the searches** (`electron/searches.ts`): the vendor search,
the tree search and your own regex are *kinds* (`SearchKind`); `searchFor(kind)`
builds the text (from the profile snapshot last pushed, so a copy is exactly
what's on screen) and the Vendor/Tree/Regex buttons, the hotkeys and copying
without a click all go through it and one IPC channel (`clipboard:copy-search`,
the kind checked in main). Your regex is the one for the act the character has
reached (`regexForAct` in `search-regex.ts`: the first *Per act* range that
covers it, else the general one); the reached act is the one the gem plan uses
too, kept per character. Text building is pure (`profile/search.ts`, the tree
window in `tree.ts`); so are the copy rules (`copy-rules.ts`).

**Copying without a click** (Settings → Search & copy, off by default): each
trigger (walking into a town, a level-up) maps to one kind or nothing. Only
changes count, never the state a restart resumes at (`AutoCopyTrigger`). Every clipboard write goes through
`electron/clipboard.ts`, which remembers the overlay's own; copying on its own
replaces only those, an empty clipboard, or a lone quoted search line
(`mayOverwrite`), never a whisper, item or link you copied. That guard is a
setting too (*Keep what you copied yourself*, on by default).

### The compact strip: `electron/strip.ts`, `electron/strip-place.ts`

A preview, off until switched on in Settings → *Overlay*. `stripModel` (pure)
picks what goes under the strip's header, at most `STRIP_LINES` (four): the one
reminder the notice bar would show, the gems of this act to take or buy while
you're in its town, and the next passive point, in that order of importance;
what doesn't fit is "+N more in the full panel". `strip-place.ts` (pure) knows
where Path of Exile's UI leaves room: the band over the XP bar between the flask
buttons and the skill bar, measured on a 2560 x 1440 game with every
combination of vendor, reward, stash, world map, character sheet and inventory
open, as fractions of the screen height (the game scales its UI by height). The
strip starts there, its text at the game's size (20 px on 1440p), and grows away
from the screen edge it sits nearer to, never off the screen.

### Spoken announcements: `electron/announce.ts`

Main watches what the overlay already knows (the zone, the trials, the
profile snapshot, the zone's level against yours) after each zone, level-up
and finished trial, and `Announcer` (`announce-rules.ts`, pure) turns it into
news: only changes, never the state it starts from (a restart, a character
switch or another profile is a baseline), a trial or costly zone once per
character. Moments switched on in Settings → *What the overlay shows* are worded there
(`phrase`, English or German) and sent to the overlay window, which speaks
them with the chosen system voice (`src/lib/speak.ts`), queued, never over
each other.

### Build profiles: JSON, one per build

**Where they live.** Every profile is its own file in `userData/profiles/`,
named once from its name when created (`cyclone-slayer.json`, then
`cyclone-slayer-2.json`) and never renamed: renaming changes `meta.name` inside,
so nothing that remembers a profile by path can be left pointing at nothing. The
active one is `settings.profilePath` (null = the bundled, read-only example), and
`profileByCharacter` remembers each character's. `electron/profile/library.ts`
owns the folder and takes it as a parameter, so it is tested against a real temp
dir; the renderer only ever names a profile by id, never by path.

It used to be two fixed files on a last-write-wins basis: every PoB import went
to `pob-import.json`, every editor save to `profile.json`, which made a second
character's import silently replace the first one's build. Profiles that older
versions referenced from elsewhere on disk are copied in on launch and the
references repointed.

Two independent axes: `stages` is the **loadout per level range**, `gemPlan` is
the **acquisition timeline**, where each gem comes from. An imported build may
also carry `passives`, the tree in order (see *Passive tree* above).

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

**Socket colours are computed, never authored**, each gem's attribute decides
it (Str → red, Dex → green, Int → blue), and a gem with no attribute requirement
gets an any-colour pip. A `gemPlan` entry may carry a `count`: levelling builds
routinely socket the same support twice, so the name alone is not an identity.

The active stage follows the tracked character's level, with the next one shown
as a preview. From this the app derives the shopping list and the reward
recommendation per quest: and, for the game's search boxes, the gems to buy
now as one quoted regex (`electron/profile/search.ts`, shared with the tree's:
quoted so the box doesn't split it at spaces, at most 250 characters, whole
names only).

## Things that shaped the design

**Area detection.** The primary signal is the instance-generation debug line
(`Generating level <N> area "<areaId>"`), which is locale-independent. The
localized "You have entered …" line is the fallback and the source of display
names. A name both halves of the campaign use (The Coast is `1_1_2` and
`2_6_2`) resolves on that fallback to the half you were just in. Campaign ids
are `<part>_<act>_<zone>`; anything else (hideouts, maps, the Labyrinth's
`<n>_Labyrinth_…`) is outside the campaign for the guide, the zone-level hint
and the trials fallback alike (`isCampaignAreaId`, `electron/log/areas.ts`).

**Quest completion is not detectable.** `Client.txt` does not log it. Progress
is driven by area changes, with hotkeys and clicking a step as the correction
mechanism. Town visits deliberately never skip pending steps, so a portal trip
to sell doesn't derail the guide.

**Party play.** Level-up lines fire for party members too, so the tracker binds
progress to one character: adopted from the most frequent name in the backscan,
or pinned explicitly in settings.

**Restart and resume.** Starting the overlay mid-session must not lose state,
so the backscan rebuilds zone, level and character from the log tail, and
progress is persisted per character.

**A reused name is a new run.** Progress is keyed by character name, and names
come back every league. The Twilight Strand only ever sees a new character, but
the log names it on its first level-up, so that is when its run (act, trials, guide
ticks, dismissed reminders) starts over. Choices (its profile,
its mule) carry on.

**Client language.** Two of the three tracked lines are localized by the game.
Only English patterns ship; another language is detected and reported rather
than silently half-working.

**Level for "now", act for "at all".** Whether a gem is for now or for later is
decided by character level against PoE's XP safe range: level is tracked on
every level-up. The furthest act reached (the second number of the zone id,
`1_2_…` = Act 2) decides what's shown at all: a quest in an act you haven't
reached is left out, and the build's links are tinted by act. A gem for later
turns grey; it is never hidden.

## Privacy

No server, no account, no telemetry, no analytics, no crash reporting.

| Concern | Rule |
|---|---|
| Log data | Only the configured patterns are matched; every other line is discarded immediately. Raw lines are never persisted and never leave the machine. Chat and whisper content is never parsed, stored or displayed. The run timer reads the time at the start of every line, and nothing else of the ones the patterns don't match. |
| Debug panel | Parsed events only, in memory, dev builds only, never written to disk. |
| Log fixtures | Raw `Client.txt` excerpts are never committed. `scripts/sanitize-fixtures.ts` replaces character names and strips account names, chat, whispers and instance-server IP addresses first. |
| Settings & profiles | Local only. No personal data beyond file paths and the optional in-game character name. |
| Spoken announcements | The overlay window speaks through the system's installed voices (`speechSynthesis`); the text is built in main from what the overlay already shows. Nothing is sent anywhere, and nothing is spoken until a moment is switched on. |
| Recorded runs | Local only (`runs.json`), and only while the run timer is switched on: area ids and names, load times, your character's name and levels, deaths, claimed skill points, Labyrinths and Pantheon gods. |
| Electron hardening | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, a CSP, allow-listed IPC, no remote content in windows. Every window is held to its own page: navigation elsewhere, `window.open`, webviews and permission requests are refused (`electron/security.ts`, rules in `navigation.ts`). |
| Imports | PoB links: 4 MB download cap, read as a stream; redirects must stay on the paste host. PoB codes: 16 MB cap on what they unpack to. |
| Supply chain | Committed lockfile, small dependency surface, `npm audit` in CI. |

Two outbound requests exist, both documented in [`SECURITY.md`](../SECURITY.md):
the update check against GitHub Releases, and the pobb.in/pastebin fetch that
only happens when you paste a link into the importer.
