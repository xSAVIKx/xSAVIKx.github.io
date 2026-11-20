import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { BUDGETS } from '../scripts/check-dist.mjs';

/**
 * The hand-made card art in src/cards. Each file has one tint, one ink colour
 * for the light scheme and one for the dark scheme. The page shows the file on
 * the card surface, so the test mixes the tint with that surface.
 */
const DIR = new URL('../src/cards/', import.meta.url);
const SURFACE = { light: '#ffffff', dark: '#1b1e24' };
const files = (await readdir(DIR)).filter((f) => f.endsWith('.svg'));
const cards = await Promise.all(files.map(async (f) => {
  const svg = await readFile(new URL(f, DIR), 'utf8');
  return {
    name: f,
    svg,
    tint: svg.match(/<rect width="640" height="192" fill="(#[0-9a-f]{6})" opacity="\.14"\/>/)?.[1],
    ink: { light: svg.match(/\.s\{fill:none;stroke:(#[0-9a-f]{6})/)?.[1], dark: svg.match(/dark\)\{\.s\{stroke:(#[0-9a-f]{6})/)?.[1] },
    faded: Number(svg.match(/\.q\{opacity:([.\d]+)\}/)?.[1]),
    fontPx: Number(svg.match(/text\{font:600 (\d+)px/)?.[1]),
  };
}));

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);
const luminance = (c) => {
  const [r, g, b] = c.map((v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const hue = ([r, g, b]) => {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
/** The two backgrounds of a card: the strip (tint at .14) and the left panel (.16 more). */
const backgrounds = (card, scheme) => {
  const strip = mix(rgb(SURFACE[scheme]), rgb(card.tint), 0.14);
  return [strip, mix(strip, rgb(card.tint), 0.16)];
};

test('there is card art, and each file has a tint, two ink colours and a dark rule', () => {
  assert.ok(cards.length >= 7);
  for (const c of cards) {
    assert.ok(c.tint && c.ink.light && c.ink.dark, c.name);
    assert.match(c.svg, /@media\(prefers-color-scheme:dark\)/, c.name);
    assert.match(c.svg, /viewBox="0 0 640 192"/, c.name);
  }
});

test('each card file is in the size budget', () => {
  for (const c of cards) assert.ok(Buffer.byteLength(c.svg) <= BUDGETS.card, c.name);
});

test('the ink has 4.5:1 contrast on the tint, light and dark', () => {
  for (const c of cards) {
    for (const scheme of ['light', 'dark']) {
      for (const bg of backgrounds(c, scheme)) {
        const ratio = contrast(rgb(c.ink[scheme]), bg);
        assert.ok(ratio >= 4.5, `${c.name} ${scheme}: ${ratio.toFixed(2)}`);
      }
    }
  }
});

test('the faded lines have 3:1 contrast on the tint, light and dark', () => {
  for (const c of cards) {
    for (const scheme of ['light', 'dark']) {
      for (const bg of backgrounds(c, scheme)) {
        const ratio = contrast(mix(bg, rgb(c.ink[scheme]), c.faded), bg);
        assert.ok(ratio >= 3, `${c.name} ${scheme}: ${ratio.toFixed(2)}`);
      }
    }
  }
});

test('a label is 22 px or larger, which is 12 px on a card 360 px wide', () => {
  for (const c of cards) assert.ok(c.fontPx >= 22, `${c.name}: ${c.fontPx}px`);
});

test('a label has a fixed length, so it stays in its box with each font', () => {
  for (const c of cards) {
    for (const [tag] of c.svg.matchAll(/<text [^>]*>/g)) {
      assert.match(tag, /textLength="\d+" lengthAdjust="spacingAndGlyphs"/, c.name);
    }
  }
});

test('each tint is 30 degrees of hue or more from each other tint', () => {
  for (const a of cards) {
    for (const b of cards) {
      if (a.name >= b.name) continue;
      const d = Math.abs(hue(rgb(a.tint)) - hue(rgb(b.tint)));
      assert.ok(Math.min(d, 360 - d) >= 30, `${a.name} and ${b.name}: ${Math.min(d, 360 - d).toFixed(0)}`);
    }
  }
});
