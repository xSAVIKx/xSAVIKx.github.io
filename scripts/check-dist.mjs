#!/usr/bin/env node
// The quality gate for a built dist/. Offline and deterministic: it reads files only.
// CI runs it after `npm run build` and before the deploy. scripts/verify.mjs is the
// separate live check that fetches URLs after a deploy.
// Usage: node scripts/check-dist.mjs [dir]   (default: dist)
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SITE_ORIGIN } from './lib/discover.mjs';

/** Size budgets in bytes, uncompressed. Today each file uses less than half of its budget. */
export const BUDGETS = {
  'index.html': 60_000,
  '404.html': 10_000,
  'styles.css': 20_000,
  'webmcp.js': 10_000,
  'projects.json': 50_000,
  'releases.xml': 200_000,
  card: 8_000,
};

const PAGES = ['index.html', '404.html'];
const REQUIRED_FILES = ['index.html', '404.html', 'styles.css', 'robots.txt', 'sitemap.xml',
  'sitemap-pages.xml', 'llms.txt', 'llms-full.txt', 'projects.json', 'webmcp.js', 'og.png',
  'favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png',
  'site.webmanifest', 'identity/tokens.json', 'releases.xml'];

const attrs = (html, tag, attr) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*\\b${attr}="([^"]*)"`, 'g'))]
  .map((m) => m[1]);
const parses = (text) => { try { JSON.parse(text); return true; } catch { return false; } };

async function exists(file) {
  try { return (await stat(file)).isFile(); } catch { return false; }
}

/** Returns a list of { name, ok, detail }. It never throws for a failed check. */
export async function checkDist(dir) {
  const results = [];
  const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail });
  const read = (f) => readFile(path.join(dir, f), 'utf8').catch(() => '');

  for (const f of REQUIRED_FILES) check(`file ${f} exists`, await exists(path.join(dir, f)));

  for (const page of PAGES) {
    const html = await read(page);
    check(`${page}: no unfilled {{SLOT}}`, !/\{\{[A-Z_]+\}\}/.test(html));
    check(`${page}: exactly one h1`, (html.match(/<h1[ >]/g) ?? []).length === 1);
    check(`${page}: has lang`, /<html[^>]*\blang="[a-z]{2}/.test(html));

    const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    const noAlt = imgs.filter((t) => !/\balt="/.test(t));
    check(`${page}: every img has alt`, noAlt.length === 0, noAlt.join(' '));
    const noSize = imgs.filter((t) => !/\bwidth="\d+"/.test(t) || !/\bheight="\d+"/.test(t));
    check(`${page}: every img has width and height`, noSize.length === 0, noSize.join(' '));

    const urls = [...attrs(html, 'a', 'href'), ...attrs(html, 'link', 'href'),
      ...attrs(html, 'img', 'src'), ...attrs(html, 'script', 'src')];
    const insecure = urls.filter((u) => u.startsWith('http://'));
    check(`${page}: no http:// URL`, insecure.length === 0, insecure.join(' '));

    // A local URL must name a file in dist/. A path under /<repo>/ belongs to a project
    // site in another repository, so the gate checks only paths whose top folder is in dist/.
    const topDirs = new Set((await readdir(dir, { withFileTypes: true }).catch(() => []))
      .filter((e) => e.isDirectory()).map((e) => e.name));
    const local = urls
      .map((u) => (u.startsWith(SITE_ORIGIN) ? u.slice(SITE_ORIGIN.length) : u))
      .filter((u) => u.startsWith('/') && !u.startsWith('//'))
      .map((u) => u.replace(/[?#].*$/, ''))
      .filter((u) => !u.slice(1).includes('/') || topDirs.has(u.split('/')[1]));
    const missing = [];
    for (const u of new Set(local)) {
      const file = u.endsWith('/') ? `${u}index.html` : u;
      if (u !== '/' && !(await exists(path.join(dir, decodeURIComponent(file))))) missing.push(u);
    }
    check(`${page}: every local link and asset exists`, missing.length === 0, missing.join(' '));
  }

  const html = await read('index.html');
  const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  check('JSON-LD parses', ld && parses(ld));
  if (ld && parses(ld)) {
    const types = JSON.parse(ld)['@graph']?.flatMap((n) => [].concat(n['@type'])) ?? [];
    for (const t of ['Person', 'WebSite', 'ProfilePage']) check(`JSON-LD has ${t}`, types.includes(t));
  }

  const projectsText = await read('projects.json');
  check('projects.json parses', parses(projectsText));
  if (parses(projectsText)) {
    const list = JSON.parse(projectsText).projects ?? [];
    const cards = (html.match(/<li class="card[ "]/g) ?? []).length;
    check('projects.json and the page list the same number of projects',
      list.length > 0 && list.length === cards, `${list.length} in JSON, ${cards} cards`);
  }
  check('site.webmanifest parses', parses(await read('site.webmanifest')));
  check('identity/tokens.json parses', parses(await read('identity/tokens.json')));

  for (const xml of ['sitemap.xml', 'sitemap-pages.xml']) {
    const text = await read(xml);
    const locs = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    check(`${xml}: starts with an XML declaration`, text.startsWith('<?xml'));
    check(`${xml}: every URL is same-origin`, locs.length > 0 && locs.every((u) => u.startsWith(SITE_ORIGIN)));
  }

  const feed = await read('releases.xml');
  check('releases.xml is an Atom feed', feed.startsWith('<?xml') && feed.includes('<feed xmlns="http://www.w3.org/2005/Atom">'));
  check('releases.xml: every entry has an id, a title, a link and a date',
    [...feed.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].every(([, e]) =>
      ['<id>', '<title>', '<link ', '<updated>'].every((t) => e.includes(t))));

  for (const [file, max] of Object.entries(BUDGETS)) {
    if (file === 'card') continue;
    const size = (await stat(path.join(dir, file)).catch(() => ({ size: Infinity }))).size;
    check(`budget ${file} <= ${max} bytes`, size <= max, `${size} bytes`);
  }
  const cards = (await readdir(path.join(dir, 'cards')).catch(() => [])).filter((f) => f.endsWith('.svg'));
  for (const f of cards) {
    const { size } = await stat(path.join(dir, 'cards', f));
    check(`budget cards/${f} <= ${BUDGETS.card} bytes`, size <= BUDGETS.card, `${size} bytes`);
  }
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist'));
  const results = await checkDist(dir);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` (${r.detail})` : ''}`);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
}
