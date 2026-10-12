// Platform-neutral API handlers (Web Request -> Response). Adapters for
// Cloudflare Pages Functions and Vercel live in functions/ and api/.

import { lavaClient, LavaError } from './lava.js';
import { signLicense } from '../public/assets/js/core/license.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const EVENTS = new Set(['pageview', 'visit_app', 'file_loaded', 'parse_ok', 'parse_empty', 'export_free', 'export_locked', 'checkout_start', 'license_activated']);

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

async function readJson(request, max = 16 * 1024) {
  const text = await request.text();
  if (text.length > max) throw new HttpError(413, 'Request too large');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function siteUrl(env, request) {
  const configured = (env.SITE_URL || '').replace(/\/+$/, '');
  return configured || new URL(request.url).origin;
}

function timingSafeEqual(a, b) {
  const ea = new TextEncoder().encode(String(a));
  const eb = new TextEncoder().encode(String(b));
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] || 0) ^ (eb[i] || 0);
  return diff === 0;
}

function privateKey(env) {
  if (!env.LICENSE_PRIVATE_JWK) return null;
  try {
    return typeof env.LICENSE_PRIVATE_JWK === 'string' ? JSON.parse(env.LICENSE_PRIVATE_JWK) : env.LICENSE_PRIVATE_JWK;
  } catch {
    return null;
  }
}

function lava(env, deps) {
  return lavaClient({ apiKey: env.LAVA_API_KEY, baseUrl: env.LAVA_API_BASE || 'https://gate.lava.top', fetchImpl: deps.fetch || fetch });
}

// ---------------------------------------------------------------------------

async function health(request, env) {
  return json({
    ok: true,
    checkout: Boolean(env.LAVA_API_KEY && env.LAVA_OFFER_ID),
    checkoutIif: Boolean(env.LAVA_API_KEY && env.LAVA_OFFER_ID_IIF),
    licensing: Boolean(privateKey(env)),
    webhookAuth: Boolean(env.LAVA_WEBHOOK_SECRET),
    notifications: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
    events: Boolean(env.LL_KV),
  });
}

// The public half of the signing key, derived from the private JWK secret, so
// the browser can verify licenses without a key file committed to the repo.
async function pubkey(request, env) {
  const key = privateKey(env);
  if (!key || !key.x || !key.y) return json({ error: 'Licensing is not configured.' }, 503);
  return json({ jwk: { kty: key.kty, crv: key.crv, x: key.x, y: key.y } }, 200, { 'Cache-Control': 'public, max-age=3600' });
}

// Products sold through lava.top. Each has its own offer id and license plan.
function products(env) {
  const list = [];
  if (env.LAVA_OFFER_ID) list.push({ key: 'ledger', plan: 'pro', offerId: env.LAVA_OFFER_ID, name: env.LAVA_PRODUCT_NAME || '' });
  if (env.LAVA_OFFER_ID_IIF) list.push({ key: 'iif', plan: 'iif', offerId: env.LAVA_OFFER_ID_IIF, name: env.LAVA_PRODUCT_NAME_IIF || 'IIF Kit Pro' });
  return list;
}

async function checkout(request, env, deps) {
  const body = await readJson(request);
  const product = products(env).find((p) => p.key === (body.product || 'ledger'));
  if (!env.LAVA_API_KEY || !product) {
    return json({ error: 'Checkout is not available yet. Please try again later.' }, 503);
  }
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ error: 'Please enter a valid email address.' }, 400);
  const currency = ['USD', 'EUR'].includes(body.currency) ? body.currency : 'USD';
  const base = siteUrl(env, request);
  const params = {
    email,
    offerId: product.offerId,
    currency,
    buyerLanguage: 'EN',
    successful_return_url: `${base}/success.html`,
    failure_return_url: `${base}/cancel.html?status=failed`,
    cancel_return_url: `${base}/cancel.html`,
  };
  if (body.method === 'paypal') params.paymentProvider = 'PAYPAL';
  if (body.utm && typeof body.utm === 'object') {
    const utm = {};
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
      if (typeof body.utm[k] === 'string' && body.utm[k]) utm[k] = body.utm[k].slice(0, 100);
    }
    if (Object.keys(utm).length) params.clientUtm = utm;
  }
  try {
    const inv = await lava(env, deps).createInvoice(params);
    if (!inv?.id || !inv?.paymentUrl) return json({ error: 'Payment provider returned an unexpected response.' }, 502);
    await record(env, ['checkout_created']);
    return json({ invoiceId: inv.id, paymentUrl: inv.paymentUrl });
  } catch (e) {
    if (e instanceof LavaError) {
      deps.log?.('lava createInvoice failed', e.status, e.message);
      return json({ error: 'Could not start checkout. Please try again in a minute.' }, 502);
    }
    throw e;
  }
}

