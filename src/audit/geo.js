import { check } from './check.js';

const CITATION_CUES = /\b(according to|source:|study|research|report|survey|data from|as reported by|\(20\d\d\))/i;
const ORIGINAL_CUES = /\b(we (analy[sz]ed|surveyed|tested|measured|tracked|benchmarked)|our (data|research|study|analysis|survey|benchmark)|based on \d)/i;
const COMPARISON_CUES = /\b(vs\.?|versus|compared to|alternative(s)? to|pros and cons|better than)\b/i;

/**
 * GEO — Generative Engine Optimization.
 * Will an LLM ingest this page, trust it, and cite it by name?
 */
export function auditGeo(page, ctx) {
  const c = [];
  const { llmsTxt, aiVerdicts, robots } = ctx;

  // --- AI crawler access ---------------------------------------------------
  const verdicts = Object.entries(aiVerdicts || {});
  const blocked = verdicts.filter(([, v]) => !v.allowed).map(([k]) => k);
  c.push(
    check({
      id: 'geo.ai-crawlers',
      category: 'geo',
      title: 'AI crawler access',
      weight: 10,
      impact: 'high',
      status: !robots ? 'warn' : blocked.length === 0 ? 'pass' : blocked.length <= 2 ? 'warn' : 'fail',
      found: !robots
        ? 'No robots.txt — every AI crawler is allowed by default'
        : blocked.length
          ? `Blocked: ${blocked.join(', ')}`
          : `All ${verdicts.length} known AI agents may crawl this path`,
      fix: 'Blocking a crawler removes you from that assistant\'s answers. Decide per vendor — training vs. live retrieval are different bots.',
      evidence: verdicts.map(([k, v]) => `${k}: ${v.allowed ? 'allowed' : 'blocked'} (${v.reason})`),
    }),
  );

  // --- llms.txt ------------------------------------------------------------
  c.push(
    check({
      id: 'geo.llms-txt',
      category: 'geo',
      title: '/llms.txt manifest',
      weight: 6,
      impact: 'medium',
      status: llmsTxt?.body ? 'pass' : 'fail',
      found: llmsTxt?.body ? `Found at ${llmsTxt.url} (${llmsTxt.body.length} bytes)` : 'No /llms.txt',
      fix: 'llms.txt is a curated, markdown map of your site for LLMs — cheap to ship, and it steers what gets quoted.',
    }),
  );

  // --- Entity identity -----------------------------------------------------
  const orgNode = page.jsonLd.find((n) => /Organization|Person|LocalBusiness/i.test(JSON.stringify(n['@type'] || '')));
  const sameAs = orgNode?.sameAs;
  c.push(
    check({
      id: 'geo.entity',
      category: 'geo',
      title: 'Entity identity (Organization/Person)',
      weight: 9,
      impact: 'high',
      status: orgNode ? (sameAs ? 'pass' : 'warn') : 'fail',
      found: orgNode
        ? `${[].concat(orgNode['@type']).join('/')} schema${sameAs ? ` with ${[].concat(sameAs).length} sameAs links` : ', but no sameAs profiles'}`
        : 'No Organization or Person schema',
      fix: 'LLMs resolve you to a knowledge-graph entity. Publish Organization schema with sameAs links to Wikipedia, LinkedIn, Crunchbase and your socials.',
    }),
  );

  // --- Authorship / E-E-A-T -----------------------------------------------
  const authorSchema = page.jsonLd.some((n) => n.author);
  const hasByline = Boolean(page.author || page.bylineText || authorSchema);
  c.push(
    check({
      id: 'geo.authorship',
      category: 'geo',
      title: 'Named author & credentials',
      weight: 7,
      impact: 'high',
      status: authorSchema && hasByline ? 'pass' : hasByline ? 'warn' : 'fail',
      found: authorSchema
        ? 'author present in structured data'
        : page.author || page.bylineText
          ? `Visible byline only: "${(page.author || page.bylineText).slice(0, 80)}"`
          : 'No author anywhere on the page',
      fix: 'Name a real author, link a bio page with credentials, and mirror it in author schema. Anonymous pages get cited far less.',
    }),
  );

  // --- Freshness -----------------------------------------------------------
  const dateStr = page.dates.modified || page.dates.published || page.dates.timeTags[0] || null;
  let ageDays = null;
  if (dateStr) {
    const t = Date.parse(dateStr);
    if (!Number.isNaN(t)) ageDays = Math.round((Date.now() - t) / 86400000);
  }
  c.push(
    check({
      id: 'geo.freshness',
      category: 'geo',
      title: 'Visible dates & freshness',
      weight: 6,
      impact: 'medium',
      status: !dateStr ? 'fail' : ageDays == null ? 'warn' : ageDays <= 365 ? 'pass' : 'warn',
      found: dateStr ? `${dateStr}${ageDays != null ? ` (${ageDays} days old)` : ''}` : 'No published or modified date exposed',
      fix: 'Expose datePublished and dateModified in schema and in visible text. Retrieval layers rank recency heavily.',
    }),
  );

  // --- Statistics ----------------------------------------------------------
  const per1k = page.wordCount ? (page.statsCount / page.wordCount) * 1000 : 0;
  c.push(
    check({
      id: 'geo.statistics',
      category: 'geo',
      title: 'Quantitative claims',
      weight: 8,
      impact: 'high',
      status: page.statsCount >= 5 && per1k >= 3 ? 'pass' : page.statsCount >= 2 ? 'warn' : 'fail',
      found: `${page.statsCount} statistics (${per1k.toFixed(1)} per 1,000 words) · ${page.numbersCount} numbers total`,
      fix: 'Concrete figures are what generative engines lift. Add percentages, sample sizes and dated benchmarks — each with its source.',
      evidence: page.statsSamples,
    }),
  );

  // --- Citations -----------------------------------------------------------
  const citationSentences = CITATION_CUES.test(page.text);
  c.push(
    check({
      id: 'geo.citations',
      category: 'geo',
      title: 'Sourced claims & outbound citations',
      weight: 8,
      impact: 'high',
      status: page.links.authority.length >= 2 && citationSentences ? 'pass' : page.links.external.length && citationSentences ? 'warn' : 'fail',
      found: `${page.links.external.length} external links · ${page.links.authority.length} to high-authority domains · citation phrasing ${citationSentences ? 'present' : 'absent'}`,
      fix: 'Cite primary sources inline ("according to <source>, …") and link them. Corroboration is a direct citation-selection signal.',
      evidence: page.links.authority.slice(0, 4).map((l) => l.href),
    }),
  );

  // --- Quotes / expert voice ----------------------------------------------
  c.push(
    check({
      id: 'geo.quotations',
      category: 'geo',
      title: 'Quotable expert statements',
      weight: 5,
      impact: 'medium',
      status: page.quotes >= 1 ? 'pass' : 'warn',
      found: `${page.quotes} blockquote/q element(s)`,
      fix: 'Include at least one attributed quote from a named expert. Quotes are extracted as-is and carry your attribution with them.',
    }),
  );

  // --- Original data -------------------------------------------------------
  const original = ORIGINAL_CUES.test(page.text);
  c.push(
    check({
      id: 'geo.original-research',
      category: 'geo',
      title: 'Original data or research',
      weight: 6,
      impact: 'medium',
      status: original ? 'pass' : 'warn',
      found: original ? 'First-party research language detected' : 'No first-party data signals ("we analysed…", "our survey of…")',
      fix: 'Publish something only you can: a benchmark, a survey, a teardown. Unique data is the most-cited content type.',
    }),
  );

  // --- Comparison content --------------------------------------------------
  c.push(
    check({
      id: 'geo.comparisons',
      category: 'geo',
      title: 'Comparison & alternatives coverage',
      weight: 4,
      impact: 'medium',
      status: COMPARISON_CUES.test(page.text) || page.tables > 0 ? 'pass' : 'warn',
      found: COMPARISON_CUES.test(page.text) ? 'Comparison language present' : page.tables ? 'Table present, no comparison language' : 'No comparison framing',
      fix: '"X vs Y" and "alternatives to X" are the highest-volume generative queries in most categories. Answer them on-site.',
    }),
  );

  // --- Content available without JS ---------------------------------------
  c.push(
    check({
      id: 'geo.no-js-content',
      category: 'geo',
      title: 'Content present in raw HTML',
      weight: 9,
      impact: 'high',
      status: page.wordCount >= 300 ? 'pass' : page.wordCount >= 80 ? 'warn' : 'fail',
      found: `${page.wordCount} words server-rendered · text/HTML ratio ${page.textHtmlRatio}%`,
      fix: 'Most AI crawlers do not execute JavaScript. If the copy only appears after hydration, you are invisible to them — server-render it.',
    }),
  );

  // --- Chunkability --------------------------------------------------------
  const sections = page.headings.filter((h) => h.level === 2 || h.level === 3);
  const oversized = sections.filter((h) => h.sectionWords > 500).length;
  const wordsPerSection = sections.length ? Math.round(page.wordCount / sections.length) : page.wordCount;
  c.push(
    check({
      id: 'geo.chunkability',
      category: 'geo',
      title: 'Retrieval chunk sizing',
      weight: 6,
      impact: 'medium',
      status: !sections.length ? 'fail' : wordsPerSection <= 350 && oversized === 0 ? 'pass' : 'warn',
      found: `${sections.length} sections · ~${wordsPerSection} words each · ${oversized} over 500 words`,
      fix: 'Retrieval splits pages into ~200–400 word chunks. Sized sections mean each chunk carries a complete, quotable idea.',
    }),
  );

  // --- Machine-readable feeds ---------------------------------------------
  c.push(
    check({
      id: 'geo.feeds',
      category: 'geo',
      title: 'Machine-readable alternates',
      weight: 3,
      impact: 'low',
      status: page.rss ? 'pass' : 'warn',
      found: page.rss ? `Feed: ${page.rss}` : 'No RSS/Atom feed advertised',
      fix: 'A feed (or a markdown mirror at .md) gives crawlers a clean, chrome-free copy of your content.',
    }),
  );

  return c;
}
