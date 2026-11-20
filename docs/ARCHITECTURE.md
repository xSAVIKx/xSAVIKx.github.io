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
| `scripts/lib/render-art.mjs` | Generated SVG card art, seeded by repo name and tinted by language |
| `scripts/lib/render-og.mjs` | SVG source of the social card `og.png`, and the PNG chunk functions |
| `scripts/make-og.mjs` | `npm run og`: writes `src/og.svg` and `src/og.png`. Not a part of the build |
| `identity/` | Shared design tokens for all the operator's sites; see `identity/README.md` |
| `scripts/build.mjs` | Orchestrates discover → enrich → render → write `dist/` |
| `scripts/verify.mjs` | Post-build checks, including live URL fetches |
| `src/` | Templates, stylesheet, icons — copied or filled. `og.svg` and `og.png` are made by `npm run og` and committed |

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

## Order and featured projects

`src/featured.json` names the projects to show first, in that order, as
Featured cards. Edit that file to change the selection; a name that matches no
project site prints a warning in the build log. The other projects follow by
activity: human commits on the default branch in the last 90 days, then the date
of the last human commit. Bot commits (Dependabot, github-actions) do not count,
so a dependency update does not make an old project look active. The "Updated"
date on a card is the last human commit for the same reason.

The count reads up to 5 pages of 100 commits for each project; past that, the
count is a floor. An empty repository counts as zero.

## Hand-made texts for a project

`src/featured.json` can also set texts for one project, in the object `projects`.
The key is the repository name. The fields are:

| Field | Replaces | Shows in |
| --- | --- | --- |
| `displayName` | The repository name as the visible name | Card title, `llms.txt`, `llms-full.txt`, JSON-LD `name`, `displayName` in `projects.json`, `og.png` |
| `description` | The GitHub repository description | Card, `llms.txt`, `llms-full.txt`, `projects.json`, JSON-LD |
| `language` | The main language that GitHub calculates | Card fact line and dot colour, `llms-full.txt`, `projects.json`, JSON-LD, keywords |

`applyOverrides` in `scripts/lib/discover.mjs` applies the texts one time, before the
renderers get the list. Thus each output shows the same value.

The repository name stays the identifier. `name` in `projects.json`, each URL, the
"Source" link label, the 404 page and the release feed use the repository name. JSON-LD
gives the repository name as `alternateName` when a display name is set.

The build prints a warning, and does not stop, for each of these:

- A project has an empty description on GitHub and in `src/featured.json`. The page then
  shows "No description provided."
- `projects` names a repository that has no project site.
- An entry has an unknown field, or a value that is not a text.

These texts are published in the name of the operator. The voice specification is
`docs/voice/voice.md` in the `serhiichuk.dev` repository.

## Meta description

`renderDescription` in `scripts/lib/render-html.mjs` writes one text for the meta
description, `og:description` and `twitter:description`. The text names the person, the
title "Google Developer Expert, Cloud" as plain text, and the featured projects by
repository name. It ends with the count of the other projects when the result has
`DESCRIPTION_MAX` (155) characters or fewer. Without a featured project, it names the
first two projects of the list. The title is the constant `OG_PERSON.title` in
`scripts/lib/render-og.mjs`.

## Social card `og.png`

`og.png` is 1200 x 630. It shows the YS mark, the host name, the name of the person, the
title "Google Developer Expert, Cloud" and the display names of the first two featured
projects. It uses the light colours of `identity/tokens.json` and the system sans fonts.
The smallest text is 40 px.

The build does not make the image. It copies `src/og.png`. The reasons:

- The repository has zero dependencies, and Node has no function that draws text to a PNG.
- A converter in the build adds a tool to the GitHub Actions job, and the fonts of that
  machine then decide the look of the card. A committed file is the same at each deploy.

The steps after a change of `featured`, or of the `displayName` of a featured project:

1. Run `npm run og`. It needs Chromium or Chrome (set `CHROME` to its path if necessary).
2. Look at `src/og.png`.
3. Commit `src/og.svg` and `src/og.png`.

`scripts/make-og.mjs` writes the SVG source to `src/og.svg`, makes a screenshot of it with
the headless browser, and adds a PNG text chunk `og-source-sha256` with the SHA-256 of the
SVG source. `test/render-og.test.mjs` fails when `src/og.svg` differs from the source that
`src/featured.json` gives, or when the hash in `src/og.png` differs from `src/og.svg`. So a
stale card stops `npm test`, which runs before the build in both workflows. The same test
checks the size (1200 x 630), the weight (less than 300 kB) and the smallest font size.