async function claim(request, env, deps) {
  const key = privateKey(env);
  if (!env.LAVA_API_KEY || !key) return json({ error: 'Licensing is not configured.' }, 503);
  const body = await readJson(request);
  const id = String(body.invoiceId || '').trim();
  if (!UUID_RE.test(id)) return json({ error: 'Invalid order id.' }, 400);

  // 1) A payment.success webhook already confirmed this order (preferred: lava.top
  //    only exposes contracts through the API once a payment has started).
  const paidRaw = env.LL_KV ? await env.LL_KV.get(`paid:${id}`) : null;
  let inv;
  if (paidRaw) {
    const p = JSON.parse(paidRaw);
    inv = { status: 'COMPLETED', datetime: p.at, receipt: { amount: p.amount, currency: p.currency }, buyer: { email: p.email }, product: { name: p.product } };
  } else {
    // 2) Otherwise ask lava.top directly. Never trust the browser's word about payment.
    try {
      inv = await lava(env, deps).getInvoice(id);
    } catch (e) {
      if (e instanceof LavaError && (e.status === 404 || e.status === 400)) return json({ status: 'pending' }, 202);
      if (e instanceof LavaError) return json({ error: 'Could not reach the payment provider. Please retry.' }, 502);
      throw e;
    }
  }
  if (inv.status === 'NEW' || inv.status === 'IN_PROGRESS') return json({ status: 'pending' }, 202);
  if (inv.status !== 'COMPLETED') return json({ status: 'failed', error: 'This payment was not completed.' }, 402);
  // Map the purchased lava.top product to a license plan; refuse unknown products.
  const catalogue = products(env);
  const named = catalogue.filter((p) => p.name);
  const match = inv.product?.name ? named.find((p) => p.name === inv.product.name) : null;
  if (named.length && inv.product?.name && !match) return json({ error: 'This order is for a different product.' }, 403);
  const plan = (match || catalogue[0] || { plan: 'pro' }).plan;
  if (!(inv.receipt?.amount > 0)) return json({ error: 'This order has no payment.' }, 402);
  const email = String(inv.buyer?.email || '').toLowerCase();
  if (!email) return json({ error: 'Order has no buyer email.' }, 422);

  const issuedAt = inv.datetime ? Math.floor(Date.parse(inv.datetime) / 1000) || undefined : undefined;
  const license = await signLicense({ email, ref: id, plan, issuedAt }, key);
  await kvPut(env, `license:${id}`, JSON.stringify({ email, issuedAt: issuedAt || null }));
  // The webhook is optional: a verified claim also counts the sale (once per order).
  await recordSale(env, id, Number(inv.receipt?.amount) || 0, inv.receipt?.currency, email, inv.product?.name);
  return json({ status: 'completed', email, license, plan });
}

