# xsavikx.github.io OSS Project Hub — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the abandoned 2016 minimal-mistakes fork at `xsavikx.github.io` with a zero-dependency static hub that indexes every GitHub Pages site on the subdomain and gives the origin its first working `robots.txt`, `sitemap.xml`, and `llms.txt`.

**Architecture:** A Node build script queries the GitHub API for the owner's Pages-publishing repos, probes each site for its own `sitemap.xml`/`llms.txt`, and renders a static `dist/` from HTML templates. GitHub Actions runs it on push, on a weekly cron, and on demand, deploying straight to Pages so no generated output is ever committed. Pure rendering logic lives in three small modules under `scripts/lib/`, each unit-tested against fixtures with `node --test`.

**Tech Stack:** Node 22 (built-in `fetch`, `node:test`), plain HTML/CSS, GitHub Actions. No npm dependencies of any kind.

**Spec:** `docs/superpowers/specs/2026-09-11-xsavikx-github-io-hub-design.md`

## Global Constraints

- **Node 22 or newer.** Uses built-in `fetch` and `node:test`. No transpiler.
- **Zero npm dependencies.** `package.json` must contain no `dependencies` and no `devDependencies` keys. This is the whole point — the 2016 rot came from an unmaintained dependency tree. A task that adds a package has failed.
- **ESM only.** `"type": "module"`, all sources `.mjs`.
- **Owner:** `xSAVIKx`. **Origin:** `https://xsavikx.github.io`. **Primary site:** `https://serhiichuk.dev/`.
- **Never hardcode the owner's name, bio, or avatar in output.** They come from `api.github.com/users/xSAVIKx` at build time. Hardcoded fallbacks are permitted only for the `<title>` when the API is unreachable, and the build must fail rather than publish a partial page.
- **Deterministic output.** Every render function takes `now` as an explicit parameter so tests are reproducible. No bare `new Date()` inside render code.
- **Branch is `main`.** Never commit or push to `master` — it holds the old fork history until the force-push in Task 8.
- **Accessibility bar:** WCAG 2.2 AA, with two deliberately stricter rules — text contrast ≥ 4.5:1 in *both* colour schemes (AA minimum for large text is 3:1; we hold 4.5 everywhere), and tap targets ≥ 44×44 px (AA minimum is 24×24).
- **License:** MIT, © 2026 Yurii Serhiichuk.
- **Google Search Console verification tag** must appear in the `<head>` of `src/index.html`, copied verbatim, and must never be templated or stripped:
  ```html
  <meta name="google-site-verification" content="sMLPKoYMB5EoPQiOfUJ51P7xLG55OXBKV9PTEvp2HPw">
  ```
  Search Console verifies a URL-prefix property by fetching the exact root document, so the tag has to survive on `/index.html` specifically. Task 3 asserts its presence in a test so a future template edit cannot silently drop it and un-verify the property.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | ESM flag, `test`/`build`/`verify` scripts. No dependencies. |
| `.gitignore` | `dist/`, `node_modules/` |
| `LICENSE` | MIT |
| `README.md` | What this repo is, how to build, how the list updates |
| `scripts/lib/discover.mjs` | GitHub API access, repo filtering, URL normalization, asset probing |
| `scripts/lib/render-seo.mjs` | `robots.txt`, sitemap index, sitemap urlset, `llms.txt`, `llms-full.txt` |
| `scripts/lib/render-html.mjs` | `index.html`, `404.html`, JSON-LD, HTML escaping |
| `scripts/build.mjs` | Orchestrator: discover → enrich → render → write `dist/` |
| `scripts/verify.mjs` | Post-build integration checks against live URLs |
| `src/index.html` | Hub template with `{{PLACEHOLDER}}` slots |
| `src/404.html` | Origin-wide 404 template |
| `src/styles.css` | Single stylesheet, CSS custom properties for both schemes |
| `src/og.png` | 1200×630 social card, authored once |
| `test/fixtures/repos.json` | GitHub repos API fixture |
| `test/fixtures/user.json` | GitHub user API fixture |
| `test/discover.test.mjs` | Filtering, normalization, probing |
| `test/render-seo.test.mjs` | All five SEO artifacts |
| `test/render-html.test.mjs` | Structure, escaping, JSON-LD |
| `test/contrast.test.mjs` | Parses `styles.css` tokens, asserts WCAG ratios |
| `.github/workflows/deploy.yml` | Build + deploy to Pages |

Splitting `scripts/lib/` into three modules rather than the single `build.mjs` the spec sketched keeps each file focused on one output family and lets tests target them independently. The spec's file listing was illustrative; this is the binding version.

---

## Task 1: Scaffold and discovery module

**Files:**
- Create: `package.json`, `.gitignore`, `LICENSE`, `scripts/lib/discover.mjs`
- Create: `test/fixtures/repos.json`, `test/fixtures/user.json`
- Test: `test/discover.test.mjs`

**Interfaces:**
- Consumes: nothing (first task)
- Produces:
  - `OWNER: string`, `ORIGIN: string`, `SELF_REPO: string`, `PRIMARY_SITE: string`
  - `isProjectSite(repo: object) => boolean`
  - `toProject(repo: object) => Project`
  - `selectProjects(repos: object[]) => Project[]` (sorted, newest push first)
  - `fetchAllRepos(fetchFn, token?) => Promise<object[]>`
  - `fetchOwner(fetchFn, token?) => Promise<Owner>`
  - `probeAsset(fetchFn, url: string) => Promise<boolean>`
  - `enrichAll(fetchFn, projects: Project[]) => Promise<Project[]>`
  - `Project = { name, description, url, repoUrl, language, topics, stars, pushedAt, hasSitemap?, hasLlms? }`
  - `Owner = { name, bio, avatar, login, htmlUrl, twitter }`

- [ ] **Step 1: Create the scaffold files**

`package.json`:

```json
{
  "name": "xsavikx-github-io",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "node --test test/",
    "build": "node scripts/build.mjs",
    "verify": "node scripts/verify.mjs"
  }
}
```

`.gitignore`:

```
dist/
node_modules/
```

`LICENSE` — the standard MIT text with `Copyright (c) 2026 Yurii Serhiichuk`.

- [ ] **Step 2: Create the API fixtures**

`test/fixtures/user.json`:

```json
{
  "login": "xSAVIKx",
  "name": "Yurii Serhiichuk",
  "bio": "Head of DevOps @GuideToIceland Google Developer Expert (GDE)",
  "blog": "https://serhiichuk.dev/",
  "twitter_username": "xSAVIKx",
  "html_url": "https://github.com/xSAVIKx",
  "avatar_url": "https://avatars.githubusercontent.com/u/5675689?v=4"
}
```

`test/fixtures/repos.json` — six entries chosen so every filter branch is exercised:

