# Security

## Reporting

Report a vulnerability privately through GitHub's
[**Report a vulnerability**](https://github.com/wertgzhj/poe-leveling-overlay/security/advisories/new)
form rather than a public issue. This is a hobby project maintained by one
person — expect a reply in days, not hours.

## What this app actually does

Worth knowing before assessing anything, because it bounds the attack surface:

- It **reads one file**, the game's own `Client.txt`, and matches a handful of
  regexes against each line. Every other line is discarded immediately.
- It **never writes to, injects into, or sends anything to** the Path of Exile
  process. No memory access, no simulated input, no automation.
- It stores settings, your route/profile files and progress locally
  (`electron-store`, in the OS userData folder). No server, no account, no
  telemetry.
- Renderer windows run **sandboxed with context isolation**, `nodeIntegration`
  off, and reach the main process only through an explicitly allow-listed IPC
  surface (`electron/channels.ts`, exposed via `electron/preload.ts`).

Outbound network requests, in full:

| When | Where | Carries |
|---|---|---|
| On launch and every 6h | GitHub Releases (update check) | nothing but the request itself |
| Only when you paste a link into the PoB importer | `pobb.in` / `pastebin.com` | the URL you pasted |

Anything beyond that would be a bug worth reporting.

## Supported versions

The latest release only. Fixes ship as a new release; the in-app updater moves
installs forward automatically (it never rolls back, so a broken version is
superseded by a higher one rather than withdrawn).

## Known, accepted

- **The Windows build is unsigned.** SmartScreen warns on first run. Code
  signing needs a paid certificate; until then, only download releases from
  this repository and take the warning seriously anywhere else.
- **Build-time dependency advisories.** `npm audit --omit=dev` — the code that
  actually ships — is clean and checked in CI. Some `electron-builder`
  dependencies carry advisories that need a breaking upgrade; they run on the
  build machine and are not part of any release artifact.
