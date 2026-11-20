import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectProjects, fetchOwner, applyOverrides } from '../scripts/lib/discover.mjs';
import { htmlEscape, fill, renderCards, renderCardImage, renderJsonLd, renderIndex, render404, renderVerification,
  renderStats, lastRowFill, shortDate, renderDescription, DESCRIPTION_MAX }
  from '../scripts/lib/render-html.mjs';

const repos = JSON.parse(readFileSync(new URL('./fixtures/repos.json', import.meta.url)));
const userFixture = JSON.parse(readFileSync(new URL('./fixtures/user.json', import.meta.url)));
const indexTemplate = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const template404 = readFileSync(new URL('../src/404.html', import.meta.url), 'utf8');
const NOW = new Date('2026-09-11T00:00:00Z');

const projects = selectProjects(repos).map((p) => ({
  ...p, hasSitemap: p.name === 'cloud-cache-action', hasLlms: p.name === 'cloud-cache-action',
}));
const owner = await fetchOwner(async () => ({ ok: true, status: 200, json: async () => userFixture }));
const html = renderIndex({ template: indexTemplate, owner, projects, now: NOW });

test('every slot is filled', () => {
  assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/);
});

test('exactly one h1', () => {
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
});

test('heading levels descend without skipping', () => {
  const levels = [...html.matchAll(/<h([1-6])[ >]/g)].map((m) => Number(m[1]));
  assert.deepEqual(levels, [1, 2, 3, 3, 3]);
});

test('the Google Search Console tag survives rendering verbatim', () => {
  // The token that verified the site must stay, or Search Console loses the property.
  const verification = JSON.parse(readFileSync(new URL('../src/site-verification.json', import.meta.url)));
  const out = renderIndex({ template: indexTemplate, owner, projects, now: NOW, verification });
  assert.ok(out.includes(
    '<meta name="google-site-verification" content="sMLPKoYMB5EoPQiOfUJ51P7xLG55OXBKV9PTEvp2HPw">'));
});

test('the avatar is decorative because the name sits beside it', () => {
  assert.match(html, /<img class="avatar"[^>]*alt=""/);
});

test('a skip link targets the main landmark', () => {
  assert.ok(html.includes('<a class="skip" href="#main">'));
  assert.ok(html.includes('id="main"'));
});

test('each card link is named by its project, not by filler text', () => {
  for (const p of projects) {
    assert.ok(html.includes(`<a href="${p.url}">${p.name}</a>`), `no named link for ${p.name}`);
  }
});

/** Accessible name: an aria-label wins, otherwise the link's own text content. */
function linkNames(doc) {
  return [...doc.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attrs, inner]) => {
    const label = attrs.match(/\baria-label="([^"]*)"/);
    return (label ? label[1] : inner.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
  });
}

test('no two links in the document share an accessible name', () => {
  const names = linkNames(html);
  assert.ok(names.length >= 8, `only ${names.length} links found, the check would be vacuous`);
  const seen = new Set();
  const dupes = new Set();
  for (const n of names) {
    const key = n.toLowerCase();
    if (seen.has(key)) dupes.add(n);
    seen.add(key);
  }
  assert.deepEqual([...dupes], [],
    `links sharing an accessible name: ${[...dupes].join(', ')}`);
});

test('lists keep their list role even though the stylesheet hides the bullets', () => {
  for (const [label, doc] of [['index', html], ['404', template404]]) {
    for (const ul of doc.match(/<ul\b[^>]*>/g) ?? []) {
      assert.match(ul, /\srole="list"/, `${label}: list without role="list": ${ul}`);
    }
  }
});

test('cards are list items inside the cards list', () => {
  assert.equal((html.match(/<li class="card[ "]/g) ?? []).length, projects.length);
});

test('a project without a description gets a fallback line, not an empty paragraph', () => {
  assert.ok(html.includes('No description provided.'));
});

test('a card has no llms.txt link; the page head and the footer keep the hub llms.txt', () => {
  assert.ok(!renderCards(projects).includes('llms.txt'));
  assert.ok(html.includes('<link rel="alternate" type="text/plain" href="/llms.txt"'));
  assert.ok(html.includes('<a href="/llms.txt">llms.txt</a>'));
});