```json
[
  { "name": "cloud-cache-action", "description": "High-performance GitHub Action for CI cache.",
    "has_pages": true, "fork": false, "archived": false, "private": false,
    "html_url": "https://github.com/xSAVIKx/cloud-cache-action", "language": "TypeScript",
    "topics": ["github-actions", "cache"], "stargazers_count": 12,
    "pushed_at": "2026-09-11T10:00:00Z", "homepage": "https://xsavikx.github.io/cloud-cache-action/" },
  { "name": "AndroidScreencast", "description": "View and control your Android device.",
    "has_pages": true, "fork": false, "archived": false, "private": false,
    "html_url": "https://github.com/xSAVIKx/AndroidScreencast", "language": "Java",
    "topics": [], "stargazers_count": 400,
    "pushed_at": "2026-09-06T10:00:00Z", "homepage": "https://xsavikx.github.io/AndroidScreencast" },
  { "name": "okf-skills", "description": null,
    "has_pages": true, "fork": false, "archived": false, "private": false,
    "html_url": "https://github.com/xSAVIKx/okf-skills", "language": "Go",
    "topics": ["skills"], "stargazers_count": 3,
    "pushed_at": "2026-09-03T10:00:00Z", "homepage": null },
  { "name": "xSAVIKx.github.io", "description": "This very repo.",
    "has_pages": true, "fork": false, "archived": false, "private": false,
    "html_url": "https://github.com/xSAVIKx/xSAVIKx.github.io", "language": "HTML",
    "topics": [], "stargazers_count": 0,
    "pushed_at": "2026-09-11T12:00:00Z", "homepage": null },
  { "name": "some-archived-docs", "description": "Old.",
    "has_pages": true, "fork": false, "archived": true, "private": false,
    "html_url": "https://github.com/xSAVIKx/some-archived-docs", "language": "Java",
    "topics": [], "stargazers_count": 0,
    "pushed_at": "2020-01-01T10:00:00Z", "homepage": null },
  { "name": "sre-agent", "description": "No pages here.",
    "has_pages": false, "fork": false, "archived": false, "private": false,
    "html_url": "https://github.com/xSAVIKx/sre-agent", "language": "Python",
    "topics": [], "stargazers_count": 5,
    "pushed_at": "2026-07-13T10:00:00Z", "homepage": "https://serhiichuk.dev/blog/x/" }
]
```

- [ ] **Step 3: Write the failing tests**

`test/discover.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ORIGIN, isProjectSite, toProject, selectProjects,
  probeAsset, enrichAll, fetchAllRepos, fetchOwner,
} from '../scripts/lib/discover.mjs';

const repos = JSON.parse(readFileSync(new URL('./fixtures/repos.json', import.meta.url)));
const byName = (n) => repos.find((r) => r.name === n);

test('keeps repos that publish Pages', () => {
  assert.equal(isProjectSite(byName('cloud-cache-action')), true);
});

test('drops repos without Pages', () => {
  assert.equal(isProjectSite(byName('sre-agent')), false);
});

test('drops archived repos', () => {
  assert.equal(isProjectSite(byName('some-archived-docs')), false);
});

test('drops the hub repo itself, case-insensitively', () => {
  assert.equal(isProjectSite(byName('xSAVIKx.github.io')), false);
});

test('drops forks and private repos', () => {
  assert.equal(isProjectSite({ name: 'a', has_pages: true, fork: true }), false);
  assert.equal(isProjectSite({ name: 'b', has_pages: true, private: true }), false);
});

test('normalizes the site URL, ignoring the homepage field', () => {
  // homepage has no trailing slash upstream; ours always does
  assert.equal(toProject(byName('AndroidScreencast')).url,
    `${ORIGIN}/AndroidScreencast/`);
  // homepage is null upstream; we still derive a URL
  assert.equal(toProject(byName('okf-skills')).url, `${ORIGIN}/okf-skills/`);
});

test('coerces a null description to an empty string', () => {
  assert.equal(toProject(byName('okf-skills')).description, '');
});

test('selects exactly the three real project sites, newest push first', () => {
  const names = selectProjects(repos).map((p) => p.name);
  assert.deepEqual(names, ['cloud-cache-action', 'AndroidScreencast', 'okf-skills']);
});

test('probeAsset reports true only on a 2xx', async () => {
  const fake = async (url) => ({ ok: url.endsWith('sitemap.xml'), status: 200 });
  assert.equal(await probeAsset(fake, 'https://x/sitemap.xml'), true);
  assert.equal(await probeAsset(fake, 'https://x/llms.txt'), false);
});

test('probeAsset swallows network errors as false', async () => {
  const boom = async () => { throw new Error('offline'); };
  assert.equal(await probeAsset(boom, 'https://x/sitemap.xml'), false);
});

test('enrichAll annotates each project with its available assets', async () => {
  const fake = async (url) => ({ ok: url.includes('cloud-cache-action'), status: 200 });
  const enriched = await enrichAll(fake, selectProjects(repos));
  const cca = enriched.find((p) => p.name === 'cloud-cache-action');
  const okf = enriched.find((p) => p.name === 'okf-skills');
  assert.equal(cca.hasSitemap, true);
  assert.equal(cca.hasLlms, true);
  assert.equal(okf.hasSitemap, false);
  assert.equal(okf.hasLlms, false);
});

test('fetchAllRepos follows pagination until a short page', async () => {
  let call = 0;
  const fake = async () => {
    call += 1;
    const body = call === 1 ? new Array(100).fill(byName('okf-skills')) : [byName('sre-agent')];
    return { ok: true, status: 200, json: async () => body };
  };
  const all = await fetchAllRepos(fake);
  assert.equal(call, 2);
  assert.equal(all.length, 101);
});

test('fetchAllRepos throws on a non-ok response', async () => {
  const fake = async () => ({ ok: false, status: 403, json: async () => ({}) });
  await assert.rejects(() => fetchAllRepos(fake), /403/);
});

test('fetchOwner maps the API shape to our Owner shape', async () => {
  const user = JSON.parse(readFileSync(new URL('./fixtures/user.json', import.meta.url)));
  const fake = async () => ({ ok: true, status: 200, json: async () => user });
  const owner = await fetchOwner(fake);
  assert.equal(owner.name, 'Yurii Serhiichuk');
  assert.equal(owner.twitter, 'xSAVIKx');
  assert.match(owner.avatar, /avatars\.githubusercontent\.com/);
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../scripts/lib/discover.mjs'`

- [ ] **Step 5: Implement the discovery module**

`scripts/lib/discover.mjs`:

