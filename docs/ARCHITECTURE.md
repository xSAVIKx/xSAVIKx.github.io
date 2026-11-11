# Architecture

A static site generator for `xsavikx.github.io`, written against Node's built-in
APIs with no dependencies. `scripts/build.mjs` queries the GitHub API, renders a
handful of files into `dist/`, and a workflow publishes that to GitHub Pages.

## Layout

| Path | Responsibility |
| --- | --- |
| `scripts/lib/discover.mjs` | GitHub API paging, repo filtering, URL normalization, asset probing |
| `scripts/lib/render-seo.mjs` | `robots.txt`, sitemap index and urlset, `llms.txt`, `llms-full.txt` |
| `scripts/lib/render-html.mjs` | `index.html`, `404.html`, JSON-LD, HTML escaping |
| `scripts/build.mjs` | Orchestrates discover → enrich → render → write `dist/` |
| `scripts/verify.mjs` | Post-build checks, including live URL fetches |
| `src/` | Templates, stylesheet, icons — copied or filled, never generated |

## How the project list is built

A repository earns a card when it satisfies all of:

```
has_pages && !fork && !archived && !private
```

and is not this repository itself. The list is therefore never edited by hand —
enable Pages on a repo and it appears on the next build. The owner's name, bio
and avatar come from the GitHub user API at build time for the same reason.

The API's `homepage` field is deliberately ignored when constructing a site URL:
it is inconsistent (sometimes absent, sometimes missing its trailing slash,
sometimes pointing off-domain). URLs are derived from the repository name.

If discovery returns zero projects the build **fails** rather than publishing an
empty page. The guard runs before the output directory is touched, so a failed
build cannot leave a half-written or emptied `dist/` behind.

## This repository owns `robots.txt` for the whole origin

`robots.txt` is only honoured at an origin root. A `robots.txt` published by a
project site — `/some-project/robots.txt` — is invisible to crawlers. Because
this repository serves the root of `xsavikx.github.io`, the `robots.txt` it
generates governs every project site published beneath that origin.

The generated file allows everything, for `*` and for named AI crawlers, and
carries a single `Sitemap:` directive.

## Sitemap routing

`/sitemap.xml` is a sitemap **index**, not a flat list of URLs. At build time
each discovered site is probed for a `sitemap.xml` of its own:

- **has one** → referenced as a child sitemap from the index, and omitted from
  `sitemap-pages.xml` (its own sitemap already lists its root, and duplicating
  it invites conflicting `lastmod` values).
- **has none** → contributes only its root URL to `sitemap-pages.xml`.

Deep pages of sitemap-bearing projects become discoverable from the origin root,
and the arrangement self-heals as other projects gain sitemaps. Every URL in
both documents is same-origin, as the sitemap protocol requires.

`llms.txt` follows the same probe: a project that publishes its own is linked to
it, so an agent can descend.

## Constraints worth preserving

**Zero dependencies.** No `dependencies`, no `devDependencies`, no lockfile.
This repository replaced an abandoned 2016 fork of a Jekyll theme that rotted
because nobody maintained its dependency tree. Everything here uses built-in
Node APIs so that it still builds years from now, untouched. Adding a package
gives that up.

**Deterministic rendering.** Every render function takes `now` as an explicit
parameter rather than reading the clock, so output is reproducible and testable.

**Escaping.** Repository descriptions and topics are free text from an external
API. Everything interpolated into HTML goes through `htmlEscape`; everything in
XML goes through `xmlEscape`; JSON-LD escapes `<` so a description cannot close
the script block early.

## Accessibility

The bar is WCAG 2.2 AA, with two stricter rules: text contrast ≥ 4.5:1 in both
colour schemes, and tap targets ≥ 44×44px. Two of these are enforced by tests
rather than left to review:

- `test/contrast.test.mjs` parses the colour tokens straight out of
  `src/styles.css` and computes WCAG relative luminance for every text pair in
  both schemes. Change a colour past the threshold and the build fails.
- `test/render-html.test.mjs` asserts that no two links in the rendered document
  share an accessible name, so repeated bare labels like "Source" cannot creep
  back in.

Lists that are visually de-bulleted carry an explicit `role="list"`: WebKit drops
the list role when `list-style: none` is applied, which otherwise silently
removes item counts and positions from VoiceOver.

## Deployment

`.github/workflows/deploy.yml` runs `npm test`, then `npm run build`, then
publishes `dist/`. It triggers on push to `main`, on a daily cron so newly
published project sites appear without a push here, and on manual dispatch.
Nothing generated is ever committed — `dist/` is gitignored.

`npm run verify` is intentionally **not** part of the workflow: it checks live
URLs, which only exist after a deploy. Run it locally.

Two operational notes. GitHub suspends scheduled workflows after 60 days of
repository inactivity and emails the owner; the site keeps serving its last
deploy, and any push or manual dispatch re-arms the schedule. And the Pages
source must be set to "GitHub Actions" in repository settings, or the deploy
step fails while the previous deployment stays live.
