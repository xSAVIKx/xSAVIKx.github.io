import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderArt, monogram, hash, languageColor, badgeTextColor, LANGUAGE_COLORS, FALLBACK_COLOR,
} from '../scripts/lib/render-art.mjs';

const project = { name: 'cloud-cache-action', language: 'TypeScript' };

test('the art is deterministic for a name', () => {
  assert.equal(renderArt(project), renderArt({ ...project }));
});

test('different names draw different art', () => {
  assert.notEqual(renderArt(project), renderArt({ ...project, name: 'geo-coordinates' }));
});

test('the art is decorative and hidden from assistive technology', () => {
  assert.match(renderArt(project), /^<svg class="art"[^>]*aria-hidden="true" focusable="false"/);
});

test('the art is tinted by the language colour, with a fallback', () => {
  assert.ok(renderArt(project).includes(LANGUAGE_COLORS.TypeScript));
  assert.equal(languageColor(null), FALLBACK_COLOR);
  assert.equal(languageColor('Brainfuck'), FALLBACK_COLOR);
});

test('the monogram splits on separators and camelCase', () => {
  assert.equal(monogram('AndroidScreencast'), 'AS');
  assert.equal(monogram('geo-coordinates'), 'GC');
  assert.equal(monogram('okf-skills'), 'OS');
  assert.equal(monogram('sre_agent'), 'SA');
  assert.equal(monogram('hub'), 'HU');
  assert.equal(monogram('---'), '?');
});

test('the monogram is safe to put in markup', () => {
  // Only letters and digits survive the split, so no escaping is needed.
  assert.match(monogram('<b>&"x'), /^[A-Z0-9?]{1,2}$/);
});

test('the hash is stable across runs', () => {
  assert.equal(hash('okf-skills'), hash('okf-skills'));
  assert.notEqual(hash('a'), hash('b'));
});

const toLinear = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => {
  const [r, g, b] = hex.slice(1).match(/../g).map((h) => parseInt(h, 16));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
};
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test('the badge letters meet 4.5:1 on every language colour', () => {
  for (const [lang, color] of Object.entries({ ...LANGUAGE_COLORS, fallback: FALLBACK_COLOR })) {
    const r = ratio(badgeTextColor(color), color);
    assert.ok(r >= 4.5, `${lang}: badge text is ${r.toFixed(2)}:1`);
  }
});