```js
export const OWNER = 'xSAVIKx';
export const ORIGIN = 'https://xsavikx.github.io';
export const SELF_REPO = 'xsavikx.github.io';
export const PRIMARY_SITE = 'https://serhiichuk.dev/';

const API = 'https://api.github.com';
const PER_PAGE = 100;

function headers(token) {
  const h = { Accept: 'application/vnd.github+json', 'User-Agent': `${OWNER}-hub-build` };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/** A repo earns a card only if it actually publishes a site of its own. */
export function isProjectSite(repo) {
  if (!repo?.has_pages) return false;
  if (repo.fork || repo.archived || repo.private) return false;
  return repo.name.toLowerCase() !== SELF_REPO;
}

/**
 * The API's `homepage` is unreliable — sometimes missing, sometimes without a
 * trailing slash, sometimes pointing off-domain entirely. Derive from the name.
 */
export function toProject(repo) {
  return {
    name: repo.name,
    description: (repo.description ?? '').trim(),
    url: `${ORIGIN}/${repo.name}/`,
    repoUrl: repo.html_url,
    language: repo.language ?? null,
    topics: repo.topics ?? [],
    stars: repo.stargazers_count ?? 0,
    pushedAt: repo.pushed_at,
  };
}

export function selectProjects(repos) {
  return repos
    .filter(isProjectSite)
    .map(toProject)
    .sort((a, b) => b.pushedAt.localeCompare(a.pushedAt));
}

export async function fetchAllRepos(fetchFn, token) {
  const all = [];
  for (let page = 1; ; page += 1) {
    const url = `${API}/users/${OWNER}/repos?per_page=${PER_PAGE}&page=${page}`;
    const res = await fetchFn(url, { headers: headers(token) });
    if (!res.ok) throw new Error(`GitHub repos API failed: ${res.status}`);
    const batch = await res.json();
    all.push(...batch);
    if (batch.length < PER_PAGE) return all;
  }
}

export async function fetchOwner(fetchFn, token) {
  const res = await fetchFn(`${API}/users/${OWNER}`, { headers: headers(token) });
  if (!res.ok) throw new Error(`GitHub user API failed: ${res.status}`);
  const u = await res.json();
  return {
    login: u.login,
    name: u.name ?? u.login,
    bio: (u.bio ?? '').replace(/\s+/g, ' ').trim(),
    avatar: u.avatar_url,
    htmlUrl: u.html_url,
    twitter: u.twitter_username ?? null,
  };
}

/** A missing file on GitHub Pages is a 404 with an HTML body, so trust the status. */
export async function probeAsset(fetchFn, url) {
  try {
    const res = await fetchFn(url, { method: 'HEAD' });
    return Boolean(res.ok);
  } catch {
    return false;
  }
}

export async function enrichAll(fetchFn, projects) {
  return Promise.all(projects.map(async (p) => {
    const [hasSitemap, hasLlms] = await Promise.all([
      probeAsset(fetchFn, `${p.url}sitemap.xml`),
      probeAsset(fetchFn, `${p.url}llms.txt`),
    ]);
    return { ...p, hasSitemap, hasLlms };
  }));
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 14 tests, 0 failures

- [ ] **Step 7: Commit**

```bash
git add package.json .gitignore LICENSE scripts/lib/discover.mjs test/
git commit -m "feat: add GitHub Pages site discovery module"
```

---

## Task 2: SEO and agent-readable artifacts

**Files:**
- Create: `scripts/lib/render-seo.mjs`
- Test: `test/render-seo.test.mjs`

**Interfaces:**
- Consumes: `ORIGIN`, `PRIMARY_SITE`, `Project`, `Owner` from `scripts/lib/discover.mjs`
- Produces:
  - `AI_CRAWLERS: string[]`
  - `xmlEscape(s: string) => string`
  - `isoDate(value: string | Date) => string` (`YYYY-MM-DD`)
  - `renderRobots() => string`
  - `renderSitemapIndex(projects: Project[], now: Date) => string`
  - `renderSitemapPages(projects: Project[], now: Date) => string`
  - `renderLlms(owner: Owner, projects: Project[]) => string`
  - `renderLlmsFull(owner: Owner, projects: Project[]) => string`

**Routing rule that the whole task hinges on:** a project with its own `sitemap.xml` is referenced as a *child sitemap* from the index and is **excluded** from `sitemap-pages.xml` (its own sitemap already lists its root, and duplicating it invites conflicting `lastmod` values). A project without one contributes only its root URL to `sitemap-pages.xml`.

- [ ] **Step 1: Write the failing tests**

`test/render-seo.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectProjects, fetchOwner, ORIGIN } from '../scripts/lib/discover.mjs';
import {
  AI_CRAWLERS, xmlEscape, isoDate, renderRobots,
  renderSitemapIndex, renderSitemapPages, renderLlms, renderLlmsFull,
} from '../scripts/lib/render-seo.mjs';

const repos = JSON.parse(readFileSync(new URL('./fixtures/repos.json', import.meta.url)));
const userFixture = JSON.parse(readFileSync(new URL('./fixtures/user.json', import.meta.url)));
const NOW = new Date('2026-09-11T00:00:00Z');

// cloud-cache-action publishes its own sitemap and llms.txt; the other two publish neither.
const projects = selectProjects(repos).map((p) => ({
  ...p,
  hasSitemap: p.name === 'cloud-cache-action',
  hasLlms: p.name === 'cloud-cache-action',
}));

const owner = await fetchOwner(async () => ({ ok: true, status: 200, json: async () => userFixture }));

test('robots allows everyone and names the sitemap', () => {
  const out = renderRobots();
  assert.match(out, /^User-agent: \*\nAllow: \/$/m);
  assert.match(out, new RegExp(`^Sitemap: ${ORIGIN}/sitemap\\.xml$`, 'm'));
});

test('robots explicitly welcomes every named AI crawler', () => {
  const out = renderRobots();
  for (const bot of AI_CRAWLERS) {
    assert.match(out, new RegExp(`^User-agent: ${bot}\\nAllow: /$`, 'm'), `missing ${bot}`);
  }
});

test('robots disallows nothing at all', () => {
  assert.doesNotMatch(renderRobots(), /^Disallow: \S/m);
});

test('sitemap index points at the fallback urlset and at child sitemaps', () => {
  const out = renderSitemapIndex(projects, NOW);
  assert.match(out, /<sitemapindex /);
  assert.ok(out.includes(`<loc>${ORIGIN}/sitemap-pages.xml</loc>`));
  assert.ok(out.includes(`<loc>${ORIGIN}/cloud-cache-action/sitemap.xml</loc>`));
});

test('sitemap index omits projects that have no sitemap of their own', () => {
  const out = renderSitemapIndex(projects, NOW);
  assert.ok(!out.includes('okf-skills/sitemap.xml'));
  assert.ok(!out.includes('AndroidScreencast/sitemap.xml'));
});

test('urlset carries the hub root plus only the sitemap-less project roots', () => {
  const out = renderSitemapPages(projects, NOW);
  assert.ok(out.includes(`<loc>${ORIGIN}/</loc>`));
  assert.ok(out.includes(`<loc>${ORIGIN}/okf-skills/</loc>`));
  assert.ok(out.includes(`<loc>${ORIGIN}/AndroidScreencast/</loc>`));
  // it has its own sitemap, so listing it here would duplicate that sitemap's root entry
  assert.ok(!out.includes(`<loc>${ORIGIN}/cloud-cache-action/</loc>`));
});

test('urlset uses each project push date as lastmod and today for the hub', () => {
  const out = renderSitemapPages(projects, NOW);
  assert.ok(out.includes('<lastmod>2026-09-03</lastmod>')); // okf-skills push
  assert.ok(out.includes('<lastmod>2026-09-11</lastmod>')); // hub build date
});

test('rendering is deterministic for a fixed now', () => {
  assert.equal(renderSitemapIndex(projects, NOW), renderSitemapIndex(projects, NOW));
  assert.equal(renderSitemapPages(projects, NOW), renderSitemapPages(projects, NOW));
});

test('xmlEscape neutralises all five XML metacharacters', () => {
  assert.equal(xmlEscape(`a&b<c>d"e'f`), 'a&amp;b&lt;c&gt;d&quot;e&apos;f');
});

test('isoDate reduces a timestamp to a W3C date', () => {
  assert.equal(isoDate('2026-09-03T10:00:00Z'), '2026-09-03');
});

