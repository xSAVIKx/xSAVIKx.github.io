# xsavikx.github.io — OSS project hub

**Date:** 2026-09-11
**Status:** Approved design, pending implementation
**Repo:** `xSAVIKx/xSAVIKx.github.io`

## Problem

`xsavikx.github.io` is a 2016 fork of `mmistakes/minimal-mistakes` that was never
customized. All 1,183 commits belong to upstream; none are the owner's. The live
root still serves the stock template — `<title>Site Title</title>`, "An amazing
website." — last modified 2016-12-13.

Meanwhile the subdomain does real work: three repos publish GitHub Pages sites
under it (`cloud-cache-action`, `AndroidScreencast`, `okf-skills`), and the
owner's actual home is now `serhiichuk.dev` (Astro, behind Cloudflare).

Two things follow. The root URL is an embarrassing placeholder, and — less
obviously — the origin has **no working `robots.txt`**. `cloud-cache-action`
ships `/cloud-cache-action/robots.txt`, but robots.txt is only honored at the
origin root, so that file and its `Sitemap:` directive are invisible to every
crawler. This repo is the only place on the subdomain where a valid
origin-wide `robots.txt` can live.

## Goals

1. Replace the root with a hub indexing every Pages site on the subdomain.
2. Point visitors at `serhiichuk.dev` as the primary identity.
3. Give the origin a correct `robots.txt`, `sitemap.xml`, and `llms.txt`.
4. Detach from the fork network and reduce history to one fresh commit.
5. Build something that cannot rot the way the 2016 fork did.

## Non-goals

- Migrating or mirroring `serhiichuk.dev` content. It stays the primary site.
- Touching the three project repos. Their Pages configs are independent and
  remain untouched throughout.
- A blog, comments, or any CMS on this domain.
- Adding sitemaps to `okf-skills` / `AndroidScreencast`. Out of scope here; the
  root sitemap degrades gracefully without them.

## Decisions

| Question | Decision | Rationale |
|---|---|---|
| Root purpose | OSS project hub | Gives the subdomain a real job; grows with new doc sites |
| Stack | Static HTML, zero deps, Node build script | The 2016 rot was caused by an unmaintained framework |
| List maintenance | Generated from GitHub API | Cannot go stale; no edit needed per new site |
| History | Leave fork network + orphan commit | Self-serve, keeps repo identity, no root downtime |
| Default branch | `main` | Rename from `master` |
| Pages source | GitHub Actions | No generated output committed |
| AI crawlers | Explicitly welcomed | Consistent with shipping `llms.txt` |
| License | MIT, owner's copyright | 100% of upstream MIT code is replaced; no carried obligation |

## Architecture

```
.github/workflows/deploy.yml   # build + deploy (push, weekly cron, manual)
scripts/build.mjs              # zero-dependency Node build
scripts/build.test.mjs         # unit tests for filter/normalize logic
src/index.html                 # template
src/404.html                   # origin-wide 404 fallback
src/styles.css
README.md
LICENSE
```

No Jekyll, no Gemfile, no `node_modules`. Node's built-in `fetch` only. The
build script is the single moving part; everything else is static text.

### Build pipeline

`scripts/build.mjs` runs in three stages, each independently testable:

