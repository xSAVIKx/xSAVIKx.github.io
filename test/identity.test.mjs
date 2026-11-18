import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTokens, renderBundles, BUNDLES } from '../identity/build.mjs';

const t = loadTokens();

const toLinear = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => {
  const [r, g, b] = hex.slice(1).match(/../g).map((h) => parseInt(h, 16));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
};
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

for (const scheme of ['light', 'dark']) {
  test(`identity tokens: every text pair meets 4.5:1 in the ${scheme} scheme`, () => {
    for (const [fg, bg] of t.textPairs) {
      const r = ratio(t.color[fg][scheme], t.color[bg][scheme]);
      assert.ok(r >= 4.5, `${scheme}: ${fg} on ${bg} is ${r.toFixed(2)}:1`);
    }
  });
  test(`identity tokens: every control edge meets 3:1 in the ${scheme} scheme`, () => {
    for (const [fg, bg] of t.uiPairs) {
      const r = ratio(t.color[fg][scheme], t.color[bg][scheme]);
      assert.ok(r >= 3, `${scheme}: ${fg} against ${bg} is ${r.toFixed(2)}:1`);
    }
  });
}

test('identity/dist matches tokens.json (run: node identity/build.mjs)', () => {
  for (const [name, body] of Object.entries(renderBundles(t))) {
    assert.equal(readFileSync(new URL(`../identity/dist/${name}`, import.meta.url), 'utf8'), body,
      `identity/dist/${name} is out of date`);
  }
});

test('every bundle carries a version and hash stamp', () => {
  for (const [name, body] of Object.entries(renderBundles(t))) {
    assert.match(body, new RegExp(`^/\\*! ys-tokens ${t.version.replace(/\./g, '\\.')} ${name.replace('.', '\\.')} sha256:[0-9a-f]{16}\\n`));
  }
  assert.equal(BUNDLES.length, Object.keys(renderBundles(t)).length);
});

test('no bundle sets a brand colour: projects keep their own accent', () => {
  for (const [name, body] of Object.entries(renderBundles(t))) {
    assert.doesNotMatch(body.replace(/\/\*[\s\S]*?\*\//g, ''), /--vp-c-brand|--vp-button-brand|--md-primary|--md-accent|\.page-header/,
      `${name} overrides a project brand colour`);
  }
});

test('the hub stylesheet uses the identity values, so the two cannot drift', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const blocks = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const read = (block) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6});/g)]
    .map((m) => [m[1], m[2].toLowerCase()]));
  const [light, dark] = [read(blocks[0]), read(blocks[1])];
  for (const [hub, token] of [['bg', 'bg'], ['surface', 'surface'], ['text', 'text'],
    ['muted', 'muted'], ['accent', 'accent'], ['border', 'border']]) {
    assert.equal(light[hub], t.color[token].light, `light --${hub}`);
    assert.equal(dark[hub], t.color[token].dark, `dark --${hub}`);
  }
});

// Identity 1.1: focus ring, links, reduced motion, print and the footer line.

