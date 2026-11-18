# Night run 2026-11-18/19: progress

Branch: `night/hub-2026-11-19` (based on main ddc8fe9). Do not push to main.
A push to main deploys the hub. The operator reviews and fast-forwards main.
Remove this file and `night-run/` before the merge to main, or keep `night-run/` as a record.

Items, in the order of work (smallest first):
H8 Search Console and Bing, H2 Lighthouse and visual re-audit, H1 CI quality gate,
H4 identity v1.1, H7 release feed and Atom.

## Done

- H8: `src/site-verification.json` and meta tag rendering, tests, docs. Operator steps:
  `night-run/H8-search-console.md`.

## Next

- H2: Lighthouse and screenshot re-audit of the live hub and of this branch build.

## Blocked

- H8: the operator must check Google Search Console and add Bing (see night-run/H8-search-console.md).
