import { SITE_ORIGIN, SITE_HOST, PRIMARY_SITE, ACTIVITY_DAYS } from './discover.mjs';
import { isoDate } from './render-seo.mjs';
import { renderArt, languageColor } from './render-art.mjs';

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

/** A hand-made image when the site publishes one, the generated art otherwise. */
/**
 * Featured cards sit on the first screen, and their art is the largest paint there
 * (measured 2026-11-18 at 390 and 1905 px wide). So their art loads at once, and the
 * first one asks for high priority. Art further down stays lazy.
 */
export function renderCardImage(p, { first = false } = {}) {
  if (!p.card) return renderArt(p);
  const load = p.featured ? (first ? ' fetchpriority="high"' : '') : ' loading="lazy"';
  return `<img class="art" src="${htmlEscape(p.card)}" alt="" width="320" height="96"${load} decoding="async">`;
}

export function renderCards(projects) {
  // One featured card alone gets the full row; two or more share rows.
  const solo = projects.filter((p) => p.featured).length === 1;
  const firstFeatured = projects.find((p) => p.featured);
  return projects.map((p) => {
    const eyebrow = p.featured ? '<p class="eyebrow">Featured</p>' : '';
    // A coloured dot names the language at a glance; the word beside it carries the meaning.
    const lang = p.language
      ? `<li><svg class="dot" viewBox="0 0 8 8" aria-hidden="true" focusable="false"><circle cx="4" cy="4" r="4" fill="${languageColor(p.language)}"/></svg>${htmlEscape(p.language)}</li>`
      : '';
    // Zero stars is noise, so the item shows only when there is something to count.
    const stars = p.stars > 0
      ? `<li>${p.stars.toLocaleString('en-US')} ${p.stars === 1 ? 'star' : 'stars'}</li>`
      : '';
    // Activity is the sort key, so the card shows it.
    const activity = p.commits90 > 0
      ? `<li>${p.commits90} ${p.commits90 === 1 ? 'commit' : 'commits'} in ${ACTIVITY_DAYS} days</li>`
      : '';
    // The newest release says more about a tool than a commit count. The feed has the history.
    const release = p.releases?.[0]
      ? `<li>Release ${htmlEscape(p.releases[0].tag)}</li>`
      : '';
    const meta = `${lang}${stars}${activity}${release}<li>Updated <time datetime="${isoDate(p.updatedAt)}">${isoDate(p.updatedAt)}</time></li>`;

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
      <li class="card${p.featured ? ` featured${solo ? ' solo' : ''}` : ''}">
        ${renderCardImage(p, { first: p === firstFeatured })}
        <div class="body">
          ${eyebrow}<h3><a href="${htmlEscape(p.url)}">${htmlEscape(p.name)}</a></h3>
          <p>${htmlEscape(p.description || 'No description provided.')}</p>
          ${topics}
        </div>
        <div class="side">
          <ul class="meta" role="list">${meta}</ul>
          <p class="also">${also}</p>
        </div>
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
    // rel="me" ties these profiles to one identity for crawlers and for IndieAuth.
    .map(([href, label]) => `<li><a href="${htmlEscape(href)}" rel="me">${htmlEscape(label)}</a></li>`)
    .join('');
}

/** Topics across all projects, most frequent first. Feeds knowsAbout and keywords. */
export function topTopics(projects, limit = 12) {
  const counts = new Map();
  for (const p of projects) for (const t of p.topics) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit).map(([t]) => t);
}

/** Languages across all projects, most frequent first. */
export function languages(projects) {
  const counts = new Map();
  for (const p of projects) if (p.language) counts.set(p.language, (counts.get(p.language) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([l]) => l);
}

/** The avatar at a fixed size: the API URL serves 460px by default, far more than the page shows. */
export function sizedAvatar(url, px) {
  try {
    const u = new URL(url);
    u.searchParams.set('s', String(px));
    return u.href;
  } catch {
    return url;
  }
}

export function renderJsonLd(owner, projects, now) {
  const personId = `${SITE_ORIGIN}/#person`;
  const websiteId = `${SITE_ORIGIN}/#website`;
  const sameAs = [
    PRIMARY_SITE,
    owner.htmlUrl,
    ...(owner.twitter ? [`https://x.com/${owner.twitter}`] : []),
  ];
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        '@id': personId,
        name: owner.name,
        alternateName: owner.login,
        description: owner.bio || undefined,
        image: sizedAvatar(owner.avatar, 460),
        url: PRIMARY_SITE,
        sameAs,
        knowsAbout: [...languages(projects), ...topTopics(projects)],
      },
      {
        '@type': 'WebSite',
        '@id': websiteId,
        url: `${SITE_ORIGIN}/`,
        name: SITE_HOST,
        description: `Open-source project sites by ${owner.name}.`,
        inLanguage: 'en',
        publisher: { '@id': personId },
      },
      {
        // ProfilePage is the type search engines read for a page about one person.
        // It also stays a collection: mainEntity is the person, hasPart is the list.
        '@type': ['ProfilePage', 'CollectionPage'],
        '@id': `${SITE_ORIGIN}/`,
        url: `${SITE_ORIGIN}/`,
        name: `${owner.name} — open-source projects`,
        inLanguage: 'en',
        isPartOf: { '@id': websiteId },
        dateModified: now ? new Date(now).toISOString() : undefined,
        mainEntity: { '@id': personId },
        about: { '@id': personId },
        hasPart: {
          '@type': 'ItemList',
          '@id': `${SITE_ORIGIN}/#projects`,
          name: 'Project sites',
          numberOfItems: projects.length,
          itemListElement: projects.map((p, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: p.url,
            item: {
              '@type': 'SoftwareSourceCode',
              '@id': `${p.url}#software`,
              name: p.name,
              description: p.description || undefined,
              url: p.url,
              codeRepository: p.repoUrl,
              programmingLanguage: p.language || undefined,
              keywords: p.topics.length ? p.topics.join(', ') : undefined,
              dateModified: p.updatedAt,
              author: { '@id': personId },
            },
          })),
        },
      },
    ],
  };
  // `</script>` inside JSON would close the block early; escaping the slash is the standard fix.
  return JSON.stringify(graph, null, 2).replace(/</g, '\\u003c');
}

