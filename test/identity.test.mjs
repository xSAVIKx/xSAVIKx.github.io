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
