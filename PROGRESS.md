# Night run 2026-11-18/19: progress

Branch: `night/hub-2026-11-19` (based on main ddc8fe9). Do not push to main.
A push to main deploys the hub. The operator reviews and fast-forwards main.
Remove this file and `night-run/` before the merge to main, or keep `night-run/` as a record.
Screenshots and full Lighthouse reports stay outside the repo (session scratchpad, night-artifacts/).

Items, in the order of work (smallest first):
H8 Search Console and Bing, H2 Lighthouse and visual re-audit, H1 CI quality gate,
H4 identity v1.1, H7 release feed and Atom.

## Done

- H8: `src/site-verification.json` and meta tag rendering, tests, docs. Operator steps:
  `night-run/H8-search-console.md`.
- H2: audit and one fix (featured card art no longer lazy). Report: `night-run/H2-audit.md`.

## Next

- H1: CI quality gate. A check job that runs on pull requests and on non-main branches, and the
  same checks before the deploy: tests, identity check, built HTML checks (links, JSON-LD, no
  unfilled slots).

## Blocked

- H8: the operator must check Google Search Console and add Bing (see night-run/H8-search-console.md).
