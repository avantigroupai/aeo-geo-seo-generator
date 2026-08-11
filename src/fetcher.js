const UA =
  'Mozilla/5.0 (compatible; AEO-GEO-SEO-Generator/1.0; +https://github.com/local/aeo-geo-seo-generator)';

const ALLOW_PRIVATE = globalThis.process?.env?.ALLOW_PRIVATE === '1';

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

/* Node's net.isIP is not available on every runtime this ships to (Workers has no node:net),
   and the shape of an IP literal is not worth a dependency. */
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const isIPv4 = (s) => {
  const m = IPV4_RE.exec(String(s));
  return Boolean(m) && m.slice(1).every((octet) => Number(octet) <= 255);
};
const isIPv6 = (s) => String(s).includes(':') && /^[0-9a-f:.]+$/i.test(String(s));
const isIP = (s) => isIPv4(s) || isIPv6(s);

function isPrivateAddress(ip) {
  if (isIPv4(ip)) {
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

/*
 * Resolution goes over DNS-over-HTTPS rather than node:dns, because this runs both as a Node
 * server and as a Cloudflare Worker, and only one of those has a resolver. `fetch` is the one
 * primitive both runtimes agree on.
 */
const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';
const DNS_TTL_MS = 5 * 60 * 1000;
const dnsCache = new Map();

async function resolveHost(host, timeoutMs = 4000) {
  const hit = dnsCache.get(host);
  if (hit && Date.now() - hit.at < DNS_TTL_MS) return hit.addresses;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const ask = async (type) => {
    const res = await fetch(`${DOH_ENDPOINT}?name=${encodeURIComponent(host)}&type=${type}`, {
      headers: { accept: 'application/dns-json' },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    // Type 1 = A, 28 = AAAA. CNAME hops appear in the same Answer array and are skipped.
    return (data.Answer || []).filter((a) => a.type === 1 || a.type === 28).map((a) => a.data);
  };

  try {
    const [v4, v6] = await Promise.all([ask('A'), ask('AAAA')]);
    const addresses = [...v4, ...v6];
    if (addresses.length) dnsCache.set(host, { addresses, at: Date.now() });
    return addresses;
  } finally {
    clearTimeout(timer);
  }
}

/** Refuse to fetch loopback / LAN targets unless explicitly allowed (SSRF guard). */
async function assertPublicHost(hostname) {
  if (ALLOW_PRIVATE) return;
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new FetchError('Refusing to fetch a local address. Set ALLOW_PRIVATE=1 to override.', 'PRIVATE_HOST');
  }
  let addresses = [];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = await resolveHost(host);
    } catch {
      throw new FetchError(`Could not resolve "${hostname}".`, 'DNS_FAILED');
    }
    // Fail closed: an unresolvable host must not slip past the guard on an empty answer.
    if (!addresses.length) throw new FetchError(`Could not resolve "${hostname}".`, 'DNS_FAILED');
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

    const raw = new Uint8Array(await res.arrayBuffer());
    const bytes = raw.length;
    const body = new TextDecoder('utf-8').decode(raw.subarray(0, maxBytes));
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
