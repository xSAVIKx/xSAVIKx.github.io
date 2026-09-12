import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_ORIGIN, SITE_HOST, SELF_REPO } from '../scripts/lib/discover.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOSTNAME = 'xsavikx.github.io';

/**
 * The one file allowed to contain the literal hostname. Changing the site's
 * origin must be a one-line edit there and nowhere else — that is the whole
 * point of SITE_ORIGIN, and this test is what makes it true rather than
 * merely intended.
 */
const DEFINITION_FILE = path.join('scripts', 'lib', 'discover.mjs');

function sourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', 'dist', '.git', '.github', 'docs'].includes(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.(mjs|html|css|json|webmanifest)$/.test(entry)) acc.push(full);
  }
  return acc;
}

test('only the definition file hardcodes the hostname', () => {
  const offenders = [];
  for (const file of sourceFiles(ROOT)) {
    const rel = path.relative(ROOT, file);
    if (rel === DEFINITION_FILE || rel.startsWith('test' + path.sep)) continue;
    const text = readFileSync(file, 'utf8');
    if (text.includes(HOSTNAME)) {
      const lines = text.split('\n')
        .map((l, i) => [i + 1, l])
        .filter(([, l]) => l.includes(HOSTNAME))
        .map(([n, l]) => `${rel}:${n}: ${l.trim()}`);
      offenders.push(...lines);
    }
  }
  assert.deepEqual(offenders, [],
    `hardcoded hostname outside ${DEFINITION_FILE} — derive it from SITE_ORIGIN:\n${offenders.join('\n')}`);
});

test('the definition file hardcodes it exactly twice, for two different reasons', () => {
  const text = readFileSync(path.join(ROOT, DEFINITION_FILE), 'utf8');
  const code = text.split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('/*'));
  const hits = code.filter((l) => l.includes(HOSTNAME));
  assert.equal(hits.length, 2, `expected SITE_ORIGIN and SELF_REPO only, got:\n${hits.join('\n')}`);
  assert.ok(hits.some((l) => l.includes('SITE_ORIGIN')));
  assert.ok(hits.some((l) => l.includes('SELF_REPO')));
});

test('SELF_REPO is the repository name and must not follow SITE_ORIGIN', () => {
  // They coincide today only because a user-pages repo is named after the
  // github.io host. Under a custom domain the repo keeps its name, so a future
  // SITE_ORIGIN change must leave SELF_REPO alone or discovery stops excluding
  // this repo from its own project list.
  assert.equal(SELF_REPO, 'xsavikx.github.io');
});

test('SITE_ORIGIN has no trailing slash and SITE_HOST is derived from it', () => {
  assert.ok(!SITE_ORIGIN.endsWith('/'), 'trailing slash would double up on every URL');
  assert.equal(SITE_HOST, new URL(SITE_ORIGIN).host);
});
