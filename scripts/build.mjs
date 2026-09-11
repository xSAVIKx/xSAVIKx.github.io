#!/usr/bin/env node
import { mkdir, writeFile, copyFile, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fetchAllRepos, fetchOwner, selectProjects, enrichAll } from './lib/discover.mjs';
import {
  renderRobots, renderSitemapIndex, renderSitemapPages, renderLlms, renderLlmsFull,
} from './lib/render-seo.mjs';
import { renderIndex, render404 } from './lib/render-html.mjs';

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

  const projects = await enrichAll(fetchFn, selectProjects(repos));
  // A shape change in the API must be loud, not a silently empty grid.
  if (projects.length === 0) {
    throw new Error('Discovered zero project sites — refusing to publish an empty hub.');
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const [indexTemplate, template404] = await Promise.all([
    readFile(path.join(SRC, 'index.html'), 'utf8'),
    readFile(path.join(SRC, '404.html'), 'utf8'),
  ]);

  const generated = {
    'index.html': renderIndex({ template: indexTemplate, owner, projects, now }),
    '404.html': render404(template404),
    'robots.txt': renderRobots(),
    'sitemap.xml': renderSitemapIndex(projects, now),
    'sitemap-pages.xml': renderSitemapPages(projects, now),
    'llms.txt': renderLlms(owner, projects),
    'llms-full.txt': renderLlmsFull(owner, projects),
  };

  await Promise.all(Object.entries(generated)
    .map(([name, body]) => writeFile(path.join(outDir, name), body)));

  const copied = ['styles.css', 'og.png'];
  await Promise.all(copied.map((f) => copyFile(path.join(SRC, f), path.join(outDir, f))));

  return { owner, projects, files: [...Object.keys(generated), ...copied] };
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
