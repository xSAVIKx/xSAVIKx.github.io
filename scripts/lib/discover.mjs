export const OWNER = 'xSAVIKx';

/**
 * The single place this estate's public identity is defined.
 *
 * Every absolute URL this build emits derives from it: canonical, og:url,
 * both JSON-LD @ids, both sitemaps, the Sitemap: line in robots.txt, and every
 * link in llms.txt / llms-full.txt. Changing the hostname is changing this line.
 *
 * It also governs every project site published under the same account: a custom
 * domain on a user-pages repo applies to all of them, so `<origin>/<project>/`
 * is the permanent docs host for every repo with Pages enabled, inherited
 * automatically by new ones. test/origin.test.mjs fails if the literal hostname
 * reappears anywhere else.
 *
 * No trailing slash — every construction adds one explicitly.
 */
export const SITE_ORIGIN = 'https://xsavikx.github.io';

/** Host without scheme, for display and for og:site_name. */
export const SITE_HOST = new URL(SITE_ORIGIN).host;

/**
 * The name of THIS repository, which is deliberately NOT derived from
 * SITE_ORIGIN. They coincide today only because a user-pages repo is named
 * after the github.io host; the repo keeps that name under any custom domain.
 */
export const SELF_REPO = 'xsavikx.github.io';
export const PRIMARY_SITE = 'https://serhiichuk.dev/';

const API = 'https://api.github.com';
const PER_PAGE = 100;

function headers(token) {
  const h = { Accept: 'application/vnd.github+json', 'User-Agent': `${OWNER}-hub-build` };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/** A repo earns a card only if it actually publishes a site of its own. */
export function isProjectSite(repo) {
  if (!repo?.has_pages) return false;
  if (repo.fork || repo.archived || repo.private) return false;
  return repo.name.toLowerCase() !== SELF_REPO;
}

/**
 * The API's `homepage` is unreliable — sometimes missing, sometimes without a
 * trailing slash, sometimes pointing off-domain entirely. Derive from the name.
 */
export function toProject(repo) {
  return {
    name: repo.name,
    description: (repo.description ?? '').trim(),
    url: `${SITE_ORIGIN}/${repo.name}/`,
    repoUrl: repo.html_url,
    language: repo.language ?? null,
    topics: repo.topics ?? [],
    stars: repo.stargazers_count ?? 0,
    pushedAt: repo.pushed_at,
  };
}

export function selectProjects(repos) {
  return repos
    .filter(isProjectSite)
    .map(toProject)
    .sort((a, b) => b.pushedAt.localeCompare(a.pushedAt));
}

export async function fetchAllRepos(fetchFn, token) {
  const all = [];
  for (let page = 1; ; page += 1) {
    const url = `${API}/users/${OWNER}/repos?per_page=${PER_PAGE}&page=${page}`;
    const res = await fetchFn(url, { headers: headers(token) });
    if (!res.ok) throw new Error(`GitHub repos API failed: ${res.status}`);
    const batch = await res.json();
    all.push(...batch);
    if (batch.length < PER_PAGE) return all;
  }
}

export async function fetchOwner(fetchFn, token) {
  const res = await fetchFn(`${API}/users/${OWNER}`, { headers: headers(token) });
  if (!res.ok) throw new Error(`GitHub user API failed: ${res.status}`);
  const u = await res.json();
  return {
    login: u.login,
    name: u.name ?? u.login,
    bio: (u.bio ?? '').replace(/\s+/g, ' ').trim(),
    avatar: u.avatar_url,
    htmlUrl: u.html_url,
    twitter: u.twitter_username ?? null,
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Does `url` exist? Answers only when it can actually tell.
 *
 * Three outcomes, and the third is the reason this is not a plain boolean:
 *   2xx                     -> true   (present)
 *   4xx                     -> false  (definitively absent; a missing file on
 *                                      GitHub Pages is a 404 with an HTML body)
 *   transport failure / 5xx -> retry, then THROW
 *
 * The third case is unknown, not absent, and collapsing it into `false` is how a
 * build publishes a quietly degraded sitemap while every step reports success: a
 * project's child sitemap silently vanishes from the index because DNS was slow,
 * not because the file went away. A build that cannot reach the host must not
 * publish a sitemap asserting what it found there, so it fails instead.
 *
 * This matters most the first time the site's origin changes, when the host
 * genuinely is unreachable for a while and the unknown case stops being
 * theoretical.
 */
export async function probeAsset(fetchFn, url, { retries = 2, delay = sleep } = {}) {
  let reason = 'unknown';

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await delay(250 * 2 ** (attempt - 1));

    let res;
    try {
      res = await fetchFn(url, { method: 'HEAD' });
    } catch (err) {
      reason = err?.message ?? String(err);
      continue;
    }

    if (res.ok) return true;
    if (res.status >= 400 && res.status < 500) return false;
    reason = `HTTP ${res.status}`;
  }

  throw new Error(
    `Could not determine whether ${url} exists after ${retries + 1} attempts (${reason}). `
    + 'Refusing to guess: treating an unreachable host as "no such file" would publish '
    + 'a sitemap that quietly drops pages while reporting success.',
  );
}

export async function enrichAll(fetchFn, projects, options = {}) {
  return Promise.all(projects.map(async (p) => {
    const [hasSitemap, hasLlms] = await Promise.all([
      probeAsset(fetchFn, `${p.url}sitemap.xml`, options),
      probeAsset(fetchFn, `${p.url}llms.txt`, options),
    ]);
    return { ...p, hasSitemap, hasLlms };
  }));
}
