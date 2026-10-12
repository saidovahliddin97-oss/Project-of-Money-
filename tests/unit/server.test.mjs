import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../../server/handlers.js';
import { generateKeyPair, verifyLicense } from '../../public/assets/js/core/license.js';

const INV = '7ea82675-4ded-4133-95a7-a6efbaf165cc';

function memKv() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, v); },
    async list({ prefix }) { return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }; },
  };
}

function fakeFetch(routes, calls) {
  return async (url, init = {}) => {
    calls.push({ url: String(url), init });
    for (const [pattern, fn] of routes) {
      if (String(url).includes(pattern)) {
        const { status = 200, body } = await fn(init);
        return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
      }
    }
    return new Response('{}', { status: 404 });
  };
}

const req = (method, path, body, headers = {}) =>
  new Request(`https://ll.example${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });

async function env() {
  const { privateJwk, publicJwk } = await generateKeyPair();
  return {
    publicJwk,
    env: {
      LAVA_API_KEY: 'test-key', LAVA_OFFER_ID: '836b9fc5-7ae9-4a27-9642-592bc44072b7', LICENSE_PRIVATE_JWK: JSON.stringify(privateJwk),
      SITE_URL: 'https://ll.example', LAVA_WEBHOOK_SECRET: 'whsec', LL_KV: memKv(), TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1', ADMIN_TOKEN: 'adm',
    },
  };
}

test('health reports configuration without leaking secrets', async () => {
  const { env: e } = await env();
  const res = await handle(req('GET', '/api/health'), e);
  const body = await res.json();
  assert.deepEqual(body, { ok: true, checkout: true, checkoutIif: false, licensing: true, webhookAuth: true, notifications: true, events: true });
  assert.ok(!JSON.stringify(body).includes('test-key'));
});

test('checkout validates email and creates a lava.top invoice', async () => {
  const { env: e } = await env();
  const calls = [];
  const fetch = fakeFetch([['/api/v3/invoice', async () => ({ status: 201, body: { id: INV, status: 'NEW', paymentUrl: 'https://pay.example/w' } })]], calls);
  let res = await handle(req('POST', '/api/checkout', { email: 'nope' }), e, { fetch });
  assert.equal(res.status, 400);
  res = await handle(req('POST', '/api/checkout', { email: 'Buyer@Example.com', currency: 'EUR', method: 'paypal', utm: { utm_source: 'reddit' } }), e, { fetch });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { invoiceId: INV, paymentUrl: 'https://pay.example/w' });
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(calls[0].init.headers['X-Api-Key'], 'test-key');
  assert.equal(sent.email, 'buyer@example.com');
  assert.equal(sent.currency, 'EUR');
  assert.equal(sent.paymentProvider, 'PAYPAL');
  assert.equal(sent.successful_return_url, 'https://ll.example/success.html');
  assert.deepEqual(sent.clientUtm, { utm_source: 'reddit' });
});

test('checkout reports provider errors and missing config', async () => {
  const { env: e } = await env();
  const fetch = fakeFetch([['/api/v3/invoice', async () => ({ status: 404, body: { error: 'Product not found' } })]], []);
  let res = await handle(req('POST', '/api/checkout', { email: 'a@b.co' }), e, { fetch, log() {} });
  assert.equal(res.status, 502);
  res = await handle(req('POST', '/api/checkout', { email: 'a@b.co' }), { ...e, LAVA_API_KEY: '' });
  assert.equal(res.status, 503);
});

test('claim issues a license only for COMPLETED invoices', async () => {
  const { env: e, publicJwk } = await env();
  let status = 'IN_PROGRESS';
  const fetch = fakeFetch([[`/api/v1/invoices/${INV}`, async () => ({ body: { id: INV, status, datetime: '2026-10-10T10:00:00Z', receipt: { amount: 29, currency: 'USD' }, buyer: { email: 'Buyer@Example.com' }, product: { name: 'LocalLedger Pro' } } })]], []);
  let res = await handle(req('POST', '/api/claim', { invoiceId: 'not-a-uuid' }), e, { fetch });
  assert.equal(res.status, 400);
  res = await handle(req('POST', '/api/claim', { invoiceId: INV }), e, { fetch });
  assert.equal(res.status, 202);
  status = 'FAILED';
  res = await handle(req('POST', '/api/claim', { invoiceId: INV }), e, { fetch });
  assert.equal(res.status, 402);
  status = 'COMPLETED';
  res = await handle(req('POST', '/api/claim', { invoiceId: INV }), { ...e, LAVA_PRODUCT_NAME: 'Other' }, { fetch });
  assert.equal(res.status, 403);
  res = await handle(req('POST', '/api/claim', { invoiceId: INV }), e, { fetch });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.email, 'buyer@example.com');
  const v = await verifyLicense(body.license, publicJwk);
  assert.equal(v.valid, true);
  assert.equal(v.ref, INV);
  assert.equal(v.issuedAt, Date.parse("2026-10-10T10:00:00Z") / 1000);
  // Claiming again or receiving the webhook does not double-count the sale.
  await handle(req('POST', '/api/claim', { invoiceId: INV }), e, { fetch });
  const day = JSON.parse(await e.LL_KV.get(`day:${new Date().toISOString().slice(0, 10)}`));
  assert.equal(day.ev.purchase, 1);
  assert.deepEqual(day.gross, { USD: 29 });
});

test('claim: unknown order is pending; a payment.success webhook unlocks it', async () => {
  const { env: e, publicJwk } = await env();
  const fetch = fakeFetch([[`/api/v1/invoices/${INV}`, async () => ({ status: 404, body: { error: 'not found' } })], ['api.telegram.org', async () => ({ body: {} })]], []);
  let res = await handle(req('POST', '/api/claim', { invoiceId: INV }), e, { fetch });
  assert.equal(res.status, 202);
  const payload = { eventType: 'payment.success', product: { title: 'LocalLedger Pro' }, buyer: { email: 'Paid@Example.com' }, contractId: INV, amount: 29, currency: 'USD', timestamp: '2026-10-12T10:00:00Z', status: 'completed' };
  await handle(req('POST', '/api/webhook/lava', payload, { 'X-Api-Key': 'whsec' }), e, { fetch });
  res = await handle(req('POST', '/api/claim', { invoiceId: INV }), e, { fetch });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.email, 'paid@example.com');
  assert.equal((await verifyLicense(body.license, publicJwk)).valid, true);
  const day = JSON.parse(await e.LL_KV.get(`day:${new Date().toISOString().slice(0, 10)}`));
  assert.equal(day.ev.purchase, 1, 'webhook + claim count one sale');
});

test('two products: checkout picks the offer, claim issues the matching plan', async () => {
  const { env: e, publicJwk } = await env();
  const e2 = { ...e, LAVA_PRODUCT_NAME: 'LocalLedger Pro', LAVA_OFFER_ID_IIF: 'iif-offer', LAVA_PRODUCT_NAME_IIF: 'IIF Kit Pro' };
  const calls = [];
  let productName = 'IIF Kit Pro';
  const fetch = fakeFetch([
    ['/api/v3/invoice', async () => ({ status: 201, body: { id: INV, paymentUrl: 'https://pay' } })],
    [`/api/v1/invoices/${INV}`, async () => ({ body: { id: INV, status: 'COMPLETED', receipt: { amount: 29, currency: 'USD' }, buyer: { email: 'a@b.co' }, product: { name: productName } } })],
  ], calls);
  await handle(req('POST', '/api/checkout', { email: 'a@b.co', product: 'iif' }), e2, { fetch });
  assert.equal(JSON.parse(calls[0].init.body).offerId, 'iif-offer');
  let res = await handle(req('POST', '/api/claim', { invoiceId: INV }), e2, { fetch });
  let body = await res.json();
  assert.equal(body.plan, 'iif');
  assert.equal((await verifyLicense(body.license, publicJwk)).plan, 'iif');
  productName = 'Something Else';
  res = await handle(req('POST', '/api/claim', { invoiceId: INV }), e2, { fetch });
  assert.equal(res.status, 403);
  assert.equal((await handle(req('POST', '/api/checkout', { email: 'a@b.co', product: 'iif' }), e)).status, 503, 'iif not configured');
});

test('webhook: auth required, idempotent, notifies seller', async () => {
  const { env: e } = await env();
  const calls = [];
  const fetch = fakeFetch([['api.telegram.org', async () => ({ body: { ok: true } })]], calls);
  const payload = { eventType: 'payment.success', product: { title: 'LocalLedger Pro' }, buyer: { email: 'b@x.co' }, contractId: INV, amount: 29, currency: 'USD', status: 'completed' };
  let res = await handle(req('POST', '/api/webhook/lava', payload), e, { fetch });
  assert.equal(res.status, 401);
  res = await handle(req('POST', '/api/webhook/lava', payload, { 'X-Api-Key': 'wrong' }), e, { fetch });
  assert.equal(res.status, 401);
  res = await handle(req('POST', '/api/webhook/lava', payload, { 'X-Api-Key': 'whsec' }), e, { fetch });
  assert.deepEqual(await res.json(), { ok: true });
  res = await handle(req('POST', '/api/webhook/lava', payload, { Authorization: 'Basic ' + btoa('lava:whsec') }), e, { fetch });
  assert.deepEqual(await res.json(), { ok: true, duplicate: true });
  assert.equal(calls.filter((c) => c.url.includes('telegram')).length, 1);
  assert.match(JSON.parse(calls[0].init.body).text, /New sale: 29 USD/);
  const refund = { event_id: 'r1', event_type: 'refund.success', data: { amount: 29, currency: 'USD', customer_email: 'B@x.co' } };
  res = await handle(req('POST', '/api/webhook/lava', refund, { 'X-Api-Key': 'whsec' }), e, { fetch });
  assert.equal(res.status, 200);
  assert.ok(e.LL_KV.m.has('refunded:b@x.co'));
});

test('events and stats', async () => {
  const { env: e } = await env();
  assert.equal((await handle(req('POST', '/api/event', { name: 'parse_ok' }), e)).status, 204);
  assert.equal((await handle(req('POST', '/api/event', { name: 'parse_ok' }), e)).status, 204);
  assert.equal((await handle(req('POST', '/api/event', { name: 'hack' }), e)).status, 400);
  assert.equal((await handle(req('GET', '/api/stats?token=bad'), e)).status, 401);
  const res = await handle(req('GET', '/api/stats?token=adm'), e);
  const day = new Date().toISOString().slice(0, 10);
  assert.equal((await res.json()).counts[day].parse_ok, 2);
});

test('pageviews record country, device, referrer; admin summary aggregates them', async () => {
  const { env: e } = await env();
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1';
  const pv = (body, ua) => {
    const r = req('POST', '/api/event', body, { 'User-Agent': ua });
    Object.defineProperty(r, 'cf', { value: { country: 'US' } });
    return r;
  };
  await handle(pv({ name: 'pageview', path: '/guides/convert-csv-to-qif.html', ref: 'www.Google.com', visit: true, src: 'Reddit' }, iphone), e);
  await handle(pv({ name: 'pageview', path: '/app.html', ref: '', visit: false }, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)'), e);
  await handle(pv({ name: 'pageview', path: '/' }, 'Googlebot/2.1'), e);
  const day = JSON.parse(await e.LL_KV.get(`day:${new Date().toISOString().slice(0, 10)}`));
  assert.deepEqual(day.ev, { pageview: 2, visit: 1 });
  assert.deepEqual(day.ref, { 'google.com': 1 });
  assert.deepEqual(day.src, { reddit: 1 });
  assert.deepEqual(day.cc, { US: 2 });
  assert.deepEqual(day.dev, { mobile: 1, desktop: 1 });
  assert.deepEqual(day.os, { iOS: 1, macOS: 1 });
  assert.deepEqual(day.pg, { '/guides/convert-csv-to-qif': 1, '/app': 1 });

  const payload = { eventType: 'payment.success', product: { title: 'LocalLedger Pro' }, buyer: { email: 'buyer@x.co' }, contractId: INV, amount: 29, currency: 'USD' };
  await handle(req('POST', '/api/webhook/lava', payload, { 'X-Api-Key': 'whsec' }), e, { fetch: async () => new Response('{}') });
  assert.equal((await handle(req('GET', '/api/admin/summary?days=7'), e)).status, 401);
  const res = await handle(req('GET', '/api/admin/summary?days=7', null, { Authorization: 'Bearer adm' }), e);
  const sum = await res.json();
  assert.equal(sum.current.ev.pageview, 2);
  assert.equal(sum.current.ev.purchase, 1);
  assert.deepEqual(sum.current.gross, { USD: 29 });
  assert.equal(sum.series.length, 7);
  assert.equal(sum.sales[0].email, 'b***@x.co');
  assert.equal(sum.config.licensing, true);
});

test('pubkey endpoint exposes only the public half', async () => {
  const { env: e, publicJwk } = await env();
  const body = await (await handle(req('GET', '/api/pubkey'), e)).json();
  assert.deepEqual(Object.keys(body.jwk).sort(), ['crv', 'kty', 'x', 'y']);
  assert.equal(body.jwk.x, publicJwk.x);
  assert.equal((await handle(req('GET', '/api/pubkey'), { ...e, LICENSE_PRIVATE_JWK: '' })).status, 503);
});

test('admin can issue a license manually with the bearer token', async () => {
  const { env: e, publicJwk } = await env();
  assert.equal((await handle(req('POST', '/api/admin/issue', { email: 'x@y.co' }), e)).status, 401);
  assert.equal((await handle(req('POST', '/api/admin/issue', { email: 'x@y.co' }, { Authorization: 'Bearer nope' }), e)).status, 401);
  assert.equal((await handle(req('POST', '/api/admin/issue', { email: 'bad' }, { Authorization: 'Bearer adm' }), e)).status, 400);
  const res = await handle(req('POST', '/api/admin/issue', { email: 'X@y.co', ref: 'inv-7' }, { Authorization: 'Bearer adm' }), e);
  const body = await res.json();
  const v = await verifyLicense(body.license, publicJwk);
  assert.equal(v.valid, true);
  assert.equal(v.email, 'x@y.co');
  assert.equal(v.ref, 'inv-7');
});

test('routing: 404, 405 and bad JSON', async () => {
  const { env: e } = await env();
  assert.equal((await handle(req('GET', '/api/nope'), e)).status, 404);
  assert.equal((await handle(req('GET', '/api/checkout'), e)).status, 405);
  const bad = new Request('https://ll.example/api/checkout', { method: 'POST', body: '{oops' });
  assert.equal((await handle(bad, e)).status, 400);
});
