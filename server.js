import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyse } from './src/audit/index.js';
import { buildArtifacts } from './src/generate/index.js';
import { FetchError } from './src/fetcher.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 4321);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// Short-lived cache so tweaking the brand profile does not re-crawl the site.
const CACHE = new Map();
const TTL_MS = 15 * 60 * 1000;

function remember(key, value) {
  CACHE.set(key, { value, at: Date.now() });
  for (const [k, v] of CACHE) if (Date.now() - v.at > TTL_MS) CACHE.delete(k);
  if (CACHE.size > 40) CACHE.delete(CACHE.keys().next().value);
}

function recall(key) {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    CACHE.delete(key);
    return null;
  }
  return hit.value;
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': type,
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(payload);
}

async function readJson(req, limit = 2_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const rel = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'Forbidden' });
  try {
    const data = await fs.readFile(file);
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  } catch {
    send(res, 404, { error: 'Not found' });
  }
}

function errorPayload(err) {
  if (err instanceof FetchError || err.code) {
    return { status: 400, body: { error: err.message, code: err.code || 'ERROR' } };
  }
  return { status: 500, body: { error: err.message || 'Unexpected error', code: 'INTERNAL' } };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'POST' && url.pathname === '/api/analyze') {
    try {
      const { url: target, profile = {}, refresh = false } = await readJson(req);
      const key = String(target || '').trim().toLowerCase();
      let report = refresh ? null : recall(key);
      if (!report) {
        report = await analyse(target);
        remember(key, report);
      }
      const generated = buildArtifacts(report.page, report, profile);
      return send(res, 200, { report, generated });
    } catch (err) {
      const { status, body } = errorPayload(err);
      return send(res, status, body);
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/generate') {
    try {
      const { url: target, profile = {} } = await readJson(req);
      const key = String(target || '').trim().toLowerCase();
      const report = recall(key) || (await analyse(target));
      remember(key, report);
      const generated = buildArtifacts(report.page, report, profile);
      return send(res, 200, { generated });
    } catch (err) {
      const { status, body } = errorPayload(err);
      return send(res, status, body);
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return send(res, 200, { ok: true, cached: CACHE.size, node: process.version });
  }

  if (req.method === 'GET') return serveStatic(req, res);
  send(res, 405, { error: 'Method not allowed' });
});

server.listen(PORT, () => {
  console.log(`\n  AEO · GEO · SEO Generator`);
  console.log(`  → http://localhost:${PORT}\n`);
});