async function webhook(request, env, deps) {
  const secret = env.LAVA_WEBHOOK_SECRET;
  if (!secret) return json({ error: 'Webhook secret not configured' }, 503);
  const apiKeyHeader = request.headers.get('X-Api-Key');
  const auth = request.headers.get('Authorization') || '';
  let authorized = apiKeyHeader !== null && timingSafeEqual(apiKeyHeader, secret);
  if (!authorized && auth.startsWith('Basic ')) {
    try {
      const decoded = atob(auth.slice(6));
      const pass = decoded.slice(decoded.indexOf(':') + 1);
      authorized = timingSafeEqual(pass, secret);
    } catch {
      authorized = false;
    }
  }
  if (!authorized) return json({ error: 'Unauthorized' }, 401);

  const evt = await readJson(request, 64 * 1024);
  const type = evt.eventType || evt.event_type || 'unknown';
  const eventId = evt.event_id || `${type}:${evt.contractId || ''}`;

  // Idempotency: lava.top retries up to 20 times; process each event once.
  if (env.LL_KV) {
    const seen = await env.LL_KV.get(`evt:${eventId}`);
    if (seen) return json({ ok: true, duplicate: true });
    await env.LL_KV.put(`evt:${eventId}`, '1', { expirationTtl: 60 * 60 * 24 * 30 });
  }

  let message = null;
  if (type === 'payment.success') {
    await recordSale(env, evt.contractId, Number(evt.amount) || 0, evt.currency, evt.buyer?.email, evt.product?.title);
    if (evt.contractId) {
      await kvPut(env, `paid:${evt.contractId}`, JSON.stringify({
        email: evt.buyer?.email || '', amount: Number(evt.amount) || 0, currency: evt.currency || 'USD', product: evt.product?.title || '', at: evt.timestamp || new Date().toISOString(),
      }));
    }
    message = `✅ New sale: ${evt.amount} ${evt.currency} — ${evt.product?.title || 'product'} — ${evt.buyer?.email || ''}`;
  } else if (type === 'payment.failed') {
    await record(env, ['payment_failed']);
    message = `⚠️ Failed payment: ${evt.amount} ${evt.currency} — ${evt.errorMessage || 'no reason'}`;
  } else if (type === 'refund.success') {
    await record(env, ['refund'], { refunds: { [evt.data?.currency || 'USD']: Number(evt.data?.amount) || 0 } });
    message = `↩️ Refund: ${evt.data?.amount} ${evt.data?.currency} — ${evt.data?.customer_email || ''}`;
    if (evt.data?.customer_email) await kvPut(env, `refunded:${String(evt.data.customer_email).toLowerCase()}`, evt.created_at || '1');
  } else if (type === 'chargeback.initiated') {
    await record(env, ['chargeback'], { refunds: { [evt.data?.currency || 'USD']: Number(evt.data?.amount) || 0 } });
    message = `🚨 Chargeback: ${evt.data?.amount} ${evt.data?.currency} — ${evt.data?.reason_category || ''} — ${evt.data?.customer_email || ''}`;
  }
  if (message) await notify(env, deps, message);
  return json({ ok: true });
}

async function event(request, env) {
  const body = await readJson(request, 2048);
  if (!EVENTS.has(body.name)) return json({ error: 'unknown event' }, 400);
  const ua = request.headers.get('User-Agent') || '';
  if (BOT_RE.test(ua)) return new Response(null, { status: 204 });
  if (body.name === 'pageview') {
    const names = ['pageview'];
    const dims = {
      pg: cleanPath(body.path),
      cc: request.cf?.country || 'XX',
      dev: deviceOf(ua),
      os: osOf(ua),
    };
    if (body.visit) {
      names.push('visit');
      dims.ref = cleanHost(body.ref) || '(direct)';
      if (body.src) dims.src = String(body.src).slice(0, 60).toLowerCase();
    }
    await record(env, names, dims);
  } else {
    await record(env, [body.name]);
  }
  return new Response(null, { status: 204 });
}

// Manual license issuing for the owner (invoice sales, lost keys) so the
// private key never has to leave the hosting secrets.
async function adminIssue(request, env) {
  if (!isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
  const key = privateKey(env);
  if (!key) return json({ error: 'Licensing is not configured.' }, 503);
  const body = await readJson(request);
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ error: 'Invalid email' }, 400);
  const ref = String(body.ref || `manual-${new Date().toISOString().slice(0, 10)}`).slice(0, 100);
  const license = await signLicense({ email, ref, plan: body.plan === 'iif' ? 'iif' : 'pro' }, key);
  await kvPut(env, `license:${ref}`, JSON.stringify({ email, manual: true }));
  return json({ email, ref, license });
}

function isAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : new URL(request.url).searchParams.get('token') || '';
  return Boolean(env.ADMIN_TOKEN) && timingSafeEqual(token, env.ADMIN_TOKEN);
}

async function readDays(env, from, count) {
  const keys = [];
  for (let i = 0; i < count; i++) keys.push(new Date(from - i * 86400000).toISOString().slice(0, 10));
  const blobs = await Promise.all(keys.map((d) => env.LL_KV.get(`day:${d}`)));
  return keys.map((date, i) => ({ date, data: blobs[i] ? JSON.parse(blobs[i]) : {} })).reverse();
}

function mergeDays(list) {
  const out = {};
  for (const { data } of list) {
    for (const [dim, map] of Object.entries(data)) {
      out[dim] ??= {};
      for (const [k, v] of Object.entries(map)) out[dim][k] = Math.round(((out[dim][k] || 0) + v) * 100) / 100;
    }
  }
  return out;
}

async function stats(request, env) {
  if (!isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
  if (!env.LL_KV) return json({ error: 'KV not bound' }, 503);
  const days = Math.min(90, Math.max(1, Number(new URL(request.url).searchParams.get('days')) || 14));
  const list = await readDays(env, Date.now(), days);
  const counts = {};
  for (const { date, data } of list) if (data.ev) counts[date] = data.ev;
  return json({ days, counts });
}

// Everything the owner's dashboard needs in one request.
async function adminSummary(request, env) {
  if (!isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
  if (!env.LL_KV) return json({ error: 'KV not bound' }, 503);
  const days = Math.min(90, Math.max(1, Number(new URL(request.url).searchParams.get('days')) || 30));
  const now = Date.now();
  const [cur, prev, saleList] = await Promise.all([
    readDays(env, now, days),
    readDays(env, now - days * 86400000, days),
    env.LL_KV.list({ prefix: 'sale:', limit: 1000 }),
  ]);
  const saleKeys = saleList.keys.map((k) => k.name).sort().reverse().slice(0, 20);
  const sales = (await Promise.all(saleKeys.map((k) => env.LL_KV.get(k)))).map((v, i) => ({
    at: saleKeys[i].slice(5, 29),
    ...(v ? JSON.parse(v) : {}),
  }));
  return json({
    days,
    generatedAt: new Date(now).toISOString(),
    current: mergeDays(cur),
    previous: mergeDays(prev),
    series: cur.map(({ date, data }) => ({ date, ev: data.ev || {} })),
    sales,
    config: {
      checkout: Boolean(env.LAVA_API_KEY && env.LAVA_OFFER_ID),
    checkoutIif: Boolean(env.LAVA_API_KEY && env.LAVA_OFFER_ID_IIF),
      licensing: Boolean(privateKey(env)),
      webhookAuth: Boolean(env.LAVA_WEBHOOK_SECRET),
      notifications: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
      siteUrl: env.SITE_URL || null,
    },
  });
}

// ---------------------------------------------------------------------------

async function kvPut(env, key, value) {
  if (!env.LL_KV) return;
  try {
    await env.LL_KV.put(key, value);
  } catch {
    /* storage is best-effort */
  }
}

const DIMS = ['pg', 'ref', 'cc', 'dev', 'os', 'src'];
const MAX_KEYS = 200;

/**
 * One KV write per event: all of a day's counters live in a single JSON blob
 * (day:YYYY-MM-DD). Counts are approximate under concurrent writes, which is
 * fine for a dashboard and keeps us far below the free plan's write limit.
 */
async function record(env, names, dims = {}) {
  if (!env.LL_KV) return;
  const key = `day:${new Date().toISOString().slice(0, 10)}`;
  try {
    const raw = await env.LL_KV.get(key);
    const d = raw ? JSON.parse(raw) : {};
    d.ev ??= {};
    for (const n of names) d.ev[n] = (d.ev[n] || 0) + 1;
    for (const dim of DIMS) {
      if (!dims[dim]) continue;
      d[dim] ??= {};
      const k = String(dims[dim]).slice(0, 100);
      d[dim][k] = (d[dim][k] || 0) + 1;
      prune(d[dim]);
    }
    for (const money of ['gross', 'refunds']) {
      if (!dims[money]) continue;
      d[money] ??= {};
      for (const [cur, amt] of Object.entries(dims[money])) d[money][cur.toUpperCase()] = Math.round(((d[money][cur.toUpperCase()] || 0) + amt) * 100) / 100;
    }
    await env.LL_KV.put(key, JSON.stringify(d), { expirationTtl: 60 * 60 * 24 * 400 });
  } catch {
    /* analytics are best-effort */
  }
}

async function recordSale(env, id, amount, currency, email, product) {
  if (!env.LL_KV || !id) return;
  try {
    if (await env.LL_KV.get(`sold:${id}`)) return;
    await env.LL_KV.put(`sold:${id}`, '1');
    await record(env, ['purchase'], { gross: { [currency || 'USD']: amount } });
    await env.LL_KV.put(`sale:${new Date().toISOString()}:${id}`, JSON.stringify({ amount, currency: currency || 'USD', product: product || '', email: maskEmail(email) }));
  } catch {
    /* best-effort */
  }
}

function prune(map) {
  const entries = Object.entries(map);
  if (entries.length <= MAX_KEYS) return;
  entries.sort((a, b) => a[1] - b[1]);
  for (const [k] of entries.slice(0, entries.length - MAX_KEYS)) delete map[k];
}

const BOT_RE = /bot|crawl|spider|slurp|headless|preview|monitor|curl|wget|python|node-fetch|axios/i;

function deviceOf(ua) {
  if (/iPad|Tablet|Nexus 7|Nexus 10|SM-T|Kindle|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)) return 'mobile';
  return 'desktop';
}

function osOf(ua) {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/CrOS/i.test(ua)) return 'ChromeOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'other';
}

