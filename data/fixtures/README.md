# Log fixtures

Parser/tracker tests run against the files in this folder.

- `act1-synthetic.log` — **hand-written** lines matching the *assumed* Client.txt
  format (plan §8). It exists so the pipeline is testable before real captures land.

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