test('llms.txt opens with an H1 and a blockquote summary', () => {
  const lines = renderLlms(owner, projects).split('\n');
  assert.match(lines[0], /^# /);
  assert.ok(lines.some((l) => l.startsWith('> ')));
});

test('llms.txt lists every project as a markdown link with its description', () => {
  const out = renderLlms(owner, projects);
  assert.ok(out.includes(`[cloud-cache-action](${ORIGIN}/cloud-cache-action/)`));
  assert.ok(out.includes('High-performance GitHub Action for CI cache.'));
  assert.ok(out.includes(`[okf-skills](${ORIGIN}/okf-skills/)`));
});

test('llms.txt points agents at a nested llms.txt only where one exists', () => {
  const out = renderLlms(owner, projects);
  assert.ok(out.includes(`${ORIGIN}/cloud-cache-action/llms.txt`));
  assert.ok(!out.includes(`${ORIGIN}/okf-skills/llms.txt`));
});

test('llms.txt links the primary site', () => {
  assert.ok(renderLlms(owner, projects).includes('https://serhiichuk.dev/'));
});

test('llms-full.txt adds the per-project metadata the short form omits', () => {
  const out = renderLlmsFull(owner, projects);
  assert.ok(out.includes('TypeScript'));
  assert.ok(out.includes('github-actions'));
  assert.ok(out.includes('Last updated: 2026-09-11'));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../scripts/lib/render-seo.mjs'`

- [ ] **Step 3: Implement the SEO renderer**

`scripts/lib/render-seo.mjs`:

```js
import { ORIGIN, PRIMARY_SITE } from './discover.mjs';

/**
 * Named explicitly rather than relying on the wildcard, so the policy is
 * legible to a human reading the file and survives a future wildcard change.
 */
export const AI_CRAWLERS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
  'ClaudeBot', 'Claude-User', 'Claude-SearchBot',
  'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'Applebot-Extended',
  'CCBot', 'meta-externalagent',
];

export function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function isoDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

export function renderRobots() {
  const blocks = [
    `# robots.txt for ${ORIGIN}`,
    '# This file governs the entire origin, including every project site',
    '# published under it. Per-project robots.txt files are ignored by crawlers.',
    '# Generated by scripts/lib/render-seo.mjs — do not edit by hand.',
    '',
    'User-agent: *',
    'Allow: /',
    '',
    ...AI_CRAWLERS.flatMap((bot) => [`User-agent: ${bot}`, 'Allow: /', '']),
    `Sitemap: ${ORIGIN}/sitemap.xml`,
    '',
  ];
  return blocks.join('\n');
}

export function renderSitemapIndex(projects, now) {
  const entries = [
    { loc: `${ORIGIN}/sitemap-pages.xml`, lastmod: isoDate(now) },
    ...projects
      .filter((p) => p.hasSitemap)
      .map((p) => ({ loc: `${p.url}sitemap.xml`, lastmod: isoDate(p.pushedAt) })),
  ];
  const body = entries
    .map(({ loc, lastmod }) =>
      `  <sitemap>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</sitemapindex>
`;
}

export function renderSitemapPages(projects, now) {
  const entries = [
    { loc: `${ORIGIN}/`, lastmod: isoDate(now), priority: '1.0' },
    // Projects with their own sitemap are reached through the index instead.
    ...projects
      .filter((p) => !p.hasSitemap)
      .map((p) => ({ loc: p.url, lastmod: isoDate(p.pushedAt), priority: '0.8' })),
  ];
  const body = entries
    .map(({ loc, lastmod, priority }) =>
      `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${priority}</priority>\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

function summary(owner) {
  return `Documentation and project sites published by ${owner.name} under ${ORIGIN}. `
    + `The author's primary site, with articles and writing, is ${PRIMARY_SITE}`;
}

export function renderLlms(owner, projects) {
  const items = projects.map((p) => {
    const desc = p.description || 'No description provided.';
    const nested = p.hasLlms ? ` Machine-readable index: ${p.url}llms.txt` : '';
    return `- [${p.name}](${p.url}): ${desc}${nested}`;
  });
  return [
    `# ${owner.name} — open-source projects`,
    '',
    `> ${summary(owner)}`,
    '',
    '## Project sites',
    '',
    ...items,
    '',
    '## Elsewhere',
    '',
    `- [${new URL(PRIMARY_SITE).host}](${PRIMARY_SITE}): Primary site — articles and writing.`,
    `- [GitHub profile](${owner.htmlUrl}): Source repositories for every project listed above.`,
    `- [Full inventory](${ORIGIN}/llms-full.txt): The same list with per-project metadata.`,
    '',
  ].join('\n');
}

export function renderLlmsFull(owner, projects) {
  const sections = projects.map((p) => [
    `### ${p.name}`,
    '',
    `- Site: ${p.url}`,
    `- Source: ${p.repoUrl}`,
    `- Description: ${p.description || 'No description provided.'}`,
    `- Language: ${p.language ?? 'n/a'}`,
    `- Topics: ${p.topics.length ? p.topics.join(', ') : 'none'}`,
    `- Stars: ${p.stars}`,
    `- Last updated: ${isoDate(p.pushedAt)}`,
    `- Own sitemap: ${p.hasSitemap ? `${p.url}sitemap.xml` : 'none'}`,
    `- Own llms.txt: ${p.hasLlms ? `${p.url}llms.txt` : 'none'}`,
    '',
  ].join('\n'));

  return [
    `# ${owner.name} — open-source projects (full inventory)`,
    '',
    `> ${summary(owner)}`,
    '',
    ...(owner.bio ? [owner.bio, ''] : []),
    '## Project sites',
    '',
    ...sections,
    '## Elsewhere',
    '',
    `- Primary site: ${PRIMARY_SITE}`,
    `- GitHub profile: ${owner.htmlUrl}`,
    ...(owner.twitter ? [`- X: https://x.com/${owner.twitter}`] : []),
    '',
  ].join('\n');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 29 tests total, 0 failures

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/render-seo.mjs test/render-seo.test.mjs
git commit -m "feat: render robots.txt, sitemap index and llms.txt"
```

---

## Task 3: HTML templates, stylesheet, and accessibility gates

**Files:**
- Create: `scripts/lib/render-html.mjs`, `src/index.html`, `src/404.html`, `src/styles.css`
- Test: `test/render-html.test.mjs`, `test/contrast.test.mjs`

**Interfaces:**
- Consumes: `ORIGIN`, `PRIMARY_SITE`, `Project`, `Owner` from `scripts/lib/discover.mjs`
- Produces:
  - `htmlEscape(s: string) => string`
  - `fill(template: string, values: Record<string,string>) => string`
  - `renderJsonLd(owner: Owner, projects: Project[]) => string`
  - `renderCards(projects: Project[]) => string`
  - `renderIndex({ template, owner, projects, now }) => string`
  - `render404(template) => string`

**Accessibility decisions worth stating up front, because a reviewer will question them:**

- The avatar gets `alt=""`. It sits immediately beside the owner's name in an `<h1>`, so a descriptive alt would make a screen reader announce the name twice. An empty alt on a decorative image adjacent to its own text label is the correct choice, not a missing one.
- Cards are a real `<ul>`/`<li>`, and each card's primary link wraps the project name inside an `<h3>`. The link's accessible name is therefore the project name — never "read more" or "docs", which strand screen-reader users navigating by link list.
- The card is *not* wholly clickable. A block-level click target that swallows nested links breaks text selection and produces an unusable accessible name.
- Heading order is `h1` (owner) → `h2` (section) → `h3` (project). No level is skipped.

- [ ] **Step 1: Write the stylesheet**

`src/styles.css`. The custom-property block at the top is parsed directly by `test/contrast.test.mjs`, so the `--name: #hex;` formatting must stay machine-readable:

```css
:root {
  --bg: #ffffff;
  --surface: #f6f8fa;
  --text: #14171a;
  --muted: #4d545c;
  --accent: #0a58ca;
  --border: #d8dee4;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --text: #e6edf3;
    --muted: #9aa7b4;
    --accent: #79c0ff;
    --border: #30363d;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 0 1.25rem 4rem;
  background: var(--bg);
  color: var(--text);
  font: 1rem/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

.wrap { max-width: 56rem; margin: 0 auto; }

.skip {
  position: absolute;
  left: -9999px;
  background: var(--accent);
  color: var(--bg);
  padding: 0.75rem 1rem;
  border-radius: 0 0 6px 0;
}
.skip:focus { left: 0; top: 0; z-index: 10; }

a { color: var(--accent); }
a:focus-visible,
:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; border-radius: 4px; }

.hero { padding: 3rem 0 2rem; border-bottom: 1px solid var(--border); }
.avatar { border-radius: 50%; display: block; }
h1 { font-size: clamp(1.75rem, 5vw, 2.5rem); margin: 1rem 0 0.25rem; }
.bio { color: var(--muted); margin: 0 0 1.25rem; max-width: 42rem; }

.links { list-style: none; display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; padding: 0; margin: 0; }
/* 44px minimum tap target, exceeding the 24px WCAG 2.2 AA floor */
.links a { display: inline-flex; align-items: center; min-height: 44px; }

main h2 { font-size: 1.25rem; margin: 2.5rem 0 1rem; }

.cards { list-style: none; padding: 0; margin: 0; display: grid; gap: 1rem;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr)); }
.card { background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; padding: 1.25rem; }
.card h3 { margin: 0 0 0.5rem; font-size: 1.05rem; }
.card h3 a { display: inline-flex; align-items: center; min-height: 44px; text-decoration-thickness: 2px; }
.card p { margin: 0 0 0.75rem; color: var(--muted); }

.meta { list-style: none; display: flex; flex-wrap: wrap; gap: 0.25rem 1rem;
  padding: 0; margin: 0 0 0.75rem; color: var(--muted); font-size: 0.875rem; }
.also { font-size: 0.875rem; }
.also a { min-height: 44px; display: inline-flex; align-items: center; }

footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border);
  color: var(--muted); font-size: 0.9375rem; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

- [ ] **Step 2: Write the contrast test**

This is a real gate, not decoration — it computes WCAG relative luminance from the tokens in `styles.css` and fails the build on any pair below 4.5:1, in either scheme. `test/contrast.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

/** Pull the token block for a scheme: the first :root is light, the one inside the media query is dark. */
function tokens(scheme) {
  const blocks = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const block = scheme === 'light' ? blocks[0] : blocks[1];
  assert.ok(block, `no ${scheme} token block found`);
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6});/g)]
    .map((m) => [m[1], m[2]]));
}

