import { test } from 'node:test';
import assert from 'node:assert/strict';

const feed = {
  projects: [
    { name: 'okf-skills', description: 'Open Knowledge format skills', language: 'Go', topics: ['skills'] },
    { name: 'cloud-cache-action', description: 'CI cache', language: 'TypeScript', topics: ['github-actions'] },
  ],
};

// Stand in for the browser: a WebMCP context and a fetch that serves the feed.
const registered = [];
globalThis.document = { modelContext: { registerTool: async (tool) => { registered.push(tool); } } };
globalThis.fetch = async (url) => {
  assert.equal(url, '/projects.json');
  return { ok: true, json: async () => feed };
};

const { tools } = await import('../src/webmcp.js');
const call = async (name, input) => {
  const out = await tools.find((t) => t.name === name).execute(input);
  return JSON.parse(out.content[0].text);
};

test('both tools register with the page context and are read-only', async () => {
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(registered.map((t) => t.name).sort(), ['get_project', 'list_projects']);
  for (const t of registered) {
    assert.equal(t.annotations.readOnlyHint, true);
    assert.equal(t.inputSchema.type, 'object');
    assert.ok(t.description.length > 20);
  }
});

test('list_projects filters by text, language and topic, case-insensitively', async () => {
  assert.equal((await call('list_projects', {})).length, 2);
  assert.deepEqual((await call('list_projects', { language: 'go' })).map((p) => p.name), ['okf-skills']);
  assert.deepEqual((await call('list_projects', { topic: 'GitHub-Actions' })).map((p) => p.name), ['cloud-cache-action']);
  assert.deepEqual((await call('list_projects', { query: 'cache' })).map((p) => p.name), ['cloud-cache-action']);
});

test('get_project returns one project and rejects an unknown name', async () => {
  assert.equal((await call('get_project', { name: 'OKF-skills' })).language, 'Go');
  await assert.rejects(() => call('get_project', { name: 'nope' }), /list_projects/);
});
