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
    // Replaced by the date of the last human commit when activity is known.
    // pushed_at alone also moves for bot branches, such as Dependabot updates.
    updatedAt: repo.pushed_at,
    commits90: null,
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

/**
 * File names a project site can publish at its root to replace the generated
 * card art, in order of preference. The image shows at a 10:3 ratio; 640x192
 * suits a raster file.
 */
export const CARD_FILES = ['card.svg', 'card.webp', 'card.png'];

/** The URL of the first hand-made card image the site publishes, or null. */
export async function findCard(fetchFn, project, options = {}) {
  for (const file of CARD_FILES) {
    const url = `${project.url}${file}`;
    if (await probeAsset(fetchFn, url, options)) return url;
  }
  return null;
}

export async function enrichAll(fetchFn, projects, options = {}) {
  return Promise.all(projects.map(async (p) => {
    const [hasSitemap, hasLlms, card] = await Promise.all([
      probeAsset(fetchFn, `${p.url}sitemap.xml`, options),
      probeAsset(fetchFn, `${p.url}llms.txt`, options),
      findCard(fetchFn, p, options),
    ]);
    return { ...p, hasSitemap, hasLlms, card };
  }));
}

export const ACTIVITY_DAYS = 90;
/** At most this many pages of 100 commits per project. Past that, the count is a floor. */
export const ACTIVITY_PAGES = 5;

/** A commit made by an automation account, such as Dependabot or github-actions. */
export function isBotCommit(c) {
  const login = c?.author?.login ?? '';
  const name = c?.commit?.author?.name ?? '';
  return c?.author?.type === 'Bot' || /\[bot\]$/i.test(login) || /\[bot\]$/i.test(name);
}

async function getCommits(fetchFn, token, name, query) {
  const url = `${API}/repos/${OWNER}/${encodeURIComponent(name)}/commits?${query}`;
  const res = await fetchFn(url, { headers: headers(token) });
  // 409: the repository is empty. It has no commits, which is a real answer.
  if (res.status === 409) return [];
  if (!res.ok) throw new Error(`GitHub commits API failed for ${name}: ${res.status}`);
  return res.json();
}

/**
 * How active a project is: human commits on the default branch in the last
 * ACTIVITY_DAYS days, and the date of the last human commit.
 */
export async function fetchActivity(fetchFn, token, project, now) {
  const since = new Date(new Date(now).getTime() - ACTIVITY_DAYS * 86400000).toISOString();
  const all = [];
  for (let page = 1; page <= ACTIVITY_PAGES; page += 1) {
    const batch = await getCommits(fetchFn, token, project.name, `since=${since}&per_page=100&page=${page}`);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  const recent = all.filter((c) => !isBotCommit(c));
  let last = recent[0];
  if (!last) {
    const older = await getCommits(fetchFn, token, project.name, 'per_page=30');
    last = older.find((c) => !isBotCommit(c));
  }
  const date = last?.commit?.committer?.date ?? last?.commit?.author?.date ?? null;
  return { commits90: recent.length, updatedAt: date ?? project.pushedAt };
}

export async function addActivity(fetchFn, token, projects, now) {
  return Promise.all(projects.map(async (p) => ({ ...p, ...await fetchActivity(fetchFn, token, p, now) })));
}

/** The feed keeps this many releases of each project, so one busy repository cannot fill it. */
export const RELEASES_PER_PROJECT = 5;

/**
 * The newest published releases of a project, newest first. Drafts and pre-releases are left out.
 * A 404 (no access, or the repository is gone) gives no releases, like a repository without any.
 */
export async function fetchReleases(fetchFn, token, project) {
  const url = `${API}/repos/${OWNER}/${encodeURIComponent(project.name)}/releases?per_page=20`;
  const res = await fetchFn(url, { headers: headers(token) });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub releases API failed for ${project.name}: ${res.status}`);
  return (await res.json())
    .filter((r) => !r.draft && !r.prerelease && r.published_at)
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .slice(0, RELEASES_PER_PROJECT)
    .map((r) => ({
      project: project.name,
      tag: r.tag_name,
      name: r.name || r.tag_name,
      url: r.html_url,
      publishedAt: r.published_at,
      body: r.body || '',
    }));
}

export async function addReleases(fetchFn, token, projects) {
  return Promise.all(projects.map(async (p) => ({ ...p, releases: await fetchReleases(fetchFn, token, p) })));
}

/**
 * The display order. Hand-picked projects come first, in the order given.
 * The others follow by activity: more recent human commits first, then the
 * newer last commit. Names match without regard to case. An unknown name is
 * reported, so a renamed repository does not drop out of the feature in silence.
 */
export function orderProjects(projects, featured = [], warn = console.warn) {
  const byName = new Map(projects.map((p) => [p.name.toLowerCase(), p]));
  const picked = [];
  for (const name of featured) {
    const p = byName.get(String(name).toLowerCase());
    if (!p) { warn(`featured.json names "${name}", but no project site has that name.`); continue; }
    if (!picked.includes(p)) picked.push(p);
  }
  const rest = projects.filter((p) => !picked.includes(p)).sort((a, b) =>
    (b.commits90 ?? 0) - (a.commits90 ?? 0) || b.updatedAt.localeCompare(a.updatedAt));
  return [...picked.map((p) => ({ ...p, featured: true })), ...rest];
}

/** The fields that `projects` in src/featured.json can set for one project. */
export const OVERRIDE_FIELDS = ['displayName', 'description', 'language'];

/**
 * Applies the hand-made texts of src/featured.json. A value there replaces the GitHub value.
 * `name` stays the repository name, because the URLs and the lookups use it.
 * Each project gets `displayName`: the override, or the repository name.
 * The function reports an unknown project name, an unknown field, a value that is not
 * a text, and a project that has an empty description after the overrides.
 */
export function applyOverrides(projects, overrides = {}, warn = console.warn) {
  const byName = new Map(Object.entries(overrides)
    .filter(([name]) => !name.startsWith('_'))
    .map(([name, fields]) => [name.toLowerCase(), [name, fields]]));
  const known = new Set(projects.map((p) => p.name.toLowerCase()));
  for (const [key, [name]] of byName) {
    if (!known.has(key)) warn(`featured.json has texts for "${name}", but no project site has that name.`);
  }
  return projects.map((p) => {
    const [, fields = {}] = byName.get(p.name.toLowerCase()) ?? [];
    const out = { ...p, displayName: p.name };
    for (const [field, value] of Object.entries(fields)) {
      if (!OVERRIDE_FIELDS.includes(field)) {
        warn(`featured.json: "${p.name}" has the unknown field "${field}". The fields are ${OVERRIDE_FIELDS.join(', ')}.`);
      } else if (typeof value !== 'string' || !value.trim()) {
        warn(`featured.json: "${p.name}" has an empty "${field}". The GitHub value stays.`);
      } else {
        out[field] = value.trim();
      }
    }
    if (!out.description) {
      warn(`"${p.name}" has an empty description. Add one on GitHub or in src/featured.json.`);
    }
    return out;
  });
}
