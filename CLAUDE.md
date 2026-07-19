# PoE Leveling Overlay — project notes for Claude

ToS-compliant Electron overlay for leveling through the PoE1 campaign.
Design doc: `docs/plan.md` (changelog at the bottom). Status + manual test
checklist: `docs/TESTING.md`.

## Commands

- `npm test` — unit tests (pure modules; no Electron needed)
- `npm run typecheck` / `npm run build` — both must pass before any PR
- `npm run dev` — run the overlay (Windows only, needs a display)
- `npm run fetch-gems` — pull gem sources from poewiki into `data/gems.json`
  (network required; also available as the "Fetch gem data" GitHub Action)

## Workflow rules

- **Until the repo goes public/live: merge PRs immediately once CI is green.**
  No review round-trip — the owner asked for this explicitly. Revisit when public.
- Develop on the designated feature branch, PR to `main`, squash-merge.
  After a merge, re-create the feature branch from `origin/main` before new work.
- GitHub's squash-merge commits are authored by GitHub (`noreply@github.com`)
  and show as "Unverified" — expected; never rewrite merged history to "fix" it.
- Routes and build profiles are **owner-authored** content. Ship engines,
  schemas, editors, and honest fallback skeletons — never import route content
  from other projects.

## Environment constraints (cloud sandbox)

- The Electron binary download and poewiki.net are egress-blocked here: no
  runtime smoke tests, no live wiki fetches. Verify via typecheck + unit tests +
  bundle build; runtime checks happen on the owner's Windows machine, wiki
  fetches via the "Fetch gem data" Action (ubuntu runners have full egress).
- Windows exes can only be built by the "Build Windows" workflow (no wine here).
