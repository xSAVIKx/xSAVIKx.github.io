#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ORIGIN } from './lib/discover.mjs';

const DIST = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'dist');
const REQUIRED = ['cloud-cache-action', 'AndroidScreencast', 'okf-skills'];

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function status(url) {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    return res.status;
  } catch (err) {
    return `error: ${err.message}`;
  }
}

const read = (f) => readFile(path.join(DIST, f), 'utf8');
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const [html, robots, sitemap, pages, llms] = await Promise.all(
  ['index.html', 'robots.txt', 'sitemap.xml', 'sitemap-pages.xml', 'llms.txt'].map(read));

// Structure
check('index has no unfilled slots', !/\{\{[A-Z_]+\}\}/.test(html));
check('index has exactly one h1', (html.match(/<h1[ >]/g) ?? []).length === 1);
check('Search Console tag present',
  html.includes('content="sMLPKoYMB5EoPQiOfUJ51P7xLG55OXBKV9PTEvp2HPw"'));
check('JSON-LD parses', (() => {
  try { JSON.parse(html.match(/application\/ld\+json">([\s\S]*?)<\/script>/)[1]); return true; }
  catch { return false; }
})());

for (const name of REQUIRED) {
  check(`index lists ${name}`, html.includes(`${ORIGIN}/${name}/`));
}

// Icon set — these are copied, not generated, so a missing source file would
// otherwise only surface as a broken favicon in a browser tab.
for (const asset of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png',
  'icon-192.png', 'icon-512.png', 'site.webmanifest']) {
  const { statSync } = await import('node:fs');
  let bytes = 0;
  try { bytes = statSync(path.join(DIST, asset)).size; } catch { bytes = 0; }
  check(`icon asset ${asset}`, bytes > 0, bytes ? `${bytes} bytes` : 'missing or empty');
}

check('manifest is valid JSON', (() => {
  try { JSON.parse(readFileSync(path.join(DIST, 'site.webmanifest'), 'utf8')); return true; }
  catch { return false; }
})());

check('favicon is local, not a third-party request',
  !/<link rel="icon"[^>]*avatars\.githubusercontent\.com/.test(html));

// robots.txt
check('robots names the sitemap', robots.includes(`Sitemap: ${ORIGIN}/sitemap.xml`));
check('robots disallows nothing', !/^Disallow: \S/m.test(robots));

// Sitemaps
const childSitemaps = locs(sitemap);
check('sitemap index is an index', sitemap.includes('<sitemapindex'));
check('sitemap index references the fallback urlset',
  childSitemaps.includes(`${ORIGIN}/sitemap-pages.xml`));
check('every sitemap URL is same-origin',
  [...childSitemaps, ...locs(pages)].every((u) => u.startsWith(ORIGIN)));

// Live reachability — the point of this script.
// Anything this build generates at the origin root is NOT yet deployed when we
// run locally, and is already verified above by reading dist/. Checking it here
// would fail every pre-deploy run against a file we just wrote ourselves.
const GENERATED_AT_ROOT = new Set(['', 'index.html', '404.html', 'robots.txt',
  'sitemap.xml', 'sitemap-pages.xml', 'llms.txt', 'llms-full.txt',
  'styles.css', 'og.png'].map((f) => `${ORIGIN}/${f}`));

const live = [...new Set([
  ...locs(pages),
  ...childSitemaps,
  ...REQUIRED.map((n) => `${ORIGIN}/${n}/`),
  ...[...llms.matchAll(/\((https:\/\/[^)]+)\)/g)].map((m) => m[1]),
])].filter((u) => !GENERATED_AT_ROOT.has(u));

for (const url of live) {
  const s = await status(url);
  check(`200 ${url}`, s === 200, String(s));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