function cleanPath(p) {
  const s = String(p || '/').split(/[?#]/)[0].slice(0, 100);
  return s.replace(/\.html$/, '').replace(/\/index$/, '/') || '/';
}

function cleanHost(h) {
  const s = String(h || '').toLowerCase().replace(/^www\./, '').slice(0, 80);
  return /^[a-z0-9.-]+$/.test(s) ? s : '';
}

function maskEmail(e) {
  const s = String(e || '');
  const at = s.indexOf('@');
  return at > 1 ? `${s[0]}***${s.slice(at)}` : s ? '***' : '';
}

async function notify(env, deps, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    await (deps.fetch || fetch)(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
      signal: ctrl.signal,
    });
  } catch {
    /* a failed notification must not fail the webhook */
  } finally {
    clearTimeout(timer);
  }
}

const ROUTES = {
  'GET /api/health': health,
  'GET /api/pubkey': pubkey,
  'POST /api/checkout': checkout,
  'POST /api/claim': claim,
  'POST /api/webhook/lava': webhook,
  'POST /api/event': event,
  'GET /api/stats': stats,
  'POST /api/admin/issue': adminIssue,
  'GET /api/admin/summary': adminSummary,
};

/**
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {{fetch?: typeof fetch, log?: Function}} [deps]
 */
export async function handle(request, env, deps = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const route = ROUTES[`${request.method} ${path}`];
  if (!route) {
    const allowed = Object.keys(ROUTES).some((k) => k.endsWith(` ${path}`));
    return json({ error: allowed ? 'Method not allowed' : 'Not found' }, allowed ? 405 : 404);
  }
  try {
    return await route(request, env, deps);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    (deps.log || console.error)('handler error', path, e?.message);
    return json({ error: 'Internal error' }, 500);
  }
}
