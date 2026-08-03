# Reading the real character from GGG's API

A plan for the one thing the overlay cannot answer today: **is what's actually in
your sockets what your build profile says it should be?**

Nothing here is built yet. This document exists because the feature is blocked on
a third party (an OAuth client has to be granted by Grinding Gear Games) and
because three things about their API would each change its shape — so the order
of work matters more than usual.

## What it would add

The Gems tab shows a *plan*. It has no idea what you did. You can run half the
campaign with a four-link that's missing its support gem, and the overlay will
keep cheerfully agreeing with you, because it only ever reads `Client.txt` and
the log carries zones and levels — never items.

GGG's API can close exactly that gap: read the signed-in account's own
characters, pull the socket groups out of the equipped items, and compare them
against the stage the profile says you're on. Two useful outputs:

- **Missing.** "Your 4-link is Cyclone + Infernal Blow + Ruthless — the plan also
  wants Melee Physical Damage."
- **Elsewhere.** A planned gem that is socketed, just not in the group it was
  planned for. Worth showing differently: it isn't a shopping problem.

The second use case worth having later, and cheap once the first works: the
**ascendancy check** — whether the character has actually done the Labyrinth,
instead of the Trials tab believing whatever you last ticked.

Everything else people ask an API for (levelling speed, item value, XP/h) is a
different product. Not planned.

## Three things we don't know yet

Each of these can change the design; two of them can kill it. None can be settled
from here — `pathofexile.com/developer/docs` is unreachable from this build
environment (HTTP 403), so **read the authorization page yourself and correct
this document** where it's wrong.

### 1. Freshness — the one that decides everything

Character data is server-side state. The question is when it's written: on
logout, on every zone change, or continuously.