const bundles = Object.entries(renderBundles(t)).map(([name, body]) => [name, body.replace(/\/\*[\s\S]*?\*\//g, '')]);
const adapterBundles = bundles.filter(([name]) => name !== 'ys-tokens.css');
/** The text of each "@media <query> { ... }" block, with nested braces. */
const mediaBlocks = (css, query) => {
  const out = [];
  for (let at = css.indexOf(`@media ${query}`); at !== -1; at = css.indexOf(`@media ${query}`, at + 1)) {
    let depth = 0;
    let i = css.indexOf('{', at);
    const start = i + 1;
    do { depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0; i += 1; } while (depth > 0);
    out.push(css.slice(start, i - 1));
  }
  return out.join('\n');
};

for (const scheme of ['light', 'dark']) {
  test(`identity focus ring: every focus colour meets 3:1 in the ${scheme} scheme`, () => {
    assert.ok(t.focus.colors.includes(t.focus.fallback), 'the fallback colour is one of the tested colours');
    for (const fg of t.focus.colors) {
      for (const bg of t.focus.against) {
        const r = ratio(t.color[fg][scheme], t.color[bg][scheme]);
        assert.ok(r >= 3, `${scheme}: focus ring ${fg} against ${bg} is ${r.toFixed(2)}:1`);
      }
    }
  });
}

test('the focus ring uses the site variable with the fallback from the tokens', () => {
  const ring = `outline: var(--ys-focus-width) solid var(--ys-focus-color, var(--ys-${t.focus.fallback}))`;
  const withRing = adapterBundles.filter(([, css]) => css.includes(':focus-visible')).map(([name]) => name);
  // VitePress and MkDocs Material keep their own focus styles. See identity/README.md.
  assert.deepEqual(withRing, ['ys-plain.css', 'ys-jekyll-cayman.css']);
  for (const [name, css] of adapterBundles) {
    if (withRing.includes(name)) assert.ok(css.includes(ring), `${name} has the focus ring`);
    assert.doesNotMatch(css, /outline:\s*(none|0)\b/, `${name} removes an outline`);
    assert.doesNotMatch(css, /--ys-focus-color\s*:/, `${name} sets --ys-focus-color: only a site sets it`);
  }
});

test('every bundle defines the 1.1 variables', () => {
  for (const [name, css] of bundles) {
    for (const v of ['focus-width', 'focus-offset', 'underline-offset', 'underline-thickness']) {
      assert.match(css, new RegExp(`--ys-${v}: [^;]+;`), `${name} has --ys-${v}`);
    }
  }
});

test('every bundle prints with white paper and black text, also from a dark page', () => {
  for (const [name, css] of bundles) {
    const print = mediaBlocks(css, 'print');
    assert.match(print, /--ys-bg: #ffffff;/, `${name} print background`);
    assert.match(print, /--ys-text: #000000;/, `${name} print text`);
    assert.match(print, /color-scheme: light;/, `${name} print colour scheme`);
  }
  const dark = (name) => mediaBlocks(Object.fromEntries(bundles)[name], 'print').split('{')[0];
  assert.ok(dark('ys-plain.css').includes(':root[data-theme="dark"]'));
  assert.ok(dark('ys-vitepress.css').includes('.dark'));
  assert.ok(dark('ys-mkdocs-material.css').includes('[data-md-color-scheme="slate"]'));
  for (const k of Object.keys(t.print).filter((key) => !key.startsWith('$'))) {
    assert.ok(k in t.color, `print.${k} names a colour token`);
  }
  assert.ok(ratio(t.print.text, t.print.bg) >= 7);
});

test('every adapter bundle has a reduced-motion block', () => {
  for (const [name, css] of adapterBundles) {
    assert.match(mediaBlocks(css, '(prefers-reduced-motion: reduce)'), /scroll-behavior: auto/, name);
  }
});

test('no bundle adds motion or a web font', () => {
  for (const [name, css] of bundles) {
    assert.doesNotMatch(css, /\b(transition|animation)[\w-]*\s*:|@keyframes|@font-face|@import/, name);
  }
});

test('every adapter bundle styles the footer line with the muted colour', () => {
  for (const [name, css] of adapterBundles) {
    assert.match(css, /\.ys-footer-line \{[^}]*color: var\(--ys-muted\)/, name);
    assert.match(mediaBlocks(css, 'print'), /\.ys-footer-line a\[href\^="http"\]::after/, `${name} prints the hub address`);
  }
});

test('the README has the footer snippet with the hub link', () => {
  const readme = readFileSync(new URL('../identity/README.md', import.meta.url), 'utf8');
  assert.ok(readme.includes('<p class="ys-footer-line">Part of <a href="https://xsavikx.github.io/">Yurii Serhiichuk\'s open-source projects</a></p>'));
  assert.ok(readme.includes(`## Changelog`) && readme.includes(`### ${t.version}`), 'the changelog names the version');
});

test('the hub stylesheet has the focus ring, the reduced-motion rule and the print block', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.ok(css.includes(`:focus-visible { outline: ${t.misc['focus-width']} solid var(--accent); outline-offset: ${t.misc['focus-offset']};`));
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
  const print = mediaBlocks(css, 'print');
  assert.match(print, /--bg: #ffffff;/);
  assert.match(print, /--text: #000000;/);
  assert.match(print, /attr\(href\)/);
});
