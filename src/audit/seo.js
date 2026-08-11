import { check } from './check.js';

export function auditSeo(page, ctx) {
  const c = [];
  const { robots, sitemap } = ctx;

  // --- Title ---------------------------------------------------------------
  const titleLen = page.title ? page.title.length : 0;
  c.push(
    check({
      id: 'seo.title',
      category: 'seo',
      title: 'Title tag length',
      weight: 10,
      impact: 'high',
      status: !page.title ? 'fail' : titleLen >= 30 && titleLen <= 60 ? 'pass' : 'warn',
      found: page.title ? `${titleLen} chars — "${page.title}"` : 'No <title> found',
      fix:
        'Aim for 30–60 characters: primary keyword first, brand last. Google truncates around 580px (~60 chars).',
    }),
  );
  if (page.titleCount > 1) {
    c.push(
      check({
        id: 'seo.title.duplicate',
        category: 'seo',
        title: 'Single title tag',
        weight: 4,
        impact: 'medium',
        status: 'fail',
        found: `${page.titleCount} <title> tags in the document`,
        fix: 'Remove the duplicates — crawlers use the first and treat the rest as noise.',
      }),
    );
  }

  // --- Meta description ----------------------------------------------------
  const descLen = page.description ? page.description.length : 0;
  c.push(
    check({
      id: 'seo.description',
      category: 'seo',
      title: 'Meta description',
      weight: 8,
      impact: 'high',
      status: !page.description ? 'fail' : descLen >= 70 && descLen <= 160 ? 'pass' : 'warn',
      found: page.description ? `${descLen} chars — "${page.description.slice(0, 120)}…"` : 'Missing',
      fix: 'Write 70–160 characters that state the outcome and include a verb. It drives click-through, not ranking.',
    }),
  );

  // --- Headings ------------------------------------------------------------
  c.push(
    check({
      id: 'seo.h1',
      category: 'seo',
      title: 'Exactly one H1',
      weight: 8,
      impact: 'high',
      status: page.h1s.length === 1 ? 'pass' : 'fail',
      found: page.h1s.length ? `${page.h1s.length} H1s: ${page.h1s.slice(0, 3).join(' | ')}` : 'No H1 on the page',
      fix: 'One H1 that restates the page promise in human language. Sub-topics become H2s.',
    }),
  );

  let skips = 0;
  let prev = 0;
  for (const h of page.headings) {
    if (prev && h.level > prev + 1) skips += 1;
    prev = h.level;
  }
  c.push(
    check({
      id: 'seo.heading-order',
      category: 'seo',
      title: 'Heading hierarchy',
      weight: 4,
      impact: 'medium',
      status: page.headings.length < 2 ? 'warn' : skips === 0 ? 'pass' : 'warn',
      found: `${page.headings.length} headings, ${skips} level skip(s)`,
      fix: 'Never jump H2 → H4. A clean outline is how both crawlers and LLMs chunk the page.',
    }),
  );

  // --- Canonical -----------------------------------------------------------
  let canonicalStatus = 'fail';
  let canonicalFound = 'Missing';
  if (page.canonical) {
    try {
      const abs = new URL(page.canonical, page.url);
      const self = abs.href.replace(/\/$/, '') === page.url.replace(/\/$/, '');
      canonicalStatus = self ? 'pass' : 'warn';
      canonicalFound = `${abs.href}${self ? ' (self-referencing)' : ' (points elsewhere)'}`;
    } catch {
      canonicalStatus = 'fail';
      canonicalFound = `Invalid canonical: ${page.canonical}`;
    }
  }
  c.push(
    check({
      id: 'seo.canonical',
      category: 'seo',
      title: 'Canonical URL',
      weight: 7,
      impact: 'high',
      status: page.canonicalCount > 1 ? 'fail' : canonicalStatus,
      found: page.canonicalCount > 1 ? `${page.canonicalCount} canonical tags — conflicting` : canonicalFound,
      fix: 'Every indexable page needs exactly one absolute, self-referencing canonical.',
      snippet: `<link rel="canonical" href="${page.url}">`,
    }),
  );

  // --- Indexability --------------------------------------------------------
  const robotsMeta = (page.robotsMeta || '').toLowerCase();
  const noindex = robotsMeta.includes('noindex');
  c.push(
    check({
      id: 'seo.indexable',
      category: 'seo',
      title: 'Page is indexable',
      weight: 10,
      impact: 'high',
      status: noindex ? 'fail' : 'pass',
      found: page.robotsMeta ? `robots meta: ${page.robotsMeta}` : 'No robots meta (indexable by default)',
      fix: noindex
        ? 'This page tells search engines to drop it. Remove noindex if it should rank.'
        : 'Nothing to do — the page is crawlable and indexable.',
    }),
  );

  const googlebot = ctx.robotsVerdicts?.Googlebot;
  c.push(
    check({
      id: 'seo.robots-txt',
      category: 'seo',
      title: 'robots.txt allows this path',
      weight: 8,
      impact: 'high',
      status: !robots ? 'warn' : googlebot?.allowed ? 'pass' : 'fail',
      found: !robots
        ? 'No robots.txt found at /robots.txt'
        : `Googlebot: ${googlebot?.allowed ? 'allowed' : 'blocked'} (${googlebot?.reason})`,
      fix: 'Publish a robots.txt that allows your content and links to the sitemap.',
    }),
  );

  c.push(
    check({
      id: 'seo.sitemap',
      category: 'seo',
      title: 'XML sitemap',
      weight: 6,
      impact: 'medium',
      status: sitemap?.found ? 'pass' : 'fail',
      found: sitemap?.found
        ? `${sitemap.url} (${sitemap.urlCount ?? '?'} URLs${sitemap.isIndex ? ', sitemap index' : ''})`
        : 'No sitemap found via robots.txt or /sitemap.xml',
      fix: 'Ship /sitemap.xml with lastmod dates and reference it from robots.txt.',
    }),
  );

  // --- Social cards --------------------------------------------------------
  const ogMissing = ['title', 'description', 'image', 'url', 'type'].filter((k) => !page.og[k]);
  c.push(
    check({
      id: 'seo.opengraph',
      category: 'seo',
      title: 'Open Graph tags',
      weight: 5,
      impact: 'medium',
      status: ogMissing.length === 0 ? 'pass' : ogMissing.length >= 4 ? 'fail' : 'warn',
      found: ogMissing.length ? `Missing og:${ogMissing.join(', og:')}` : 'All core tags present',
      fix: 'Open Graph controls how the page renders when shared — and several AI answer UIs reuse og:image.',
    }),
  );
  c.push(
    check({
      id: 'seo.twitter',
      category: 'seo',
      title: 'Twitter/X card',
      weight: 3,
      impact: 'low',
      status: page.twitter.card ? 'pass' : 'warn',
      found: page.twitter.card ? `card: ${page.twitter.card}` : 'No twitter:card',
      fix: 'Add twitter:card="summary_large_image" plus title, description and image.',
    }),
  );

  // --- Technical -----------------------------------------------------------
  c.push(
    check({
      id: 'seo.https',
      category: 'seo',
      title: 'HTTPS',
      weight: 6,
      impact: 'high',
      status: page.protocol === 'https:' ? 'pass' : 'fail',
      found: `Served over ${page.protocol.replace(':', '')}`,
      fix: 'Serve everything over HTTPS and 301 the http:// variant.',
    }),
  );
  c.push(
    check({
      id: 'seo.redirects',
      category: 'seo',
      title: 'Redirect chain',
      weight: 4,
      impact: 'medium',
      status: ctx.redirects.length === 0 ? 'pass' : ctx.redirects.length <= 1 ? 'warn' : 'fail',
      found: ctx.redirects.length
        ? ctx.redirects.map((r) => `${r.status} → ${r.to}`).join(' · ')
        : 'Direct 200 response',
      fix: 'Link to final URLs. Each hop leaks crawl budget and slows first byte.',
    }),
  );
  c.push(
    check({
      id: 'seo.viewport',
      category: 'seo',
      title: 'Mobile viewport',
      weight: 6,
      impact: 'high',
      status: page.viewport ? 'pass' : 'fail',
      found: page.viewport || 'No viewport meta tag',
      fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">. Indexing is mobile-first.',
    }),
  );
  c.push(
    check({
      id: 'seo.lang',
      category: 'seo',
      title: 'HTML lang attribute',
      weight: 4,
      impact: 'medium',
      status: page.lang ? 'pass' : 'fail',
      found: page.lang ? `lang="${page.lang}"` : 'Missing on <html>',
      fix: 'Set <html lang="en"> (or your locale) — it drives language targeting and screen readers.',
    }),
  );

  // --- Images --------------------------------------------------------------
  const altCoverage = page.images.total
    ? Math.round(((page.images.withAlt + page.images.emptyAlt) / page.images.total) * 100)
    : 100;
  c.push(
    check({
      id: 'seo.image-alt',
      category: 'seo',
      title: 'Image alt coverage',
      weight: 5,
      impact: 'medium',
      status: altCoverage >= 95 ? 'pass' : altCoverage >= 70 ? 'warn' : 'fail',
      found: page.images.total
        ? `${altCoverage}% of ${page.images.total} images have an alt attribute (${page.images.missing.length} missing)`
        : 'No images on the page',
      fix: 'Describe the image in context. Decorative images take alt="" so they are skipped deliberately.',
      evidence: page.images.missing.slice(0, 5),
    }),
  );

  // --- Content -------------------------------------------------------------
  c.push(
    check({
      id: 'seo.word-count',
      category: 'seo',
      title: 'Content depth',
      weight: 6,
      impact: 'medium',
      status: page.wordCount >= 600 ? 'pass' : page.wordCount >= 250 ? 'warn' : 'fail',
      found: `${page.wordCount} words in the main content area`,
      fix: 'Thin pages rarely win competitive queries or get cited. Cover the sub-questions the topic implies.',
    }),
  );
  c.push(
    check({
      id: 'seo.internal-links',
      category: 'seo',
      title: 'Internal linking',
      weight: 5,
      impact: 'medium',
      status: page.links.internal.length >= 8 ? 'pass' : page.links.internal.length >= 3 ? 'warn' : 'fail',
      found: `${page.links.internal.length} internal · ${page.links.external.length} external · ${page.links.empty} with no anchor text`,
      fix: 'Link to related pages with descriptive anchor text — it spreads authority and maps your topic cluster.',
    }),
  );
  c.push(
    check({
      id: 'seo.structured-data',
      category: 'seo',
      title: 'Structured data present',
      weight: 8,
      impact: 'high',
      status: page.jsonLdErrors.length
        ? 'fail'
        : page.jsonLd.length
          ? 'pass'
          : page.microdataTypes.length
            ? 'warn'
            : 'fail',
      found: page.jsonLdErrors.length
        ? `Invalid JSON-LD: ${page.jsonLdErrors[0]}`
        : page.jsonLd.length
          ? `${page.jsonLd.length} JSON-LD node(s): ${page.jsonLdTypes.join(', ') || 'untyped'}`
          : page.microdataTypes.length
            ? `Only microdata found: ${[...new Set(page.microdataTypes)].join(', ')}`
            : 'No structured data at all',
      fix: 'JSON-LD is the format every engine parses reliably. Generate a starter pack in the Generate tab.',
    }),
  );

  // --- Performance proxies -------------------------------------------------
  c.push(
    check({
      id: 'seo.render-blocking',
      category: 'seo',
      title: 'Render-blocking scripts',
      weight: 4,
      impact: 'medium',
      status: page.scripts.blocking === 0 ? 'pass' : page.scripts.blocking <= 2 ? 'warn' : 'fail',
      found: `${page.scripts.blocking} blocking of ${page.scripts.total} scripts · ${page.stylesheets} stylesheets · ${Math.round(page.htmlBytes / 1024)} KB HTML`,
      fix: 'Add defer/async to head scripts. LCP is a ranking signal and slow pages lose crawl frequency.',
    }),
  );

  const urlLen = page.url.length;
  c.push(
    check({
      id: 'seo.url',
      category: 'seo',
      title: 'URL structure',
      weight: 3,
      impact: 'low',
      status: urlLen <= 100 && !/[_ ]|%20/.test(page.path) ? 'pass' : 'warn',
      found: `${urlLen} chars${/_/.test(page.path) ? ', contains underscores' : ''}${page.path.includes('?') ? ', has query parameters' : ''}`,
      fix: 'Short, lowercase, hyphen-separated paths. Keep parameters out of indexable URLs.',
    }),
  );

  if (page.hreflang.length) {
    c.push(
      check({
        id: 'seo.hreflang',
        category: 'seo',
        title: 'hreflang set',
        weight: 3,
        impact: 'low',
        status: page.hreflang.some((h) => h.lang === 'x-default') ? 'pass' : 'warn',
        found: `${page.hreflang.length} alternates${page.hreflang.some((h) => h.lang === 'x-default') ? ', x-default present' : ', no x-default'}`,
        fix: 'Include a self-reference and an x-default in every hreflang cluster, and make it reciprocal.',
      }),
    );
  }

  return c;
}
