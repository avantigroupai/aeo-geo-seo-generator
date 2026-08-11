import * as cheerio from 'cheerio';

const AUTHORITY_HOSTS = [
  '.gov', '.edu', '.ac.uk', '.who.int', 'wikipedia.org', 'doi.org', 'nature.com',
  'science.org', 'arxiv.org', 'ncbi.nlm.nih.gov', 'europa.eu', 'oecd.org',
  'worldbank.org', 'statista.com', 'gartner.com', 'mckinsey.com', 'nist.gov',
];

const QUESTION_STARTERS = [
  'how', 'what', 'why', 'when', 'where', 'who', 'which', 'can', 'do', 'does',
  'is', 'are', 'should', 'will', 'was', 'were',
];

const AI_AGENTS = [
  { id: 'GPTBot', label: 'GPTBot (OpenAI training)', vendor: 'OpenAI' },
  { id: 'OAI-SearchBot', label: 'OAI-SearchBot (ChatGPT search)', vendor: 'OpenAI' },
  { id: 'ChatGPT-User', label: 'ChatGPT-User (live browsing)', vendor: 'OpenAI' },
  { id: 'ClaudeBot', label: 'ClaudeBot (Anthropic)', vendor: 'Anthropic' },
  { id: 'Claude-User', label: 'Claude-User (live browsing)', vendor: 'Anthropic' },
  { id: 'PerplexityBot', label: 'PerplexityBot', vendor: 'Perplexity' },
  { id: 'Google-Extended', label: 'Google-Extended (Gemini / AI Overviews)', vendor: 'Google' },
  { id: 'Applebot-Extended', label: 'Applebot-Extended', vendor: 'Apple' },
  { id: 'CCBot', label: 'CCBot (Common Crawl)', vendor: 'Common Crawl' },
  { id: 'meta-externalagent', label: 'meta-externalagent', vendor: 'Meta' },
  { id: 'Bytespider', label: 'Bytespider', vendor: 'ByteDance' },
];

export { AI_AGENTS };

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return w.length ? 1 : 0;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').match(/[aeiouy]{1,2}/g);
  return groups ? groups.length : 1;
}

export function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'“(])/)
    .map(clean)
    .filter((s) => s.length > 1);
}

export function readability(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const sentences = splitSentences(text);
  if (!words.length || !sentences.length) return { flesch: null, avgSentenceWords: 0, grade: null };
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const wps = words.length / sentences.length;
  const spw = syllables / words.length;
  const flesch = 206.835 - 1.015 * wps - 84.6 * spw;
  const grade = 0.39 * wps + 11.8 * spw - 15.59;
  return {
    // Flesch is unbounded in theory; report it on the conventional 0–100 scale.
    flesch: Math.round(Math.max(0, Math.min(100, flesch)) * 10) / 10,
    grade: Math.round(grade * 10) / 10,
    avgSentenceWords: Math.round(wps * 10) / 10,
  };
}

export function isQuestion(text) {
  const t = clean(text).toLowerCase();
  if (!t) return false;
  if (t.endsWith('?')) return true;
  const first = t.split(/\s+/)[0].replace(/[^a-z]/g, '');
  return QUESTION_STARTERS.includes(first) && t.split(/\s+/).length >= 3;
}

function collectJsonLd($) {
  const nodes = [];
  const errors = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      const parsed = JSON.parse(raw);
      const push = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) return obj.forEach(push);
        if (Array.isArray(obj['@graph'])) obj['@graph'].forEach(push);
        nodes.push(obj);
      };
      push(parsed);
    } catch (err) {
      errors.push(clean(err.message));
    }
  });
  return { nodes, errors };
}

function typesOf(nodes) {
  const out = new Set();
  for (const n of nodes) {
    const t = n['@type'];
    if (!t) continue;
    (Array.isArray(t) ? t : [t]).forEach((x) => out.add(String(x)));
  }
  return [...out];
}

/** Parse robots.txt into per-agent rule groups. */
export function parseRobots(body) {
  if (!body) return null;
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  const sitemaps = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'sitemap') {
      sitemaps.push(value);
      continue;
    }
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    if (!current) continue;
    lastWasAgent = false;
    if (field === 'allow') current.allow.push(value);
    else if (field === 'disallow') current.disallow.push(value);
    else if (field === 'crawl-delay') current.crawlDelay = value;
  }
  return { groups, sitemaps };
}

function matchesPattern(path, pattern) {
  if (pattern === '') return false;
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const parts = body.split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`^${parts.join('.*')}${anchored ? '$' : ''}`);
  return re.test(path);
}