test('the name link is the only link to the project site, and an arrow hidden from a screen reader follows it', () => {
  for (const p of projects) {
    const out = renderCards([p]);
    assert.equal(out.split(`href="${p.url}"`).length - 1, 1, p.name);
    assert.ok(out.includes(`${p.name}</a><span class="arrow" aria-hidden="true">→</span></h3>`), p.name);
    assert.ok(out.includes(`<a href="${p.repoUrl}" aria-label="Source for ${p.name}">Source</a>`), p.name);
  }
});

test('the fact line has the language, the stars and the update date, and no commit count', () => {
  const out = renderCards([{ ...projects[0], language: 'Go', stars: 12, commits90: 7, updatedAt: '2026-09-01T10:00:00Z' }]);
  const meta = out.match(/<ul class="meta" role="list">([\s\S]*?)<\/ul>/)[1];
  const items = [...meta.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]*>/g, ''));
  assert.deepEqual(items, ['Go', '12 stars', 'Updated 1 Sep 2026']);
  assert.ok(!out.includes('commit'));
});

test('the newest release is a link to its GitHub page, with its date, in the link row', () => {
  const p = { ...projects[0], name: 'tool', releases: [
    { tag: 'v1.2.3', url: 'https://github.com/xSAVIKx/tool/releases/tag/v1.2.3', publishedAt: '2026-11-12T08:00:00Z' },
    { tag: 'v1.2.2', url: 'https://github.com/xSAVIKx/tool/releases/tag/v1.2.2', publishedAt: '2026-10-01T08:00:00Z' }] };
  const out = renderCards([p]);
  const also = out.match(/<p class="also">([\s\S]*?)<\/p>/)[1];
  assert.ok(also.includes('<a href="https://github.com/xSAVIKx/tool/releases/tag/v1.2.3" aria-label="v1.2.3 · 12 Nov 2026, release of tool">v1.2.3 · <time datetime="2026-11-12">12 Nov 2026</time></a>'));
  assert.ok(!out.includes('v1.2.2'));
  assert.ok(!renderCards([{ ...p, releases: [] }]).includes('release of'));
  assert.equal(shortDate('2026-01-05T23:59:59Z'), '5 Jan 2026');
});

test('a release tag is HTML-escaped in the text and in the label', () => {
  const out = renderCards([{ ...projects[0], releases: [{ tag: '<b>"1"', url: 'https://e/?a=1&b=2', publishedAt: '2026-11-12T08:00:00Z' }] }]);
  assert.ok(!out.includes('<b>'));
  assert.ok(out.includes('href="https://e/?a=1&amp;b=2"'));
  assert.ok(out.includes('&lt;b&gt;&quot;1&quot; · <time'));
});

test('the cards of an incomplete last desktop row get a class that makes them wider', () => {
  const card = (name, featured = false) => ({ ...projects[0], name, featured });
  const classesOf = (list) => [...renderCards(list).matchAll(/<li class="(card[^"]*)"/g)].map((m) => m[1]);
  // 2 featured + 5 others: rows of 2, 3 and 2. The two last cards share the last row.
  const seven = [card('a', true), card('b', true), card('c'), card('d'), card('e'), card('f'), card('g')];
  assert.deepEqual(classesOf(seven), ['card featured', 'card featured', 'card', 'card', 'card', 'card fill-2', 'card fill-2']);
  // One card remains: it takes the row.
  assert.deepEqual(classesOf(seven.slice(0, 6)).slice(-2), ['card', 'card fill-1']);
  // A complete last row, and a last row with a featured card, do not change.
  assert.equal(lastRowFill(seven.slice(0, 5)).size, 0);
  assert.equal(lastRowFill([card('a', true), card('b', true), card('c', true)]).size, 0);
  // A lone featured card takes a row; the cards after it start a new row.
  assert.deepEqual(classesOf([card('a', true), card('b')]), ['card featured solo', 'card fill-1']);
});

