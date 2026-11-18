# H1: CI quality gate

## What the branch adds

- `scripts/check-dist.mjs` and `npm run check`: 56 offline checks on `dist/` (slots, local links
  and assets, img alt and size, no http://, JSON-LD types, projects.json count, sitemaps, size budgets).
- `deploy.yml`: `npm run check` after the build, before the upload. A failed check stops the deploy.
- `.github/workflows/check.yml`: on branch pushes (not main) and pull requests: tests, build, gate,
  then Lighthouse CI (`@lhci/cli@0.15.1`, `lighthouserc.json`). Reports are a workflow artifact.
- `test/check-dist.test.mjs`: 5 tests (a clean build passes; a slot, a missing asset, broken
  JSON-LD and an over-budget file fail). The fake GitHub API moved to `test/helpers/fake-fetch.mjs`.

## Results

- `npm test`: 118 pass, 0 fail. `npm run check` on a real build: 56/56.
- Lighthouse CI on p1 (Chromium, 3 runs): accessibility, SEO and best practices pass. Performance
  0.56 to 0.62. The p1 CPU benchmark index was 163 to 325 (a normal runner is near 1500), and
  style and layout took 3.1 s for 209 elements. So the p1 number is not valid. Performance and LCP
  are `warn` until the GitHub runner gives stable numbers.

- First GitHub run (44378651526, 2026-11-18 19:16 UTC): gate 56/56, Lighthouse CI passed all
  assertions with no warning, so performance was 90 or more and LCP 2.5 s or less on the runner.
  The report upload was empty because `upload-artifact@v4` skips the hidden `.lighthouseci` folder.
  Fixed with `include-hidden-files: true`.

## For the operator

- A push of this branch runs `check.yml` on GitHub. Look at the Lighthouse step and its artifact.
  If performance is 90 or more in a few runs, change `categories:performance` to `error`.
- `check.yml` adds load on GitHub-hosted runners only (`ubuntu-latest`), not on p1.

## What I did not check

- The workflows on GitHub before this push. I did not run them with `act`.
- The exact Lighthouse numbers on the runner (the first run did not upload them).