function renderStats(projects) {
  const stars = projects.reduce((n, p) => n + p.stars, 0);
  const langs = languages(projects);
  const items = [
    `<li><strong>${projects.length}</strong> project ${projects.length === 1 ? 'site' : 'sites'}</li>`,
    `<li><strong>${stars.toLocaleString('en-US')}</strong> ${stars === 1 ? 'star' : 'stars'}</li>`,
    ...(langs.length ? [`<li title="${langs.map(htmlEscape).join(', ')}"><strong>${langs.length}</strong> ${langs.length === 1 ? 'language' : 'languages'}</li>`] : []),
  ];
  return items.join('');
}

// The meta name that each webmaster tool reads.
const VERIFICATION_META = { google: 'google-site-verification', bing: 'msvalidate.01' };
// Real tokens use only these characters. A token with other characters is an error, not markup.
const TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;

/** One <meta> tag per token. An unknown engine or a malformed token throws, so a typo fails the build. */
export function renderVerification(verification = {}) {
  const tags = [];
  for (const [engine, tokens] of Object.entries(verification)) {
    if (engine.startsWith('_')) continue;
    const name = VERIFICATION_META[engine];
    if (!name) throw new Error(`site-verification.json: unknown engine "${engine}"`);
    for (const token of tokens) {
      if (!TOKEN_RE.test(token)) throw new Error(`site-verification.json: malformed ${engine} token "${token}"`);
      tags.push(`<meta name="${name}" content="${token}">`);
    }
  }
  return tags.join('\n');
}

export function renderIndex({ template, owner, projects, now, verification = {} }) {
  const title = `${owner.name} — open-source projects`;
  const langs = languages(projects).slice(0, 4);
  // A description that answers "what is here" by itself, for search snippets and answer engines.
  const description = `${projects.length} open-source project sites by ${owner.name}`
    + (langs.length ? ` in ${langs.join(', ')}` : '')
    + `: documentation, demos and tools published under ${SITE_HOST}.`;
  return fill(template, {
    ORIGIN: htmlEscape(SITE_ORIGIN),
    HOST: htmlEscape(SITE_HOST),
    TITLE: htmlEscape(title),
    DESCRIPTION: htmlEscape(description),
    KEYWORDS: htmlEscape([...langs, ...topTopics(projects, 8)].join(', ')),
    NAME: htmlEscape(owner.name),
    LOGIN: htmlEscape(owner.login),
    PRIMARY: htmlEscape(PRIMARY_SITE),
    TWITTER_META: owner.twitter
      ? `<meta name="twitter:creator" content="@${htmlEscape(owner.twitter)}">\n`
        + `<meta name="twitter:site" content="@${htmlEscape(owner.twitter)}">`
      : '',
    VERIFICATION: renderVerification(verification),
    BIO: htmlEscape(owner.bio),
    AVATAR: htmlEscape(sizedAvatar(owner.avatar, 256)),
    LINKS: renderLinks(owner),
    STATS: renderStats(projects),
    CARDS: renderCards(projects),
    JSONLD: renderJsonLd(owner, projects, now),
    BUILT: isoDate(now),
    BUILT_ISO: new Date(now).toISOString(),
  });
}

export function render404(template) {
  return fill(template, { ORIGIN: htmlEscape(SITE_ORIGIN), HOST: htmlEscape(SITE_HOST) });
}