test('a project with topics renders each one, escaped, in its own list', () => {
  const cloudCache = projects.find((p) => p.name === 'cloud-cache-action');
  assert.deepEqual(cloudCache.topics, ['github-actions', 'cache']);
  const out = renderCards([cloudCache]);
  assert.match(out, /<ul class="topics" role="list">/);
  assert.ok(out.includes('<li>github-actions</li>'));
  assert.ok(out.includes('<li>cache</li>'));
});

test('a project with no topics renders no topics list at all', () => {
  const noTopics = projects.find((p) => p.name === 'AndroidScreencast');
  assert.deepEqual(noTopics.topics, []);
  const out = renderCards([noTopics]);
  assert.ok(!out.includes('class="topics"'));
});

test('a card shows 4 topics at most', () => {
  const manyTopics = { ...projects[0], topics: ['a', 'b', 'c', 'd', 'e', 'f'] };
  const out = renderCards([manyTopics]);
  const shown = [...out.match(/<ul class="topics" role="list">([\s\S]*?)<\/ul>/)[1].matchAll(/<li>([^<]*)<\/li>/g)].map((m) => m[1]);
  assert.deepEqual(shown, ['a', 'b', 'c', 'd']);
});

test('topic text is HTML-escaped like every other interpolated value', () => {
  const evilTopics = { ...projects[0], topics: ['<script>x</script>'] };
  const out = renderCards([evilTopics]);
  assert.ok(!out.includes('<script>x</script>'));
  assert.ok(out.includes('&lt;script&gt;x&lt;/script&gt;'));
});

test('user-supplied text is HTML-escaped', () => {
  const evil = [{ ...projects[0], description: '<script>alert(1)</script>', name: 'a&b' }];
  const out = renderCards(evil);
  assert.ok(!out.includes('<script>'));
  assert.ok(out.includes('&lt;script&gt;'));
  assert.ok(out.includes('a&amp;b'));
});

