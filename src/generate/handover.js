import { AI_AGENTS } from '../extract.js';

/**
 * The half of the job a generator cannot do.
 *
 * Every failing or weak check falls into exactly one of two buckets: one we close with a file
 * you paste, and one that needs a person — a writer, an engineer, a decision. This module draws
 * that line explicitly, because a client who only sees the download buttons walks away thinking
 * the work is finished.
 */

/* ------------------------------------------------------- what the files close */

/**
 * check id → the artifact that actually closes it, where it goes, and what must still be true
 * before the markup is honest rather than merely valid.
 *
 * `needs` keys are resolved in `unmetPrerequisites()` — a generated file with an unmet
 * prerequisite is shipped, but it ships with a blocker attached.
 */
const COVERAGE = {
  'seo.title': { artifact: 'head-meta', paste: 'Replace <title> in the page template.' },
  'seo.title.duplicate': { artifact: 'head-meta', paste: 'Replace <title> in the page template.' },
  'seo.description': { artifact: 'head-meta', paste: 'Replace the meta description.' },
  'seo.canonical': { artifact: 'head-meta', paste: 'Add the <link rel="canonical"> line to <head>.' },
  'seo.indexable': {
    artifact: 'head-meta',
    paste: 'Replace the robots meta tag.',
    caveat: 'Only if the noindex was an accident. Staging, thank-you and duplicate pages are meant to carry it.',
  },
  'seo.viewport': { artifact: 'head-meta', paste: 'Add the viewport meta tag to the template.' },
  'seo.opengraph': { artifact: 'head-meta', paste: 'Add the Open Graph block to <head>.', needs: ['logoUrl'] },
  'seo.twitter': { artifact: 'head-meta', paste: 'Add the twitter:* block to <head>.', needs: ['logoUrl'] },
  'seo.structured-data': { artifact: 'schema-graph', paste: 'Paste the JSON-LD script into <head>.' },
  'seo.robots-txt': { artifact: 'robots-open', paste: 'Serve at /robots.txt.' },

  'aeo.faq-schema': {
    artifact: 'schema-faq',
    paste: 'Paste into <head> — together with the visible FAQ section, never alone.',
    needs: ['answers'],
  },
  'aeo.answer-first': { artifact: 'answer-first', paste: 'Insert directly under the H1, before anything else.', needs: ['answers'] },
  'aeo.summary-block': { artifact: 'takeaways', paste: 'Insert above the first H2.', needs: ['answers'] },
  'aeo.anchors': { artifact: 'toc', paste: 'Insert after the intro, and give every H2/H3 the matching id.' },
  'aeo.speakable': { artifact: 'schema-graph', paste: 'Already in the @graph — keep the .key-takeaways selector on the page.' },
  'aeo.howto': { artifact: 'schema-howto', paste: 'Paste into <head> of the procedural page.' },

  'geo.llms-txt': { artifact: 'llms-txt', paste: 'Serve at /llms.txt as text/plain.' },
  'geo.ai-crawlers': {
    artifact: 'robots-open',
    paste: 'Serve at /robots.txt — but settle the posture first (see Decisions).',
    needs: ['posture'],
  },
  'geo.entity': { artifact: 'schema-graph', paste: 'Already in the @graph as the Organization node.', needs: ['sameAs'] },
  'geo.authorship': { artifact: 'schema-graph', paste: 'Already in the @graph as the author node.', needs: ['authorName', 'byline'] },
  'geo.freshness': { artifact: 'head-meta', paste: 'Add the published/modified pair.', needs: ['dates'] },
};

/* ------------------------------------------------------------ what stays human */

/**
 * check id → who owns it, roughly how long it takes, and — the part clients actually need to
 * hear — why no generator can hand it to them as a file.
 */