const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex) => {
  const [r, g, b] = hex.slice(1).match(/../g).map((h) => parseInt(h, 16));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
};

const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const PAIRS = [['text', 'bg'], ['text', 'surface'], ['muted', 'bg'],
  ['muted', 'surface'], ['accent', 'bg'], ['accent', 'surface']];

for (const scheme of ['light', 'dark']) {
  test(`${scheme} scheme meets 4.5:1 on every text pair`, () => {
    const t = tokens(scheme);
    for (const [fg, bg] of PAIRS) {
      const r = ratio(t[fg], t[bg]);
      assert.ok(r >= 4.5, `${scheme}: --${fg} on --${bg} is ${r.toFixed(2)}:1, need >= 4.5`);
    }
  });
}

test('the skip link stays readable against the accent it sits on', () => {
  for (const scheme of ['light', 'dark']) {
    const t = tokens(scheme);
    const r = ratio(t.bg, t.accent);
    assert.ok(r >= 4.5, `${scheme}: skip link is ${r.toFixed(2)}:1, need >= 4.5`);
  }
});

test('both schemes define the same token set', () => {
  assert.deepEqual(Object.keys(tokens('light')).sort(), Object.keys(tokens('dark')).sort());
});
```

- [ ] **Step 3: Run the contrast test to verify it passes**

Run: `node --test test/contrast.test.mjs`
Expected: PASS. If any pair fails, adjust that token in `src/styles.css` until it clears 4.5:1 — do **not** lower the threshold.

- [ ] **Step 4: Write the templates**

`src/index.html` — `{{SLOTS}}` are filled by `renderIndex`. Note the verification tag is literal, never a slot:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{TITLE}}</title>
<meta name="description" content="{{DESCRIPTION}}">
<meta name="google-site-verification" content="sMLPKoYMB5EoPQiOfUJ51P7xLG55OXBKV9PTEvp2HPw">
<link rel="canonical" href="https://xsavikx.github.io/">
<meta property="og:type" content="website">
<meta property="og:title" content="{{TITLE}}">
<meta property="og:description" content="{{DESCRIPTION}}">
<meta property="og:url" content="https://xsavikx.github.io/">
<meta property="og:image" content="https://xsavikx.github.io/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://xsavikx.github.io/og.png">
<link rel="icon" href="{{AVATAR}}">
<link rel="stylesheet" href="/styles.css">
<link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt">
<script type="application/ld+json">{{JSONLD}}</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<div class="wrap">
<header class="hero">
  <img class="avatar" src="{{AVATAR}}" alt="" width="96" height="96">
  <h1>{{NAME}}</h1>
  <p class="bio">{{BIO}}</p>
  <nav aria-label="Elsewhere">
    <ul class="links">{{LINKS}}</ul>
  </nav>
</header>
<main id="main">
  <h2>Project sites</h2>
  <ul class="cards">{{CARDS}}</ul>
</main>
<footer>
  <p>These are the GitHub Pages sites published under <code>xsavikx.github.io</code>.
     This index is generated from the GitHub API —
     <a href="https://github.com/xSAVIKx/xSAVIKx.github.io">source</a>.
     Last built {{BUILT}}.</p>
</footer>
</div>
</body>
</html>
```

`src/404.html` — static, no slots. It is the fallback for *any* unmatched path on the origin, including typos beneath the project sites, so it must explain that and route back:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found — xsavikx.github.io</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<div class="wrap">
<main id="main">
  <h1>Page not found</h1>
  <p>Nothing is published at that address. It may have moved, or the link may be
     missing part of a project path.</p>
  <ul class="links">
    <li><a href="/">All project sites</a></li>
    <li><a href="https://serhiichuk.dev/">serhiichuk.dev</a></li>
  </ul>
</main>
</div>
</body>
</html>
```

- [ ] **Step 5: Write the failing tests**

`test/render-html.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectProjects, fetchOwner } from '../scripts/lib/discover.mjs';
import { htmlEscape, fill, renderCards, renderJsonLd, renderIndex, render404 }
  from '../scripts/lib/render-html.mjs';

const repos = JSON.parse(readFileSync(new URL('./fixtures/repos.json', import.meta.url)));
const userFixture = JSON.parse(readFileSync(new URL('./fixtures/user.json', import.meta.url)));
const indexTemplate = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const template404 = readFileSync(new URL('../src/404.html', import.meta.url), 'utf8');
const NOW = new Date('2026-09-11T00:00:00Z');

const projects = selectProjects(repos).map((p) => ({
  ...p, hasSitemap: p.name === 'cloud-cache-action', hasLlms: p.name === 'cloud-cache-action',
}));
const owner = await fetchOwner(async () => ({ ok: true, status: 200, json: async () => userFixture }));
const html = renderIndex({ template: indexTemplate, owner, projects, now: NOW });

test('every slot is filled', () => {
  assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/);
});

test('exactly one h1', () => {
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
});

test('heading levels descend without skipping', () => {
  const levels = [...html.matchAll(/<h([1-6])[ >]/g)].map((m) => Number(m[1]));
  assert.deepEqual(levels, [1, 2, 3, 3, 3]);
});

test('the Google Search Console tag survives rendering verbatim', () => {
  assert.ok(html.includes(
    '<meta name="google-site-verification" content="sMLPKoYMB5EoPQiOfUJ51P7xLG55OXBKV9PTEvp2HPw">'));
});

test('the avatar is decorative because the name sits beside it', () => {
  assert.match(html, /<img class="avatar"[^>]*alt=""/);
});

test('a skip link targets the main landmark', () => {
  assert.ok(html.includes('<a class="skip" href="#main">'));
  assert.ok(html.includes('id="main"'));
});

test('each card link is named by its project, not by filler text', () => {
  for (const p of projects) {
    assert.ok(html.includes(`<a href="${p.url}">${p.name}</a>`), `no named link for ${p.name}`);
  }
  assert.doesNotMatch(html, />\s*(read more|click here|docs)\s*</i);
});

