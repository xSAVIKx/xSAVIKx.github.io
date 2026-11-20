import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectProjects, fetchOwner, applyOverrides, SITE_ORIGIN } from '../scripts/lib/discover.mjs';
import {
  AI_CRAWLERS, xmlEscape, isoDate, renderRobots,
  renderSitemapIndex, renderSitemapPages, renderLlms, renderLlmsFull, renderProjectsJson,
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
  assert.match(out, new RegExp(`^Sitemap: ${SITE_ORIGIN}/sitemap\\.xml$`, 'm'));
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
  assert.ok(out.includes(`<loc>${SITE_ORIGIN}/sitemap-pages.xml</loc>`));
  assert.ok(out.includes(`<loc>${SITE_ORIGIN}/cloud-cache-action/sitemap.xml</loc>`));
});

test('sitemap index omits projects that have no sitemap of their own', () => {
  const out = renderSitemapIndex(projects, NOW);
  assert.ok(!out.includes('okf-skills/sitemap.xml'));
  assert.ok(!out.includes('AndroidScreencast/sitemap.xml'));
});

test('urlset carries the hub root plus only the sitemap-less project roots', () => {
  const out = renderSitemapPages(projects, NOW);
  assert.ok(out.includes(`<loc>${SITE_ORIGIN}/</loc>`));
  assert.ok(out.includes(`<loc>${SITE_ORIGIN}/okf-skills/</loc>`));
  assert.ok(out.includes(`<loc>${SITE_ORIGIN}/AndroidScreencast/</loc>`));
  // it has its own sitemap, so listing it here would duplicate that sitemap's root entry
  assert.ok(!out.includes(`<loc>${SITE_ORIGIN}/cloud-cache-action/</loc>`));
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
  assert.ok(out.includes(`[cloud-cache-action](${SITE_ORIGIN}/cloud-cache-action/)`));
  assert.ok(out.includes('High-performance GitHub Action for CI cache.'));
  assert.ok(out.includes(`[okf-skills](${SITE_ORIGIN}/okf-skills/)`));
});

