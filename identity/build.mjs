#!/usr/bin/env node
// Writes identity/dist/ from identity/tokens.json. Zero dependencies.
// Usage: node identity/build.mjs           -> write the files
//        node identity/build.mjs --check   -> exit 1 if dist/ is out of date
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SITE_ORIGIN } from '../scripts/lib/discover.mjs';

const here = (p) => new URL(p, import.meta.url);

export function loadTokens() {
  return JSON.parse(readFileSync(here('./tokens.json'), 'utf8'));
}

/** How each stack marks the colour scheme. A null dark selector means a light-only site. */
const SCHEMES = {
  generic: { light: ':root', darkMedia: ':root:not([data-theme="light"])', dark: ':root[data-theme="dark"]' },
  vitepress: { light: ':root', dark: '.dark' },
  material: { light: ':root, [data-md-color-scheme="default"]', dark: '[data-md-color-scheme="slate"]' },
  'light-only': { light: ':root' },
};

/** Each bundle: [file, scheme kind, adapter or null]. */
export const BUNDLES = [
  ['ys-tokens.css', 'generic', null],
  ['ys-plain.css', 'generic', 'plain'],
  ['ys-vitepress.css', 'vitepress', 'vitepress'],
  ['ys-mkdocs-material.css', 'material', 'mkdocs-material'],
  ['ys-jekyll-cayman.css', 'light-only', 'jekyll-cayman'],
];

const colors = (t, scheme, pad) => Object.entries(t.color)
  .map(([k, v]) => `${pad}--ys-${k}: ${v[scheme]};`).join('\n');
const group = (prefix, obj) => Object.entries(obj)
  .map(([k, v]) => `  --ys-${prefix}${k}: ${v};`).join('\n');

export function tokensCss(t, kind) {
  const s = SCHEMES[kind];
  let out = `${s.light} {\n${kind === 'generic' ? '  color-scheme: light dark;\n' : ''}${colors(t, 'light', '  ')}\n}\n`;
  out += `:root {\n${group('font-', t.font)}\n${group('space-', t.space)}\n${group('radius-', t.radius)}\n${group('', t.misc)}\n}\n`;
  if (s.darkMedia) {
    out += '/* Dark: the system asks for dark and the page did not pin light. */\n'
      + `@media (prefers-color-scheme: dark) {\n  ${s.darkMedia} {\n    color-scheme: dark;\n${colors(t, 'dark', '    ')}\n  }\n}\n`;
  }
  if (s.dark) out += `/* Dark: the page pinned dark. */\n${s.dark} {\n  color-scheme: dark;\n${colors(t, 'dark', '  ')}\n}\n`;
  if (kind === 'generic') out += ':root[data-theme="light"] { color-scheme: light; }\n';
  out += printCss(t, kind);
  return out;
}

/** Print uses the light colours with the replacements from tokens.print, also when the page pinned dark. */
export function printCss(t, kind) {
  const s = SCHEMES[kind];
  const selectors = [s.light, s.darkMedia, s.dark].filter(Boolean).join(', ');
  const lines = Object.keys(t.color)
    .map((k) => `    --ys-${k}: ${t.print[k] ?? t.color[k].light};`).join('\n');
  return '/* Print: white paper, black text. A dark page prints with the light colours. */\n'
    + `@media print {\n  ${selectors} {\n    color-scheme: light;\n${lines}\n  }\n}\n`;
}

/** The stamp names the version and a hash of the body, so a vendored copy shows if it drifted. */
export function stamp(t, name, body) {
  const sha = createHash('sha256').update(body).digest('hex').slice(0, 16);
  return `/*! ys-tokens ${t.version} ${name} sha256:${sha}\n`
    + ' * Shared identity of Yurii Serhiichuk\'s web properties: neutrals, fonts, spacing.\n'
    + ' * Generated from https://github.com/xSAVIKx/xSAVIKx.github.io/tree/main/identity. Do not edit.\n'
    + ` * Source: ${SITE_ORIGIN}/identity/${name}\n */\n`;
}

export function renderBundles(t = loadTokens()) {
  const files = {};
  for (const [name, kind, adapter] of BUNDLES) {
    // An adapter bundle is: the variables, the shared rules, then the rules of the stack.
    const body = tokensCss(t, kind) + (adapter
      ? `\n${readFileSync(here('./adapters/_shared.css'), 'utf8')}\n${readFileSync(here(`./adapters/${adapter}.css`), 'utf8')}`
      : '');
    files[name] = stamp(t, name, body) + body;
  }
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = renderBundles();
  if (process.argv.includes('--check')) {
    const stale = Object.entries(files).filter(([n, body]) => {
      try { return readFileSync(here(`./dist/${n}`), 'utf8') !== body; } catch { return true; }
    }).map(([n]) => n);
    if (stale.length) {
      console.error(`identity/dist is out of date: ${stale.join(', ')}. Run: node identity/build.mjs`);
      process.exit(1);
    }
    console.log('identity/dist is up to date.');
  } else {
    mkdirSync(here('./dist/'), { recursive: true });
    for (const [n, body] of Object.entries(files)) writeFileSync(here(`./dist/${n}`), body);
    console.log(`Wrote ${Object.keys(files).length} files to identity/dist/.`);
  }
}
