// WebMCP tools for this page: https://webmachinelearning.github.io/webmcp/
//
// A browser agent that supports WebMCP can call these tools instead of
// scraping the page. Both tools only read /projects.json, so they are marked
// read-only. Browsers without WebMCP skip all of this.
//
// The spec puts the API on document.modelContext. Early Chrome builds put it
// on navigator.modelContext, so the script accepts either.

const context = globalThis.document?.modelContext ?? globalThis.navigator?.modelContext;

let feed;
function projects() {
  feed ??= fetch('/projects.json').then((res) => {
    if (!res.ok) throw new Error(`projects.json: HTTP ${res.status}`);
    return res.json();
  });
  return feed;
}

const result = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const lower = (s) => String(s ?? '').toLowerCase();

const tools = [
  {
    name: 'list_projects',
    title: 'List project sites',
    description: 'List the open-source project sites on this page, newest first. '
      + 'Each result has the site URL, repository, language, topics, stars, last update, '
      + 'and the URL of the project llms.txt when one exists. All filters are optional.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text to find in the project name or description.' },
        language: { type: 'string', description: 'Programming language, for example "Go" or "TypeScript".' },
        topic: { type: 'string', description: 'GitHub topic, for example "github-actions".' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async execute(input = {}) {
      const { projects: all } = await projects();
      const q = lower(input.query);
      const matches = all.filter((p) => (!q || lower(`${p.name} ${p.description}`).includes(q))
        && (!input.language || lower(p.language) === lower(input.language))
        && (!input.topic || p.topics.some((t) => lower(t) === lower(input.topic))));
      return result(matches);
    },
  },
  {
    name: 'get_project',
    title: 'Get one project site',
    description: 'Get the details of one project site by its repository name, for example "okf-skills".',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'The repository name.' } },
      required: ['name'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async execute({ name } = {}) {
      const { projects: all } = await projects();
      const match = all.find((p) => lower(p.name) === lower(name));
      if (!match) throw new Error(`No project named "${name}". Call list_projects for the names.`);
      return result(match);
    },
  },
];

if (context?.registerTool) {
  for (const tool of tools) {
    // registerTool returns a promise in the spec and may reject, for example
    // when the "tools" permission is off. A rejection must not break the page.
    Promise.resolve()
      .then(() => context.registerTool(tool))
      .catch((err) => console.warn(`WebMCP: ${tool.name} not registered:`, err));
  }
}

export { tools };
