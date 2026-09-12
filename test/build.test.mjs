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
    '404.html', 'apple-touch-icon.png', 'favicon.ico', 'favicon.svg',
    'icon-192.png', 'icon-512.png', 'index.html', 'llms-full.txt', 'llms.txt',
    'og.png', 'robots.txt', 'site.webmanifest', 'sitemap-pages.xml',
    'sitemap.xml', 'styles.css',
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
