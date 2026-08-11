import test from 'node:test';
import assert from 'node:assert/strict';

import { extractPage, parseRobots, robotsVerdict, isQuestion, readability } from '../src/extract.js';
import { scoreOf, grade } from '../src/audit/check.js';
import { auditSeo } from '../src/audit/seo.js';
import { auditAeo } from '../src/audit/aeo.js';
import { auditGeo } from '../src/audit/geo.js';
import { buildGraph, faqPairs } from '../src/generate/schema.js';
import { optimisedTitle, optimisedDescription } from '../src/generate/meta.js';
import { robotsTxt, llmsTxt } from '../src/generate/text.js';
import { buildArtifacts } from '../src/generate/index.js';
import { buildHandover, handoverMarkdown, COVERAGE, HUMAN } from '../src/generate/handover.js';
import { normaliseUrl } from '../src/fetcher.js';

const HTML = `<!doctype html>
<html lang="en">
<head>
  <title>Retrieval augmented generation explained | Acme</title>
  <meta name="description" content="Retrieval augmented generation grounds a model in your own documents. Here is how it works, what it costs and when it beats fine-tuning.">
  <link rel="canonical" href="https://acme.com/blog/rag">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta property="og:title" content="RAG explained">
  <meta property="og:description" content="How retrieval augmented generation works.">
  <meta property="og:image" content="/og.png">
  <meta property="og:url" content="https://acme.com/blog/rag">
  <meta property="og:type" content="article">
  <meta property="article:published_time" content="2026-02-01T10:00:00Z">
</head>
<body>
  <main>
    <h1>Retrieval augmented generation explained</h1>
    <p>Retrieval augmented generation is a technique that grounds a language model in documents you control. It cut hallucination rates by 42% in our benchmark of 1,200 queries.</p>
    <h2 id="how">How does retrieval augmented generation work?</h2>
    <p>The system embeds your documents, retrieves the closest chunks for a query, and passes them to the model as context. According to a 2025 study, this beats fine-tuning on freshness-sensitive tasks.</p>
    <h2 id="cost">How much does RAG cost?</h2>
    <p>Expect $0.40 per thousand queries at current embedding prices, plus storage.</p>
    <ul><li>Chunk to 400 tokens</li><li>Re-rank the top 50</li><li>Cite the source</li></ul>
    <blockquote>"Grounding beats scale for enterprise search." — Dr. Lin, Acme Research</blockquote>
    <img src="/diagram.png" alt="RAG pipeline diagram">
    <a href="https://en.wikipedia.org/wiki/Retrieval-augmented_generation">Wikipedia</a>
    <a href="/blog/embeddings">Embeddings guide</a>
  </main>
</body>
</html>`;

const page = extractPage(HTML, 'https://acme.com/blog/rag');
const ctx = {
  robots: null,
  sitemap: { found: false },
  llmsTxt: null,
  aiVerdicts: {},
  robotsVerdicts: { Googlebot: { allowed: true, reason: 'no robots.txt' } },
  redirects: [],
};

test('extract reads the head, headings and content signals', () => {
  assert.equal(page.lang, 'en');
  assert.equal(page.h1s.length, 1);
  assert.equal(page.canonical, 'https://acme.com/blog/rag');
  assert.equal(page.questionHeadings.length, 2);
  assert.ok(page.wordCount > 80);
  assert.equal(page.images.total, 1);
  assert.equal(page.images.withAlt, 1);
  assert.equal(page.links.internal.length, 1);
  assert.equal(page.links.authority.length, 1);
  assert.equal(page.quotes, 1);
  assert.ok(page.statsCount >= 3, `expected statistics, got ${page.statsCount}`);
  assert.ok(page.headings.find((h) => h.id === 'how').answer.startsWith('The system embeds'));
});

test('question detection accepts real questions only', () => {
  assert.ok(isQuestion('How does RAG work?'));
  assert.ok(isQuestion('What is a vector database'));
  assert.ok(!isQuestion('Vector databases'));
  assert.ok(!isQuestion('How'));
});

test('readability returns a plausible Flesch score', () => {
  const r = readability('The cat sat on the mat. It was a warm day and the sun was out.');
  assert.ok(r.flesch > 70, `expected easy text, got ${r.flesch}`);
});

test('robots.txt parsing honours the most specific rule', () => {
  const robots = parseRobots(`
User-agent: *
Disallow: /private/

User-agent: GPTBot
Disallow: /

User-agent: PerplexityBot
Disallow: /
Allow: /blog/

Sitemap: https://acme.com/sitemap.xml
`);
  assert.deepEqual(robots.sitemaps, ['https://acme.com/sitemap.xml']);
  assert.equal(robotsVerdict(robots, 'GPTBot', '/blog/rag').allowed, false);
  assert.equal(robotsVerdict(robots, 'PerplexityBot', '/blog/rag').allowed, true);
  assert.equal(robotsVerdict(robots, 'PerplexityBot', '/pricing').allowed, false);
  assert.equal(robotsVerdict(robots, 'Googlebot', '/private/x').allowed, false);
  assert.equal(robotsVerdict(robots, 'Googlebot', '/blog/rag').allowed, true);
  assert.equal(robotsVerdict(null, 'GPTBot', '/').allowed, true);
});

