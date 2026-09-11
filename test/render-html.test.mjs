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