test('llms.txt points agents at a nested llms.txt only where one exists, as a markdown link', () => {
  const out = renderLlms(owner, projects);
  assert.ok(out.includes(`— [llms.txt](${SITE_ORIGIN}/cloud-cache-action/llms.txt)`));
  assert.ok(!out.includes(`${SITE_ORIGIN}/okf-skills/llms.txt`));
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

test('projects.json lists every project with absolute URLs and nested assets', () => {
  const data = JSON.parse(renderProjectsJson(owner, projects, NOW));
  assert.equal(data.generated, NOW.toISOString());
  assert.equal(data.projects.length, projects.length);
  const cca = data.projects.find((p) => p.name === 'cloud-cache-action');
  assert.equal(cca.url, `${SITE_ORIGIN}/cloud-cache-action/`);
  assert.equal(cca.llms, `${SITE_ORIGIN}/cloud-cache-action/llms.txt`);
  assert.equal(data.projects.find((p) => p.name === 'okf-skills').llms, null);
});

test('the releases feed is Atom, newest first, without drafts or pre-releases', async () => {
  const { mkdtemp, readFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = (await import('node:path')).default;
  const { build } = await import('../scripts/build.mjs');
  const { fakeFetch } = await import('./helpers/fake-fetch.mjs');
  const dir = await mkdtemp(path.join(tmpdir(), 'hub-feed-'));
  await build({ fetchFn: fakeFetch(), now: new Date('2026-09-11T00:00:00Z'), outDir: dir });
  const feed = await readFile(path.join(dir, 'releases.xml'), 'utf8');
  assert.ok(feed.startsWith('<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">'));
  const titles = [...feed.matchAll(/<title>([^<]+)<\/title>/g)].map((m) => m[1]).slice(1);
  assert.deepEqual(titles, ['okf-skills v0.3.0', 'cloud-cache-action v1.2.0', 'cloud-cache-action v1.1.0']);
  // The feed date is the newest release, not the build time, so a rebuild gives the same file.
  assert.match(feed, /<\/subtitle>[\s\S]*?<updated>2026-09-06T00:00:00Z<\/updated>/);
  assert.ok(feed.includes('<summary type="text">Notes for v1.2.0 &amp; more</summary>'));
  const html = await readFile(path.join(dir, 'index.html'), 'utf8');
  assert.match(html, /<a href="[^"]+" aria-label="v1\.2\.0 · [^"]+, release of cloud-cache-action">v1\.2\.0 · <time /);
  assert.ok(html.includes('<link rel="alternate" type="application/atom+xml" href="/releases.xml"'));
  const json = JSON.parse(await readFile(path.join(dir, 'projects.json'), 'utf8'));
  const cca = json.projects.find((p) => p.name === 'cloud-cache-action');
  assert.equal(cca.latestRelease.tag, 'v1.2.0');
});

test('the feed keeps a few releases per project and cuts long notes', async () => {
  const { renderReleasesAtom, FEED_ENTRIES } = await import('../scripts/lib/render-seo.mjs');
  const { RELEASES_PER_PROJECT } = await import('../scripts/lib/discover.mjs');
  assert.ok(RELEASES_PER_PROJECT <= 5 && FEED_ENTRIES >= RELEASES_PER_PROJECT);
  const long = 'x'.repeat(5000);
  const feed = renderReleasesAtom({ name: 'A' }, [{ releases: [{ project: 'p', tag: 'v1', url: 'https://e/1', publishedAt: '2026-01-01T00:00:00Z', body: long }] }]);
  const summary = feed.match(/<summary type="text">([^<]*)<\/summary>/)[1];
  assert.ok(summary.length < 1010 && summary.endsWith('…'));
  assert.ok(renderReleasesAtom({ name: 'A' }, [{ releases: [] }]).includes('<updated>1970-01-01T00:00:00Z</updated>'));
});

test('fetchReleases treats a 404 as no releases and fails loud on other errors', async () => {
  const { fetchReleases } = await import('../scripts/lib/discover.mjs');
  assert.deepEqual(await fetchReleases(async () => ({ ok: false, status: 404 }), null, { name: 'x' }), []);
  await assert.rejects(() => fetchReleases(async () => ({ ok: false, status: 500 }), null, { name: 'x' }), /releases API failed for x: 500/);
});

// Feed rules. Each release names its project, as fetchReleases writes it.
const feedRel = (project, tag, publishedAt, body = '') => ({
  project, tag, name: tag, url: `https://github.com/x/${project}/releases/tag/${tag}`, publishedAt, body,
});
const feedTitles = (feed) => [...feed.matchAll(/<entry>[\s\S]*?<title>([^<]+)<\/title>/g)].map((m) => m[1]);

test('the feed shows at most 3 entries for each project', async () => {
  const { renderReleasesAtom, FEED_PER_PROJECT } = await import('../scripts/lib/render-seo.mjs');
  assert.equal(FEED_PER_PROJECT, 3);
  const busy = { name: 'busy', url: `${SITE_ORIGIN}/busy/`, releases: [5, 4, 3, 2, 1].map((d) => feedRel('busy', `v${d}`, `2026-11-0${d}T10:00:00Z`)) };
  const calm = { name: 'calm', url: `${SITE_ORIGIN}/calm/`, releases: [feedRel('calm', 'v1', '2026-10-01T10:00:00Z')] };
  const feed = renderReleasesAtom({ name: 'A' }, [busy, calm]);
  assert.deepEqual(feedTitles(feed), ['busy v5', 'busy v4', 'busy v3', 'calm v1']);
});

test('releases of one project in the same minute become one entry', async () => {
  const { renderReleasesAtom } = await import('../scripts/lib/render-seo.mjs');
  const mono = { name: 'mono', url: `${SITE_ORIGIN}/mono/`, releases: [
    feedRel('mono', 'go/v1', '2026-11-02T08:15:03Z', 'Go notes'),
    feedRel('mono', 'python/v1', '2026-11-02T08:15:01Z', 'Python notes'),
    feedRel('mono', 'corpus/v1', '2026-11-02T08:15:59Z', ''),
    feedRel('mono', 'v0.9', '2026-11-02T08:16:00Z'),
  ] };
  // The same minute in another project stays a separate entry.
  const other = { name: 'other', url: `${SITE_ORIGIN}/other/`, releases: [feedRel('other', 'v2', '2026-11-02T08:15:30Z')] };
  const feed = renderReleasesAtom({ name: 'A' }, [mono, other]);
  assert.deepEqual(feedTitles(feed), ['mono v0.9', 'mono corpus/v1, go/v1, python/v1', 'other v2']);
  const merged = feed.match(/<entry>(?:(?!<\/entry>)[\s\S])*corpus\/v1, go[\s\S]*?<\/entry>/)[0];
  // The entry takes the address and the date of the newest release, and the first note that has text.
  assert.ok(merged.includes('<id>https://github.com/x/mono/releases/tag/corpus/v1</id>'));
  assert.ok(merged.includes('<updated>2026-11-02T08:15:59Z</updated>'));
  assert.ok(merged.includes('<summary type="text">Go notes</summary>'));
  assert.equal((feed.match(/<entry>/g) ?? []).length, 3);
});

test('the feed drops a release older than 24 months, measured from the newest release', async () => {
  const { renderReleasesAtom } = await import('../scripts/lib/render-seo.mjs');
  const projects = [
    { name: 'new', url: `${SITE_ORIGIN}/new/`, releases: [feedRel('new', 'v3', '2026-11-18T14:07:00Z'), feedRel('new', 'v2', '2024-11-18T14:07:00Z'), feedRel('new', 'v1', '2024-11-18T14:06:59Z')] },
    { name: 'old', url: `${SITE_ORIGIN}/old/`, releases: [feedRel('old', 'v0.1', '2020-12-27T00:00:00Z')] },
  ];
  const feed = renderReleasesAtom({ name: 'A' }, projects);
  assert.deepEqual(feedTitles(feed), ['new v3', 'new v2']);
  // The wall clock is not an input: old data alone still gives its newest release.
  assert.deepEqual(feedTitles(renderReleasesAtom({ name: 'A' }, [projects[1]])), ['old v0.1']);
  assert.equal(feed, renderReleasesAtom({ name: 'A' }, projects));
});

test('the feed subtitle says in plain words what the file is', async () => {
  const { renderReleasesAtom } = await import('../scripts/lib/render-seo.mjs');
  const subtitle = renderReleasesAtom({ name: 'Ann & Co' }, []).match(/<subtitle>([^<]+)<\/subtitle>/)[1];
  assert.match(subtitle, /^This file is a release feed\./);
  assert.match(subtitle, /feed reader/);
  assert.match(subtitle, /at most 3 entries for each project, from the last 24 months/);
  assert.ok(subtitle.includes('Ann &amp; Co'));
});

test('a summary is the first paragraph of the notes without Markdown marks', async () => {
  const { plainSummary, renderReleasesAtom } = await import('../scripts/lib/render-seo.mjs');
  assert.equal(plainSummary("## What's Changed\r\n\r\n**Fixed** the `cache` key in [the action](https://e/x) and _more_.\r\n\r\nSecond paragraph."),
    'Fixed the cache key in the action and more.');
  assert.equal(plainSummary('### Pull\n\n- `docker pull a`\n- `docker pull b`\n\nText'), 'docker pull a; docker pull b');
  assert.equal(plainSummary('# Title\nLine one\nline two with snake_case_name\n\nNext'), 'Line one line two with snake_case_name');
  assert.equal(plainSummary('<!-- note -->\n\n> A quote with <b>bold</b>'), 'A quote with bold');
  assert.equal(plainSummary('## Only a heading'), '');
  assert.equal(plainSummary(''), '');
  const feed = renderReleasesAtom({ name: 'A' }, [{ name: 'p', url: `${SITE_ORIGIN}/p/`, releases: [feedRel('p', 'v1', '2026-01-01T00:00:00Z', '## Head')] }]);
  assert.ok(!feed.includes('<summary'));
});

test('each feed entry also links to the project site', async () => {
  const { renderReleasesAtom } = await import('../scripts/lib/render-seo.mjs');
  const feed = renderReleasesAtom({ name: 'A' }, [
    { name: 'p', url: `${SITE_ORIGIN}/p/`, releases: [feedRel('p', 'v1', '2026-01-01T00:00:00Z')] },
    { name: 'q', releases: [feedRel('q', 'v1', '2025-12-01T00:00:00Z')] },
  ]);
  assert.ok(feed.includes(`<link rel="related" type="text/html" href="${SITE_ORIGIN}/p/" title="p project site"/>`));
  assert.equal((feed.match(/rel="related"/g) ?? []).length, 1);
  assert.equal((feed.match(/rel="alternate" type="text\/html" href="https:\/\/github/g) ?? []).length, 2);
});

test('llms.txt, llms-full.txt and projects.json use the texts of featured.json', () => {
  const list = applyOverrides(projects, {
    'cloud-cache-action': { displayName: 'Cloud Cache Action', description: 'Hand-made text.', language: 'Dockerfile' },
  }, () => {});
  const llms = renderLlms(owner, list);
  assert.ok(llms.includes(`- [Cloud Cache Action](${SITE_ORIGIN}/cloud-cache-action/): Hand-made text.`));
  const full = renderLlmsFull(owner, list);
  assert.ok(full.includes('### Cloud Cache Action\n\n- Repository name: cloud-cache-action\n'));
  assert.ok(full.includes('- Description: Hand-made text.'));
  assert.ok(full.includes('- Language: Dockerfile'));
  assert.ok(!full.includes('- Repository name: okf-skills'), 'a project without a display name has no such line');
  const json = JSON.parse(renderProjectsJson(owner, list, NOW)).projects;
  const cache = json.find((p) => p.name === 'cloud-cache-action');
  assert.equal(cache.displayName, 'Cloud Cache Action');
  assert.equal(cache.description, 'Hand-made text.');
  assert.equal(cache.language, 'Dockerfile');
  assert.equal(cache.url, `${SITE_ORIGIN}/cloud-cache-action/`);
  assert.equal(json.find((p) => p.name === 'okf-skills').displayName, 'okf-skills');
});
