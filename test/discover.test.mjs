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