The name on the card is the constant `OG_PERSON.name`. The build prints a warning when the
GitHub profile has a different name.

## Cards

`renderCards` in `scripts/lib/render-html.mjs` writes one list item for each project.

- **One link to the project site.** The project name is the link. Its `::after` element
  covers the card, so a click or a tap on the art or the text opens the project site. The
  accessible name is the project name. The arrow after the name is `aria-hidden`. It moves
  on hover and on keyboard focus, and it does not move with `prefers-reduced-motion`.
- **Other links.** "Source" and the release link have `z-index: 2`, so they stay above the
  card link. A card has no llms.txt link. The hub `llms.txt` and `projects.json` link the
  llms.txt of each project.
- **Keyboard focus.** The focus ring goes around the card, inside its edge, because the
  card clips its overflow.
- **One fact line.** Language, stars (when more than zero) and the update date. The commit
  count is the sort key and is not on the card.
- **Topics.** A card shows 4 topics at most. `projects.json`, `llms-full.txt` and the
  JSON-LD keep all topics.
- **The last row.** The desktop grid has 6 tracks. `lastRowFill` finds the cards of an
  incomplete last row. Two cards get the class `fill-2` and take 3 tracks each. One card
  gets `fill-1` and takes the row, with its art beside the text. These classes have an
  effect only from 64rem. The two-column layout (40rem to 64rem) can keep one card alone.
- **Print.** The print block puts the card link back in the text flow and hides the arrow.

The figures ("7 project sites · 743 stars · 5 with releases") are one muted line beside the
"Project sites" heading (`renderStats`). The section heading (28 px) is larger than each
card title (24 px featured, 22 px other). The card description uses the token `--strong`,
which is darker than `--muted`. `--strong` is a hub token, not an identity token.

Below 48rem, the header is compact: the avatar (56 px) is beside the name, and the profile
links are in one row at 390 px. The footer links are a list with the `.links` layout, so
each link has a 44 px target that does not overlap another target.

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

## Card art

Each card has a small inline SVG strip. Project OG images are 1200x630, too
heavy for a card grid, and the zero-dependency rule excludes an image library to
shrink them. `render-art.mjs` draws the art instead: a shape pattern seeded by
the repository name, tinted by the GitHub language colour, with a two-letter
badge. The same name always gives the same art, and a new project gets art with
no work. The art is `aria-hidden`; the card title names the project.

A project can replace the generated art with a hand-made image. The build
probes the site root for `card.svg`, then `card.webp`, then `card.png`, and
uses the first file that exists. If the site has none, the build uses
`src/cards/<repo>.svg` from this repository when that file exists. The image shows at a 10:3 ratio and is cropped
to fit; 640x192 suits a raster file. Keep the left 30% calm if text or a mark
must stay visible on narrow cards.
`test/render-art.test.mjs` checks the badge letters for 4.5:1 contrast on every
language colour.

The files in `src/cards/` follow these rules, and `test/cards.test.mjs` checks them:

- Each project has its own tint. The tint is not the language colour. Each tint
  is 30 degrees of hue or more from each other tint.
- Each file has one ink colour for the light scheme and one for the dark scheme.
  The ink has 4.5:1 contrast on the tint. The faded lines (class `q`) have 3:1.
- A label is 24 px in the 640 px view box. That is 13.5 px on a card 360 px wide.
- A label has a `textLength`, so the label stays in its box with each font.
- Each file is in the card size budget of `check-dist.mjs`.

## Structured data

The JSON-LD graph has a `Person`, a `WebSite`, and the page itself as both
`ProfilePage` and `CollectionPage`. The page's `hasPart` is an `ItemList` where
each item is a `SoftwareSourceCode` with its repository, language, topics and
author. `knowsAbout` on the person comes from the project languages and topics.
Profile links carry `rel="me"`.

## Machine-readable access

Agents get the project list three ways: `llms.txt` and `llms-full.txt` as text,
`projects.json` as data, and WebMCP tools on the page. `src/webmcp.js`
registers two read-only tools, `list_projects` and `get_project`, with
`document.modelContext.registerTool()` (the API in the WebMCP draft; early
Chrome builds used `navigator.modelContext`, so the script accepts either). The
tools read `projects.json`. A browser without WebMCP ignores the script.

## Releases

