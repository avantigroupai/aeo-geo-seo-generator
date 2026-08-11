import { abs, brandFrom, clean, sentenceClamp, topicFrom, truncate } from './helpers.js';

const escape = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** First clause of the description — a usable qualifier for a too-short title. */
function descriptor(page) {
  const source = clean(page.description || page.og.description || page.firstParagraph || '');
  if (!source) return '';
  return clean(source.split(/[,.;:—–]/)[0]);
}

export function optimisedTitle(page, profile = {}) {
  const current = clean(page.title || '');
  if (current.length >= 30 && current.length <= 60) return current;
  const brand = brandFrom(page, profile);
  const topic = topicFrom(page);

  // Brand already in the title: never append it twice — qualify instead.
  if (current && topic.toLowerCase().includes(brand.toLowerCase())) {
    const qualifier = descriptor(page);
    if (current.length < 30 && qualifier) return truncate(`${topic} — ${qualifier}`, 60);
    return truncate(topic, 60);
  }

  if (current.length > 60) {
    const withoutBrand = current.replace(new RegExp(`\\s*[|–—·-]\\s*${brand}\\s*$`, 'i'), '');
    const room = 60 - brand.length - 3;
    return `${truncate(withoutBrand, Math.max(room, 24)).replace(/…$/, '')} | ${brand}`.slice(0, 60).trim();
  }
  const candidate = `${topic} | ${brand}`;
  return candidate.length <= 60 ? candidate : truncate(candidate, 60);
}

export function optimisedDescription(page, profile = {}) {
  const current = clean(page.description || '');
  if (current.length >= 70 && current.length <= 160) return current;
  const source = profile.description || page.firstParagraph || page.og.description || page.text;
  const draft = sentenceClamp(source, 158);
  if (draft.length >= 70) return draft;
  const topic = topicFrom(page);
  const brand = brandFrom(page, profile);
  return truncate(`${draft ? `${draft} ` : ''}${topic} explained by ${brand} — what it is, how it works and what it costs.`, 158);
}

/** A complete, paste-ready <head> block. */
export function headBlock(page, profile = {}) {
  const title = optimisedTitle(page, profile);
  const description = optimisedDescription(page, profile);
  const image = abs(profile.logoUrl || page.og.image, page.url) || `${page.origin}/og-image.png`;
  const brand = brandFrom(page, profile);
  const lang = page.lang || 'en';
  const twitterHandle = (profile.sameAs || []).find((s) => /(twitter|x)\.com/i.test(s));
  const handle = twitterHandle ? `@${twitterHandle.replace(/\/$/, '').split('/').pop()}` : null;

  const lines = [
    `<!-- Place inside <html lang="${lang}"> … <head> -->`,
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '',
    `<title>${escape(title)}</title>`,
    `<meta name="description" content="${escape(description)}">`,
    `<link rel="canonical" href="${escape(page.url)}">`,
    '<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">',
    '',
    '<!-- Open Graph -->',
    `<meta property="og:type" content="${page.og.type || 'website'}">`,
    `<meta property="og:site_name" content="${escape(brand)}">`,
    `<meta property="og:title" content="${escape(title)}">`,
    `<meta property="og:description" content="${escape(description)}">`,
    `<meta property="og:url" content="${escape(page.url)}">`,
    `<meta property="og:image" content="${escape(image)}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:locale" content="${lang.replace('-', '_')}">`,
    '',
    '<!-- X / Twitter -->',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escape(title)}">`,
    `<meta name="twitter:description" content="${escape(description)}">`,
    `<meta name="twitter:image" content="${escape(image)}">`,
  ];
  if (handle) lines.push(`<meta name="twitter:site" content="${escape(handle)}">`);
  if (profile.authorName) lines.push('', `<meta name="author" content="${escape(profile.authorName)}">`);
  lines.push(
    '',
    '<!-- Freshness signals answer engines read -->',
    `<meta property="article:published_time" content="${profile.publishedAt || page.dates.published || 'YYYY-MM-DDTHH:MM:SSZ'}">`,
    `<meta property="article:modified_time" content="${profile.modifiedAt || page.dates.modified || new Date().toISOString()}">`,
  );
  return lines.join('\n');
}

export function metaDiff(page, profile = {}) {
  return [
    {
      field: 'Title',
      current: page.title || null,
      currentLength: page.title ? page.title.length : 0,
      proposed: optimisedTitle(page, profile),
    },
    {
      field: 'Meta description',
      current: page.description || null,
      currentLength: page.description ? page.description.length : 0,
      proposed: optimisedDescription(page, profile),
    },
    {
      field: 'Canonical',
      current: page.canonical || null,
      currentLength: page.canonical ? page.canonical.length : 0,
      proposed: page.url,
    },
  ].map((row) => ({ ...row, proposedLength: row.proposed.length }));
}