test('htmlEscape covers the five dangerous characters', () => {
  assert.equal(htmlEscape(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
});

test('fill leaves unknown slots untouched rather than erasing them', () => {
  assert.equal(fill('x {{A}} {{B}}', { A: '1' }), 'x 1 {{B}}');
});

test('JSON-LD parses and describes a Person, the site, and the project list', () => {
  const raw = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
  const data = JSON.parse(raw);
  const types = data['@graph'].flatMap((n) => [n['@type']].flat());
  for (const t of ['Person', 'WebSite', 'ProfilePage', 'CollectionPage']) {
    assert.ok(types.includes(t), `no ${t} node`);
  }
  const person = data['@graph'].find((n) => n['@type'] === 'Person');
  assert.equal(person.name, 'Yurii Serhiichuk');
  assert.equal(person.alternateName, 'xSAVIKx');
  assert.ok(person.sameAs.includes('https://serhiichuk.dev/'));
  assert.ok(person.knowsAbout.includes('Go'));
  const page = data['@graph'].find((n) => [n['@type']].flat().includes('ProfilePage'));
  assert.equal(page.mainEntity['@id'], person['@id']);
  assert.equal(page.dateModified, NOW.toISOString());
  const list = page.hasPart;
  assert.equal(list.numberOfItems, projects.length);
  for (const [i, entry] of list.itemListElement.entries()) {
    assert.equal(entry.item['@type'], 'SoftwareSourceCode');
    assert.equal(entry.item.codeRepository, projects[i].repoUrl);
    assert.equal(entry.item.author['@id'], person['@id']);
  }
});

test('profile links carry rel="me" so the identities connect', () => {
  assert.ok(html.includes('href="https://serhiichuk.dev/" rel="me"'));
  assert.ok(html.includes('href="https://github.com/xSAVIKx" rel="me"'));
});

test('the page names its author and the X account for social cards', () => {
  assert.ok(html.includes('<meta name="author" content="Yurii Serhiichuk">'));
  assert.ok(html.includes('<meta name="twitter:creator" content="@xSAVIKx">'));
  assert.ok(html.includes('<meta property="og:type" content="profile">'));
});

test('without an X account no twitter:creator tag is emitted', () => {
  const out = renderIndex({ template: indexTemplate, owner: { ...owner, twitter: null }, projects, now: NOW });
  assert.ok(!out.includes('twitter:creator'));
  assert.doesNotMatch(out, /\{\{[A-Z_]+\}\}/);
});

test('the description names the person, the title and the featured projects', () => {
  const list = projects.map((p) => ({ ...p, featured: p.name === 'cloud-cache-action' || p.name === 'okf-skills' }));
  const text = renderDescription(owner, list);
  assert.equal(text,
    `Open-source projects by ${owner.name}, Google Developer Expert, Cloud: cloud-cache-action, okf-skills and 1 more project site.`);
  const out = renderIndex({ template: indexTemplate, owner, projects: list, now: NOW });
  for (const tag of ['<meta name="description"', '<meta property="og:description"', '<meta name="twitter:description"']) {
    assert.ok(out.includes(`${tag} content="${text}">`), `${tag} must have the description`);
  }
  assert.ok(!/gde|developers\.google/i.test(text), 'the title is plain text, without a profile address');
});

test('the description stays in the limit of a search snippet', () => {
  const long = (n) => 'project-with-a-long-name-'.repeat(2) + n;
  const list = ['a', 'b', 'c'].map((n) => ({ ...projects[0], name: long(n), featured: n !== 'c' }));
  const text = renderDescription(owner, list);
  assert.ok(!text.includes('more project'), 'a long text drops the count of the other projects');
  assert.ok(text.endsWith(`${long('a')} and ${long('b')}.`));
  assert.ok(renderDescription(owner, projects).length <= DESCRIPTION_MAX);
});

test('without a featured project the description names the first two projects', () => {
  assert.ok(renderDescription(owner, projects).includes(`: ${projects[0].name}, ${projects[1].name} and 1 more project site.`));
});

test('the text alternative of og.png says what the image shows', () => {
  assert.match(html, /<meta property="og:image:alt" content="[^"]*Google Developer Expert, Cloud\. Open-source projects: [^"]+">/);
  assert.match(html, /<meta name="twitter:image:alt" content="[^"]*Google Developer Expert, Cloud/);
});

test('a card and the JSON-LD show the display name, and the links keep the repository name', () => {
  const [p] = applyOverrides([projects[0]], { [projects[0].name]: { displayName: 'A Display <Name>', language: 'Dockerfile', description: 'Hand-made text.' } }, () => {});
  const card = renderCards([p]);
  assert.ok(card.includes(`<a href="${p.url}">A Display &lt;Name&gt;</a>`));
  assert.ok(card.includes('<p>Hand-made text.</p>'));
  assert.ok(card.includes('Dockerfile</li>'));
  assert.ok(card.includes(`aria-label="Source for ${p.name}"`));
  const item = JSON.parse(renderJsonLd(owner, [p]))['@graph'][2].hasPart.itemListElement[0].item;
  assert.equal(item.name, 'A Display <Name>');
  assert.equal(item.alternateName, p.name);
  assert.equal(item.description, 'Hand-made text.');
  assert.equal(item.programmingLanguage, 'Dockerfile');
  assert.equal(item.url, p.url);
});

test('the avatar is requested at the size it is shown, not the 460px default', () => {
  assert.match(html, /<img class="avatar" src="[^"]*[?&]amp;s=256"|<img class="avatar" src="[^"]*s=256"/);
});

test('every card carries decorative art hidden from assistive technology', () => {
  assert.equal((html.match(/<svg class="art"[^>]*aria-hidden="true"/g) ?? []).length, projects.length);
});

test('the figures are one line of text beside the section heading', () => {
  const stars = projects.reduce((n, p) => n + p.stars, 0);
  assert.ok(html.includes(`<h2>Project sites</h2>\n    <div class="section-side">\n      <p class="stats">${projects.length} project sites · ${stars} stars</p>`));
  assert.ok(!html.includes('<strong>'));
  const list = [{ stars: 700, releases: [{}] }, { stars: 43, releases: [] }, { stars: 0 }];
  assert.equal(renderStats(list), '3 project sites · 743 stars · 1 with releases');
  assert.equal(renderStats([{ stars: 1 }]), '1 project site · 1 star');
});

test('the footer links are a list, so each link has its own 44 px target', () => {
  const footer = html.match(/<footer>([\s\S]*?)<\/footer>/)[1];
  const list = footer.match(/<ul class="links" role="list">([\s\S]*?)<\/ul>/)[1];
  assert.equal((list.match(/<li><a /g) ?? []).length, 4);
  assert.ok(!footer.replace(list, '').includes('<a '));
});

test('JSON-LD escapes any closing script tag in the data', () => {
  const out = renderJsonLd(owner, [{ ...projects[0], description: '</script><script>x' }]);
  assert.ok(!out.includes('</script>'));
});

test('the 404 page is noindex and routes back to the hub', () => {
  const out = render404(template404);
  assert.ok(out.includes('name="robots" content="noindex"'));
  assert.ok(out.includes('href="/"'));
});

test('the page carries a local icon set, not a third-party avatar', () => {
  assert.ok(html.includes('<link rel="icon" href="/favicon.ico" sizes="32x32">'));
  assert.ok(html.includes('<link rel="icon" type="image/svg+xml" href="/favicon.svg">'));
  assert.ok(html.includes('<link rel="apple-touch-icon" href="/apple-touch-icon.png">'));
  assert.ok(html.includes('<link rel="manifest" href="/site.webmanifest">'));
  // the avatar may still be used for the <img>, but must not be the favicon
  assert.doesNotMatch(html, /<link rel="icon"[^>]*avatars\.githubusercontent\.com/);
});

test('both colour schemes are declared so dark mode does not flash white', () => {
  assert.ok(html.includes('<meta name="color-scheme" content="light dark">'));
  assert.ok(html.includes('content="#f8fafc" media="(prefers-color-scheme: light)"'));
  assert.ok(html.includes('content="#14161a" media="(prefers-color-scheme: dark)"'));
});

test('the social card is fully described for scrapers that need dimensions', () => {
  assert.ok(html.includes('<meta property="og:site_name" content="xsavikx.github.io">'));
  assert.ok(html.includes('<meta property="og:image:width" content="1200">'));
  assert.ok(html.includes('<meta property="og:image:height" content="630">'));
  assert.match(html, /<meta property="og:image:alt" content="[^"]+">/);
  assert.match(html, /<meta name="twitter:image:alt" content="[^"]+">/);
});

test('the 404 page carries the same icon identity', () => {
  const out = render404(template404);
  assert.ok(out.includes('<link rel="icon" type="image/svg+xml" href="/favicon.svg">'));
  assert.ok(out.includes('<meta name="color-scheme" content="light dark">'));
});

test('rendering is deterministic for a fixed now', () => {
  assert.equal(html, renderIndex({ template: indexTemplate, owner, projects, now: NOW }));
});

test('a hand-made card replaces the generated art and stays decorative', () => {
  const out = renderCardImage({ ...projects[0], featured: false, card: 'https://xsavikx.github.io/x/card.svg?a=1&b=2' });
  assert.match(out, /^<img class="art" src="https:\/\/xsavikx\.github\.io\/x\/card\.svg\?a=1&amp;b=2" alt=""/);
  assert.ok(out.includes('loading="lazy"'));
  assert.ok(!out.includes('<svg'));
});

test('the page links the JSON feed and loads the WebMCP tools', () => {
  assert.ok(html.includes('<link rel="alternate" type="application/json" href="/projects.json"'));
  assert.ok(html.includes('<script type="module" src="/webmcp.js"></script>'));
});

test('site verification writes one meta tag per token, for Google and Bing', () => {
  const out = renderIndex({
    template: indexTemplate, owner, projects, now: NOW,
    verification: { _comment: 'x', google: ['abcDEF123_-xyz'], bing: ['0123456789ABCDEF0123456789ABCDEF'] },
  });
  assert.ok(out.includes('<meta name="google-site-verification" content="abcDEF123_-xyz">'));
  assert.ok(out.includes('<meta name="msvalidate.01" content="0123456789ABCDEF0123456789ABCDEF">'));
});

test('without tokens no verification tag is emitted', () => {
  assert.ok(!html.includes('msvalidate.01'));
  assert.equal(renderVerification({ google: [], bing: [] }), '');
});

test('a malformed token or an unknown engine fails the build', () => {
  assert.throws(() => renderVerification({ google: ['"><script>'] }), /malformed google token/);
  assert.throws(() => renderVerification({ yandex: ['abcdefgh12'] }), /unknown engine "yandex"/);
});


test('featured card art is the first-screen paint, so it is not lazy and the first one has high priority', () => {
  const card = { ...projects[0], featured: true, card: '/cards/a.svg' };
  const first = renderCardImage(card, { first: true });
  const second = renderCardImage(card);
  assert.ok(!first.includes('loading="lazy"') && first.includes('fetchpriority="high"'));
  assert.ok(!second.includes('loading="lazy"') && !second.includes('fetchpriority'));
  const out = renderCards([{ ...card, name: 'a' }, { ...card, name: 'b' }, { ...card, name: 'c', featured: false }]);
  assert.equal((out.match(/fetchpriority="high"/g) || []).length, 1);
  assert.equal((out.match(/loading="lazy"/g) || []).length, 1);
});

test('the 404 page lists the project sites from the project data', () => {
  const out = render404(template404, projects);
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(out));
  for (const p of projects) {
    assert.ok(out.includes(`<li><a href="/${p.name}/" data-name="${p.name}">${p.name}</a></li>`), `missing ${p.name}`);
  }
  assert.equal((out.match(/<h1[ >]/g) ?? []).length, 1);
  assert.ok(out.includes('name="robots" content="noindex"'));
  assert.ok(out.includes('<main id="main" class="notfound">'));
  // A name is data, not markup.
  const odd = render404(template404, [{ name: 'a"<b', url: 'https://xsavikx.github.io/a%22%3Cb/' }]);
  assert.ok(odd.includes('data-name="a&quot;&lt;b"'));
});