The build reads the releases of each project (`fetchReleases` in
`scripts/lib/discover.mjs`) and keeps the newest 5 published ones. Drafts and
pre-releases are left out. A 404 gives no releases; another API error fails
the build, the same as the commits API.

- Each card has a link to the GitHub page of the newest release, with the tag and the date
  (for example "v1.2.3 · 12 Nov 2026"). The link is in the link row, after "Source".
- `projects.json` has `latestRelease` for each project.
- `/releases.xml` is an Atom feed of the releases of all projects, newest first.
  `feedEntries` in `scripts/lib/render-seo.mjs` applies the feed rules below.
- The cap of 5 releases for each project is the input of the feed and of the cards.

The feed rules, in this order:

1. Drop a release that is older than 24 months (`FEED_MAX_AGE_MONTHS`). The build measures
   the age from the newest release date in the data, not from the wall clock. Thus the
   same data gives the same file.
2. Releases of one project published in the same minute become one entry. The title lists
   the tags, for example "okf-skills skills/a/v1, skills/b/v1". The entry has the address
   and the date of the newest release of the group.
3. Keep at most 3 entries for each project (`FEED_PER_PROJECT`), so one busy project
   cannot fill the feed.
4. Keep at most 30 entries in all (`FEED_ENTRIES`).

Other facts about the feed:

- Its `<updated>` is the newest release date, not the build time, so a rebuild
  without a new release writes the same file.
- Its `<subtitle>` says in plain words what the file is, for a person who opens it in a browser.
- A `<summary>` is the first paragraph of the release note without Markdown marks
  (`plainSummary`). A heading is not a paragraph. The items of a list become one line.
  A summary has 1000 characters at most; the entry link leads to the full note.
- Each entry has a `rel="alternate"` link to the release on GitHub and a `rel="related"`
  link to the project site.
- The page has three links to the feed: `<link rel="alternate">` in the head, "Release feed"
  in the row of the "Project sites" heading, and "Atom feed" in the footer.

## The 404 page

GitHub Pages serves `404.html` for each address that no site under the origin has.
`render404` in `scripts/lib/render-html.mjs` fills `src/404.html`.

- The page is `noindex`.
- The page lists the project sites. The list comes from the same project data as the cards.
- A project path is case-sensitive. A small inline script compares the first segment of the
  path with the project names. When only the case is different (`/androidscreencast/` and
  `/AndroidScreencast/`), the page shows "Did you mean /AndroidScreencast/?" with a link.
  The link keeps the rest of the path, the query and the fragment.
- The script reads the names from the `data-name` attributes of the list. It loads nothing.
  Without JavaScript the list is still there.

## Search engine verification

`src/site-verification.json` holds the ownership tokens for Google Search
Console (`google`) and Bing Webmaster Tools (`bing`). The build writes one
`<meta>` tag for each token into the page head. A token is public. It only
proves that the owner put it on the page. A malformed token or an unknown
engine fails the build.

To add a token:

1. In the webmaster tool, add the URL-prefix property `https://xsavikx.github.io/`.
2. Choose the HTML tag method and copy the `content` value only.
3. Add the value to the right list in `src/site-verification.json`.
4. Push to main. After the deploy, press "Verify" in the tool.
5. Submit `https://xsavikx.github.io/sitemap.xml` in the tool.

Do not remove a token while its property is in use. The tool checks the tag
again from time to time and drops the property when the tag is gone.

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

## Quality gate

`npm run check` (`scripts/check-dist.mjs`) reads a built `dist/` and fails on:
an unfilled `{{SLOT}}`, a missing local file or asset, an image without `alt`,
width or height, an `http://` URL, JSON-LD that does not parse or lacks Person,
WebSite or ProfilePage, a project count in `projects.json` that differs from
the cards, a sitemap URL on another origin, and a file over its size budget
(`BUDGETS`). It reads files only, so it gives the same result on every run.

- `deploy.yml` runs it after the build and before the upload. A failed check
  stops the deploy, also for the daily scheduled build.
- `check.yml` runs the tests, the build and the gate on every branch push and
  pull request, then Lighthouse CI (`lighthouserc.json`). Accessibility and SEO
  must be 100, best practices 95 or more, and CLS 0.05 or less. Performance
  below 90 and LCP above 2.5 s give a warning only, because the score depends
  on the runner. Raise them to `error` after some stable runs.
- `scripts/verify.mjs` is a different tool: it fetches the live URLs after a
  deploy.

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
