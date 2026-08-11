import { isQuestion } from '../extract.js';
import { abs, brandFrom, clean, isLocaleSegment, isoDate, looksLikeArticle, looksLikeHome, sentenceClamp, topicFrom } from './helpers.js';

const TODO = 'TODO: replace with a 40–60 word answer written for a reader who lands here cold.';

/** Questions to mark up: the page's own, topped up with the queries every topic attracts. */
export function faqPairs(page, limit = 6) {
  const topic = topicFrom(page);
  const pairs = page.headings
    .filter((h) => h.level >= 2 && isQuestion(h.text))
    .map((h) => ({
      question: clean(h.text).replace(/[:.]$/, '').replace(/\?*$/, '?'),
      answer: h.answer ? sentenceClamp(h.answer, 420) : TODO,
      source: 'page',
    }));

  const fallbacks = [
    `What is ${topic}?`,
    `How does ${topic} work?`,
    `Why does ${topic} matter?`,
    `Who is ${topic} for?`,
    `What are the alternatives to ${topic}?`,
    `How much does ${topic} cost?`,
  ];
  for (const q of fallbacks) {
    if (pairs.length >= limit) break;
    if (pairs.some((p) => p.question.toLowerCase() === q.toLowerCase())) continue;
    pairs.push({ question: q, answer: TODO, source: 'suggested' });
  }
  return pairs.slice(0, limit);
}

function organizationNode(page, profile) {
  const brand = brandFrom(page, profile);
  const sameAs = (profile.sameAs || []).map(clean).filter(Boolean);
  const node = {
    '@type': 'Organization',
    '@id': `${page.origin}/#organization`,
    name: brand,
    url: `${page.origin}/`,
  };
  if (profile.logoUrl || page.og.image) {
    node.logo = {
      '@type': 'ImageObject',
      url: abs(profile.logoUrl || page.og.image, page.url),
    };
  }
  // Only an explicit tagline: the page description describes the page, not the company.
  if (profile.tagline) node.description = sentenceClamp(profile.tagline, 250);
  if (sameAs.length) node.sameAs = sameAs;
  if (profile.contactEmail) {
    node.contactPoint = [
      { '@type': 'ContactPoint', contactType: 'customer support', email: profile.contactEmail, availableLanguage: [page.lang || 'en'] },
    ];
  }
  return node;
}

function websiteNode(page, profile) {
  const node = {
    '@type': 'WebSite',
    '@id': `${page.origin}/#website`,
    url: `${page.origin}/`,
    name: brandFrom(page, profile),
    publisher: { '@id': `${page.origin}/#organization` },
    inLanguage: page.lang || 'en',
  };
  if (profile.searchUrlTemplate) {
    node.potentialAction = {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: profile.searchUrlTemplate },
      'query-input': 'required name=search_term_string',
    };
  }
  return node;
}

