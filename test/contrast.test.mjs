import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

/** Pull the token block for a scheme: the first :root is light, the one inside the media query is dark. */
function tokens(scheme) {
  const blocks = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const block = scheme === 'light' ? blocks[0] : blocks[1];
  assert.ok(block, `no ${scheme} token block found`);
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6});/g)]
    .map((m) => [m[1], m[2]]));
}

const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex) => {
  const [r, g, b] = hex.slice(1).match(/../g).map((h) => parseInt(h, 16));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
};

const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const PAIRS = [['text', 'bg'], ['text', 'surface'], ['muted', 'bg'],
  ['muted', 'surface'], ['accent', 'bg'], ['accent', 'surface']];

for (const scheme of ['light', 'dark']) {
  test(`${scheme} scheme meets 4.5:1 on every text pair`, () => {
    const t = tokens(scheme);
    for (const [fg, bg] of PAIRS) {
      const r = ratio(t[fg], t[bg]);
      assert.ok(r >= 4.5, `${scheme}: --${fg} on --${bg} is ${r.toFixed(2)}:1, need >= 4.5`);
    }
  });
}

test('the skip link stays readable against the accent it sits on', () => {
  for (const scheme of ['light', 'dark']) {
    const t = tokens(scheme);
    const r = ratio(t.bg, t.accent);
    assert.ok(r >= 4.5, `${scheme}: skip link is ${r.toFixed(2)}:1, need >= 4.5`);
  }
});

test('both schemes define the same token set', () => {
  assert.deepEqual(Object.keys(tokens('light')).sort(), Object.keys(tokens('dark')).sort());
});
