import { ORIGIN, PRIMARY_SITE } from './discover.mjs';
import { isoDate } from './render-seo.mjs';

export function htmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Unknown slots are left alone so a typo shows up as visible `{{TEXT}}`, not a silent blank. */
export function fill(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) =>
    Object.hasOwn(values, key) ? values[key] : match);
}

// Repos can carry dozens of topics; past this many the card would read as a
// wall of tags rather than a scannable summary, so the rest are folded into
// a "+N more" count instead of rendered individually.
const TOPIC_CAP = 6;

export function renderCards(projects) {
  return projects.map((p) => {
    const meta = [
      p.language,
      `${p.stars} ${p.stars === 1 ? 'star' : 'stars'}`,
      `Updated ${isoDate(p.pushedAt)}`,
    ].filter(Boolean).map((m) => `<li>${htmlEscape(m)}</li>`).join('');

    const topicItems = p.topics
      .slice(0, TOPIC_CAP)
      .map((t) => `<li>${htmlEscape(t)}</li>`)
      .join('');
    const topicOverflow = p.topics.length > TOPIC_CAP
      ? `<li>+${p.topics.length - TOPIC_CAP} more</li>`
      : '';
    const topics = p.topics.length
      ? `<ul class="topics" role="list">${topicItems}${topicOverflow}</ul>`
      : '';

    const also = [
      `<a href="${htmlEscape(p.repoUrl)}" aria-label="Source for ${htmlEscape(p.name)}">Source</a>`,
      ...(p.hasLlms ? [`<a href="${htmlEscape(`${p.url}llms.txt`)}" aria-label="llms.txt for ${htmlEscape(p.name)}">llms.txt</a>`] : []),
    ].join(' · ');

    return `
      <li class="card">
        <h3><a href="${htmlEscape(p.url)}">${htmlEscape(p.name)}</a></h3>
        <p>${htmlEscape(p.description || 'No description provided.')}</p>
        ${topics}
        <ul class="meta" role="list">${meta}</ul>
        <p class="also">${also}</p>
      </li>`;
  }).join('');
}

function renderLinks(owner) {
  const links = [
    [PRIMARY_SITE, new URL(PRIMARY_SITE).host],
    [owner.htmlUrl, 'GitHub'],
    ...(owner.twitter ? [[`https://x.com/${owner.twitter}`, `@${owner.twitter}`]] : []),
  ];
  return links
    .map(([href, label]) => `<li><a href="${htmlEscape(href)}">${htmlEscape(label)}</a></li>`)
    .join('');
}

export function renderJsonLd(owner, projects) {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        '@id': `${ORIGIN}/#person`,
        name: owner.name,
        description: owner.bio || undefined,
        image: owner.avatar,
        url: PRIMARY_SITE,
        sameAs: [
          PRIMARY_SITE,
          owner.htmlUrl,
          ...(owner.twitter ? [`https://x.com/${owner.twitter}`] : []),
        ],
      },
      {
        '@type': 'CollectionPage',
        '@id': `${ORIGIN}/`,
        url: `${ORIGIN}/`,
        name: `${owner.name} — open-source projects`,
        about: { '@id': `${ORIGIN}/#person` },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: projects.length,
          itemListElement: projects.map((p, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: p.url,
            name: p.name,
            description: p.description || undefined,
          })),
        },
      },
    ],
  };
  // `</script>` inside JSON would close the block early; escaping the slash is the standard fix.
  return JSON.stringify(graph, null, 2).replace(/</g, '\\u003c');
}

export function renderIndex({ template, owner, projects, now }) {
  const title = `${owner.name} — open-source projects`;
  const description = `GitHub Pages sites published under ${new URL(ORIGIN).host}, `
    + `by ${owner.name}. Primary site: ${new URL(PRIMARY_SITE).host}.`;
  return fill(template, {
    TITLE: htmlEscape(title),
    DESCRIPTION: htmlEscape(description),
    NAME: htmlEscape(owner.name),
    BIO: htmlEscape(owner.bio),
    AVATAR: htmlEscape(owner.avatar),
    LINKS: renderLinks(owner),
    CARDS: renderCards(projects),
    JSONLD: renderJsonLd(owner, projects),
    BUILT: isoDate(now),
  });
}

export function render404(template) {
  return template;
}
