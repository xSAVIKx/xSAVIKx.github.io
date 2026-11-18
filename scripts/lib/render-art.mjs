/**
 * Small generated card art, one per project.
 *
 * Project OG images are 1200x630 and too heavy for a grid of cards, and the
 * zero-dependency rule excludes an image library to shrink them. So the build
 * draws a small inline SVG instead: a pattern seeded by the repository name and
 * tinted by the GitHub language colour. The same name always gives the same art,
 * so the output stays deterministic, and a new project gets art without any work.
 *
 * The art is decorative (aria-hidden): the card title names the project.
 */

/** GitHub linguist colours for the languages this account uses. */
export const LANGUAGE_COLORS = {
  Java: '#b07219',
  Kotlin: '#a97bff',
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Go: '#00add8',
  Python: '#3572a5',
  Svelte: '#ff3e00',
  Vue: '#41b883',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#663399',
  Dockerfile: '#384d54',
  Rust: '#dea584',
};

/** Used when the language is missing or not in the table. */
export const FALLBACK_COLOR = '#6e7781';

export function languageColor(language) {
  return LANGUAGE_COLORS[language] ?? FALLBACK_COLOR;
}

/** FNV-1a, 32 bit. Small, stable, and good enough to seed a pattern. */
export function hash(s) {
  let h = 0x811c9dc5;
  for (const ch of String(s)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** mulberry32: a seeded generator, so the same name always draws the same art. */
function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Two letters for the badge. Split on separators and on camelCase humps:
 * "AndroidScreencast" -> "AS", "geo-coordinates" -> "GC", "okf-skills" -> "OS".
 */
export function monogram(name) {
  const words = String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const W = 320;
const H = 96;
const BAR = 8;
const GAP = 4;

export function renderArt(project) {
  const color = languageColor(project.language);
  const rand = rng(hash(project.name));

  // A bar chart drawn by a seeded random walk: it reads as a latency histogram,
  // and each name gets its own skyline. The left part stays clear for the badge.
  const bars = [];
  let level = 0.25 + rand() * 0.5;
  for (let x = 100; x + BAR <= W; x += BAR + GAP) {
    level = Math.min(0.95, Math.max(0.12, level + (rand() - 0.5) * 0.45));
    const h = Math.round(level * (H - 16));
    // Opacity fades in from the left, so the badge edge stays calm.
    const fade = Math.min(1, (x - 100) / 120);
    const o = (0.25 + 0.5 * fade) * (rand() > 0.82 ? 1.3 : 1);
    bars.push(`<rect x="${x}" y="${H - h}" width="${BAR}" height="${h}" rx="2" opacity="${Math.min(0.9, o).toFixed(2)}"/>`);
  }
  // One dashed line across the chart, like an alert threshold.
  const line = 20 + Math.round(rand() * 30);

  const letters = monogram(project.name);
  return `<svg class="art" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMax slice" aria-hidden="true" focusable="false">`
    + `<rect width="${W}" height="${H}" fill="${color}" opacity="0.12"/>`
    + `<g fill="${color}">${bars.join('')}</g>`
    + `<path d="M100 ${line}H${W}" stroke="${color}" stroke-width="1.5" stroke-dasharray="3 5" opacity="0.6"/>`
    + `<rect x="20" y="20" width="56" height="56" rx="12" fill="${color}"/>`
    + `<text x="48" y="49" text-anchor="middle" dominant-baseline="central" class="mono" fill="${badgeTextColor(color)}">${letters}</text>`
    + '</svg>';
}

/**
 * Text colour for the badge: black or white, whichever has more contrast on
 * the language colour. JavaScript yellow needs black; Java brown needs white.
 */
export function badgeTextColor(hex) {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hex.slice(1).match(/../g).map((h) => parseInt(h, 16));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#000000' : '#ffffff';
}
