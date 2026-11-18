import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectProjects, fetchOwner, SITE_ORIGIN } from '../scripts/lib/discover.mjs';
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
  assert.ok(html.includes('<li>Release v1.2.0</li>'));
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
