import { buildGraph, faqNode, faqPairs, howToNode } from './schema.js';
import { headBlock, metaDiff, optimisedDescription, optimisedTitle } from './meta.js';
import { actionPlan, contentBlocks, llmsTxt, robotsTxt } from './text.js';
import { buildHandover, handoverMarkdown } from './handover.js';
import { json, ldScript } from './helpers.js';

const HOWTO_HINT = /\b(how to|step \d|guide|tutorial|setup|install)\b/i;

/**
 * Everything the Generate tab shows. Pure: page model + profile in, artifacts out.
 */
export function buildArtifacts(page, report, profile = {}) {
  // The AEO audit scans the body too, so trust its verdict when we have one — otherwise the
  // handover would list a HowTo gap as human work while we were able to generate the markup.
  const procedural = report
    ? report.checks.some((c) => c.id === 'aeo.howto')
    : HOWTO_HINT.test(page.title || '') || HOWTO_HINT.test(page.h1s[0] || '');
  const blocks = contentBlocks(page, profile);
  const pairs = faqPairs(page);

  const artifacts = [
    {
      id: 'schema-graph',
      group: 'Structured data',
      label: 'Full JSON-LD @graph',
      filename: 'schema-graph.html',
      language: 'html',
      description:
        'Organization, WebSite, BreadcrumbList, WebPage (+ Article) and FAQPage in one connected graph. Paste once into <head>; every engine resolves the @id references.',
      code: ldScript(buildGraph(page, profile, { includeFaq: true, includeHowTo: false })),
    },
    {
      id: 'schema-faq',
      group: 'Structured data',
      label: 'FAQPage only',
      filename: 'schema-faq.html',
      language: 'html',
      description: `${pairs.filter((p) => p.source === 'page').length} question(s) lifted from the page, topped up with the queries this topic attracts. Every answer must also appear as visible text.`,
      code: ldScript({ '@context': 'https://schema.org', ...faqNode(page, pairs) }),
    },
  ];

  if (procedural) {
    artifacts.push({
      id: 'schema-howto',
      group: 'Structured data',
      label: 'HowTo steps',
      filename: 'schema-howto.html',
      language: 'html',
      description: 'Procedural content detected. HowTo lets assistants walk a user through your steps one at a time.',
      code: ldScript({ '@context': 'https://schema.org', ...howToNode(page) }),
    });
  }

  artifacts.push(
    {
      id: 'head-meta',
      group: 'Head & meta',
      label: 'Optimised <head> block',
      filename: 'head.html',
      language: 'html',
      description: 'Title and description rewritten to length, plus canonical, robots directives, Open Graph, X cards and freshness stamps.',
      code: headBlock(page, profile),
    },
    {
      id: 'llms-txt',
      group: 'AI access',
      label: 'llms.txt',
      filename: 'llms.txt',
      language: 'markdown',
      description: 'Serve at /llms.txt. A curated markdown map that tells language models which pages matter and how to attribute you.',
      code: llmsTxt(page, profile),
    },
    {
      id: 'robots-open',
      group: 'AI access',
      label: 'robots.txt — maximum reach',
      filename: 'robots.txt',
      language: 'text',
      description: 'Every known AI crawler explicitly allowed. Use when being quoted matters more than being trained on.',
      code: robotsTxt(page, { mode: 'open' }),
    },
    {
      id: 'robots-balanced',
      group: 'AI access',
      label: 'robots.txt — cite yes, train no',
      filename: 'robots-balanced.txt',
      language: 'text',
      description: 'Live-retrieval bots allowed so answers can cite you; training crawlers opted out.',
      code: robotsTxt(page, { mode: 'balanced' }),
    },
    {
      id: 'answer-first',
      group: 'Content blocks',
      label: 'Answer-first opening',
      filename: 'answer-first.html',
      language: 'html',
      description: 'The block snippet extractors read hardest. Answer in the first 25 words, then qualify.',
      code: blocks.answerFirst,
    },
    {
      id: 'takeaways',
      group: 'Content blocks',
      label: 'Key takeaways box',
      filename: 'key-takeaways.html',
      language: 'html',
      description: 'The block LLMs quote most often, wired to the speakable selector in the JSON-LD graph.',
      code: blocks.takeaways,
    },
    {
      id: 'faq-html',
      group: 'Content blocks',
      label: 'Visible FAQ section',
      filename: 'faq.html',
      language: 'html',
      description: 'Mirrors the FAQPage markup. Google invalidates FAQ schema whose answers are not visible on the page.',
      code: blocks.faqHtml,
    },
    {
      id: 'toc',
      group: 'Content blocks',
      label: 'Anchored table of contents',
      filename: 'toc.html',
      language: 'html',
      description: 'Jump links plus stable heading ids, so engines can deep-link straight to the answering section.',
      code: blocks.toc,
    },
    {
      id: 'faq-markdown',
      group: 'Content blocks',
      label: 'FAQ as markdown',
      filename: 'faq.md',
      language: 'markdown',
      description: 'Same Q&A for a CMS, docs site or knowledge base.',
      code: blocks.faqMarkdown,
    },
  );

  // Built from the artifacts above, so it can see the TODO placeholders they still carry.
  const handover = buildHandover(page, report, artifacts, profile);

  if (report) {
    artifacts.push(
      {
        id: 'handover',
        group: 'Handover',
        label: 'Handover document',
        filename: 'handover.md',
        language: 'markdown',
        description:
          'The honest split: which findings these files close, what we still need from you, and the work no generator can do. Send this with the pack.',
        code: handoverMarkdown(handover, report),
      },
      {
        id: 'action-plan',
        group: 'Handover',
        label: 'Action plan (markdown)',
        filename: 'action-plan.md',
        language: 'markdown',
        description: 'Prioritised checklist of every failing and weak check, ready to paste into a ticket.',
        code: actionPlan(report),
      },
      {
        id: 'report-json',
        group: 'Handover',
        label: 'Full report (JSON)',
        filename: 'report.json',
        language: 'json',
        description: 'Machine-readable audit: scores, every check, and the extracted page model.',
        code: json({ ...report, page: { ...report.page, text: undefined } }),
      },
    );
  }

  return {
    artifacts,
    handover,
    meta: {
      titleProposal: optimisedTitle(page, profile),
      descriptionProposal: optimisedDescription(page, profile),
      diff: metaDiff(page, profile),
      faqPairs: pairs,
    },
  };
}
