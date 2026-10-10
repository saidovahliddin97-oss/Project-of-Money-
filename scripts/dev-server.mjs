// Local server without Cloudflare: serves public/ and routes /api/* to the
// shared handlers. Reads secrets from .dev.vars (same format as .env.example).
//   node scripts/dev-server.mjs [port]
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from '../server/handlers.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.pdf': 'application/pdf', '.xml': 'application/xml', '.txt': 'text/plain', '.json': 'application/json',
};

export function loadEnv(file = join(root, '.dev.vars')) {
  const env = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

export function memoryKv() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, String(v)); },
    async list({ prefix = '' } = {}) { return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }; },
  };
}

export function startServer({ port = 8787, env = { ...loadEnv(), ...process.env }, quiet = false } = {}) {
  if (!env.LL_KV) env.LL_KV = memoryKv();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
      const r = await handle(request, env, { log: quiet ? () => {} : console.log });
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (p.endsWith('/')) p += 'index.html';
    let file = join(pub, p);
    if (!file.startsWith(pub) || !existsSync(file) || statSync(file).isDirectory()) file = join(pub, '404.html');
    res.writeHead(file.endsWith('404.html') && !p.endsWith('404.html') ? 404 : 200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; worker-src 'self' blob:; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://cloudflareinsights.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2]) || 8787;
  await startServer({ port });
  console.log(`LocalLedger dev server on http://localhost:${port}`);
}
