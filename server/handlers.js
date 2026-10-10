// Platform-neutral API handlers (Web Request -> Response). Adapters for
// Cloudflare Pages Functions and Vercel live in functions/ and api/.

import { lavaClient, LavaError } from './lava.js';
import { signLicense } from '../public/assets/js/core/license.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const EVENTS = new Set(['visit_app', 'file_loaded', 'parse_ok', 'parse_empty', 'export_free', 'export_locked', 'checkout_start', 'license_activated']);

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

async function checkout(request, env, deps) {
  if (!env.LAVA_API_KEY || !env.LAVA_OFFER_ID) {
    return json({ error: 'Checkout is not configured yet. Please email support to buy a license.' }, 503);
  }
  const body = await readJson(request);
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ error: 'Please enter a valid email address.' }, 400);
  const currency = ['USD', 'EUR'].includes(body.currency) ? body.currency : 'USD';
  const base = siteUrl(env, request);
  const params = {
    email,
    offerId: env.LAVA_OFFER_ID,
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
    await countEvent(env, 'checkout_created');
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

  let inv;
  try {
    inv = await lava(env, deps).getInvoice(id);
  } catch (e) {
    if (e instanceof LavaError && (e.status === 404 || e.status === 400)) return json({ error: 'Order not found.' }, 404);
    if (e instanceof LavaError) return json({ error: 'Could not reach the payment provider. Please retry.' }, 502);
    throw e;
  }
  // Never trust the browser's word about payment — only the provider's status.
  if (inv.status === 'NEW' || inv.status === 'IN_PROGRESS') return json({ status: 'pending' }, 202);
  if (inv.status !== 'COMPLETED') return json({ status: 'failed', error: 'This payment was not completed.' }, 402);
  if (env.LAVA_PRODUCT_NAME && inv.product?.name && inv.product.name !== env.LAVA_PRODUCT_NAME) {
    return json({ error: 'This order is for a different product.' }, 403);
  }
  if (!(inv.receipt?.amount > 0)) return json({ error: 'This order has no payment.' }, 402);
  const email = String(inv.buyer?.email || '').toLowerCase();
  if (!email) return json({ error: 'Order has no buyer email.' }, 422);

  const issuedAt = inv.datetime ? Math.floor(Date.parse(inv.datetime) / 1000) || undefined : undefined;
  const license = await signLicense({ email, ref: id, plan: 'pro', issuedAt }, key);
  await kvPut(env, `license:${id}`, JSON.stringify({ email, issuedAt: issuedAt || null }));
  return json({ status: 'completed', email, license });
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
    await countEvent(env, 'purchase');
    message = `✅ New sale: ${evt.amount} ${evt.currency} — ${evt.product?.title || 'product'} — ${evt.buyer?.email || ''}`;
  } else if (type === 'payment.failed') {
    await countEvent(env, 'payment_failed');
    message = `⚠️ Failed payment: ${evt.amount} ${evt.currency} — ${evt.errorMessage || 'no reason'}`;
  } else if (type === 'refund.success') {
    await countEvent(env, 'refund');
    message = `↩️ Refund: ${evt.data?.amount} ${evt.data?.currency} — ${evt.data?.customer_email || ''}`;
    if (evt.data?.customer_email) await kvPut(env, `refunded:${String(evt.data.customer_email).toLowerCase()}`, evt.created_at || '1');
  } else if (type === 'chargeback.initiated') {
    await countEvent(env, 'chargeback');
    message = `🚨 Chargeback: ${evt.data?.amount} ${evt.data?.currency} — ${evt.data?.reason_category || ''} — ${evt.data?.customer_email || ''}`;
  }
  if (message) await notify(env, deps, message);
  return json({ ok: true });
}

async function event(request, env) {
  const body = await readJson(request, 1024);
  if (!EVENTS.has(body.name)) return json({ error: 'unknown event' }, 400);
  await countEvent(env, body.name);
  return new Response(null, { status: 204 });
}

async function stats(request, env) {
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!env.ADMIN_TOKEN || !timingSafeEqual(token, env.ADMIN_TOKEN)) return json({ error: 'Unauthorized' }, 401);
  if (!env.LL_KV) return json({ error: 'KV not bound' }, 503);
  const days = Math.min(90, Math.max(1, Number(new URL(request.url).searchParams.get('days')) || 14));
  const out = {};
  const list = await env.LL_KV.list({ prefix: 'count:' });
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  for (const k of list.keys) {
    const [, day, name] = k.name.split(':');
    if (day < since) continue;
    out[day] ??= {};
    out[day][name] = Number(await env.LL_KV.get(k.name)) || 0;
  }
  return json({ days, counts: out });
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

async function countEvent(env, name) {
  if (!env.LL_KV) return;
  const key = `count:${new Date().toISOString().slice(0, 10)}:${name}`;
  try {
    const cur = Number(await env.LL_KV.get(key)) || 0;
    await env.LL_KV.put(key, String(cur + 1), { expirationTtl: 60 * 60 * 24 * 400 });
  } catch {
    /* counters are best-effort */
  }
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