test('grouped user-agents share one rule block', () => {
  const robots = parseRobots('User-agent: A\nUser-agent: B\nDisallow: /x\n');
  assert.equal(robotsVerdict(robots, 'B', '/x').allowed, false);
});

test('audits score a well-formed page above a bare one', () => {
  const good = [...auditSeo(page, ctx), ...auditAeo(page, ctx), ...auditGeo(page, ctx)];
  const bare = extractPage('<html><body><p>hi</p></body></html>', 'https://acme.com/');
  const bad = [...auditSeo(bare, ctx), ...auditAeo(bare, ctx), ...auditGeo(bare, ctx)];
  assert.ok(scoreOf(good) > scoreOf(bad) + 20, `${scoreOf(good)} vs ${scoreOf(bad)}`);
  assert.equal(grade(95), 'A');
  assert.equal(grade(10), 'F');
});

test('every check carries the fields the UI renders', () => {
  for (const c of [...auditSeo(page, ctx), ...auditAeo(page, ctx), ...auditGeo(page, ctx)]) {
    assert.ok(c.id && c.title && c.fix, `incomplete check: ${c.id}`);
    assert.ok(['pass', 'warn', 'fail', 'info'].includes(c.status), `bad status on ${c.id}`);
    assert.equal(typeof c.found, 'string');
    assert.ok(c.weight > 0);
  }
});

test('JSON-LD graph is valid and internally linked', () => {
  const graph = buildGraph(page, { brandName: 'Acme', sameAs: ['https://linkedin.com/company/acme'] });
  const json = JSON.parse(JSON.stringify(graph));
  assert.equal(json['@context'], 'https://schema.org');
  const types = json['@graph'].map((n) => n['@type']);
  assert.ok(types.includes('Organization'));
  assert.ok(types.includes('WebSite'));
  assert.ok(types.includes('FAQPage'));
  const website = json['@graph'].find((n) => n['@type'] === 'WebSite');
  assert.equal(website.publisher['@id'], 'https://acme.com/#organization');
  const crumbs = json['@graph'].find((n) => n['@type'] === 'BreadcrumbList');
  assert.deepEqual(crumbs.itemListElement.map((i) => i.position), [1, 2, 3]);
  const faq = json['@graph'].find((n) => n['@type'] === 'FAQPage');
  assert.ok(faq.mainEntity.every((q) => q.acceptedAnswer.text.length > 0));
});

test('FAQ pairs prefer the questions already on the page', () => {
  const pairs = faqPairs(page);
  assert.equal(pairs[0].source, 'page');
  assert.ok(pairs[0].question.endsWith('?'));
  assert.ok(pairs.some((p) => p.source === 'suggested'));
});

test('title and description proposals respect length limits', () => {
  const long = extractPage(
    '<html><head><title>An extremely long page title that rambles well past the sixty character limit search engines respect | Acme</title></head><body><h1>Long</h1><p>Body copy.</p></body></html>',
    'https://acme.com/x',
  );
  const title = optimisedTitle(long, { brandName: 'Acme' });
  assert.ok(title.length <= 60, `title too long: ${title.length}`);
  const desc = optimisedDescription(page, {});
  assert.ok(desc.length >= 70 && desc.length <= 160, `description length ${desc.length}`);
  // Brand already present: never appended twice.
  const dup = extractPage('<html><head><title>Acme Blog</title><meta name="description" content="News, guides and teardowns."></head><body></body></html>', 'https://acme.com/');
  assert.ok(!/Acme.*Acme/.test(optimisedTitle(dup, { brandName: 'Acme' })));
});

test('robots.txt generator covers both policies', () => {
  const open = robotsTxt(page, { mode: 'open' });
  assert.ok(open.includes('User-agent: GPTBot\nAllow: /'));
  assert.ok(open.includes('Sitemap: https://acme.com/sitemap.xml'));
  const balanced = robotsTxt(page, { mode: 'balanced' });
  assert.ok(balanced.includes('User-agent: GPTBot\nDisallow: /'));
  assert.ok(balanced.includes('User-agent: OAI-SearchBot\nAllow: /'));
});

test('llms.txt lists the site under a heading', () => {
  const txt = llmsTxt(page, { brandName: 'Acme' });
  assert.ok(txt.startsWith('# Acme'));
  assert.ok(txt.includes('https://acme.com/blog/embeddings'));
});

/* ------------------------------------------------------------- handover */

const bare = extractPage('<html><body><p>hi</p></body></html>', 'https://acme.com/');

function fakeReport(p) {
  const checks = [...auditSeo(p, ctx), ...auditAeo(p, ctx), ...auditGeo(p, ctx)];
  return {
    finalUrl: p.url,
    fetchedAt: '2026-08-11T09:00:00Z',
    scores: { seo: 60, aeo: 50, geo: 40, overall: 50 },
    grades: { seo: 'D', aeo: 'E', geo: 'E', overall: 'E' },
    checks,
    priorities: checks.filter((c) => c.status === 'fail' || c.status === 'warn').slice(0, 12),
    page: p,
    context: {},
  };
}