/** Decide whether `agent` may crawl `path` given parsed robots.txt. */
export function robotsVerdict(robots, agent, path = '/') {
  if (!robots) return { allowed: true, reason: 'no robots.txt (everything allowed)' };
  const name = agent.toLowerCase();
  const specific = robots.groups.filter((g) => g.agents.includes(name));
  const wildcard = robots.groups.filter((g) => g.agents.includes('*'));
  const applicable = specific.length ? specific : wildcard;
  if (!applicable.length) return { allowed: true, reason: 'no matching group' };

  let best = { allowed: true, len: -1, rule: null };
  for (const group of applicable) {
    for (const rule of group.disallow) {
      if (matchesPattern(path, rule) && rule.length > best.len) {
        best = { allowed: false, len: rule.length, rule: `Disallow: ${rule}` };
      }
    }
    for (const rule of group.allow) {
      if (matchesPattern(path, rule) && rule.length >= best.len) {
        best = { allowed: true, len: rule.length, rule: `Allow: ${rule}` };
      }
    }
  }
  return {
    allowed: best.allowed,
    reason: best.rule || (specific.length ? 'matched group, no rule' : 'wildcard group, no rule'),
    explicit: specific.length > 0,
  };
}

/**
 * Turn raw HTML into the structured page model every auditor and generator reads.
 */
