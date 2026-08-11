import dns from 'node:dns/promises';
import net from 'node:net';

const UA =
  'Mozilla/5.0 (compatible; AEO-GEO-SEO-Generator/1.0; +https://github.com/local/aeo-geo-seo-generator)';

const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE === '1';

export class FetchError extends Error {
  constructor(message, code = 'FETCH_FAILED') {
    super(message);
    this.code = code;
  }
}

/** Normalise user input into an absolute http(s) URL. */
export function normaliseUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new FetchError('Enter a URL first.', 'EMPTY_URL');
  const scheme = raw.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme && scheme !== 'http' && scheme !== 'https') {
    throw new FetchError(`Only http:// and https:// URLs can be analysed (got ${scheme}:).`, 'BAD_PROTOCOL');
  }
  const withProto = scheme ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(withProto);
  } catch {
    throw new FetchError(`"${raw}" is not a valid URL.`, 'BAD_URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FetchError('Only http:// and https:// URLs can be analysed.', 'BAD_PROTOCOL');
  }
  url.hash = '';
  return url;
}

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7));
  return false;
}

/** Refuse to fetch loopback / LAN targets unless explicitly allowed (SSRF guard). */
async function assertPublicHost(hostname) {
  if (ALLOW_PRIVATE) return;
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new FetchError('Refusing to fetch a local address. Set ALLOW_PRIVATE=1 to override.', 'PRIVATE_HOST');
  }
  let addresses = [];
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await dns.lookup(host, { all: true })).map((a) => a.address);
    } catch {
      throw new FetchError(`Could not resolve "${hostname}".`, 'DNS_FAILED');
    }
  }
  if (addresses.some(isPrivateAddress)) {
    throw new FetchError('Refusing to fetch a private network address. Set ALLOW_PRIVATE=1 to override.', 'PRIVATE_HOST');
  }
}

/**
 * Fetch a URL following redirects manually so the chain can be reported.
 * Returns { finalUrl, status, headers, body, redirects, timingMs, bytes }.
 */
export async function fetchDocument(url, { timeoutMs = 20000, maxRedirects = 8, maxBytes = 6_000_000 } = {}) {
  let current = normaliseUrl(url);
  const redirects = [];
  const started = Date.now();

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertPublicHost(current.hostname);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(current.href, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': UA,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
        },
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new FetchError(`Timed out after ${timeoutMs / 1000}s.`, 'TIMEOUT');
      throw new FetchError(`Could not reach ${current.hostname}: ${err.message}`, 'NETWORK');
    }
    clearTimeout(timer);

    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      const next = new URL(location, current);
      redirects.push({ from: current.href, to: next.href, status: res.status });
      current = next;
      continue;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const bytes = buf.length;
    const body = buf.subarray(0, maxBytes).toString('utf8');
    return {
      finalUrl: current.href,
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      body,
      bytes,
      redirects,
      timingMs: Date.now() - started,
    };
  }
  throw new FetchError('Too many redirects.', 'REDIRECT_LOOP');
}

/** Best-effort side fetch: never throws, returns null when unavailable. */
export async function fetchSideFile(origin, path, { timeoutMs = 8000 } = {}) {
  try {
    const target = new URL(path, origin);
    const res = await fetchDocument(target.href, { timeoutMs, maxBytes: 400_000 });
    if (res.status >= 400) return { url: target.href, status: res.status, body: null };
    return { url: res.finalUrl, status: res.status, body: res.body };
  } catch {
    return null;
  }
}