test('cards are list items inside the cards list', () => {
  assert.equal((html.match(/<li class="card">/g) ?? []).length, projects.length);
});

test('a project without a description gets a fallback line, not an empty paragraph', () => {
  assert.ok(html.includes('No description provided.'));
});

test('the nested llms.txt link appears only where one exists', () => {
  assert.ok(html.includes('https://xsavikx.github.io/cloud-cache-action/llms.txt'));
  assert.ok(!html.includes('https://xsavikx.github.io/okf-skills/llms.txt'));
});

test('user-supplied text is HTML-escaped', () => {
  const evil = [{ ...projects[0], description: '<script>alert(1)</script>', name: 'a&b' }];
  const out = renderCards(evil);
  assert.ok(!out.includes('<script>'));
  assert.ok(out.includes('&lt;script&gt;'));
  assert.ok(out.includes('a&amp;b'));
});

test('htmlEscape covers the five dangerous characters', () => {
  assert.equal(htmlEscape(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
});

test('fill leaves unknown slots untouched rather than erasing them', () => {
  assert.equal(fill('x {{A}} {{B}}', { A: '1' }), 'x 1 {{B}}');
});

test('JSON-LD parses and describes a Person and the project list', () => {
  const raw = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
  const data = JSON.parse(raw);
  const types = data['@graph'].map((n) => n['@type']);
  assert.ok(types.includes('Person'));
  assert.ok(types.includes('CollectionPage'));
  const person = data['@graph'].find((n) => n['@type'] === 'Person');
  assert.equal(person.name, 'Yurii Serhiichuk');
  assert.ok(person.sameAs.includes('https://serhiichuk.dev/'));
  const list = data['@graph'].find((n) => n['@type'] === 'CollectionPage').mainEntity;
  assert.equal(list.numberOfItems, projects.length);
});

test('JSON-LD escapes any closing script tag in the data', () => {
  const out = renderJsonLd(owner, [{ ...projects[0], description: '</script><script>x' }]);
  assert.ok(!out.includes('</script>'));
});

test('the 404 page is noindex and routes back to the hub', () => {
  const out = render404(template404);
  assert.ok(out.includes('name="robots" content="noindex"'));
  assert.ok(out.includes('href="/"'));
});

test('rendering is deterministic for a fixed now', () => {
  assert.equal(html, renderIndex({ template: indexTemplate, owner, projects, now: NOW }));
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../scripts/lib/render-html.mjs'`

- [ ] **Step 7: Implement the HTML renderer**

`scripts/lib/render-html.mjs`:

```js
import { ORIGIN, PRIMARY_SITE } from './discover.mjs';
import { isoDate } from './render-seo.mjs';

export function htmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Unknown slots are left alone so a typo shows up as visible `{{TEXT}}`, not a silent blank. */
export function fill(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) =>
    Object.hasOwn(values, key) ? values[key] : match);
}

export function renderCards(projects) {
  return projects.map((p) => {
    const meta = [
      p.language,
      `${p.stars} ${p.stars === 1 ? 'star' : 'stars'}`,
      `Updated ${isoDate(p.pushedAt)}`,
    ].filter(Boolean).map((m) => `<li>${htmlEscape(m)}</li>`).join('');

    const also = [
      `<a href="${htmlEscape(p.repoUrl)}">Source</a>`,
      ...(p.hasLlms ? [`<a href="${htmlEscape(`${p.url}llms.txt`)}">llms.txt</a>`] : []),
    ].join(' · ');

    return `
      <li class="card">
        <h3><a href="${htmlEscape(p.url)}">${htmlEscape(p.name)}</a></h3>
        <p>${htmlEscape(p.description || 'No description provided.')}</p>
        <ul class="meta">${meta}</ul>
        <p class="also">${also}</p>
      </li>`;
  }).join('');
}

function renderLinks(owner) {
  const links = [
    [PRIMARY_SITE, new URL(PRIMARY_SITE).host],
    [owner.htmlUrl, 'GitHub'],
    ...(owner.twitter ? [[`https://x.com/${owner.twitter}`, `@${owner.twitter}`]] : []),
  ];
  return links
    .map(([href, label]) => `<li><a href="${htmlEscape(href)}">${htmlEscape(label)}</a></li>`)
    .join('');
}

export function renderJsonLd(owner, projects) {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        '@id': `${ORIGIN}/#person`,
        name: owner.name,
        description: owner.bio || undefined,
        image: owner.avatar,
        url: PRIMARY_SITE,
        sameAs: [
          PRIMARY_SITE,
          owner.htmlUrl,
          ...(owner.twitter ? [`https://x.com/${owner.twitter}`] : []),
        ],
      },
      {
        '@type': 'CollectionPage',
        '@id': `${ORIGIN}/`,
        url: `${ORIGIN}/`,
        name: `${owner.name} — open-source projects`,
        about: { '@id': `${ORIGIN}/#person` },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: projects.length,
          itemListElement: projects.map((p, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: p.url,
            name: p.name,
            description: p.description || undefined,
          })),
        },
      },
    ],
  };
  // `</script>` inside JSON would close the block early; escaping the slash is the standard fix.
  return JSON.stringify(graph, null, 2).replace(/</g, '\\u003c');
}

export function renderIndex({ template, owner, projects, now }) {
  const title = `${owner.name} — open-source projects`;
  const description = `GitHub Pages sites published under ${new URL(ORIGIN).host}, `
    + `by ${owner.name}. Primary site: ${new URL(PRIMARY_SITE).host}.`;
  return fill(template, {
    TITLE: htmlEscape(title),
    DESCRIPTION: htmlEscape(description),
    NAME: htmlEscape(owner.name),
    BIO: htmlEscape(owner.bio),
    AVATAR: htmlEscape(owner.avatar),
    LINKS: renderLinks(owner),
    CARDS: renderCards(projects),
    JSONLD: renderJsonLd(owner, projects),
    BUILT: isoDate(now),
  });
}