export function extractPage(html, finalUrl) {
  const $ = cheerio.load(html);
  const url = new URL(finalUrl);

  const meta = {};
  const property = {};
  $('meta').each((_, el) => {
    const $el = $(el);
    const name = ($el.attr('name') || '').toLowerCase();
    const prop = ($el.attr('property') || '').toLowerCase();
    const content = $el.attr('content');
    if (content == null) return;
    if (name) meta[name] = meta[name] ?? clean(content);
    if (prop) property[prop] = property[prop] ?? clean(content);
  });

  const og = {};
  const twitter = {};
  for (const [k, v] of Object.entries(property)) if (k.startsWith('og:')) og[k.slice(3)] = v;
  for (const [k, v] of Object.entries(property)) if (k.startsWith('twitter:')) twitter[k.slice(8)] = v;
  for (const [k, v] of Object.entries(meta)) if (k.startsWith('twitter:')) twitter[k.slice(8)] = v;
  for (const [k, v] of Object.entries(meta)) if (k.startsWith('og:')) og[k.slice(3)] ??= v;

  const HEADING_SEL = 'h1, h2, h3, h4, h5, h6';
  const headings = [];
  $(HEADING_SEL).each((_, el) => {
    const $el = $(el);
    const text = clean($el.text());
    if (!text) return;
    // Body copy that belongs to this heading: siblings until the next heading.
    // Falls back one level up for the common "heading wrapped in a div" layout.
    let $body = $el.nextUntil(HEADING_SEL);
    // Cap the fallback: a wrapper's siblings can otherwise swallow the whole page.
    if (!$body.length) $body = $el.parent().nextUntil(HEADING_SEL).slice(0, 3);
    const $clone = $body.clone();
    $clone.find('script, style, noscript, svg').remove();
    const sectionText = clean($clone.text());
    const firstBlock = $body
      .filter('p, ul, ol, dl, table')
      .first()
      .add($body.find('p, ul, ol, dl, table').first())
      .first();
    headings.push({
      level: Number(el.tagName.slice(1)),
      text,
      id: $el.attr('id') || null,
      sectionWords: sectionText ? sectionText.split(/\s+/).filter(Boolean).length : 0,
      answer: clean(firstBlock.text()).slice(0, 400) || null,
    });
  });

  const $body = $('body').clone();
  $body.find('script, style, noscript, template, svg, iframe').remove();
  const $mainNode = $body.find('main').first().length
    ? $body.find('main').first()
    : $body.find('article').first().length
      ? $body.find('article').first()
      : $body;
  const mainText = clean($mainNode.text());
  const bodyText = clean($body.text());

  const paragraphs = [];
  $mainNode.find('p').each((_, el) => {
    const t = clean($(el).text());
    if (t.split(/\s+/).length >= 6) paragraphs.push(t);
  });

  const images = { total: 0, withAlt: 0, emptyAlt: 0, missing: [], lazy: 0, dimensioned: 0 };
  $('img').each((_, el) => {
    const $el = $(el);
    images.total += 1;
    const alt = $el.attr('alt');
    if (alt == null) images.missing.push(clean($el.attr('src') || '(inline)').slice(0, 120));
    else if (alt.trim() === '') images.emptyAlt += 1;
    else images.withAlt += 1;
    if (($el.attr('loading') || '') === 'lazy') images.lazy += 1;
    if ($el.attr('width') && $el.attr('height')) images.dimensioned += 1;
  });

  const links = { internal: [], external: [], nofollow: 0, authority: [], empty: 0 };
  $('a[href]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) return;
    let abs;
    try {
      abs = new URL(href, url);
    } catch {
      return;
    }
    const rel = ($el.attr('rel') || '').toLowerCase();
    if (rel.includes('nofollow')) links.nofollow += 1;
    const text = clean($el.text());
    if (!text && !$el.find('img').length) links.empty += 1;
    const record = { href: abs.href, text: text.slice(0, 120), rel };
    if (abs.hostname === url.hostname) links.internal.push(record);
    else {
      links.external.push(record);
      if (AUTHORITY_HOSTS.some((h) => abs.hostname.endsWith(h) || abs.hostname.includes(h))) {
        links.authority.push(record);
      }
    }
  });

  const { nodes: jsonLdNodes, errors: jsonLdErrors } = collectJsonLd($);
  const microdataTypes = [];
  $('[itemtype]').each((_, el) => {
    const t = $(el).attr('itemtype');
    if (t) microdataTypes.push(t.split('/').pop());
  });

  const hreflang = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    hreflang.push({ lang: $(el).attr('hreflang'), href: $(el).attr('href') });
  });

  const scripts = { total: 0, blocking: 0, external: 0, inlineChars: 0 };
  $('script').each((_, el) => {
    const $el = $(el);
    scripts.total += 1;
    if ($el.attr('src')) {
      scripts.external += 1;
      const deferred = $el.attr('async') != null || $el.attr('defer') != null || ($el.attr('type') || '') === 'module';
      if (!deferred && $('head').find(el).length) scripts.blocking += 1;
    } else {
      scripts.inlineChars += $el.contents().text().length;
    }
  });

  const numbers = mainText.match(/\b\d[\d,.]*\b/g) || [];
  // A "statistic" is a number carrying a unit a reader can act on: a percentage,
  // a magnitude, or a currency amount. Bare integers do not count.
  const statMatches = [
    ...(mainText.match(/\b\d[\d,.]*\s?(?:%|percent(?:age point)?s?|million|billion|trillion|bn|×|x more|x faster)/gi) || []),
    ...(mainText.match(/[$€£¥]\s?\d[\d,.]*\s?(?:k|m|bn|million|billion)?/gi) || []),
    ...(mainText.match(/\b\d[\d,.]*\s?(?:out of|in)\s?\d[\d,.]*/gi) || []),
    ...(mainText.match(/\b\d{1,3}(?:,\d{3})+\b/g) || []), // measured quantities: "1,200 queries"
  ];
  // "$3.4 billion" and "3.4 billion" are the same claim counted twice.
  const stats = statMatches.filter((s, i) => !statMatches.some((o, j) => j !== i && o.length > s.length && o.includes(s)));
  const quotes = $('blockquote').length + $('q').length;
  const questionHeadings = headings.filter((h) => h.level >= 2 && isQuestion(h.text));

  const bylineText = clean(
    $('[rel="author"], .author, .byline, [itemprop="author"], [class*="author"]').first().text(),
  ).slice(0, 160);

  const wordCount = mainText ? mainText.split(/\s+/).filter(Boolean).length : 0;

  return {
    url: url.href,
    origin: url.origin,
    path: url.pathname + url.search,
    hostname: url.hostname,
    protocol: url.protocol,
    html,
    htmlBytes: Buffer.byteLength(html, 'utf8'),
    lang: $('html').attr('lang') || null,
    dir: $('html').attr('dir') || null,
    charset: $('meta[charset]').attr('charset') || (meta['content-type'] || '').split('charset=')[1] || null,
    title: clean($('title').first().text()) || null,
    titleCount: $('title').length,
    description: meta.description || null,
    descriptionCount: $('meta[name="description"]').length,
    keywords: meta.keywords || null,
    robotsMeta: meta.robots || null,
    viewport: meta.viewport || null,
    themeColor: meta['theme-color'] || null,
    author: meta.author || null,
    canonical: $('link[rel="canonical"]').attr('href') || null,
    canonicalCount: $('link[rel="canonical"]').length,
    favicon: $('link[rel~="icon"]').attr('href') || null,
    manifest: $('link[rel="manifest"]').attr('href') || null,
    rss: $('link[type="application/rss+xml"], link[type="application/atom+xml"]').attr('href') || null,
    og,
    twitter,
    meta,
    headings,
    h1s: headings.filter((h) => h.level === 1).map((h) => h.text),
    questionHeadings,
    hreflang,
    jsonLd: jsonLdNodes,
    jsonLdTypes: typesOf(jsonLdNodes),
    jsonLdErrors,
    microdataTypes,
    images,
    links,
    scripts,
    stylesheets: $('link[rel="stylesheet"]').length,
    lists: $('ul, ol').length,
    listItems: $('li').length,
    tables: $('table').length,
    quotes,
    dl: $('dl').length,
    semantics: {
      main: $('main').length > 0,
      article: $('article').length > 0,
      section: $('section').length > 0,
      nav: $('nav').length > 0,
      header: $('header').length > 0,
      footer: $('footer').length > 0,
      aside: $('aside').length > 0,
      time: $('time').length,
    },
    anchoredHeadings: headings.filter((h) => h.id).length,
    tocLinks: $('a[href^="#"]').length,
    text: mainText,
    bodyText,
    paragraphs,
    firstParagraph: paragraphs[0] || null,
    wordCount,
    textHtmlRatio: html.length ? Math.round((bodyText.length / html.length) * 1000) / 10 : 0,
    readability: readability(mainText),
    numbersCount: numbers.length,
    statsCount: stats.length,
    statsSamples: stats.slice(0, 8),
    dates: {
      published: property['article:published_time'] || meta['article:published_time'] || meta.date || null,
      modified: property['article:modified_time'] || meta['article:modified_time'] || null,
      timeTags: $('time[datetime]')
        .map((_, el) => $(el).attr('datetime'))
        .get()
        .slice(0, 5),
    },
    bylineText: bylineText || null,
    forms: $('form').length,
    iframes: $('iframe').length,
  };
}
