# Log fixtures

Parser/tracker tests run against the files in this folder.

- `act1-real.log` — **real, sanitized** Client.txt lines (English client,
  2026-07-17): a fresh-character Act 1 run (Twilight Strand → town → Coast →
  Mud Flats → Submerged Passage, three level-ups) plus earlier hideout/map
  sessions. Captured via `Select-String` on the three event families, so it
  contains no chat/unmatched lines. This capture verified the three patterns
  verbatim and established the real area-id scheme (sub-numbered campaign ids
  like `1_1_4_1`; word ids like `HideoutWorldTurtle` / `MapWorldsCitySquare`
  for non-campaign instances).
- `act1-synthetic.log` — **hand-written** lines (ids aligned to the verified
  scheme) covering cases the real capture lacks: chat-spoof attempts, a party
  member's level-up, an instance-server IP line, and a town re-entry without
  a Generating line (fallback path).

## Adding a real capture (P1 DoD)

1. Play a few minutes (enter 2–3 zones, level up once; ideally once while in a party).
2. Copy the relevant tail of `Client.txt` to a temp file.
3. Sanitize it — **never commit a raw excerpt** (§11.1):

   ```bash
   npm run sanitize -- path/to/capture.txt data/fixtures/act1-real.log
   ```

4. Review the output by eye (the script drops chat/whispers, scrubs IPs, and
   replaces character names — but you are the last check).
5. If the real line format differs from the synthetic one, fix
   `data/log-patterns/en.json` (and the areaIds in `data/areas/en.json`) until
   `npm test` is green against the real fixture — patterns are data, not code.
