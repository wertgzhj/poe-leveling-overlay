# Security

## Reporting

Report a vulnerability privately through GitHub's
[**Report a vulnerability**](https://github.com/wertgzhj/poe-leveling-overlay/security/advisories/new)
form rather than a public issue. This is a hobby project maintained by one
person: expect a reply in days, not hours.

## What this app actually does

Worth knowing before assessing anything, because it bounds the attack surface:

- It **reads one file**, the game's own `Client.txt`, and matches a handful of
  regexes against each line. Every other line is discarded immediately. To
  *find* that file on first launch it also looks, read-only, at Steam's library
  list (`libraryfolders.vdf`), Epic's install manifests and one registry value
  (`HKCU\Software\Valve\Steam` → `SteamPath`): nothing else, and nothing of
  it leaves the machine.
- It **never writes to, injects into, or sends anything to** the Path of Exile
  process. No memory access, no simulated input, no automation.
- It stores settings, your route/profile files and progress locally
  (`electron-store`, in the OS userData folder). No server, no account, no
  telemetry.
- Renderer windows run **sandboxed with context isolation**, `nodeIntegration`
  off, under a Content-Security-Policy, and reach the main process only through
  an explicitly allow-listed IPC surface (`electron/channels.ts`, exposed via
  `electron/preload.ts`).
- No window may navigate away from its own page, open another window, embed a
  webview, or get a permission (camera, microphone, notifications, …):
  `electron/security.ts` refuses all of it for every window the app creates.
- The packaged app has its Electron fuses set: it can't be run as a plain
  Node.js runtime, ignores `NODE_OPTIONS` and `--inspect`, and only loads its
  own `app.asar`, checked against a hash baked into the build.
- Imports are size-capped: a pasted PoB link stops downloading at 4 MB (a
  `Content-Length` over that is refused unread) and may not redirect off its
  paste host; a PoB code may not unpack to more than 16 MB.

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

## Where a release comes from

Releases are built by the *Build Windows* workflow on GitHub's runners from the
tagged commit, never on a personal machine. Each one carries `SHA256SUMS.txt`
and a signed build-provenance attestation:
`gh attestation verify <file>.exe -R wertgzhj/poe-leveling-overlay` shows the
workflow and commit it came from. The workflows' actions are pinned to commit
SHAs, and every job gets only the token permissions it needs.

The project is written largely with an AI coding assistant and maintained by one
person; it has had no outside audit. Pull requests from others aren't accepted.

## Known, accepted

- **The Windows build is unsigned.** SmartScreen warns on first run. Code
  signing needs a paid certificate; until then, only download releases from
  this repository and take the warning seriously anywhere else.
- **Dependency advisories.** `npm audit --omit=dev` (the code that actually
  ships) must be clean for CI to pass. Build-time tools are audited too, but an
  advisory there doesn't block: it runs on the build machine, not in any release.
