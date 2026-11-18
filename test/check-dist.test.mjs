import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from '../scripts/build.mjs';
import { checkDist } from '../scripts/check-dist.mjs';
import { fakeFetch } from './helpers/fake-fetch.mjs';

const NOW = new Date('2026-09-11T00:00:00Z');

async function built() {
  const dir = await mkdtemp(path.join(tmpdir(), 'hub-check-'));
  await build({ fetchFn: fakeFetch(), now: NOW, outDir: dir });
  return dir;
}
const failures = (results) => results.filter((r) => !r.ok).map((r) => r.name);

test('a fresh build passes every check', async () => {
  const results = await checkDist(await built());
  assert.deepEqual(failures(results), []);
  assert.ok(results.length > 40, `expected many checks, got ${results.length}`);
});

test('an unfilled slot fails the gate', async () => {
  const dir = await built();
  const file = path.join(dir, 'index.html');
  await writeFile(file, (await readFile(file, 'utf8')).replace('</main>', '{{CARDS}}</main>'));
  assert.ok(failures(await checkDist(dir)).includes('index.html: no unfilled {{SLOT}}'));
});

test('a missing local asset fails the gate, a project-site path does not', async () => {
  const dir = await built();
  await rm(path.join(dir, 'styles.css'));
  const failed = await checkDist(dir);
  const link = failed.find((r) => r.name === 'index.html: every local link and asset exists');
  assert.equal(link.ok, false);
  assert.match(link.detail, /\/styles\.css/);
  assert.doesNotMatch(link.detail, /cloud-cache-action/);
});

test('broken JSON-LD fails the gate', async () => {
  const dir = await built();
  const file = path.join(dir, 'index.html');
  await writeFile(file, (await readFile(file, 'utf8'))
    .replace('<script type="application/ld+json">{', '<script type="application/ld+json">{,'));
  assert.ok(failures(await checkDist(dir)).includes('JSON-LD parses'));
});

test('a file over its size budget fails the gate', async () => {
  const dir = await built();
  await writeFile(path.join(dir, 'webmcp.js'), 'x'.repeat(20_000));
  assert.ok(failures(await checkDist(dir)).some((n) => n.startsWith('budget webmcp.js')));
});