export function render404(template) {
  return template;
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 50 tests total, 0 failures

- [ ] **Step 9: Commit**

```bash
git add src/ scripts/lib/render-html.mjs test/render-html.test.mjs test/contrast.test.mjs
git commit -m "feat: add hub templates, stylesheet and accessibility gates"
```

---

## Task 4: Build orchestrator

**Files:**
- Create: `scripts/build.mjs`
- Test: `test/build.test.mjs`

**Interfaces:**
- Consumes: everything exported by the three `scripts/lib/` modules
- Produces: `build({ fetchFn?, token?, now?, outDir? }) => Promise<{ owner, projects, files: string[] }>`

- [ ] **Step 1: Write the failing test**

`test/build.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from '../scripts/build.mjs';

const repos = JSON.parse(readFileSync(new URL('./fixtures/repos.json', import.meta.url)));
const user = JSON.parse(readFileSync(new URL('./fixtures/user.json', import.meta.url)));
const NOW = new Date('2026-09-11T00:00:00Z');

/** Stands in for the network: the two API endpoints plus HEAD probes. */
function fakeFetch(overrides = {}) {
  return async (url, opts = {}) => {
    if (opts.method === 'HEAD') {
      return { ok: String(url).includes('cloud-cache-action'), status: 200 };
    }
    if (String(url).includes('/users/xSAVIKx/repos')) {
      const body = overrides.repos ?? repos;
      return { ok: true, status: 200, json: async () => body };
    }
    if (String(url).includes('/users/xSAVIKx')) {
      return { ok: true, status: 200, json: async () => user };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
}

const outDir = async () => mkdtemp(path.join(tmpdir(), 'hub-build-'));

test('writes the full set of artifacts', async () => {
  const dir = await outDir();
  await build({ fetchFn: fakeFetch(), now: NOW, outDir: dir });
  const written = (await readdir(dir)).sort();
  assert.deepEqual(written, [
    '404.html', 'index.html', 'llms-full.txt', 'llms.txt',
    'og.png', 'robots.txt', 'sitemap-pages.xml', 'sitemap.xml', 'styles.css',
  ]);
});

test('reports the three discovered project sites', async () => {
  const dir = await outDir();
  const result = await build({ fetchFn: fakeFetch(), now: NOW, outDir: dir });
  assert.deepEqual(result.projects.map((p) => p.name),
    ['cloud-cache-action', 'AndroidScreencast', 'okf-skills']);
});

test('the rendered index names every project', async () => {
  const dir = await outDir();
  await build({ fetchFn: fakeFetch(), now: NOW, outDir: dir });
  const html = await readFile(path.join(dir, 'index.html'), 'utf8');
  for (const name of ['cloud-cache-action', 'AndroidScreencast', 'okf-skills']) {
    assert.ok(html.includes(name), `index is missing ${name}`);
  }
  assert.ok(!html.includes('xSAVIKx.github.io/</a>'), 'hub must not list itself');
});

test('refuses to publish an empty hub', async () => {
  const dir = await outDir();
  await assert.rejects(
    () => build({ fetchFn: fakeFetch({ repos: [] }), now: NOW, outDir: dir }),
    /zero project sites/,
  );
});

test('a failing API aborts the build instead of shipping a partial page', async () => {
  const dir = await outDir();
  const broken = async () => ({ ok: false, status: 500, json: async () => ({}) });
  await assert.rejects(() => build({ fetchFn: broken, now: NOW, outDir: dir }), /500/);
});

test('rebuilding is idempotent', async () => {
  const dir = await outDir();
  await build({ fetchFn: fakeFetch(), now: NOW, outDir: dir });
  const first = await readFile(path.join(dir, 'index.html'), 'utf8');
  await build({ fetchFn: fakeFetch(), now: NOW, outDir: dir });
  assert.equal(await readFile(path.join(dir, 'index.html'), 'utf8'), first);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../scripts/build.mjs'`

- [ ] **Step 3: Implement the orchestrator**

`scripts/build.mjs`:

```js
#!/usr/bin/env node
import { mkdir, writeFile, copyFile, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fetchAllRepos, fetchOwner, selectProjects, enrichAll } from './lib/discover.mjs';
import {
  renderRobots, renderSitemapIndex, renderSitemapPages, renderLlms, renderLlmsFull,
} from './lib/render-seo.mjs';
import { renderIndex, render404 } from './lib/render-html.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

export async function build({
  fetchFn = fetch,
  token = process.env.GITHUB_TOKEN,
  now = new Date(),
  outDir = DIST,
} = {}) {
  const [owner, repos] = await Promise.all([
    fetchOwner(fetchFn, token),
    fetchAllRepos(fetchFn, token),
  ]);

  const projects = await enrichAll(fetchFn, selectProjects(repos));
  // A shape change in the API must be loud, not a silently empty grid.
  if (projects.length === 0) {
    throw new Error('Discovered zero project sites — refusing to publish an empty hub.');
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const [indexTemplate, template404] = await Promise.all([
    readFile(path.join(SRC, 'index.html'), 'utf8'),
    readFile(path.join(SRC, '404.html'), 'utf8'),
  ]);

  const generated = {
    'index.html': renderIndex({ template: indexTemplate, owner, projects, now }),
    '404.html': render404(template404),
    'robots.txt': renderRobots(),
    'sitemap.xml': renderSitemapIndex(projects, now),
    'sitemap-pages.xml': renderSitemapPages(projects, now),
    'llms.txt': renderLlms(owner, projects),
    'llms-full.txt': renderLlmsFull(owner, projects),
  };

  await Promise.all(Object.entries(generated)
    .map(([name, body]) => writeFile(path.join(outDir, name), body)));

  const copied = ['styles.css', 'og.png'];
  await Promise.all(copied.map((f) => copyFile(path.join(SRC, f), path.join(outDir, f))));

  return { owner, projects, files: [...Object.keys(generated), ...copied] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { projects, files } = await build();
    console.log(`Built ${files.length} files for ${projects.length} project sites:`);
    for (const p of projects) console.log(`  - ${p.name} -> ${p.url}`);
  } catch (err) {
    console.error(`Build failed: ${err.message}`);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 56 tests total, 0 failures

Note: the build test copies `src/og.png`, so Task 6 must have produced it — if you are running tasks strictly in order, create a 1×1 placeholder PNG now and let Task 6 replace it.

- [ ] **Step 5: Commit**

```bash
git add scripts/build.mjs test/build.test.mjs
git commit -m "feat: add build orchestrator"
```

---

## Task 5: Live verification script

**Files:**
- Create: `scripts/verify.mjs`

**Interfaces:**
- Consumes: `build()` output shape; reads `dist/`
- Produces: a CLI that exits non-zero on any failed check. No unit tests — this task's deliverable *is* a test, and mocking the network would defeat its purpose.

- [ ] **Step 1: Implement the verifier**

`scripts/verify.mjs`:

```js
#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ORIGIN } from './lib/discover.mjs';

const DIST = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'dist');
const REQUIRED = ['cloud-cache-action', 'AndroidScreencast', 'okf-skills'];

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function status(url) {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    return res.status;
  } catch (err) {
    return `error: ${err.message}`;
  }
}

const read = (f) => readFile(path.join(DIST, f), 'utf8');
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const [html, robots, sitemap, pages, llms] = await Promise.all(
  ['index.html', 'robots.txt', 'sitemap.xml', 'sitemap-pages.xml', 'llms.txt'].map(read));

// Structure
check('index has no unfilled slots', !/\{\{[A-Z_]+\}\}/.test(html));
check('index has exactly one h1', (html.match(/<h1[ >]/g) ?? []).length === 1);
check('Search Console tag present',
  html.includes('content="sMLPKoYMB5EoPQiOfUJ51P7xLG55OXBKV9PTEvp2HPw"'));
