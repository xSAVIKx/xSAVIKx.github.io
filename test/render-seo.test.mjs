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

test('llms.txt points agents at a nested llms.txt only where one exists, as a markdown link', () => {
  const out = renderLlms(owner, projects);
  assert.ok(out.includes(`— [llms.txt](${ORIGIN}/cloud-cache-action/llms.txt)`));
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