test('the 404 page has an inline script that offers the correct case of a project path', () => {
  const out = render404(template404, projects);
  const scripts = [...out.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  assert.ok(!/\bsrc=/.test(scripts[0][1]), 'the script must be inline');
  assert.ok(out.includes('<p id="suggest" class="suggest" hidden></p>'));
  assert.ok(scripts[0][2].includes('Did you mean '));
  assert.doesNotMatch(scripts[0][2], /innerHTML|https?:\/\//);

  // Run the script against a small stand-in for the page.
  const run = (pathname) => {
    const box = { hidden: true, parts: [], append(...p) { this.parts.push(...p); } };
    const links = projects.map((p) => ({ getAttribute: () => p.name }));
    const document = {
      querySelectorAll: () => links,
      createElement: () => ({}),
      getElementById: () => box,
    };
    new Function('document', 'location', scripts[0][2])(document, { pathname, search: '?a=1', hash: '#top' });
    return box;
  };
  const hit = run('/androidscreencast/docs/page.html');
  assert.equal(hit.hidden, false);
  assert.equal(hit.parts[1].href, '/AndroidScreencast/docs/page.html?a=1#top');
  assert.equal(hit.parts[1].textContent, '/AndroidScreencast/docs/page.html');
  assert.equal(run('/AndroidScreencast/missing').hidden, true, 'an exact name gets no suggestion');
  assert.equal(run('/no-such-project/').hidden, true);
  assert.equal(run('/').hidden, true);
  assert.equal(run('/%E0%A4%A/').hidden, true, 'a malformed path must not throw');
});

test('the Project sites row has a visible link to the release feed', () => {
  const head = html.match(/<div class="section-head">[\s\S]*?<ul class="cards"/)[0];
  assert.match(head, /<a class="feed-link" href="\/releases\.xml"><svg aria-hidden="true"[^>]*>[\s\S]*?<\/svg>Release feed<\/a>/);
  assert.ok(html.includes('<link rel="alternate" type="application/atom+xml" href="/releases.xml" title="Releases">'));
  assert.ok(html.includes('<li><a href="/releases.xml">Atom feed</a></li>'));
});
