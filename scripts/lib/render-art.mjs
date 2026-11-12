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
const CELL = 16;

/** One shape inside a CELL x CELL square at (x, y). */
function shape(kind, x, y) {
  const c = CELL / 2;
  switch (kind) {
    case 0: return `<circle cx="${x + c}" cy="${y + c}" r="5"/>`;
    case 1: return `<rect x="${x + 3}" y="${y + 3}" width="10" height="10" rx="2"/>`;
    case 2: return `<path d="M${x + 2} ${y + 14}L${x + c} ${y + 2}L${x + 14} ${y + 14}Z"/>`;
    default: return `<path d="M${x + 2} ${y + 2}L${x + 14} ${y + 14}M${x + 14} ${y + 2}L${x + 2} ${y + 14}" stroke-width="2.5" fill="none"/>`;
  }
}

export function renderArt(project) {
  const color = languageColor(project.language);
  const rand = rng(hash(project.name));

  // Each project uses two of the four shape kinds, so cards differ in texture
  // and not only in layout.
  const kinds = [Math.floor(rand() * 4)];
  kinds.push((kinds[0] + 1 + Math.floor(rand() * 3)) % 4);
  const density = 0.35 + rand() * 0.25;

  const shapes = [];
  // The left part stays clear for the badge.
  for (let y = 0; y < H; y += CELL) {
    for (let x = 96; x < W; x += CELL) {
      if (rand() > density) continue;
      // Opacity fades in from the left, so the badge edge stays calm.
      const fade = Math.min(1, (x - 96) / 96);
      const o = (0.15 + rand() * 0.45) * (0.35 + 0.65 * fade);
      shapes.push(`<g opacity="${o.toFixed(2)}">${shape(kinds[Math.floor(rand() * 2)], x, y)}</g>`);
    }
  }

  const letters = monogram(project.name);
  return `<svg class="art" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMid slice" aria-hidden="true" focusable="false">`
    + `<rect width="${W}" height="${H}" fill="${color}" opacity="0.14"/>`
    + `<g fill="${color}" stroke="${color}">${shapes.join('')}</g>`
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
