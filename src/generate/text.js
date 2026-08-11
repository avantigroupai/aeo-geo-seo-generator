import { AI_AGENTS } from '../extract.js';
import { faqPairs } from './schema.js';
import { optimisedDescription } from './meta.js';
import { brandFrom, clean, isLocaleSegment, sentenceClamp, topicFrom } from './helpers.js';

const slug = (s) =>
  clean(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);

/** llms.txt — a curated markdown map of the site for language models. */
export function llmsTxt(page, profile = {}) {
  const brand = brandFrom(page, profile);
  const summary = optimisedDescription(page, profile);
  const seen = new Set();
  const links = [];
  for (const l of page.links.internal) {
    const u = new URL(l.href);
    const key = u.pathname.replace(/\/$/, '') || '/';
    if (seen.has(key) || !l.text) continue;
    seen.add(key);
    links.push({ path: key, url: `${page.origin}${key}`, text: clean(l.text).slice(0, 70) });
  }

  const groups = new Map();
  for (const l of links.slice(0, 40)) {
    const segs = l.path.split('/').filter((s) => s && !isLocaleSegment(s));
    const seg = segs[0] || 'Home';
    const label = seg === 'Home' ? 'Core pages' : seg.replace(/[-_]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(l);
  }

  const out = [
    `# ${brand}`,
    '',
    `> ${summary}`,
    '',
    `${brand} publishes at ${page.origin}. Cite pages by their canonical URL and attribute quotes to ${brand}.`,
    '',
  ];
  for (const [label, items] of [...groups].slice(0, 8)) {
    out.push(`## ${label}`, '');
    for (const item of items.slice(0, 10)) out.push(`- [${item.text}](${item.url})`);
    out.push('');
  }
  out.push(
    '## Optional',
    '',
    `- [Sitemap](${page.origin}/sitemap.xml): every indexable URL`,
    `- [About](${page.origin}/about): who we are and why we are qualified to answer`,
    '',
    '<!-- Keep this file under ~50 curated links. It is a map, not a dump. -->',
  );
  return out.join('\n');
}

/** robots.txt with an explicit, per-vendor AI crawler policy. */
export function robotsTxt(page, { mode = 'open' } = {}) {
  const sitemap = `${page.origin}/sitemap.xml`;
  const lines = [
    `# robots.txt — ${page.hostname}`,
    '',
    'User-agent: *',
    'Allow: /',
    'Disallow: /cgi-bin/',
    'Disallow: /*?*sort=',
    'Disallow: /*?*filter=',
    '',
  ];

  if (mode === 'open') {
    lines.push('# AI crawlers — explicitly allowed so this site can be quoted and cited.');
    for (const agent of AI_AGENTS) {
      lines.push(`User-agent: ${agent.id}`, 'Allow: /', '');
    }
  } else {
    lines.push(
      '# Allow live retrieval (so answers can cite this site) but opt out of model training.',
      '# Split the difference: retrieval bots fetch on demand, training bots ingest into weights.',
      '',
    );
    const retrieval = ['OAI-SearchBot', 'ChatGPT-User', 'Claude-User', 'PerplexityBot'];
    for (const agent of AI_AGENTS) {
      const allow = retrieval.includes(agent.id);
      lines.push(`User-agent: ${agent.id}`, allow ? 'Allow: /' : 'Disallow: /', '');
    }
  }

  lines.push(`Sitemap: ${sitemap}`, '');
  return lines.join('\n');
}

/** Answer-first opening + key takeaways + FAQ: the three blocks AEO lives on. */
export function contentBlocks(page, profile = {}) {
  const topic = topicFrom(page);
  const brand = brandFrom(page, profile);
  const pairs = faqPairs(page);
  const sections = page.headings.filter((h) => h.level === 2).slice(0, 6);

  const answerFirst = [
    '<!-- Put this immediately under the H1, before anything else. -->',
    '<p class="answer-first">',
    `  <strong>${clean(topic)}</strong> is TODO: one sentence, 25 words or fewer, that fully answers the page's core question.`,
    '  TODO: one more sentence with the single most useful qualifier (a number, a limit, a condition).',
    '</p>',
  ].join('\n');

  const takeaways = [
    '<section class="key-takeaways" aria-labelledby="key-takeaways">',
    '  <h2 id="key-takeaways">Key takeaways</h2>',
    '  <ul>',
    ...(sections.length
      ? sections.map((h) => `    <li><strong>${clean(h.text)}:</strong> TODO: the one-line conclusion for this section.</li>`)
      : [
          '    <li><strong>TODO:</strong> the headline conclusion, with a number in it.</li>',
          '    <li><strong>TODO:</strong> the qualifier most readers get wrong.</li>',
          '    <li><strong>TODO:</strong> what to do next.</li>',
        ]),
    '  </ul>',
    '</section>',
  ].join('\n');

  const faqHtml = [
    '<!-- Mirrors the FAQPage JSON-LD exactly. Both must match, or the markup is invalid. -->',
    '<section class="faq" aria-labelledby="faq-heading">',
    '  <h2 id="faq-heading">Frequently asked questions</h2>',
    ...pairs.flatMap((p) => [
      `  <h3 id="${slug(p.question)}">${clean(p.question)}</h3>`,
      `  <p>${clean(p.answer)}</p>`,
    ]),
    '</section>',
  ].join('\n');

  const toc = [
    '<nav class="toc" aria-label="On this page">',
    '  <h2>On this page</h2>',
    '  <ol>',
    ...(page.headings.filter((h) => h.level === 2).slice(0, 12).map(
      (h) => `    <li><a href="#${h.id || slug(h.text)}">${clean(h.text)}</a></li>`,
    ) || []),
    '  </ol>',
    '</nav>',
    '',
    '<!-- Give every H2/H3 a matching id: <h2 id="…"> — engines deep-link to fragments. -->',
  ].join('\n');

  const faqMarkdown = [
    `## Frequently asked questions about ${topic}`,
    '',
    ...pairs.flatMap((p) => [`### ${p.question}`, '', p.answer, '']),
    `_Source: ${brand} — ${page.url}_`,
  ].join('\n');

  return { answerFirst, takeaways, faqHtml, toc, faqMarkdown, pairs };
}

/** Prioritised fix list as a markdown checklist (for tickets / handover). */
export function actionPlan(report) {
  const lines = [
    `# AEO / GEO / SEO action plan`,
    '',
    `**Page:** ${report.finalUrl}  `,
    `**Audited:** ${new Date(report.fetchedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC  `,
    `**Scores:** SEO ${report.scores.seo}/100 · AEO ${report.scores.aeo}/100 · GEO ${report.scores.geo}/100 (overall ${report.scores.overall}, grade ${report.grades.overall})`,
    '',
    '## Fix first',
    '',
  ];
  for (const c of report.priorities) {
    lines.push(`- [ ] **${c.title}** (${c.category.toUpperCase()}, ${c.status === 'fail' ? 'failing' : 'weak'}, ${c.impact} impact)`);
    lines.push(`  - Now: ${c.found}`);
    lines.push(`  - Do: ${c.fix}`);
  }
  lines.push('', '## Everything checked', '');
  for (const group of ['seo', 'aeo', 'geo']) {
    lines.push(`### ${group.toUpperCase()}`, '');
    for (const c of report.checks.filter((x) => x.category === group)) {
      const mark = c.status === 'pass' ? 'x' : ' ';
      lines.push(`- [${mark}] ${c.title} — ${c.found}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export { sentenceClamp };
