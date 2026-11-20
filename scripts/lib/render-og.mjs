/**
 * The social card og.png, 1200 x 630.
 *
 * This file writes the SVG source of the card from the data in src/featured.json.
 * scripts/make-og.mjs makes src/og.svg and src/og.png from it. Both files are committed.
 * The build copies src/og.png and does not need an image tool.
 * test/render-og.test.mjs fails when the committed files do not agree with src/featured.json.
 */
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { SITE_HOST } from './discover.mjs';

/** The person and the title on the card. The meta description uses the same title. */
export const OG_PERSON = { name: 'Yurii Serhiichuk', initials: 'YS', title: 'Google Developer Expert, Cloud' };
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
/** The smallest text on the card, in px. A link preview is often 500 px wide or less. */
export const OG_MIN_FONT = 40;
/** A project name longer than this does not fit in one line at the font size of the card. */
export const OG_NAME_MAX = 34;
/** The key of the PNG text chunk that holds the SHA-256 of the SVG source. */
export const OG_HASH_KEY = 'og-source-sha256';

// The light colours of identity/tokens.json: bg, text, muted, border, accent, accent-solid.
const C = { bg: '#f8fafc', text: '#0f172a', muted: '#475569', border: '#e2e8f0', accent: '#1d4ed8', solid: '#2563eb' };
const SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Liberation Sans', Arial, sans-serif";

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The data of the card from the content of src/featured.json: the first two featured projects. */
export function ogInputs({ featured = [], projects = {} } = {}, host = SITE_HOST) {
  return {
    person: OG_PERSON,
    host,
    projects: featured.slice(0, 2).map((name) => projects[name]?.displayName?.trim() || name),
  };
}

export function renderOgSvg({ person, host, projects }) {
  for (const name of projects) {
    if (name.length > OG_NAME_MAX) {
      throw new Error(`og.png: the project name "${name}" has more than ${OG_NAME_MAX} characters and does not fit.`);
    }
  }
  const rows = projects.map((name, i) => {
    const y = 478 + i * 72;
    return `  <rect x="80" y="${y - 30}" width="14" height="30" rx="3" fill="${C.solid}"/>\n`
      + `  <text x="116" y="${y}" font-size="46" font-weight="600" fill="${C.text}">${esc(name)}</text>`;
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}" font-family="${SANS}">`,
    `  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${C.bg}"/>`,
    `  <rect width="${OG_WIDTH}" height="12" fill="${C.solid}"/>`,
    `  <rect x="80" y="72" width="96" height="96" rx="21" fill="${C.solid}"/>`,
    `  <text x="128" y="136" text-anchor="middle" font-size="46" font-weight="700" fill="#ffffff">${esc(person.initials)}</text>`,
    `  <text x="1120" y="134" text-anchor="end" font-size="${OG_MIN_FONT}" fill="${C.muted}">${esc(host)}</text>`,
    `  <text x="80" y="278" font-size="80" font-weight="700" fill="${C.text}">${esc(person.name)}</text>`,
    `  <text x="80" y="346" font-size="44" font-weight="600" fill="${C.accent}">${esc(person.title)}</text>`,
    `  <rect x="80" y="394" width="1040" height="2" fill="${C.border}"/>`,
    ...rows,
    '</svg>',
    '',
  ].join('\n');
}

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The chunks of a PNG file as { type, data }. */
export function pngChunks(png) {
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Not a PNG file.');
  const chunks = [];
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    chunks.push({ type: png.toString('latin1', at + 4, at + 8), data: png.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
  }
  return chunks;
}

/** The width, the height and the text chunks of a PNG file. */
export function pngInfo(png) {
  const chunks = pngChunks(png);
  const text = {};
  for (const { type, data } of chunks) {
    if (type !== 'tEXt') continue;
    const zero = data.indexOf(0);
    text[data.toString('latin1', 0, zero)] = data.toString('latin1', zero + 1);
  }
  return { width: chunks[0].data.readUInt32BE(0), height: chunks[0].data.readUInt32BE(4), text };
}

/** Adds one tEXt chunk after the header chunk. An old tEXt chunk with the same key goes away. */
export function pngWithText(png, key, value) {
  const data = Buffer.from(`${key}\0${value}`, 'latin1');
  const body = Buffer.concat([Buffer.from('tEXt', 'latin1'), data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  body.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(body), 8 + data.length);
  const parts = [PNG_SIGNATURE];
  let at = 8;
  let first = true;
  while (at < png.length) {
    const length = png.readUInt32BE(at);
    const raw = png.subarray(at, at + 12 + length);
    const type = png.toString('latin1', at + 4, at + 8);
    const sameKey = type === 'tEXt' && raw.subarray(8, 8 + key.length + 1).equals(Buffer.from(`${key}\0`, 'latin1'));
    if (!sameKey) parts.push(raw);
    if (first) { parts.push(chunk); first = false; }
    at += 12 + length;
  }
  return Buffer.concat(parts);
}
