import { SITE_ORIGIN, SITE_HOST, PRIMARY_SITE } from './discover.mjs';
import { isoDate } from './render-seo.mjs';
import { renderArt, languageColor } from './render-art.mjs';
import { OG_PERSON } from './render-og.mjs';

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

// A card is a summary, so it shows at most this many topics. The other topics
// stay in projects.json, llms-full.txt and the JSON-LD keywords.
const TOPIC_CAP = 4;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A date as "12 Nov 2026", in UTC, so the same input gives the same text on each machine. */
export function shortDate(value) {
  const d = new Date(value);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * The desktop grid has 6 tracks: a featured card takes 3, another card takes 2, and a lone
 * featured card takes the row. This function finds the cards of an incomplete last row and
 * gives each a class that makes it wider, so the row has no empty slot.
 * Result: a Map from project to "fill-2" (two cards share the row) or "fill-1" (one card).
 */
export function lastRowFill(projects) {
  const solo = projects.filter((p) => p.featured).length === 1;
  let row = [];
  let used = 0;
  for (const p of projects) {
    const span = p.featured ? (solo ? 6 : 3) : 2;
    if (used + span > 6) { row = []; used = 0; }
    row.push(p);
    used += span;
  }
  const fill = new Map();
  if (used === 6 || row.some((p) => p.featured)) return fill;
  for (const p of row) fill.set(p, row.length === 2 ? 'fill-2' : 'fill-1');
  return fill;
}

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
  const fill = lastRowFill(projects);
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
    // One fact line: language, stars, update date. The commit count is the sort key only.
    const meta = `${lang}${stars}<li>Updated <time datetime="${isoDate(p.updatedAt)}">${shortDate(p.updatedAt)}</time></li>`;

    const topics = p.topics.length
      ? `<ul class="topics" role="list">${p.topics.slice(0, TOPIC_CAP).map((t) => `<li>${htmlEscape(t)}</li>`).join('')}</ul>`
      : '';

    // The newest release is a link to its GitHub page. The label names the project,
    // so two projects with the same tag do not give two links with the same name.
    const release = p.releases?.[0];
    const releaseText = release ? `${release.tag} · ${shortDate(release.publishedAt)}` : '';
    const also = [
      `<a href="${htmlEscape(p.repoUrl)}" aria-label="Source for ${htmlEscape(p.name)}">Source</a>`,
      ...(release ? [`<a href="${htmlEscape(release.url)}" aria-label="${htmlEscape(`${releaseText}, release of ${p.name}`)}">${htmlEscape(release.tag)} · <time datetime="${isoDate(release.publishedAt)}">${shortDate(release.publishedAt)}</time></a>`] : []),
    ].join('');

    const classes = ['card', ...(p.featured ? ['featured', ...(solo ? ['solo'] : [])] : []),
      ...(fill.has(p) ? [fill.get(p)] : [])].join(' ');
    // The name link covers the whole card (its ::after element), so the name is the only
    // link to the project site. The arrow is a cue for the eye and is hidden from a screen reader.
    return `
      <li class="${classes}">
        ${renderCardImage(p, { first: p === firstFeatured })}
        <div class="body">
          ${eyebrow}<h3><a href="${htmlEscape(p.url)}">${htmlEscape(p.displayName ?? p.name)}</a><span class="arrow" aria-hidden="true">→</span></h3>
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
              name: p.displayName ?? p.name,
              alternateName: p.displayName && p.displayName !== p.name ? p.name : undefined,
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

/** One muted line of text beside the section heading, for example "7 project sites · 743 stars · 5 with releases". */
export function renderStats(projects) {
  const stars = projects.reduce((n, p) => n + p.stars, 0);
  const released = projects.filter((p) => p.releases?.length).length;
  return [
    `${projects.length} project ${projects.length === 1 ? 'site' : 'sites'}`,
    `${stars.toLocaleString('en-US')} ${stars === 1 ? 'star' : 'stars'}`,
    ...(released ? [`${released} with releases`] : []),
  ].join(' · ');
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

/** The projects that a short text names: the featured ones, or the first two of the list. */
function namedProjects(projects) {
  const featured = projects.filter((p) => p.featured);
  return (featured.length ? featured : projects).slice(0, 2).map((p) => p.name);
}

/** "a", "a and b". */
const joinNames = (names) => names.join(' and ');

/**
 * The meta description, also for og:description and twitter:description. It names the person,
 * the title and the featured projects by repository name, so a search snippet says what is here.
 * The limit of a snippet is about 155 characters. A text that is too long loses the count of
 * the other projects.
 */
export function renderDescription(owner, projects) {
  const names = namedProjects(projects);
  const rest = projects.length - names.length;
  const head = `Open-source projects by ${owner.name}, ${OG_PERSON.title}: `;
  const short = `${head}${joinNames(names)}.`;
  if (rest <= 0) return short;
  const long = `${head}${names.join(', ')} and ${rest} more project ${rest === 1 ? 'site' : 'sites'}.`;
  return long.length <= DESCRIPTION_MAX ? long : short;
}
export const DESCRIPTION_MAX = 155;

/** The text alternative of og.png. It says what the image shows. */
export function renderOgAlt(owner, projects) {
  return `${owner.name}, ${OG_PERSON.title}. Open-source projects: ${joinNames(namedProjects(projects))}.`;
}

export function renderIndex({ template, owner, projects, now, verification = {} }) {
  const title = `${owner.name} — open-source projects`;
  const langs = languages(projects).slice(0, 4);
  const description = renderDescription(owner, projects);
  return fill(template, {
    ORIGIN: htmlEscape(SITE_ORIGIN),
    HOST: htmlEscape(SITE_HOST),
    TITLE: htmlEscape(title),
    DESCRIPTION: htmlEscape(description),
    OG_ALT: htmlEscape(renderOgAlt(owner, projects)),
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

/** The project sites as links for the 404 page. The script of that page reads data-name. */
export function render404Sites(projects) {
  return projects.map((p) =>
    `<li><a href="${htmlEscape(new URL(p.url).pathname)}" data-name="${htmlEscape(p.name)}">${htmlEscape(p.name)}</a></li>`)
    .join('\n    ');
}

export function render404(template, projects = []) {
  return fill(template, {
    ORIGIN: htmlEscape(SITE_ORIGIN),
    HOST: htmlEscape(SITE_HOST),
    SITES: render404Sites(projects),
  });
}
