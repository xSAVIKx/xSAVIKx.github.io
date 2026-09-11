# xsavikx.github.io

The hub page for [xsavikx.github.io](https://xsavikx.github.io) — an index of
[Yurii Serhiichuk](https://github.com/xSAVIKx)'s GitHub Pages project sites. The primary
site is [serhiichuk.dev](https://serhiichuk.dev/); this repo exists to make the project
sites published under the `xsavikx.github.io` origin discoverable, crawlable, and
agent-friendly.

## Important: this repo owns `robots.txt` for the whole origin

**`robots.txt` is only ever honoured when it is served from the root of an origin** —
`https://xsavikx.github.io/robots.txt`. That file is generated and published by this
repo (`scripts/lib/render-seo.mjs` → `dist/robots.txt`), and it governs **every** path
under `xsavikx.github.io`, including every project site hosted at
`xsavikx.github.io/<project>/`.

If a project site's own repository ships a `robots.txt` — for example
`cloud-cache-action/robots.txt`, published as `https://xsavikx.github.io/cloud-cache-action/robots.txt`
— **crawlers ignore it**. A `robots.txt` at a sub-path is not a valid robots.txt as far
as the standard is concerned; only the origin-root copy counts. So:

- Do not expect a per-project `robots.txt` to have any effect on crawling. It will not,
  no matter how correct it looks.
- If a project site needs to be excluded from crawling (or a crawler needs different
  rules for it), that rule belongs in **this** repo's robots.txt generation
  (`scripts/lib/render-seo.mjs`), not in the project's own repo.
- A future maintainer who edits or debugs a project site's `robots.txt` and doesn't see
  it take effect: this is why. Come back here instead.

## What this is

`src/index.html`, `src/404.html`, and `src/styles.css` are hand-written templates.
Everything else the site serves — the project card grid, `robots.txt`, `sitemap.xml`,
`sitemap-pages.xml`, `llms.txt`, and `llms-full.txt` — is generated at build time from
live calls to the GitHub API (`scripts/lib/discover.mjs`). The build enumerates the
owner's public, non-fork, non-archived repositories that have GitHub Pages enabled and
turns each one into a card and a set of SEO/LLM-discovery entries.

**When a new project site is published, this repo needs no edit.** The next build
(triggered by push, the weekly schedule, or a manual dispatch — see
`.github/workflows/deploy.yml`) will discover it via the GitHub API and add it
automatically. The same is true in reverse: archive or unpublish Pages on a repo and it
drops out of the next build.

## Build and verify

```sh
npm test      # unit tests: node --test "test/**/*.test.mjs"
npm run build # calls the live GitHub API, writes dist/
npm run verify # live checks against the deployed site (post-deploy only)
```

- `npm run build` writes the deployable site to `dist/` (gitignored). It makes real
  GitHub API calls, so it needs network access and benefits from a `GITHUB_TOKEN` in the
  environment to avoid the GitHub API's low unauthenticated rate limit.
- `npm run verify` (`scripts/verify.mjs`) checks the site as actually deployed —
  live HTTP requests against `https://xsavikx.github.io` and the known project URLs. It
  is deliberately **not** part of the deploy workflow, because those URLs don't exist
  until after a deploy has already happened; run it by hand after a deploy to confirm
  everything is live.

## Zero dependencies, on purpose

This repo has no `node_modules` and no entries in `package.json` beyond the `scripts`
block. Everything is written against Node.js 22+ built-in APIs (`node:test`, `fetch`,
`node:fs/promises`, etc.), as plain ESM `.mjs` files. There is nothing to `npm install`
and nothing to audit for supply-chain risk — that tradeoff is intentional for a small,
low-churn static site, not an oversight.

## Deployment

`.github/workflows/deploy.yml` runs on push to `main`, on a weekly schedule (so a newly
published project site shows up even without a push to this repo), and on manual
dispatch. It runs `npm test` then `npm run build` on Node 22, then publishes `dist/` to
GitHub Pages via `actions/deploy-pages`.
