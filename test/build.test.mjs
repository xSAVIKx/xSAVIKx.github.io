import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from '../scripts/build.mjs';
import { fakeFetch } from './helpers/fake-fetch.mjs';

const NOW = new Date('2026-09-11T00:00:00Z');

const outDir = async () => mkdtemp(path.join(tmpdir(), 'hub-build-'));

test('writes the full set of artifacts', async () => {
  const dir = await outDir();
  await build({ fetchFn: fakeFetch(), now: NOW, outDir: dir });
  const written = (await readdir(dir)).sort();
  assert.deepEqual(written, [
    '404.html', 'apple-touch-icon.png', 'cards', 'favicon.ico', 'favicon.svg',
    'icon-192.png', 'icon-512.png', 'identity', 'index.html', 'llms-full.txt', 'llms.txt',
    'og.png', 'projects.json', 'releases.xml', 'robots.txt', 'site.webmanifest', 'sitemap-pages.xml',
    'sitemap.xml', 'styles.css', 'webmcp.js',
  ]);
});

test('reports the three discovered project sites: featured first, then by activity', async () => {
  const dir = await outDir();
  const result = await build({ fetchFn: fakeFetch(), now: NOW, outDir: dir });
  // cloud-cache-action is in src/featured.json; okf-skills has more recent commits.
  assert.deepEqual(result.projects.map((p) => p.name),
    ['cloud-cache-action', 'okf-skills', 'AndroidScreencast']);
  const android = result.projects.find((p) => p.name === 'AndroidScreencast');
  assert.equal(android.commits90, 0);
  assert.equal(android.updatedAt, '2026-09-01T00:00:00Z', 'the bot commit must not count as an update');
});

test('the rendered index names every project', async () => {
  const dir = await outDir();
  await build({ fetchFn: fakeFetch(), now: NOW, outDir: dir });
  const html = await readFile(path.join(dir, 'index.html'), 'utf8');
  for (const name of ['cloud-cache-action', 'AndroidScreencast', 'okf-skills']) {
    assert.ok(html.includes(name), `index is missing ${name}`);
  }
  assert.ok(!html.includes('xSAVIKx.github.io/</a>'), 'hub must not list itself');
  assert.ok(html.includes('<meta name="google-site-verification"'), 'the build must apply src/site-verification.json');
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

test('the build applies the texts of src/featured.json to each output and reports an empty description', async () => {
  const dir = await outDir();
  const warnings = [];
  const { projects } = await build({ fetchFn: fakeFetch(), now: NOW, outDir: dir, warn: (m) => warnings.push(m) });
  const featured = JSON.parse(await readFile(new URL('../src/featured.json', import.meta.url), 'utf8'));
  const html = await readFile(path.join(dir, 'index.html'), 'utf8');
  const json = JSON.parse(await readFile(path.join(dir, 'projects.json'), 'utf8')).projects;
  const llms = await readFile(path.join(dir, 'llms.txt'), 'utf8');
  for (const p of projects) {
    const texts = featured.projects[p.name] ?? {};
    const entry = json.find((j) => j.name === p.name);
    assert.equal(entry.displayName, texts.displayName ?? p.name);
    if (texts.description) {
      assert.equal(entry.description, texts.description);
      assert.ok(llms.includes(texts.description));
    }
    assert.ok(html.includes(`>${texts.displayName ?? p.name}</a>`));
  }
  // The fixture of okf-skills has no description on GitHub. src/featured.json gives one, so no warning.
  assert.ok(!warnings.some((m) => m.includes('empty description')), warnings.join(' | '));
});

test('the build reports a project that has no description at all', async () => {
  const dir = await outDir();
  const warnings = [];
  const repos = JSON.parse(await readFile(new URL('./fixtures/repos.json', import.meta.url), 'utf8'))
    .map((r) => (r.name === 'cloud-cache-action' ? { ...r, description: null } : r));
  const featured = JSON.parse(await readFile(new URL('../src/featured.json', import.meta.url), 'utf8'));
  await build({ fetchFn: fakeFetch({ repos }), now: NOW, outDir: dir, warn: (m) => warnings.push(m) });
  const expected = featured.projects['cloud-cache-action']?.description ? 0 : 1;
  assert.equal(warnings.filter((m) => m === '"cloud-cache-action" has an empty description. Add one on GitHub or in src/featured.json.').length, expected);
});
