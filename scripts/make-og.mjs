#!/usr/bin/env node
// Makes src/og.svg and src/og.png from src/featured.json. Run it after a change of the
// featured projects or of a display name: `npm run og`. Commit the two files.
// It needs Chromium or Chrome on the machine. The build and the tests do not need it.
// Set CHROME to the path of the browser when the name is not in the list below.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { ogInputs, renderOgSvg, pngInfo, pngWithText, sha256, OG_WIDTH, OG_HEIGHT, OG_HASH_KEY } from './lib/render-og.mjs';
import { SITE_HOST } from './lib/discover.mjs';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const BROWSERS = [process.env.CHROME, 'chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'].filter(Boolean);

const svg = renderOgSvg(ogInputs(JSON.parse(readFileSync(path.join(SRC, 'featured.json'), 'utf8')), SITE_HOST));
writeFileSync(path.join(SRC, 'og.svg'), svg);

const tmp = mkdtempSync(path.join(tmpdir(), 'og-'));
const shot = path.join(tmp, 'og.png');
// A page without a margin, so the image fills the window exactly.
const page = path.join(tmp, 'og.html');
writeFileSync(page, `<!doctype html><html><body style="margin:0;overflow:hidden">${svg}</body></html>`);
let done = false;
for (const browser of BROWSERS) {
  try {
    execFileSync(browser, ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1', `--user-data-dir=${path.join(tmp, 'profile')}`,
      `--window-size=${OG_WIDTH},${OG_HEIGHT}`, `--screenshot=${shot}`, pathToFileURL(page).href],
    { stdio: 'ignore', timeout: 60_000 });
    done = true;
    break;
  } catch { /* try the next name */ }
}
if (!done) {
  console.error(`No browser made the image. Tried: ${BROWSERS.join(', ')}. Set CHROME to the path of Chromium.`);
  process.exit(1);
}
const png = pngWithText(readFileSync(shot), OG_HASH_KEY, sha256(svg));
rmSync(tmp, { recursive: true, force: true });
const { width, height } = pngInfo(png);
if (width !== OG_WIDTH || height !== OG_HEIGHT) {
  console.error(`The image is ${width} x ${height}, not ${OG_WIDTH} x ${OG_HEIGHT}.`);
  process.exit(1);
}
writeFileSync(path.join(SRC, 'og.png'), png);
console.log(`Wrote src/og.svg and src/og.png (${png.length} bytes).`);