check('JSON-LD parses', (() => {
  try { JSON.parse(html.match(/application\/ld\+json">([\s\S]*?)<\/script>/)[1]); return true; }
  catch { return false; }
})());

for (const name of REQUIRED) {
  check(`index lists ${name}`, html.includes(`${ORIGIN}/${name}/`));
}

// robots.txt
check('robots names the sitemap', robots.includes(`Sitemap: ${ORIGIN}/sitemap.xml`));
check('robots disallows nothing', !/^Disallow: \S/m.test(robots));

// Sitemaps
const childSitemaps = locs(sitemap);
check('sitemap index is an index', sitemap.includes('<sitemapindex'));
check('sitemap index references the fallback urlset',
  childSitemaps.includes(`${ORIGIN}/sitemap-pages.xml`));
check('every sitemap URL is same-origin',
  [...childSitemaps, ...locs(pages)].every((u) => u.startsWith(ORIGIN)));

// Live reachability — the point of this script.
// Anything this build generates at the origin root is NOT yet deployed when we
// run locally, and is already verified above by reading dist/. Checking it here
// would fail every pre-deploy run against a file we just wrote ourselves.
const GENERATED_AT_ROOT = new Set(['', 'index.html', '404.html', 'robots.txt',
  'sitemap.xml', 'sitemap-pages.xml', 'llms.txt', 'llms-full.txt',
  'styles.css', 'og.png'].map((f) => `${ORIGIN}/${f}`));

const live = [...new Set([
  ...locs(pages),
  ...childSitemaps,
  ...REQUIRED.map((n) => `${ORIGIN}/${n}/`),
  ...[...llms.matchAll(/\((https:\/\/[^)]+)\)/g)].map((m) => m[1]),
])].filter((u) => !GENERATED_AT_ROOT.has(u));

for (const url of live) {
  const s = await status(url);
  check(`200 ${url}`, s === 200, String(s));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
```

- [ ] **Step 2: Run it against a real build**

```bash
npm run build && npm run verify
```

Expected: every check PASS. Live URL checks hit the already-published project sites, which are independent of this repo and should already return 200.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify.mjs
git commit -m "feat: add live verification script"
```

---

## Task 6: Social card, README, and deploy workflow

**Files:**
- Create: `src/og.png`, `README.md`, `.github/workflows/deploy.yml`

- [ ] **Step 1: Author the social card**

Write a throwaway `/tmp/og.html` sized 1200×630 using the same palette tokens as `src/styles.css` — owner name, the line "open-source projects", and `xsavikx.github.io` — then screenshot it at exactly 1200×630 and save as `src/og.png`. Use the Chrome DevTools MCP tools (`new_page`, `resize_page` to 1200×630, `take_screenshot`), which avoids adding any image dependency to the repo. Delete `/tmp/og.html` afterwards.

Verify: `file src/og.png` reports `PNG image data, 1200 x 630`.

- [ ] **Step 2: Write the README**

`README.md` must state: what the site is, that the project list is generated from the GitHub API and needs no edit when a new doc site appears, how to build (`npm run build`) and verify (`npm run verify`), that there are zero dependencies on purpose, and — most importantly for a future reader — that **this repo owns the origin-wide `robots.txt`**, so per-project `robots.txt` files elsewhere are ignored by crawlers.

- [ ] **Step 3: Write the workflow**

`.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]
  schedule:
    # Weekly, so a newly published project site appears without a push.
    - cron: '17 4 * * 1'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm test
      - run: npm run build
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Verify the workflow is valid YAML and the build still passes**

```bash
node -e "require('fs').readFileSync('.github/workflows/deploy.yml','utf8')" && npm test && npm run build
```

Expected: tests pass, `dist/` rebuilt, `dist/og.png` is the 1200×630 card.

- [ ] **Step 5: Commit**

```bash
git add src/og.png README.md .github/workflows/deploy.yml
git commit -m "feat: add social card, README and Pages deploy workflow"
```

---

## Task 7: Accessibility and Lighthouse gate

**Files:** none created — this task produces evidence, not code.

This is the gate the spec promised. Run it against the local build; report the actual numbers rather than asserting success.

- [ ] **Step 1: Serve the build locally**

```bash
npm run build && python3 -m http.server 8080 --directory dist
```

- [ ] **Step 2: Run Lighthouse**

Use the Chrome DevTools MCP `lighthouse_audit` tool against `http://localhost:8080/` with the `accessibility` and `seo` categories.

Expected: **Accessibility 100, SEO 100.** Anything lower: fix the underlying markup and re-run. Do not waive a finding.

- [ ] **Step 3: Keyboard-only pass**

Tab through the page from the top and confirm, in order: the skip link appears on first Tab and jumps to `#main`; every header link and every card link is reachable; the focus ring is clearly visible against both `--bg` and `--surface`; focus order matches visual order; nothing is reachable but invisible.

- [ ] **Step 4: Both colour schemes**

Use the Chrome DevTools MCP `emulate` tool to force `prefers-color-scheme: dark`, then `light`, screenshotting each. Confirm the page is legible in both and that `test/contrast.test.mjs` still passes.

- [ ] **Step 5: Record the results**

Report the Lighthouse scores and any fixes made. If markup changed, re-run `npm test` and commit:

```bash
git add -A && git commit -m "fix: address accessibility audit findings"
```

---

## Task 8: Ship

**Prerequisite:** the repo must have left the fork network. Confirm before starting:

```bash
curl -s https://api.github.com/repos/xSAVIKx/xSAVIKx.github.io | \
  python3 -c "import json,sys; r=json.load(sys.stdin); print('fork:', r['fork'])"
```

Expected: `fork: False`. If it still reports `True`, stop and get the detach completed first — force-pushing into a live fork network leaves the new history entangled with upstream.

- [ ] **Step 1: Final local check**

```bash
npm test && npm run build && npm run verify
```

Expected: all tests pass, all verification checks pass.

- [ ] **Step 2: Confirm the branch state is what you think it is**

```bash
git log --oneline main | cat
git status --short
```

Expected: a short, clean history on `main` containing only this work; no uncommitted changes.

- [ ] **Step 3: Push `main` and make it the default**

```bash
git push --force-with-lease origin main
```

Then in the GitHub UI: Settings → General → Default branch → switch to `main`.

- [ ] **Step 4: Delete the obsolete branches**

Only after `main` is confirmed default:

```bash
git push origin --delete master develop gh-pages-2.2.1 gh-pages-3.1.6
```

- [ ] **Step 5: Point Pages at Actions**

GitHub UI: Settings → Pages → Build and deployment → Source → **GitHub Actions**. Then watch the first run complete in the Actions tab.

- [ ] **Step 6: Verify the live site**

```bash
for u in / /robots.txt /sitemap.xml /sitemap-pages.xml /llms.txt /llms-full.txt /og.png /404.html \
         /cloud-cache-action/ /AndroidScreencast/ /okf-skills/; do
  printf '%-28s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' https://xsavikx.github.io$u)"
done
curl -s https://xsavikx.github.io/ | grep -c google-site-verification
curl -s -o /dev/null -w '%{http_code}\n' https://xsavikx.github.io/definitely-not-a-real-path
```

Expected: 200 for every path in the loop; `1` for the verification tag; `404` for the nonsense path (confirming the custom 404 is wired as the origin-wide fallback).

- [ ] **Step 7: Submit the sitemap to Search Console**

With the verification tag now live, verify the `https://xsavikx.github.io/` URL-prefix property in Google Search Console and submit `https://xsavikx.github.io/sitemap.xml`.

- [ ] **Step 8: Report**

Report the live status codes, the Lighthouse scores from Task 7, and confirm the three project sites still return 200.

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Hub indexing Pages sites | 1, 3, 4 |
| Point visitors at serhiichuk.dev | 3 (header links, footer, JSON-LD `sameAs`) |
| Working origin-wide `robots.txt` | 2 |
| Sitemap index with child sitemaps | 2 |
| `llms.txt` + `llms-full.txt` | 2 |
| JSON-LD Person + CollectionPage | 3 |
| Google Search Console verification | Global constraint, 3, 5, 8 |
| Accessibility (landmarks, skip link, contrast, tap targets) | 3, 7 |
| Origin-wide 404 fallback | 3, 8 |
| Zero dependencies | Global constraint, 1 |
| Build fails on empty discovery | 4 |
| Owner metadata from API, not hardcoded | 1, 3 |
| Deploy via Actions, nothing generated committed | 6 |
| Weekly refresh | 6 |
| Detach + orphan history + branch cleanup | 8 |
| Lighthouse A11y/SEO 100 | 7 |
| Live 200 checks on all project sites | 5, 8 |
| MIT license | 1 |

No gaps.

**Placeholder scan:** clean — every code step carries runnable code, no "TBD", no "add error handling".

**Type consistency:** `Project` gains `hasSitemap`/`hasLlms` only in `enrichAll` (Task 1); Tasks 2–4 consume both. `isoDate` is defined once in `render-seo.mjs` and imported by `render-html.mjs` rather than redefined. `fetchOwner` returns `{ login, name, bio, avatar, htmlUrl, twitter }` in Task 1 and every later consumer uses exactly those keys. `ORIGIN` has no trailing slash; every construction adds one explicitly.
