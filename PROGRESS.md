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
- H1: `scripts/check-dist.mjs` (56 offline checks, size budgets), `npm run check` in deploy.yml
  before the upload, new `check.yml` (branch and PR: tests, build, gate, Lighthouse CI 0.15.1),
  `lighthouserc.json`, tests in `test/check-dist.test.mjs`. Report: `night-run/H1-ci-gate.md`.

- H4: identity 1.1.0 (focus ring, link underline, reduced motion, print, `.ys-footer-line`), 10 new
  tests (128 pass). Report and 3 open design questions: `night-run/H4-identity-v1.1.md`.
  Preview: `night-run/H4-preview.html`.

- H7: releases: the newest release tag on each card, `latestRelease` in projects.json, and the
  Atom feed `/releases.xml` (30 entries, at most 5 for each project). 131 tests pass; the gate has
  60 checks. Report: `night-run/H7-releases.md`.

## Next

- Nothing. All five items are done. The operator reviews the branch and fast-forwards main.

## Blocked

- H4: a design review by the operator (3 questions in night-run/H4-identity-v1.1.md). The project
  sites keep 1.0.0 until the operator approves 1.1.0.
- H8: the operator must check Google Search Console and add Bing (see night-run/H8-search-console.md).
