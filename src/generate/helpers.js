const SEPARATORS = /\s[|–—·»:-]\s/;

export const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const GENERIC_PREFIX = /^(guide|tutorial|review|how to|intro|introduction|blog|news|docs?|overview|part \d+)$/i;

/** Strip the brand suffix — and a subtitle — from a title to get the actual topic. */
export function topicFrom(page) {
  const source = page.h1s[0] || page.title || page.hostname;
  const parts = clean(source).split(SEPARATORS).map(clean).filter(Boolean);
  let topic = parts.length ? parts.sort((a, b) => b.length - a.length)[0] : clean(source);
  // "HTML: HyperText Markup Language" → "HTML", but keep "Guide: pricing models".
  const colon = topic.indexOf(': ');
  if (colon > 1) {
    const prefix = topic.slice(0, colon).trim();
    if (prefix.split(/\s+/).length <= 3 && !GENERIC_PREFIX.test(prefix)) topic = prefix;
  }
  return topic;
}

export function brandFrom(page, profile = {}) {
  if (profile.brandName) return clean(profile.brandName);
  const org = page.jsonLd.find((n) => /Organization|LocalBusiness/i.test(JSON.stringify(n['@type'] || '')));
  if (org?.name) return clean(org.name);
  if (page.og.site_name) return clean(page.og.site_name);
  const title = clean(page.title || '');
  const parts = title.split(SEPARATORS).map(clean).filter(Boolean);
  if (parts.length > 1) return parts[parts.length - 1];
  const host = page.hostname.replace(/^www\./, '').split('.')[0];
  return host.charAt(0).toUpperCase() + host.slice(1);
}

/** Truncate on a word boundary without cutting mid-word. */
export function truncate(text, max) {
  const t = clean(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return `${cut.slice(0, at > max * 0.6 ? at : max).replace(/[,.;:–—-]$/, '')}…`;
}

/** Trim to whole sentences up to `max` characters. */
export function sentenceClamp(text, max) {
  const t = clean(text);
  if (!t) return '';
  if (t.length <= max) return t;
  const slice = t.slice(0, max + 1);
  const end = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
  if (end > max * 0.5) return t.slice(0, end + 1).trim();
  return truncate(t, max);
}

/** "/en-US/docs/…" — locale segments are routing, not taxonomy. */
export function isLocaleSegment(seg) {
  return /^[a-z]{2}([-_][a-zA-Z]{2,4})?$/.test(seg) && !['docs', 'api', 'faq', 'blog'].includes(seg.toLowerCase());
}

export function abs(href, base) {
  if (!href) return null;
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

export function isoDate(value, fallback = null) {
  if (!value) return fallback;
  const t = Date.parse(value);
  return Number.isNaN(t) ? fallback : new Date(t).toISOString();
}

export function json(obj) {
  return JSON.stringify(obj, null, 2);
}

export function ldScript(obj) {
  return `<script type="application/ld+json">\n${json(obj)}\n</script>`;
}

/** Does this page read like an article rather than a landing or product page? */
export function looksLikeArticle(page) {
  if (page.jsonLdTypes.some((t) => /Article|BlogPosting|NewsArticle/i.test(t))) return true;
  if (page.dates.published || page.dates.modified) return true;
  if (page.bylineText) return true;
  const depth = new URL(page.url).pathname.split('/').filter(Boolean).length;
  return depth >= 1 && page.wordCount > 500;
}

export function looksLikeHome(page) {
  return new URL(page.url).pathname.replace(/\/$/, '') === '';
}