const HUMAN = {
  'seo.h1': {
    owner: 'Engineering',
    effort: '30 min',
    why: 'The H1 comes out of your template, and choosing the right one is a judgement about what this page is for.',
  },
  'seo.heading-order': {
    owner: 'Editorial',
    effort: '1 hour',
    why: 'Re-levelling headings changes the meaning of the outline. Doing it mechanically produces a document nobody wrote.',
    assist: 'toc',
  },
  'seo.sitemap': {
    owner: 'Engineering',
    effort: 'half a day',
    why: 'A sitemap must reflect every indexable URL on the site. We audited one page — only your CMS knows the rest.',
  },
  'seo.https': {
    owner: 'Engineering',
    effort: '1 hour',
    why: 'Certificates and redirects live at the host, not in the page.',
  },
  'seo.redirects': {
    owner: 'Engineering',
    effort: '1 hour',
    why: 'Redirect chains are server configuration. Every hop costs crawl budget and leaks link equity.',
  },
  'seo.lang': {
    owner: 'Engineering',
    effort: '15 min',
    why: 'The lang attribute sits on <html>, above anything we can paste into <head>.',
  },
  'seo.image-alt': {
    owner: 'Editorial',
    effort: '1 hour',
    why: 'Alt text describes what the image shows. Generating it without seeing the image would be a guess with a confident tone.',
  },
  'seo.word-count': {
    owner: 'Editorial',
    effort: 'days',
    why: 'Thin pages need substance, not padding. This is writing work, and it is the work that actually moves the score.',
  },
  'seo.internal-links': {
    owner: 'Editorial',
    effort: 'half a day',
    why: 'Internal links depend on what else you have published. We can see this page; you can see the library.',
  },
  'seo.render-blocking': {
    owner: 'Engineering',
    effort: 'half a day',
    why: 'Script loading is a build concern. Nothing pasted into <head> fixes a bundle.',
  },
  'seo.url': {
    owner: 'Engineering',
    effort: 'half a day',
    why: 'Changing a URL means redirects, updated internal links and a temporary ranking dip. It is a migration, not an edit.',
  },
  'seo.hreflang': {
    owner: 'Engineering',
    effort: 'half a day',
    why: 'Hreflang has to be reciprocal across every language variant. A single page cannot declare it correctly on its own.',
  },

  'aeo.question-headings': {
    owner: 'Editorial',
    effort: '1 hour',
    why: 'Turning a heading into the question your reader actually types is a rewrite. We can suggest the questions; the section under each one still has to answer it.',
    assist: 'faq-html',
  },
  'aeo.answer-blocks': {
    owner: 'Editorial',
    effort: 'half a day',
    why: 'A question heading with no answer beneath it is worse than no question at all. Only you know the answer.',
    assist: 'answer-first',
  },
  'aeo.snippet-formats': {
    owner: 'Editorial',
    effort: '1 hour',
    why: 'Lists and tables have to come from real content. Reformatting prose you have not written is not possible.',
  },
  'aeo.readability': {
    owner: 'Editorial',
    effort: 'half a day',
    why: 'Shorter sentences and plainer words are an editing pass. Automated simplification loses the precision that made the page worth citing.',
  },
  'aeo.paragraph-size': {
    owner: 'Editorial',
    effort: '1 hour',
    why: 'Splitting walls of text means deciding where one idea ends. That is a reading decision, not a regex.',
  },
  'aeo.semantic-html': {
    owner: 'Engineering',
    effort: '1 hour',
    why: '<main>, <article> and <nav> are template landmarks. They wrap the page, so they cannot be pasted into it.',
  },
  'aeo.context-free': {
    owner: 'Editorial',
    effort: '1 hour',
    why: 'Sentences that open with "it" or "this" break the moment an engine lifts them out of the page. Fixing them means naming the subject again — in your words.',
  },

  'geo.statistics': {
    owner: 'Research',
    effort: 'days',
    why: 'Models quote numbers. We will not invent them, and a fabricated statistic is the single fastest way to lose a citation permanently.',
  },
  'geo.citations': {
    owner: 'Research',
    effort: 'half a day',
    why: 'Every claim needs a source you have actually read. Attaching plausible-looking references would be worse than having none.',
  },
  'geo.quotations': {
    owner: 'Editorial',
    effort: '1 hour',
    why: 'A quotable line is a position someone is willing to defend. That has to come from the business, not from a template.',
  },
  'geo.original-research': {
    owner: 'Leadership',
    effort: 'weeks',
    why: 'Original data is the only durable reason for a model to name you rather than paraphrase you. It is the biggest item on this list and the only one no competitor can copy.',
  },
  'geo.comparisons': {
    owner: 'Leadership',
    effort: 'days',
    why: 'Assistants are asked "X vs Y" constantly. Publishing an honest comparison is a commercial decision about naming competitors.',
  },
  'geo.no-js-content': {
    owner: 'Engineering',
    effort: 'weeks',
    why: 'Most AI crawlers never execute JavaScript. If the copy only appears after hydration, the page is empty to them — and that is a rendering-architecture change.',
  },
  'geo.chunkability': {
    owner: 'Editorial',
    effort: 'half a day',
    why: 'Retrieval splits your page into chunks. Sections have to stand alone at roughly that size, which is a structural rewrite.',
    assist: 'toc',
  },
  'geo.feeds': {
    owner: 'Engineering',
    effort: '1 hour',
    why: 'A feed is generated by the CMS from the whole archive, not from one page.',
  },
};

