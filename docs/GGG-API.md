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

## Three things we didn't know — one still open

Each of these could change the design and two could have killed it. Two are now
answered from the docs themselves, read on 6 October 2026. The one that decides
whether the feature is worth having is still open, and only the game can answer it.

The docs are unreachable from this build environment (HTTP 403), so everything
quoted here was read by a person and pasted in. Quotes are marked as quotes;
anything else is inference and should be checked against the page.

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

The docs touch it without settling it. The Introduction says this access is

> almost always a read-only snapshot of data stored on the game servers

which tells you the data is the game's own state rather than something the
website derives — and says nothing about when that state is written. There is no
staleness note, no "updated on logout", nothing in the error list for it.

**How we settle it:** with credentials in hand, a throwaway script — log in,
socket a gem, walk into a new zone, call the endpoint, diff. Ten minutes. It is
the first thing to do once registration reopens, before any UI exists.

### 2. ~~Public client or confidential client~~ — settled

**Answered by the docs, 6 October 2026. It was the risk that could have made this
a different project, and it didn't.**

Under *API Policies and Third-Party Requirements*, GGG classify application types.
Ours is "executable apps that run independently from the game", and of those:

> While not encouraged, these are permitted. They must use a **public OAuth
> client** if interacting with our APIs.

So a public client isn't merely available, it's **required** for this shape of
app — which is also what the Developer Guidelines demand from the other side:

> Don't embed keys or credentials in a distributed binary.

That removes the server. No hosting, no operator who can see who connects, and
"no server, no account, no telemetry" survives as a sentence with one honest
exception written next to it. PKCE follows from OAuth 2.1, which the docs say
they implement.

Two things to read with it, neither a blocker:

- **"While not encouraged."** GGG would rather this were a website — they say
  outright that a site is "the safest kind of application for our players",
  because a binary on someone's machine can change after review. Our kind is
  permitted, not welcomed, and a registration request should expect to argue it.
- **Log reading is explicitly fine.** The same list says: "Reading the game's log
  files is okay as long as the user is aware of what you are doing with that
  data." That is the overlay's entire existing mechanism, blessed in writing.

### 3. ~~Rate limits~~ — documented, and stricter than "retry on 429"

Limits are per-policy and **dynamic** — "these limits are dynamic and can change
at any time" — so they are published in response headers and nothing may be
hardcoded:

```
X-Rate-Limit-Policy: ladder-view        the policy this request falls under
X-Rate-Limit-Rules: client              which rules apply; keys the next two
                                        headers. Common: ip, account, client
X-Rate-Limit-Client: 10:5:10            max hits : period tested (s) : penalty (s)
X-Rate-Limit-Client-State: 1:5:0        current hits : period (s) : restricted (s)
Retry-After: 10                         only when limited
```

So the client reads `Rules`, then builds the header name per rule, then compares
state against limit. Several rules can apply at once and all must pass.

**The part that changes the design** is not the limits themselves:

> Applications (and users) that make too many invalid requests in a short period
> of time will be restricted from further access to our service. Invalid requests
> include any response codes in the HTTP 4xx range. This includes common codes
> such as 401 (Unauthorized), 403 (Forbidden), and 429 (Too Many Requests).
> Reasonable attempts **must** be made in order to avoid passing the threshold.

A 429 is itself an invalid request. So "fire and back off on 429" is not an
acceptable strategy here — the backoff is the punishment, and collecting them
gets access revoked ("exceeding these limits frequently will result in your
application access being revoked"). The budget has to be checked *before* the
request, not learned from the rejection.

Three rules that fall out of it, worth writing down before the code exists:
**never spend the last hit** (leave headroom, because the published limit can
change under you), **single-flight** (a zone change and a manual refresh must not
become two requests), and **no polling** — refresh on an event or a click, never
on a timer.

## Registering with GGG

> **Blocked.** The developer docs' *Registering your Application* section reads,
> in full:
>
> > We are currently unable to process new applications.
>
> Read first-hand on 6 October 2026. No reason given and no timeframe, so treat
> it as indefinite rather than imminent, and re-read the page rather than this
> paragraph.
>
> That makes steps 4–6 below indefinite rather than merely slow. It does not
> make the rest of this document stale, and it does not strand any of the work
> that is already merged — the order was chosen for exactly this case, and steps
> 1–3 cost a feature flag that is switched off.
>
> There is no second route to the same answer, and it's worth writing down why
> rather than rediscovering it:
>
> - **A `POESESSID` session cookie** against the old endpoints would work today.
>   It is also the thing this project exists not to do — and, it turns out, not
>   merely a matter of taste: *Available Resources* says "requests for access to
>   any other internal website APIs or in-game resources will be denied. It is
>   against our Terms of Use (section 7i) to reverse-engineer endpoints outside
>   of this documentation." No.
> - **Reading the game's memory, or touching the game's files.** The docs are
>   blunt about this category: "strictly against our Terms of Use (sections 7b,
>   7c, 7i)" and "will result in immediate account termination" — yours *and*
>   your users'. OCR of the inventory screen avoids the files and still fails the
>   guardrails in `README.md`. No.
> - **Asking the player to tick off what they socketed.** Honest, and it defeats
>   the purpose: the value here is catching the support gem you *didn't notice*
>   was missing. A checklist needs you to notice first.
>
> So the feature waits, and the flag stays off. Re-check the authorization docs
> page now and then; when it reopens, step 4 is the ten-minute spike and nothing
> before it needs redoing.