- **On zone change** → the feature works as designed. The overlay already knows
  when you change zones (it's how the guide advances), so it can refresh at
  exactly the right moment and the check is never more than a zone stale.
- **On logout only** → there is no live check. What's left is a post-session
  review ("last time you played you were missing X"), which is a different and
  much weaker feature. That's the point to stop and decide whether to build it
  at all rather than ship something that quietly lies about being current.

**How we settle it:** with credentials in hand, a throwaway script — log in,
socket a gem, walk into a new zone, call the endpoint, diff. Ten minutes. It is
the first thing to do once GGG replies, before any UI exists.

### 2. Public client or confidential client

The overlay is a Windows binary on a user's machine. It **cannot keep a secret**:
anything compiled into it is readable by anyone who downloads it. The correct
shape is therefore a **public client with PKCE** and a loopback redirect
(RFC 8252), which is what native apps are supposed to use.

If GGG only issues confidential clients, the client secret has to live on a
server we'd have to run — which means hosting, an operator who can see who
connects and when, and the end of "no server, no account, no telemetry" as a
plain statement. That's not a small implementation detail; it's a different
project. **Ask this in the registration request** and take the answer seriously.

### 3. Rate limits

GGG publishes limits in response headers (`X-Rate-Limit-*`, `Retry-After`) and
expects clients to obey them rather than hardcode a number. So: parse the
headers, keep the budget in memory, back off on 429, and never fire a request the
budget doesn't have room for. The refresh cadence is then whatever's left over,
not whatever feels responsive.

Two rules that fall out of that and are worth writing down before the code exists:
**single-flight** (a zone change and a manual refresh must not become two
requests) and **no polling** — refresh on an event or a click, never on a timer.

## Registering with GGG

Registration is a request by email to **oauth@grindinggear.com** — confirm the
address on the authorization docs page before sending, it's the page that governs.

Two things GGG states about these requests, both of which shape how you write it:

- They're **low priority**, especially around a league launch. Plan for weeks,
  and possibly for no answer at all. Nothing below is allowed to block on it.
- **Low-effort or LLM-generated requests are rejected outright.** They want to
  see that a person read the documentation and knows what they're building. So
  the request is yours to write, in your own words. What this repo can supply is
  the substance — the facts you'd otherwise have to dig out of the code:

| They'll want to know | Our answer |
| --- | --- |
| What the app is | Free, MIT-licensed, open-source levelling overlay for PoE 1. No ads, no monetisation, no accounts. `github.com/wertgzhj/poe-leveling-overlay` |
| What you want the data for | Compare the gems actually socketed on the user's own character against the gem plan they wrote themselves, and show what's missing |
| Scope | `account:characters`, read-only. Nothing else |
| Client type | Desktop binary, cannot hold a secret → public client with PKCE |
| Redirect URI | Loopback: `http://127.0.0.1:<ephemeral port>/callback` |
| Who it runs as | One installation per user, each authorising their own account. No shared credential, no server, no proxying |
| Request volume | Single digits per play session per user: on a zone change, debounced, plus a manual refresh button |
| Rate limits | Parsed from the response headers and obeyed; 429 backs off on `Retry-After` |
| User-Agent | Descriptive, with a contact address — confirm the exact format they want |

And three questions worth asking outright, because the answers change the build:

1. Does `/character/<name>` reflect a character that is **currently logged in**,
   and how soon after they change gems? (See unknown 1.)
2. Is a **public client with PKCE** available, or confidential only?
3. Anything they want stated in the app's UI about the connection.

## Architecture

A new `electron/ggg/` module, main-process only. The renderer never sees a token,
never talks to the network, and gets a plain result object over the existing IPC
allow-list — same as every other service in this app.

```
electron/ggg/
  auth.ts         PKCE flow: verifier/challenge, system browser, loopback catcher
  tokens.ts       refresh token at rest, via Electron safeStorage
  client.ts       fetch wrapper: User-Agent, rate-limit budget, 429 backoff
  characters.ts   endpoint calls (thin)
  parse.ts        API JSON -> socket groups        [pure, unit-tested]
  diff.ts         planned groups vs actual groups  [pure, unit-tested]
  service.ts      wiring: when to refresh, what to push to the renderer
```

**Login opens the system browser** (`shell.openExternal`), never an in-app
`BrowserWindow`. An app-rendered login page asking for someone's Path of Exile
password is indistinguishable from a phishing page, and native OAuth guidance
says the same thing for the same reason. The loopback server binds `127.0.0.1`
on an ephemeral port, accepts exactly one request, and shuts down.

**The refresh token goes through `safeStorage`** (DPAPI on Windows), stored as an
encrypted blob. If `safeStorage.isEncryptionAvailable()` is false, don't persist
it at all and re-authorise next launch — a token in plaintext JSON next to the
settings is worse than the inconvenience.

**The join key is the character name.** The log already tells us who you're
playing; the API lists characters by name. Match case-insensitively, and if the
authorised account has no character by that name, say exactly that — it usually
means a different account is connected, and guessing would be worse than silence.

### The diff is the interesting part

Planned, from the profile: `Stage.socketGroups[].gems: string[]` — gem names, no
item, no colours. Actual, from the API: for each equipped item, `sockets[]`
carries a `group` id per socket and `socketedItems[]` says which socket each gem
sits in. Group the socketed items by their socket's group and you have the real
link groups.

Three things that make this less trivial than it sounds, all of which need a test:

- **Not everything socketed is a gem.** Abyss jewels live in `socketedItems` too.
  Filter against the gem names we already ship in `data/gems.json` rather than
  trusting a flag.
- **Names don't match exactly.** Vaal and transfigured variants read differently
  ("Vaal Cold Snap", "Cold Snap of Power") for what the plan calls "Cold Snap".
  `electron/profile/gems.ts` already has exact-first-then-loose lookup for this,
  built when Barrage and Barrage Support collided. Reuse it — do not write a
  second matcher.
- **The plan doesn't say which item.** So the mapping is best-fit: for each
  planned group, take the actual group with the largest overlap, greedily.
  Actual groups that match no planned group are reported as *not in the plan*,
  not as an error — improvising a spare 3-link is normal play, not a mistake.

`parse.ts` and `diff.ts` take JSON in and return plain data. That means both can
be **written and tested today, against a recorded fixture, with no credentials**
— which is what keeps GGG's reply off the critical path for most of the work.

Fixtures go in `tests/fixtures/ggg/`, sanitized the same way the `Client.txt`
captures are (`scripts/sanitize-fixtures.ts`): account and character names
replaced, nothing personal committed.

### In the tab

One line per link group in the Gems tab, in the column system that's already
there — a dot and a short state, not a second panel:

- **matched** — quiet. The common case must not shout.
- **missing X** — amber, naming the gem.
- **elsewhere** — the gem is socketed, in another group.
- **stale / not connected** — grey, or nothing at all.

The last one is a rule, not a state: **not connected shows nothing.** No banner,
no nag, no "connect your account to unlock". The overlay works without this
feature and has to keep looking like it.

## What this costs the privacy promise

Today `README.md` says: *no server, no account, no telemetry* and *nothing about
you, your characters or your game is ever sent anywhere.* That is currently true
and it's one of the first things a new user reads.

This feature makes it conditionally false. An OAuth token identifies an account
to GGG, and every refresh tells them that this account's overlay is running. That
is a fair trade for the data — but it has to be stated, not quietly dropped:

- **Off by default**, opt-in, and disconnectable in Settings with the token
  deleted on disconnect.
- `README.md`'s privacy section and `docs/ARCHITECTURE.md#privacy` gain the
  third outbound destination (GitHub, pobb.in, *and now GGG when you connect*).
- The ToS position is unchanged and worth restating: this is GGG's own sanctioned
  API, read-only. What it is emphatically **not** is the other route — reusing a
  `POESESSID` session cookie to hit the old endpoints. That's the thing that gets
  tools into trouble, and this project's premise is that we don't do it.

## Building it without breaking the live version

The feature spans auth, network, storage and UI, and it waits on a third party.
Meanwhile v0.14.x should keep getting fixes. Three layers of separation, cheapest
first:

**1. A feature flag.** `settings.experimental.gggApi`, default off, everything new
behind it. This is the one that actually matters: with it, half-finished work can
be merged to `main` and shipped in a normal release without any user seeing it.
Long-lived branches rot; dark code doesn't.

**2. A side-by-side beta build.** Same source, different identity — overridden on
the electron-builder command line rather than duplicated into a second config:

```
electron-builder --win \
  -c.appId=com.poelevelingoverlay.beta \
  -c.productName="PoE Leveling Overlay Beta" \
  -c.win.artifactName=PoE-Leveling-Overlay-Beta-${version}-setup.${ext} \
  -c.portable.artifactName=PoE-Leveling-Overlay-Beta-${version}-portable.exe \
  -c.nsis.shortcutName="PoE Leveling Overlay Beta"
```

A different `appId` means a **different userData folder**, which is the real
reason to bother: an experimental build cannot corrupt the settings and
per-character progress of the one you actually play with. The cost is honest —
the beta starts empty, so `Client.txt` and the profile have to be pointed at once.

Keep the artifact names **hyphenated**. `electron-builder.yml` explains why at
length: GitHub collapses spaces in asset names differently than electron-updater
does, and the mismatch 404s the auto-updater. A beta channel with a broken
updater is worse than no beta channel.

**3. The prerelease channel — free.** Tag `v0.15.0-beta.1`, mark the GitHub
Release as a prerelease. electron-updater enables `allowPrerelease` by itself
when the *running* version has a prerelease suffix, so the beta build follows
betas and the stable build ignores them. No code, no config. Worth verifying once
rather than trusting this paragraph.

## Order of work

Deliberately arranged so that only step 4 waits on GGG.

| # | Step | Blocked by |
| --- | --- | --- |
| 0 | Send the registration request | — |
| 1 | `parse.ts` + `diff.ts` + fixtures + tests, behind the flag | — |
| 2 | Feature flag, Settings section, the tab's UI states | — |
| 3 | Beta build overrides + workflow, prerelease channel verified | — |
| 4 | **Freshness spike** with real credentials — go / no-go | GGG |
| 5 | `auth.ts`, `tokens.ts`, `client.ts` | GGG |
| 6 | Wire it up, refresh policy, docs and privacy text | 4, 5 |

Steps 1–3 are real work with real tests and no external dependency. If GGG never
replies, they cost a feature flag left switched off — and the diff engine is
still the thing that would have to be right anyway.

## Open decisions

- **Which branch.** Standing rule in this repo is that work lands on the one
  designated branch. A feature this size either needs an exception, or leans
  entirely on the feature flag and lands in small pieces on the usual branch.
  The flag makes the second genuinely viable, and it's the recommendation.
- **Whether step 4 is a veto.** If the data turns out to be logout-only, is a
  post-session review still worth building? Decide that *before* step 5, not
  after, or the sunk cost will decide it instead.
