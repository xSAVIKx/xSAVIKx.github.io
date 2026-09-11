export const OWNER = 'xSAVIKx';
export const ORIGIN = 'https://xsavikx.github.io';
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
    url: `${ORIGIN}/${repo.name}/`,
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

/** A missing file on GitHub Pages is a 404 with an HTML body, so trust the status. */
export async function probeAsset(fetchFn, url) {
  try {
    const res = await fetchFn(url, { method: 'HEAD' });
    return Boolean(res.ok);
  } catch {
    return false;
  }
}

export async function enrichAll(fetchFn, projects) {
  return Promise.all(projects.map(async (p) => {
    const [hasSitemap, hasLlms] = await Promise.all([
      probeAsset(fetchFn, `${p.url}sitemap.xml`),
      probeAsset(fetchFn, `${p.url}llms.txt`),
    ]);
    return { ...p, hasSitemap, hasLlms };
  }));
}