**1. Discover.** Page through `api.github.com/users/xSAVIKx/repos?per_page=100`
(authenticated with the workflow's `GITHUB_TOKEN` to stay clear of rate limits).
Keep repos where `has_pages && !fork && !archived && !private`. Exclude
`xSAVIKx.github.io` itself. Also fetch `api.github.com/users/xSAVIKx` for name,
bio, and avatar — so the header cannot go stale the way `_config.yml` did.

**2. Enrich.** For each kept repo, normalize its site URL to
`https://xsavikx.github.io/<name>/` (the API's `homepage` field is
inconsistent — some entries carry a trailing slash, some don't, and some point
off-domain entirely, so `homepage` is not trusted as the source of truth).
Then probe each site for `sitemap.xml` and `llms.txt` via `HEAD`, recording
which exist.

**3. Render.** Emit into `dist/`:

| File | Contents |
|---|---|
| `index.html` | Hub page with the project grid and JSON-LD |
| `404.html` | Origin-wide fallback, links back to the hub |
| `styles.css` | Copied verbatim |
| `robots.txt` | `Allow: /` for `*` and named AI crawlers; `Sitemap:` line |
| `sitemap.xml` | Sitemap **index** (see below) |
| `sitemap-pages.xml` | Urlset: hub + project roots lacking own sitemaps |
| `llms.txt` | llmstxt.org format |
| `llms-full.txt` | Expanded inventory in one fetch |
| `og.png` | Static social card |

If discovery yields zero projects the build **fails** rather than publishing an
empty grid — a silent API shape change should be loud.

### Sitemap strategy

`/sitemap.xml` is a `<sitemapindex>`, not a flat urlset. Child entries:

- `sitemap-pages.xml` — the hub itself, plus the root URL of every project site
  that has no sitemap of its own (`okf-skills`, `AndroidScreencast` today).
- One `<sitemap>` entry per project that *does* publish `sitemap.xml`
  (`cloud-cache-action` today), referencing it directly.

Deep pages of sitemap-bearing projects become discoverable from the origin root,
and the arrangement self-heals as the other projects gain sitemaps. All child
URLs are same-origin, which the sitemap protocol requires.

### The page

Single screen, no client JS:

- **Header** — avatar, name, bio (all from the API), prominent link to
  `serhiichuk.dev`, plus GitHub and X/@xSAVIKx.
- **Main** — "Project sites": a card grid, one per discovered repo, showing
  name, description, primary language, topics, stars, and last push.
- **Footer** — link to this repo's source; note that `serhiichuk.dev` is home.

Light and dark via `prefers-color-scheme`, system font stack. Palette sampled
from `serhiichuk.dev` so the hub reads as related, without coupling the two
codebases.

`404.html` matters more than its size suggests: a user-pages site's 404 is the
fallback for *any* unmatched `xsavikx.github.io/*` URL, including typo'd paths
beneath the project sites.

### SEO and agent readability

- **`robots.txt`** — `User-agent: * / Allow: /` plus explicit `Allow` for
  GPTBot, ClaudeBot, PerplexityBot, Google-Extended, and a `Sitemap:` line.
  Governs the whole origin, project sites included.
- **`llms.txt`** — H1, blockquote summary, then a linked section per project
  from its repo description, and a link to `serhiichuk.dev`. Projects that ship
  their own `llms.txt` are linked to it so an agent can descend.
- **JSON-LD** — a `Person` (name, bio, `sameAs` → serhiichuk.dev, GitHub, X)
  and a `CollectionPage` wrapping an `ItemList` of the project sites.
- **Per-page** — canonical, meta description, OG and Twitter card tags,
  `<html lang="en">`.

### Accessibility

Treated as a gate, not a nicety: semantic landmarks
(`header`/`nav`/`main`/`footer`), exactly one `h1`, a skip-to-content link,
project cards as a real `<ul>` whose link accessible names are the project names
(never "read more"), `alt` on the avatar, visible `:focus-visible` rings,
contrast ≥ 4.5:1 in both schemes, tap targets ≥ 44px, `prefers-reduced-motion`
honored, full keyboard traversal.

## Testing

Unit tests (`scripts/build.test.mjs`, `node --test`, no framework) cover the
pure logic against fixtures:

- filter keeps `has_pages && !fork && !archived && !private`
- self-repo `xSAVIKx.github.io` excluded
- URL normalization across trailing-slash / off-domain / missing `homepage`
- sitemap index routes a project with a sitemap vs. one without correctly
- empty discovery result raises

Integration checks, run against the built `dist/` before shipping:

- every generated project link returns 200
- `cloud-cache-action`, `AndroidScreencast`, `okf-skills` all present
- `robots.txt` and `sitemap.xml` validate against their specs
- each sitemap-index child URL returns 200
- Lighthouse: **Accessibility 100, SEO 100** (reported, not asserted blindly)
- keyboard-only pass; contrast verified in light and dark

## Execution order

Steps 1 and 4 require the GitHub UI and are the owner's to perform.

1. **Owner** — Settings → Danger Zone → *Leave fork network*. Permanent.
   Preconditions verified: public, 0 child forks, 0 stars, 0 open issues, no
   wiki, under the 1 GB limit.
2. **Agent** — build the site on a local orphan branch; verify locally.
3. **Agent, on go-ahead** — force-push as `main`, set default, delete `master`,
   `develop`, `gh-pages-2.2.1`, `gh-pages-3.1.6`.
4. **Owner** — Settings → Pages → Source: *GitHub Actions*.
5. **Agent** — verify the live root and that all three project sites still 200.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Project doc sites break | None | Served from their own repos; never touched |
| Root regresses | None | Currently a 2016 placeholder |
| Fork detach is irreversible | Low | Nothing of value attached — 0 forks/stars/issues |
| GitHub API shape change empties grid | Medium | Build fails on zero results; unit tests on fixtures |
| API rate limiting in CI | Low | Authenticated with `GITHUB_TOKEN` |
| History force-push loses work | None | No owner commits exist to lose |