const OWNER_FALLBACK = {
  seo: { owner: 'Engineering', effort: '1 hour', why: 'Needs a change in the template or the server, not a pasted block.' },
  aeo: { owner: 'Editorial', effort: '1 hour', why: 'Needs someone who knows the subject to write it.' },
  geo: { owner: 'Editorial', effort: 'half a day', why: 'Needs judgement about what is true and what you are willing to publish.' },
};

const EFFORT_RANK = { '15 min': 1, '30 min': 2, '1 hour': 3, 'half a day': 4, days: 5, weeks: 6 };
const IMPACT_RANK = { high: 3, medium: 2, low: 1 };
const STATUS_RANK = { fail: 2, warn: 1 };

/* ------------------------------------------------------------------ helpers */

const has = (v) => (Array.isArray(v) ? v.length > 0 : Boolean(v && String(v).trim()));

/** Which prerequisites for a covered check are not satisfied yet. */
function unmetPrerequisites(needs = [], { page, profile, todoCount }) {
  const out = [];
  for (const need of needs) {
    if (need === 'logoUrl' && !has(profile.logoUrl) && !has(page.og.image)) {
      out.push('No share image. Add a 1200×630 logo or OG image in Profile, or social and assistant cards fall back to a placeholder URL.');
    }
    if (need === 'sameAs' && !has(profile.sameAs)) {
      out.push('No sameAs profiles. Without Wikipedia, LinkedIn, Crunchbase or GitHub URLs, the Organization node names an entity no model can resolve.');
    }
    if (need === 'authorName' && !has(profile.authorName)) {
      out.push('No author. Add a real name, job title and bio URL in Profile — an anonymous page is a weak citation candidate.');
    }
    if (need === 'byline' && !has(page.bylineText)) {
      out.push('The author has to be visible on the page too, not only in the JSON-LD. Add a byline next to the H1.');
    }
    if (need === 'dates' && !has(profile.publishedAt) && !has(page.dates.published)) {
      out.push('No publish date. Stamp the real dates in Profile — never a date the content did not change on.');
    }
    if (need === 'answers' && todoCount > 0) {
      out.push(`${todoCount} TODO placeholder${todoCount === 1 ? '' : 's'} in this file. Every one is a sentence only you can write.`);
    }
    if (need === 'posture') {
      out.push('Pick a crawler posture before publishing this file — see Decisions.');
    }
  }
  return out;
}

/** Count the TODO placeholders we deliberately left in a generated file. */
function todosIn(code) {
  return (String(code || '').match(/TODO/g) || []).length;
}

/* ------------------------------------------------------------------- inputs */

function missingInputs(page, profile) {
  const items = [
    {
      id: 'brandName',
      label: 'Brand name',
      missing: !has(profile.brandName),
      unlocks: 'Organization schema, title suffixes, llms.txt attribution line.',
    },
    {
      id: 'logoUrl',
      label: 'Logo / share image (1200×630)',
      missing: !has(profile.logoUrl),
      unlocks: 'og:image, twitter:image, the Organization logo node.',
    },
    {
      id: 'authorName',
      label: 'Author name, title and bio URL',
      missing: !has(profile.authorName) || !has(profile.authorUrl),
      unlocks: 'Author schema and the expertise signal models weigh most heavily.',
    },
    {
      id: 'sameAs',
      label: 'Entity profiles (Wikipedia, LinkedIn, Crunchbase, GitHub, X)',
      missing: !has(profile.sameAs),
      unlocks: 'sameAs — how a model confirms you are the entity it already knows about.',
    },
    {
      id: 'dates',
      label: 'Real published and modified dates',
      missing: (!has(profile.publishedAt) && !has(page.dates.published)) || (!has(profile.modifiedAt) && !has(page.dates.modified)),
      unlocks: 'Freshness stamps in <head> and in the Article node.',
    },
    {
      id: 'searchUrlTemplate',
      label: 'Site search URL template',
      missing: !has(profile.searchUrlTemplate),
      unlocks: 'SearchAction on the WebSite node, so assistants can search your site directly.',
    },
  ];
  return items.filter((i) => i.missing).map(({ missing, ...rest }) => rest);
}

/* ---------------------------------------------------------------- decisions */

