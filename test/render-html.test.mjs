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
});

/** Accessible name: an aria-label wins, otherwise the link's own text content. */
function linkNames(doc) {
  return [...doc.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attrs, inner]) => {
    const label = attrs.match(/\baria-label="([^"]*)"/);
    return (label ? label[1] : inner.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
  });
}

test('no two links in the document share an accessible name', () => {
  const names = linkNames(html);
  assert.ok(names.length >= 8, `only ${names.length} links found, the check would be vacuous`);
  const seen = new Set();
  const dupes = new Set();
  for (const n of names) {
    const key = n.toLowerCase();
    if (seen.has(key)) dupes.add(n);
    seen.add(key);
  }
  assert.deepEqual([...dupes], [],
    `links sharing an accessible name: ${[...dupes].join(', ')}`);
});

test('lists keep their list role even though the stylesheet hides the bullets', () => {
  for (const [label, doc] of [['index', html], ['404', template404]]) {
    for (const ul of doc.match(/<ul\b[^>]*>/g) ?? []) {
      assert.match(ul, /\srole="list"/, `${label}: list without role="list": ${ul}`);
    }
  }
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

test('a project with topics renders each one, escaped, in its own list', () => {
  const cloudCache = projects.find((p) => p.name === 'cloud-cache-action');
  assert.deepEqual(cloudCache.topics, ['github-actions', 'cache']);
  const out = renderCards([cloudCache]);
  assert.match(out, /<ul class="topics" role="list">/);
  assert.ok(out.includes('<li>github-actions</li>'));
  assert.ok(out.includes('<li>cache</li>'));
});

test('a project with no topics renders no topics list at all', () => {
  const noTopics = projects.find((p) => p.name === 'AndroidScreencast');
  assert.deepEqual(noTopics.topics, []);
  const out = renderCards([noTopics]);
  assert.ok(!out.includes('class="topics"'));
});

test('topics beyond the cap collapse into a "+N more" count instead of piling up', () => {
  const manyTopics = { ...projects[0], topics: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] };
  const out = renderCards([manyTopics]);
  assert.ok(out.includes('<li>+2 more</li>'));
  assert.ok(!out.includes('<li>g</li>'));
});

test('topic text is HTML-escaped like every other interpolated value', () => {
  const evilTopics = { ...projects[0], topics: ['<script>x</script>'] };
  const out = renderCards([evilTopics]);
  assert.ok(!out.includes('<script>x</script>'));
  assert.ok(out.includes('&lt;script&gt;x&lt;/script&gt;'));
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

test('the page carries a local icon set, not a third-party avatar', () => {
  assert.ok(html.includes('<link rel="icon" href="/favicon.ico" sizes="32x32">'));
  assert.ok(html.includes('<link rel="icon" type="image/svg+xml" href="/favicon.svg">'));
  assert.ok(html.includes('<link rel="apple-touch-icon" href="/apple-touch-icon.png">'));
  assert.ok(html.includes('<link rel="manifest" href="/site.webmanifest">'));
  // the avatar may still be used for the <img>, but must not be the favicon
  assert.doesNotMatch(html, /<link rel="icon"[^>]*avatars\.githubusercontent\.com/);
});

test('both colour schemes are declared so dark mode does not flash white', () => {
  assert.ok(html.includes('<meta name="color-scheme" content="light dark">'));
  assert.ok(html.includes('content="#ffffff" media="(prefers-color-scheme: light)"'));
  assert.ok(html.includes('content="#0d1117" media="(prefers-color-scheme: dark)"'));
});

test('the social card is fully described for scrapers that need dimensions', () => {
  assert.ok(html.includes('<meta property="og:site_name" content="xsavikx.github.io">'));
  assert.ok(html.includes('<meta property="og:image:width" content="1200">'));
  assert.ok(html.includes('<meta property="og:image:height" content="630">'));
  assert.match(html, /<meta property="og:image:alt" content="[^"]+">/);
  assert.match(html, /<meta name="twitter:image:alt" content="[^"]+">/);
});

test('the 404 page carries the same icon identity', () => {
  const out = render404(template404);
  assert.ok(out.includes('<link rel="icon" type="image/svg+xml" href="/favicon.svg">'));
  assert.ok(out.includes('<meta name="color-scheme" content="light dark">'));
});

test('rendering is deterministic for a fixed now', () => {
  assert.equal(html, renderIndex({ template: indexTemplate, owner, projects, now: NOW }));
});
