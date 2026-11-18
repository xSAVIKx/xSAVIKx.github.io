import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SITE_ORIGIN, isProjectSite, toProject, selectProjects,
  probeAsset, enrichAll, fetchAllRepos, fetchOwner, findCard, orderProjects, isBotCommit, fetchActivity,
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
    `${SITE_ORIGIN}/AndroidScreencast/`);
  // homepage is null upstream; we still derive a URL
  assert.equal(toProject(byName('okf-skills')).url, `${SITE_ORIGIN}/okf-skills/`);
});

test('coerces a null description to an empty string', () => {
  assert.equal(toProject(byName('okf-skills')).description, '');
});

test('selects exactly the three real project sites, newest push first', () => {
  const names = selectProjects(repos).map((p) => p.name);
  assert.deepEqual(names, ['cloud-cache-action', 'AndroidScreencast', 'okf-skills']);
});

test('probeAsset reports true only on a 2xx', async () => {
  // an absent file is a real 404, not an ok:false with a 200 status
  const fake = async (url) => (url.endsWith('sitemap.xml')
    ? { ok: true, status: 200 }
    : { ok: false, status: 404 });
  assert.equal(await probeAsset(fake, 'https://x/sitemap.xml'), true);
  assert.equal(await probeAsset(fake, 'https://x/llms.txt'), false);
});

test('probeAsset treats a 404 as a definitive absence, without retrying', async () => {
  let calls = 0;
  const gone = async () => { calls += 1; return { ok: false, status: 404 }; };
  assert.equal(await probeAsset(gone, 'https://x/llms.txt', { delay: async () => {} }), false);
  assert.equal(calls, 1, 'a definitive answer must not be retried');
});

test('probeAsset refuses to call an unreachable host "absent"', async () => {
  const offline = async () => { throw new Error('ENOTFOUND'); };
  await assert.rejects(
    () => probeAsset(offline, 'https://new-host/sitemap.xml', { delay: async () => {} }),
    (err) => {
      // the message must name the URL, or a flip-day failure is unactionable
      assert.match(err.message, /new-host\/sitemap\.xml/);
      assert.match(err.message, /ENOTFOUND/);
      assert.match(err.message, /Refusing to guess/);
      return true;
    },
  );
});

test('probeAsset retries a transport failure and succeeds if the host recovers', async () => {
  let calls = 0;
  const flaky = async () => {
    calls += 1;
    if (calls < 3) throw new Error('ECONNRESET');
    return { ok: true, status: 200 };
  };
  assert.equal(await probeAsset(flaky, 'https://x/sitemap.xml', { delay: async () => {} }), true);
  assert.equal(calls, 3);
});

test('probeAsset retries a 5xx, which says nothing about whether the file exists', async () => {
  let calls = 0;
  const broken = async () => { calls += 1; return { ok: false, status: 503 }; };
  await assert.rejects(
    () => probeAsset(broken, 'https://x/sitemap.xml', { delay: async () => {} }),
    /HTTP 503/,
  );
  assert.equal(calls, 3, 'default is 1 attempt plus 2 retries');
});

test('a probe failure aborts enrichment rather than degrading the sitemap', async () => {
  const offline = async () => { throw new Error('EAI_AGAIN'); };
  await assert.rejects(
    () => enrichAll(offline, selectProjects(repos), { delay: async () => {} }),
    /Refusing to guess/,
  );
});

test('enrichAll annotates each project with its available assets', async () => {
  const fake = async (url) => (url.includes('cloud-cache-action')
    ? { ok: true, status: 200 }
    : { ok: false, status: 404 });
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

test('a hand-made card is found in order of preference: svg, webp, png', async () => {
  const project = { url: 'https://example.test/p/' };
  const only = (file) => async (url) => (url.endsWith(file) ? { ok: true, status: 200 } : { ok: false, status: 404 });
  assert.equal(await findCard(only('card.png'), project), 'https://example.test/p/card.png');
  assert.equal(await findCard(only('card.svg'), project), 'https://example.test/p/card.svg');
  assert.equal(await findCard(async () => ({ ok: false, status: 404 }), project), null);
});

test('enrichAll records a hand-made card, or null when there is none', async () => {
  const fake = async (url) => (url === 'https://xsavikx.github.io/okf-skills/card.webp'
    ? { ok: true, status: 200 } : { ok: false, status: 404 });
  const enriched = await enrichAll(fake, selectProjects(repos));
  assert.equal(enriched.find((p) => p.name === 'okf-skills').card,
    'https://xsavikx.github.io/okf-skills/card.webp');
  assert.equal(enriched.find((p) => p.name === 'cloud-cache-action').card, null);
});

const proj = (name, commits90, updatedAt) => ({ name, commits90, updatedAt, pushedAt: updatedAt });

test('featured projects come first in the given order, the rest by activity', () => {
  const list = [proj('a', 1, '2026-01-01'), proj('b', 9, '2026-01-01'), proj('c', 1, '2026-05-01'), proj('D', 0, '2026-09-01')];
  const out = orderProjects(list, ['d', 'a'], () => {});
  assert.deepEqual(out.map((p) => p.name), ['D', 'a', 'b', 'c']);
  assert.deepEqual(out.map((p) => Boolean(p.featured)), [true, true, false, false]);
});

test('an unknown featured name is reported, not dropped in silence', () => {
  const warnings = [];
  orderProjects([proj('a', 0, '2026-01-01')], ['gone'], (m) => warnings.push(m));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /"gone"/);
});

test('bot commits are recognised by account type or by the [bot] suffix', () => {
  assert.ok(isBotCommit({ author: { type: 'Bot', login: 'x' } }));
  assert.ok(isBotCommit({ author: { login: 'dependabot[bot]' } }));
  assert.ok(isBotCommit({ author: null, commit: { author: { name: 'github-actions[bot]' } } }));
  assert.ok(!isBotCommit({ author: { login: 'xSAVIKx', type: 'User' } }));
});

test('an empty repository has no activity rather than failing the build', async () => {
  const empty = async () => ({ ok: false, status: 409 });
  const out = await fetchActivity(empty, null, proj('e', null, '2026-01-01'), new Date('2026-09-11'));
  assert.deepEqual(out, { commits90: 0, updatedAt: '2026-01-01' });
});
