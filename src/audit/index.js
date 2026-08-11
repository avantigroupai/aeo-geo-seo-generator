import { fetchDocument, fetchSideFile, normaliseUrl } from '../fetcher.js';
import { extractPage, parseRobots, robotsVerdict, AI_AGENTS } from '../extract.js';
import { auditSeo } from './seo.js';
import { auditAeo } from './aeo.js';
import { auditGeo } from './geo.js';
import { scoreOf, grade } from './check.js';

const IMPACT_RANK = { high: 3, medium: 2, low: 1 };
const STATUS_RANK = { fail: 3, warn: 2, info: 1, pass: 0 };

function summariseSitemap(body, url) {
  if (!body) return { found: false };
  const isIndex = /<sitemapindex/i.test(body);
  const urlCount = (body.match(/<loc>/gi) || []).length;
  const hasLastmod = /<lastmod>/i.test(body);
  return { found: true, url, isIndex, urlCount, hasLastmod };
}

/** Fetch, parse, audit. Returns the full report consumed by the UI. */
export async function analyse(rawUrl, options = {}) {
  const url = normaliseUrl(rawUrl);
  const doc = await fetchDocument(url.href, options);

  if (doc.status >= 400) {
    const err = new Error(`The server returned HTTP ${doc.status} for ${doc.finalUrl}`);
    err.code = 'HTTP_ERROR';
    throw err;
  }

  const page = extractPage(doc.body, doc.finalUrl);
  const origin = page.origin;

  const [robotsFile, llmsTxt] = await Promise.all([
    fetchSideFile(origin, '/robots.txt'),
    fetchSideFile(origin, '/llms.txt'),
  ]);

  const robots = robotsFile?.body ? parseRobots(robotsFile.body) : null;

  let sitemap = { found: false };
  const sitemapCandidates = [...(robots?.sitemaps || []), new URL('/sitemap.xml', origin).href];
  for (const candidate of sitemapCandidates.slice(0, 3)) {
    const res = await fetchSideFile(origin, candidate);
    if (res?.body && /<(urlset|sitemapindex)/i.test(res.body)) {
      sitemap = summariseSitemap(res.body, res.url);
      break;
    }
  }

  const path = new URL(page.url).pathname;
  const aiVerdicts = {};
  for (const agent of AI_AGENTS) aiVerdicts[agent.id] = robotsVerdict(robots, agent.id, path);
  const robotsVerdicts = {
    Googlebot: robotsVerdict(robots, 'Googlebot', path),
    Bingbot: robotsVerdict(robots, 'Bingbot', path),
  };

  const ctx = {
    robots,
    robotsRaw: robotsFile?.body || null,
    robotsUrl: robotsFile?.url || null,
    llmsTxt,
    sitemap,
    aiVerdicts,
    robotsVerdicts,
    redirects: doc.redirects,
    headers: doc.headers,
    status: doc.status,
    timingMs: doc.timingMs,
    bytes: doc.bytes,
  };

  const checks = [...auditSeo(page, ctx), ...auditAeo(page, ctx), ...auditGeo(page, ctx)];

  const byCategory = {
    seo: checks.filter((c) => c.category === 'seo'),
    aeo: checks.filter((c) => c.category === 'aeo'),
    geo: checks.filter((c) => c.category === 'geo'),
  };

  const scores = {
    seo: scoreOf(byCategory.seo),
    aeo: scoreOf(byCategory.aeo),
    geo: scoreOf(byCategory.geo),
  };
  scores.overall = Math.round((scores.seo + scores.aeo + scores.geo) / 3);

  const priorities = checks
    .filter((c) => c.status === 'fail' || c.status === 'warn')
    .sort((a, b) => {
      const s = STATUS_RANK[b.status] - STATUS_RANK[a.status];
      if (s) return s;
      const i = IMPACT_RANK[b.impact] - IMPACT_RANK[a.impact];
      if (i) return i;
      return b.weight - a.weight;
    })
    .slice(0, 12);

  return {
    requestedUrl: url.href,
    finalUrl: page.url,
    fetchedAt: new Date().toISOString(),
    http: {
      status: doc.status,
      timingMs: doc.timingMs,
      bytes: doc.bytes,
      redirects: doc.redirects,
      server: doc.headers.server || null,
      contentType: doc.headers['content-type'] || null,
      cacheControl: doc.headers['cache-control'] || null,
    },
    page: {
      // Everything the UI needs, minus the raw HTML payload.
      ...page,
      html: undefined,
      bodyText: undefined,
      text: page.text.slice(0, 4000),
    },
    context: {
      robotsFound: Boolean(robotsFile?.body),
      robotsUrl: ctx.robotsUrl,
      robotsSitemaps: robots?.sitemaps || [],
      llmsTxtFound: Boolean(llmsTxt?.body),
      llmsTxtUrl: llmsTxt?.url || null,
      sitemap,
      aiVerdicts,
      robotsVerdicts,
      agents: AI_AGENTS,
    },
    scores,
    grades: {
      seo: grade(scores.seo),
      aeo: grade(scores.aeo),
      geo: grade(scores.geo),
      overall: grade(scores.overall),
    },
    counts: {
      pass: checks.filter((c) => c.status === 'pass').length,
      warn: checks.filter((c) => c.status === 'warn').length,
      fail: checks.filter((c) => c.status === 'fail').length,
      total: checks.length,
    },
    checks,
    priorities,
  };
}

export { AI_AGENTS };