// Checks that only fire on certain pages, so a two-fixture union will not contain them.
const CONDITIONAL_IDS = ['seo.title.duplicate', 'seo.hreflang', 'aeo.howto'];

test('handover maps reference real checks and never claim the same one twice', () => {
  const known = new Set([...fakeReport(page).checks, ...fakeReport(bare).checks].map((c) => c.id));
  for (const id of [...Object.keys(COVERAGE), ...Object.keys(HUMAN)]) {
    assert.ok(known.has(id) || CONDITIONAL_IDS.includes(id), `handover references an unknown check: ${id}`);
  }
  for (const id of Object.keys(COVERAGE)) {
    assert.ok(!(id in HUMAN), `${id} is claimed by both a file and a person`);
  }
  for (const [id, entry] of Object.entries(HUMAN)) {
    assert.ok(entry.owner && entry.effort && entry.why, `incomplete human entry: ${id}`);
  }
});

test('every open finding lands in exactly one bucket', () => {
  for (const p of [page, bare]) {
    const report = fakeReport(p);
    const { artifacts } = buildArtifacts(p, report, {});
    const h = buildHandover(p, report, artifacts, {});
    const open = report.checks.filter((c) => c.status === 'fail' || c.status === 'warn');
    assert.equal(h.counts.openTotal, open.length);
    assert.equal(h.shipped.length + h.yours.length, open.length);
    const ids = new Set([...h.shipped, ...h.yours].map((x) => x.id));
    assert.equal(ids.size, open.length, 'a finding was bucketed twice');
    for (const y of h.yours) assert.ok(y.owner && y.why, `no owner for ${y.id}`);
    for (const s of h.shipped) assert.ok(s.filename && s.paste, `no destination for ${s.id}`);
  }
});

test('TODO placeholders surface as blockers on the files that carry them', () => {
  const report = fakeReport(bare);
  const { artifacts } = buildArtifacts(bare, report, {});
  const h = buildHandover(bare, report, artifacts, {});

  assert.ok(h.counts.placeholders > 0, 'the content blocks ship with deliberate TODOs');
  assert.ok(h.placeholders.some((p) => p.filename === 'answer-first.html'));

  const answerFirst = h.shipped.find((s) => s.id === 'aeo.answer-first');
  assert.ok(answerFirst, 'answer-first is a generated fix on a bare page');
  assert.ok(answerFirst.blockers.some((b) => /TODO/.test(b)), 'the TODOs must be declared, not hidden');
});

test('a filled-in profile clears the inputs it unlocks', () => {
  const report = fakeReport(bare);
  const empty = buildHandover(bare, report, buildArtifacts(bare, report, {}).artifacts, {});
  assert.ok(empty.inputs.some((i) => i.id === 'sameAs'));
  assert.ok(empty.inputs.some((i) => i.id === 'authorName'));

  const profile = {
    brandName: 'Acme',
    logoUrl: 'https://acme.com/og.png',
    authorName: 'Jordan Reyes',
    authorUrl: 'https://acme.com/team/jordan',
    sameAs: ['https://linkedin.com/company/acme'],
    publishedAt: '2026-01-15T09:00:00Z',
    modifiedAt: '2026-08-01T09:00:00Z',
    searchUrlTemplate: 'https://acme.com/search?q={search_term_string}',
  };
  const filled = buildHandover(bare, report, buildArtifacts(bare, report, profile).artifacts, profile);
  assert.equal(filled.inputs.length, 0);
  const entity = filled.shipped.find((s) => s.id === 'geo.entity');
  if (entity) assert.ok(!entity.blockers.some((b) => /sameAs/.test(b)));
});

test('the handover document carries all four sections and the pack includes it', () => {
  const report = fakeReport(bare);
  const generated = buildArtifacts(bare, report, {});
  assert.ok(generated.handover, 'handover travels with the artifacts');

  const doc = generated.artifacts.find((a) => a.filename === 'handover.md');
  assert.ok(doc, 'handover.md is part of the pack');
  for (const heading of [
    '## 1 — Closed by the generated files',
    '## 2 — We need this from you',
    '## 3 — Still yours',
    '## 4 — Decisions only you can make',
  ]) {
    assert.ok(doc.code.includes(heading), `missing section: ${heading}`);
  }
  assert.ok(doc.code.includes('Which AI crawlers do you let in?'));
  assert.ok(/Why we cannot do it for you:/.test(doc.code));
  // The document itself is generated last, so it must not count its own prose as a placeholder.
  assert.ok(!generated.handover.placeholders.some((p) => p.filename === 'handover.md'));
  assert.equal(handoverMarkdown(null, report), '');
});

test('URL normalisation rejects non-http schemes', () => {
  assert.equal(normaliseUrl('acme.com').href, 'https://acme.com/');
  assert.throws(() => normaliseUrl('ftp://acme.com'), /http/);
  assert.throws(() => normaliseUrl(''), /Enter a URL/);
});
