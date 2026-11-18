#!/usr/bin/env node
import { mkdir, writeFile, copyFile, readFile, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  fetchAllRepos, fetchOwner, selectProjects, enrichAll, addActivity, orderProjects, SITE_HOST,
} from './lib/discover.mjs';
import {
  renderRobots, renderSitemapIndex, renderSitemapPages, renderLlms, renderLlmsFull,
  renderProjectsJson,
} from './lib/render-seo.mjs';
import { renderIndex, render404, fill, htmlEscape } from './lib/render-html.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

export async function build({
  fetchFn = fetch,
  token = process.env.GITHUB_TOKEN,
  now = new Date(),
  outDir = DIST,
} = {}) {
  const [owner, repos] = await Promise.all([
    fetchOwner(fetchFn, token),
    fetchAllRepos(fetchFn, token),
  ]);

  const { featured } = JSON.parse(await readFile(path.join(SRC, 'featured.json'), 'utf8'));
  const verification = JSON.parse(await readFile(path.join(SRC, 'site-verification.json'), 'utf8'));
  // Hand-made card art kept in this repository: src/cards/<repo>.svg.
  const hubCards = new Set((await readdir(path.join(SRC, 'cards')).catch(() => []))
    .filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)));

  const enriched = await addActivity(fetchFn, token,
    await enrichAll(fetchFn, selectProjects(repos)), now);
  const projects = orderProjects(enriched.map((p) => ({
    ...p,
    // A card the project site publishes wins over one kept here.
    card: p.card ?? (hubCards.has(p.name) ? `/cards/${p.name}.svg` : null),
  })), featured);
  // A shape change in the API must be loud, not a silently empty grid.
  if (projects.length === 0) {
    throw new Error('Discovered zero project sites — refusing to publish an empty hub.');
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const [indexTemplate, template404, manifestTemplate] = await Promise.all([
    readFile(path.join(SRC, 'index.html'), 'utf8'),
    readFile(path.join(SRC, '404.html'), 'utf8'),
    readFile(path.join(SRC, 'site.webmanifest'), 'utf8'),
  ]);

  const generated = {
    'index.html': renderIndex({ template: indexTemplate, owner, projects, now, verification }),
    '404.html': render404(template404),
    // Templated rather than copied: it names the host, which must follow SITE_ORIGIN.
    'site.webmanifest': fill(manifestTemplate, { HOST: htmlEscape(SITE_HOST) }),
    'robots.txt': renderRobots(),
    'sitemap.xml': renderSitemapIndex(projects, now),
    'sitemap-pages.xml': renderSitemapPages(projects, now),
    'llms.txt': renderLlms(owner, projects),
    'llms-full.txt': renderLlmsFull(owner, projects),
    'projects.json': renderProjectsJson(owner, projects, now),
  };

  await Promise.all(Object.entries(generated)
    .map(([name, body]) => writeFile(path.join(outDir, name), body)));

  const copied = ['styles.css', 'webmcp.js', 'og.png', 'favicon.svg', 'favicon.ico',
    'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];
  await Promise.all(copied.map((f) => copyFile(path.join(SRC, f), path.join(outDir, f))));
  // The shared identity: served at /identity/ so project sites can compare their vendored copy.
  const identity = ['tokens.json', ...(await readdir(path.join(ROOT, 'identity', 'dist')))]
    .map((f) => [f === 'tokens.json' ? path.join(ROOT, 'identity', f) : path.join(ROOT, 'identity', 'dist', f), `identity/${f}`]);
  await mkdir(path.join(outDir, 'identity'));
  await Promise.all(identity.map(([from, to]) => copyFile(from, path.join(outDir, to))));

  const cards = [...hubCards].map((n) => `cards/${n}.svg`);
  if (cards.length) await mkdir(path.join(outDir, 'cards'));
  await Promise.all(cards.map((f) => copyFile(path.join(SRC, f), path.join(outDir, f))));

  return { owner, projects, files: [...Object.keys(generated), ...copied, ...cards, ...identity.map(([, to]) => to)] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { projects, files } = await build();
    console.log(`Built ${files.length} files for ${projects.length} project sites:`);
    for (const p of projects) console.log(`  - ${p.name} -> ${p.url}`);
  } catch (err) {
    console.error(`Build failed: ${err.message}`);
    process.exit(1);
  }
}