function decisions(report) {
  const verdicts = report?.context?.aiVerdicts || {};
  const agents = report?.context?.agents || AI_AGENTS;
  const allowed = agents.filter((a) => verdicts[a.id]?.allowed).length;
  const total = agents.length || AI_AGENTS.length;

  return [
    {
      id: 'crawler-posture',
      title: 'Which AI crawlers do you let in?',
      state: `${allowed} of ${total} known AI crawlers can currently read this page.`,
      question:
        'This stopped being an IT setting. Retrieval bots fetch on demand and can cite you; training crawlers ingest you into weights and never send anyone back.',
      options: [
        ['Maximum reach', 'Allow everything. Correct while your goal is to be quoted at all. Ship robots.txt.'],
        ['Cite yes, train no', 'Allow retrieval bots, block training crawlers. Ship robots-balanced.txt.'],
        ['Gate and charge', 'Meter access at the edge and return HTTP 402 to unpaid agents. Your content becomes a priced resource rather than a free one — the right posture only once the content is genuinely scarce.'],
      ],
      note: 'Whatever you choose, choose it deliberately. The default — an unconfigured robots.txt — is "everything, free, forever".',
    },
    {
      id: 'answer-in-full',
      title: 'Do you publish the whole answer, or hold some back?',
      state: `${report?.page?.wordCount ? `${report.page.wordCount} words on the page today.` : 'Unknown page depth.'}`,
      question:
        'A page that answers completely gets extracted and cited, and often never visited. A page that withholds gets skipped entirely.',
      options: [
        ['Answer in full', 'Win the citation and the brand mention. Assume the visit is a bonus, not the product.'],
        ['Answer, then gate the depth', 'Publish the answer; put the calculator, dataset or template behind a form.'],
        ['Withhold', 'Only defensible when the content is the product itself. Expect to disappear from assistant answers.'],
      ],
      note: 'Measure mentions and assistant referrals, not just sessions. The old click metric will keep falling whatever you do here.',
    },
    {
      id: 'named-expert',
      title: 'Who signs this page?',
      state: report?.page?.bylineText ? `Currently bylined: ${report.page.bylineText}` : 'No visible byline on the page.',
      question:
        'Models weight named, verifiable expertise far above anonymous brand copy — but a byline puts a person, not a company, on the record.',
      options: [
        ['A named expert', 'Strongest citation signal. Needs a real bio page and profiles that corroborate them.'],
        ['The organisation', 'Safer and lower maintenance. Works only if the Organization entity itself is well established.'],
      ],
      note: 'Half-measures fail: an author name with no bio page and no sameAs links resolves to nobody.',
    },
  ];
}

/* -------------------------------------------------------------------- build */

/**
 * Split every open finding into "a file closes this" and "a person closes this".
 * Pure: page + report + the artifacts we just generated, in — the handover, out.
 */
export function buildHandover(page, report, artifacts = [], profile = {}) {
  if (!report) return null;

  const byId = new Map(artifacts.map((a) => [a.id, a]));
  const todos = new Map(artifacts.map((a) => [a.id, todosIn(a.code)]));

  const open = report.checks.filter((c) => c.status === 'fail' || c.status === 'warn');

  const shipped = [];
  const yours = [];

  for (const c of open) {
    const cover = COVERAGE[c.id];
    const artifact = cover && byId.get(cover.artifact);

    if (cover && artifact) {
      const blockers = unmetPrerequisites(cover.needs, {
        page,
        profile,
        todoCount: todos.get(cover.artifact) || 0,
      });
      shipped.push({
        id: c.id,
        title: c.title,
        category: c.category,
        status: c.status,
        impact: c.impact,
        found: c.found,
        artifactId: artifact.id,
        artifactLabel: artifact.label,
        filename: artifact.filename,
        paste: cover.paste,
        caveat: cover.caveat || null,
        blockers,
      });
      continue;
    }

    const human = HUMAN[c.id] || OWNER_FALLBACK[c.category];
    const assist = human.assist && byId.get(human.assist);
    yours.push({
      id: c.id,
      title: c.title,
      category: c.category,
      status: c.status,
      impact: c.impact,
      found: c.found,
      fix: c.fix,
      owner: human.owner,
      effort: human.effort,
      why: human.why,
      assist: assist ? { id: assist.id, label: assist.label, filename: assist.filename } : null,
    });
  }

  const rank = (x) =>
    STATUS_RANK[x.status] * 100 + IMPACT_RANK[x.impact] * 10 + (EFFORT_RANK[x.effort] ? 7 - EFFORT_RANK[x.effort] : 0);
  yours.sort((a, b) => rank(b) - rank(a));
  shipped.sort((a, b) => rank(b) - rank(a));

  const placeholders = artifacts
    .filter((a) => (todos.get(a.id) || 0) > 0)
    .map((a) => ({ artifactId: a.id, label: a.label, filename: a.filename, count: todos.get(a.id) }));

  const inputs = missingInputs(page, profile);

  const effortBuckets = yours.reduce((acc, y) => {
    acc[y.effort] = (acc[y.effort] || 0) + 1;
    return acc;
  }, {});

  return {
    shipped,
    yours,
    inputs,
    placeholders,
    decisions: decisions(report),
    counts: {
      openTotal: open.length,
      shipped: shipped.length,
      yours: yours.length,
      inputs: inputs.length,
      placeholders: placeholders.reduce((n, p) => n + p.count, 0),
      blocked: shipped.filter((s) => s.blockers.length).length,
      byOwner: yours.reduce((acc, y) => {
        acc[y.owner] = (acc[y.owner] || 0) + 1;
        return acc;
      }, {}),
      byEffort: effortBuckets,
    },
  };
}

