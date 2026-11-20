import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ogInputs, renderOgSvg, pngInfo, pngWithText, sha256,
  OG_PERSON, OG_WIDTH, OG_HEIGHT, OG_MIN_FONT, OG_NAME_MAX, OG_HASH_KEY,
} from '../scripts/lib/render-og.mjs';
import { SITE_HOST } from '../scripts/lib/discover.mjs';

const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url));
const featured = JSON.parse(read('featured.json'));
const svg = renderOgSvg(ogInputs(featured, SITE_HOST));

test('the card names the person, the title as text and the two featured projects', () => {
  assert.ok(svg.includes(`>${OG_PERSON.name}</text>`));
  assert.ok(svg.includes('>Google Developer Expert, Cloud</text>'));
  const names = ogInputs(featured).projects;
  assert.equal(names.length, 2);
  for (const name of names) assert.ok(svg.includes(`>${name}</text>`), `the card must name ${name}`);
  assert.ok(!/<a\b|href/.test(svg), 'the card has no link');
});

test('the card uses a display name when featured.json has one', () => {
  const data = ogInputs({ featured: ['a', 'b', 'c'], projects: { b: { displayName: 'Bee & Co' } } });
  assert.deepEqual(data.projects, ['a', 'Bee & Co']);
  assert.ok(renderOgSvg(data).includes('>Bee &amp; Co</text>'));
});

test('no text on the card is smaller than the minimum', () => {
  const sizes = [...svg.matchAll(/font-size="(\d+)"/g)].map((m) => Number(m[1]));
  assert.ok(sizes.length >= 5);
  assert.ok(Math.min(...sizes) >= OG_MIN_FONT, `smallest text is ${Math.min(...sizes)} px`);
});

test('a project name that does not fit stops the generator', () => {
  assert.throws(() => renderOgSvg({ person: OG_PERSON, host: SITE_HOST, projects: ['x'.repeat(OG_NAME_MAX + 1)] }), /does not fit/);
});

test('src/og.svg is up to date with src/featured.json (run `npm run og` after a change)', () => {
  assert.equal(read('og.svg').toString('utf8'), svg);
});

test('src/og.png is made from src/og.svg, is 1200 x 630 and is smaller than 300 kB', () => {
  const png = read('og.png');
  const info = pngInfo(png);
  assert.equal(info.width, OG_WIDTH);
  assert.equal(info.height, OG_HEIGHT);
  assert.equal(info.text[OG_HASH_KEY], sha256(svg), 'og.png is stale: run `npm run og` and commit src/og.svg and src/og.png');
  assert.ok(png.length < 300_000, `${png.length} bytes`);
});

test('a text chunk can be written again without a second copy', () => {
  const twice = pngWithText(pngWithText(read('og.png'), OG_HASH_KEY, 'one'), OG_HASH_KEY, 'two');
  assert.equal(pngInfo(twice).text[OG_HASH_KEY], 'two');
  assert.equal(twice.length, pngWithText(read('og.png'), OG_HASH_KEY, 'two').length);
});