function breadcrumbNode(page) {
  const url = new URL(page.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const items = [{ '@type': 'ListItem', position: 1, name: 'Home', item: `${page.origin}/` }];
  let acc = '';
  segments.forEach((seg, i) => {
    acc += `/${seg}`;
    if (isLocaleSegment(seg)) return; // /en-US/ is routing, not a crumb
    items.push({
      '@type': 'ListItem',
      position: 0,
      name: clean(decodeURIComponent(seg).replace(/[-_]+/g, ' ').replace(/\.\w+$/, '')).replace(/\b\w/g, (m) => m.toUpperCase()),
      item: `${page.origin}${acc}${i === segments.length - 1 ? url.search : ''}`,
    });
  });
  items.forEach((item, i) => {
    item.position = i + 1;
  });
  return { '@type': 'BreadcrumbList', '@id': `${page.url}#breadcrumb`, itemListElement: items };
}

function webPageNode(page, profile) {
  const node = {
    '@type': looksLikeHome(page) ? 'WebPage' : 'WebPage',
    '@id': `${page.url}#webpage`,
    url: page.url,
    name: clean(page.title || topicFrom(page)),
    isPartOf: { '@id': `${page.origin}/#website` },
    about: { '@id': `${page.origin}/#organization` },
    breadcrumb: { '@id': `${page.url}#breadcrumb` },
    inLanguage: page.lang || 'en',
  };
  if (page.description) node.description = sentenceClamp(page.description, 300);
  const image = abs(profile.logoUrl || page.og.image, page.url);
  if (image) node.primaryImageOfPage = { '@type': 'ImageObject', url: image };
  const modified = isoDate(profile.modifiedAt || page.dates.modified, null);
  if (modified) node.dateModified = modified;
  node.speakable = {
    '@type': 'SpeakableSpecification',
    cssSelector: ['h1', '.key-takeaways', '.answer-first'],
  };
  return node;
}

function articleNode(page, profile) {
  const published = isoDate(profile.publishedAt || page.dates.published, null);
  const modified = isoDate(profile.modifiedAt || page.dates.modified, published);
  const author = clean(profile.authorName || page.author || page.bylineText || '') || brandFrom(page, profile);
  const node = {
    '@type': 'Article',
    '@id': `${page.url}#article`,
    headline: clean(page.h1s[0] || page.title || '').slice(0, 110),
    description: sentenceClamp(page.description || page.firstParagraph || '', 300),
    mainEntityOfPage: { '@id': `${page.url}#webpage` },
    isPartOf: { '@id': `${page.url}#webpage` },
    author: {
      '@type': profile.authorName || page.bylineText ? 'Person' : 'Organization',
      name: author,
      ...(profile.authorUrl ? { url: clean(profile.authorUrl) } : {}),
      ...(profile.authorTitle ? { jobTitle: clean(profile.authorTitle) } : {}),
    },
    publisher: { '@id': `${page.origin}/#organization` },
    inLanguage: page.lang || 'en',
    wordCount: page.wordCount,
  };
  if (published) node.datePublished = published;
  if (modified) node.dateModified = modified;
  const image = abs(page.og.image, page.url);
  if (image) node.image = [image];
  const keywords = page.headings.filter((h) => h.level === 2).slice(0, 8).map((h) => clean(h.text));
  if (keywords.length) node.about = keywords.map((k) => ({ '@type': 'Thing', name: k }));
  return node;
}

export function faqNode(page, pairs) {
  return {
    '@type': 'FAQPage',
    '@id': `${page.url}#faq`,
    mainEntity: pairs.map((p) => ({
      '@type': 'Question',
      name: p.question,
      acceptedAnswer: { '@type': 'Answer', text: p.answer },
    })),
  };
}

export function howToNode(page) {
  const steps = page.headings
    .filter((h) => h.level >= 2 && !isQuestion(h.text))
    .slice(0, 8)
    .map((h, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: clean(h.text),
      text: h.answer ? sentenceClamp(h.answer, 300) : `TODO: describe step ${i + 1} in one or two sentences.`,
      url: h.id ? `${page.url}#${h.id}` : undefined,
    }));
  return {
    '@type': 'HowTo',
    '@id': `${page.url}#howto`,
    name: clean(page.h1s[0] || page.title || 'How to'),
    description: sentenceClamp(page.description || page.firstParagraph || '', 250),
    step: steps,
  };
}

/** The full @graph: one JSON-LD block that covers site, page, entity and FAQ. */
export function buildGraph(page, profile = {}, { includeFaq = true, includeHowTo = false } = {}) {
  const graph = [organizationNode(page, profile), websiteNode(page, profile), breadcrumbNode(page), webPageNode(page, profile)];
  const type = profile.pageType && profile.pageType !== 'auto' ? profile.pageType : looksLikeArticle(page) ? 'article' : 'page';
  if (type === 'article') graph.push(articleNode(page, profile));
  if (includeFaq) graph.push(faqNode(page, faqPairs(page)));
  if (includeHowTo) graph.push(howToNode(page));
  return { '@context': 'https://schema.org', '@graph': graph };
}