/* ----------------------------------------------------------------- markdown */

/** The handover document: what we shipped, what is blocked, and what is still theirs. */
export function handoverMarkdown(handover, report) {
  if (!handover) return '';
  const { counts } = handover;
  const lines = [
    '# Agent-readiness handover',
    '',
    `**Page:** ${report.finalUrl}  `,
    `**Audited:** ${new Date(report.fetchedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC  `,
    `**Scores:** SEO ${report.scores.seo} · AEO ${report.scores.aeo} · GEO ${report.scores.geo} (overall ${report.scores.overall}, grade ${report.grades.overall})`,
    '',
    `${counts.openTotal} open finding${counts.openTotal === 1 ? '' : 's'}. ${counts.shipped} close with a file in this pack. ` +
      `${counts.yours} need a person. ${counts.placeholders} sentence${counts.placeholders === 1 ? '' : 's'} in the generated files are marked TODO on purpose.`,
    '',
    '## 1 — Closed by the generated files',
    '',
    'Paste these and the finding goes away. This is the fast half.',
    '',
  ];

  if (!handover.shipped.length) lines.push('_Nothing here — no open finding is fixable by markup alone._', '');
  for (const s of handover.shipped) {
    lines.push(`- [ ] **${s.title}** → \`${s.filename}\``);
    lines.push(`  - Now: ${s.found}`);
    lines.push(`  - Where: ${s.paste}`);
    if (s.caveat) lines.push(`  - Careful: ${s.caveat}`);
    for (const b of s.blockers) lines.push(`  - ⚠ Blocked: ${b}`);
  }

  lines.push('', '## 2 — We need this from you', '', 'Small inputs. Each one makes a file we already wrote actually true.', '');
  if (!handover.inputs.length && !handover.placeholders.length) {
    lines.push('_Nothing outstanding — the profile is complete and no placeholders are left._', '');
  }
  for (const i of handover.inputs) lines.push(`- [ ] **${i.label}** — unlocks: ${i.unlocks}`);
  for (const p of handover.placeholders) {
    lines.push(`- [ ] **${p.count} TODO placeholder${p.count === 1 ? '' : 's'} in \`${p.filename}\`** — write the real sentences before publishing.`);
  }
  lines.push(
    '',
    '> FAQ schema whose answers are not visible on the page is invalid, and inventing answers for you',
    '> would be worse than leaving the gap. That is why the placeholders exist.',
    '',
  );

  lines.push('## 3 — Still yours', '', 'No generator closes these. This is where the actual visibility is won.', '');
  if (!handover.yours.length) lines.push('_Nothing outstanding._', '');
  for (const y of handover.yours) {
    lines.push(`- [ ] **${y.title}** — ${y.owner}, ~${y.effort} (${y.category.toUpperCase()}, ${y.status === 'fail' ? 'failing' : 'weak'}, ${y.impact} impact)`);
    lines.push(`  - Now: ${y.found}`);
    lines.push(`  - Do: ${y.fix}`);
    lines.push(`  - Why we cannot do it for you: ${y.why}`);
    if (y.assist) lines.push(`  - Starting point: \`${y.assist.filename}\` in this pack.`);
  }

  const owners = Object.entries(counts.byOwner).sort((a, b) => b[1] - a[1]);
  if (owners.length) {
    lines.push('', '### Who owns what', '');
    for (const [owner, n] of owners) lines.push(`- **${owner}:** ${n} item${n === 1 ? '' : 's'}`);
  }

  lines.push('', '## 4 — Decisions only you can make', '');
  for (const d of handover.decisions) {
    lines.push(`### ${d.title}`, '', `_${d.state}_`, '', d.question, '');
    for (const [option, detail] of d.options) lines.push(`- **${option}** — ${detail}`);
    lines.push('', `> ${d.note}`, '');
  }

  return lines.join('\n');
}

export { COVERAGE, HUMAN };
