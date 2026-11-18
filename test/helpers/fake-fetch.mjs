import { readFileSync } from 'node:fs';

const repos = JSON.parse(readFileSync(new URL('../fixtures/repos.json', import.meta.url)));
const user = JSON.parse(readFileSync(new URL('../fixtures/user.json', import.meta.url)));

/** Stands in for the network: the two API endpoints plus HEAD probes. */
export function fakeFetch(overrides = {}) {
  return async (url, opts = {}) => {
    if (opts.method === 'HEAD') {
      return String(url).includes('cloud-cache-action')
        ? { ok: true, status: 200 }
        : { ok: false, status: 404 };
    }
    const releases = String(url).match(/\/repos\/xSAVIKx\/([^/]+)\/releases/);
    if (releases) {
      const rel = (tag, date, extra = {}) => ({
        tag_name: tag, name: tag, html_url: `https://github.com/xSAVIKx/${releases[1]}/releases/tag/${tag}`,
        published_at: date, body: `Notes for ${tag} & more`, draft: false, prerelease: false, ...extra,
      });
      const body = {
        'cloud-cache-action': [rel('v1.2.0', '2026-09-05T00:00:00Z'), rel('v1.1.0', '2026-08-01T00:00:00Z'),
          rel('v2.0.0-rc.1', '2026-09-08T00:00:00Z', { prerelease: true }), rel('v9', '2026-09-09T00:00:00Z', { draft: true })],
        'okf-skills': [rel('v0.3.0', '2026-09-06T00:00:00Z')],
      }[releases[1]] ?? [];
      return { ok: true, status: 200, json: async () => body };
    }
    const commits = String(url).match(/\/repos\/xSAVIKx\/([^/]+)\/commits/);
    if (commits) {
      const human = { author: { login: 'xSAVIKx', type: 'User' }, commit: { committer: { date: '2026-09-01T00:00:00Z' } } };
      const bot = { author: { login: 'dependabot[bot]', type: 'Bot' }, commit: { committer: { date: '2026-09-10T00:00:00Z' } } };
      const recent = { 'cloud-cache-action': [human, human, human], 'okf-skills': [human, human, human, human, human] };
      const body = String(url).includes('since=') ? (recent[commits[1]] ?? [bot]) : [bot, human];
      return { ok: true, status: 200, json: async () => body };
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