**Registering is a request by email to `oauth@grindinggear.com`.** The *Manage
applications* link the docs point at is for applications you already own, and the
account's *Authorised Apps* page is where a player revokes an app's access — both
are managing what exists, not creating it. Re-read the page when the door opens
anyway; it is what governs.

The docs ask you to arrive having read their sections on OAuth client types,
grant types and scopes, and having confirmed the scopes cover what you want.
Unknown 2 above was exactly one of those questions, and reading it answered it.

Two things attributed to GGG about these requests, both of which shape how you
ask — **second-hand**, unlike the quote above, so check them on the page too:

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
| Scope | The characters one, read-only. Nothing else. A player sees it as "view your characters; including their inventories and passive skill trees" on their Authorised Apps page, so it covers what we need; the literal scope string is in the docs' scope list and is not quoted here because nobody has read it yet |
| Client type | Desktop binary, cannot hold a secret → public client with PKCE |
| Redirect URI | Loopback: `http://127.0.0.1:<ephemeral port>/callback` |
| Who it runs as | One installation per user, each authorising their own account. No shared credential, no server, no proxying |
| Request volume | Single digits per play session per user: on a zone change, debounced, plus a manual refresh button |
| Rate limits | Parsed from the response headers and obeyed; 429 backs off on `Retry-After` |
| User-Agent | Fixed format, below |
| One product | "One product per registered application" — this is the one product |
| Money | None. "As a general rule, we cannot allow our Intellectual Property to be used to generate commercial revenue" — MIT, no ads, no donations tied to it |

And three questions worth asking outright, because the answers change the build:

1. Does `/character/<name>` reflect a character that is **currently logged in**,
   and how soon after they change gems? (See unknown 1.)
2. Is a **public client with PKCE** available, or confidential only?
3. Anything they want stated in the app's UI about the connection.

### What the docs require, whatever they answer

Not negotiable and cheap to get right, so get them right the first time:

**The User-Agent has a fixed shape.** "Any application that interacts with our
API must set an identifiable User Agent header prefixed using the following
format":

```
User-Agent: OAuth {$clientId}/{$version} (contact: {$contact}) ...
```

Their example: `OAuth mypoeapp/1.0.0 (contact: mypoeapp@gmail.com)
SomeOptionalThingHere`. Note `{$version}` is the *app's* version, which this
project takes from the release tag while `package.json` stays `0.0.0` — so it
has to come from `app.getVersion()`, not from the manifest.

**Credentials never ship.** "Don't include any application keys or credentials in
your code" and "don't embed keys or credentials in a distributed binary". With a
public client there is no secret to leak, but the refresh token is per-user and
belongs in `safeStorage`, never in the settings JSON.

**Only documented resources.** "We can only support resources defined in our API
Reference or listed in our Data Exports." If the character endpoint doesn't carry
something, that is the answer — not a prompt to go looking elsewhere.

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
the electron-builder command line rather than duplicated into a second config.
See the beta branch of `.github/workflows/build-windows.yml` for the live list.

The point of it is a **separate userData folder**, so an experimental build
cannot corrupt the settings and per-character progress of the one you actually
play with. Getting that right needs three different overrides, and only one of
them is the obvious one:

- `appId` separates the **Windows installation**, so the beta installs beside
  the stable build instead of upgrading over it.
- `productName` separates what the **installer and shortcut** say.
- `extraMetadata.name` separates the **userData folder** — and this is the one
  that matters. Electron derives `userData` from `app.getName()`, which reads
  the packaged `package.json`, not the appId. Override only the first two and
  the beta writes its settings straight into the real ones.

The cost is honest: the beta starts empty, so `Client.txt` and the profile have
to be pointed at once.

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

Deliberately arranged so that only the last three wait on GGG. They now wait
indefinitely; 1–3 are done and shipped dark.

| # | Step | Blocked by |
| --- | --- | --- |
| 0 | Send the registration request | **GGG (closed)** |
| 1 | `parse.ts` + `diff.ts` + fixtures + tests, behind the flag | — |
| 2 | Feature flag, Settings section, the tab's UI states | — |
| 3 | Beta build overrides + workflow, prerelease channel verified | — |
| 4 | **Freshness spike** with real credentials — go / no-go | **GGG (closed)** |
| 5 | `auth.ts`, `tokens.ts`, `client.ts` | **GGG (closed)** |
| 6 | Wire it up, refresh policy, docs and privacy text | 4, 5 |

Steps 1–3 are real work with real tests and no external dependency, and they are
done. With applications closed, that is where this stops: the diff engine is the
thing that would have to be right whenever the door opens, and it is written and
tested against everything except the schema.

## Open decisions

- **Whether step 4 is a veto.** The only one left that matters. If the data turns
  out to be logout-only, is a post-session review still worth building? Decide
  that *before* step 5, not after, or the sunk cost will decide it instead.
  Nothing in the docs answers it, so nobody can decide it until the spike runs.

Settled, and recorded so they don't get re-opened: the branch question (the flag
made small pieces on the usual branch viable, and that is what happened), and
whether a server is needed (no — a public client is mandatory for this shape of
app, see unknown 2).
