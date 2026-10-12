import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatId, live, maybeDigest, visitText, digestText } from '../../server/telegram.js';
import { handle } from '../../server/handlers.js';

function memKv() {
  const m = new Map();
  return { m, async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v) { m.set(k, v); } };
}
function tg(calls, updates = []) {
  return async (url, init = {}) => {
    calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : {} });
    const result = String(url).endsWith('/getUpdates') ? updates : {};
    return new Response(JSON.stringify({ ok: true, result }), { headers: { 'Content-Type': 'application/json' } });
  };
}

test('chat id is taken once from the first private /start and pinned', async () => {
  const env = { TELEGRAM_BOT_TOKEN: 't', LL_KV: memKv() };
  const calls = [];
  const fetch = tg(calls, [{ message: { chat: { id: -5, type: 'group' } } }, { message: { chat: { id: 42, type: 'private' } } }]);
  assert.equal(await chatId(env, { fetch }), '42');
  assert.equal(env.LL_KV.m.get('tg:chat'), '42');
  const n = calls.length;
  assert.equal(await chatId(env, { fetch: tg(calls, [{ message: { chat: { id: 99, type: 'private' } } }]) }), '42');
  assert.equal(calls.length, n, 'pinned chat needs no more API calls');
});

test('no chat yet → nothing is sent', async () => {
  const env = { TELEGRAM_BOT_TOKEN: 't', LL_KV: memKv() };
  const calls = [];
  assert.equal(await live(env, { fetch: tg(calls, []) }, 'x'), false);
  assert.ok(!calls.some((c) => c.url.endsWith('/sendMessage')));
});

test('live alerts stop after the hourly cap', async () => {
  const env = { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1', LL_KV: memKv() };
  const calls = [];
  for (let i = 0; i < 35; i++) await live(env, { fetch: tg(calls) }, `v${i}`);
  assert.equal(calls.length, 30);
  assert.match(calls[29].body.text, /лимит уведомлений/);
});

test('daily digest is sent once per day after 21:00 MSK', async () => {
  const env = { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1', LL_KV: memKv() };
  env.LL_KV.m.set('day:2026-10-12', JSON.stringify({ ev: { visit: 5, iif_visit: 2, file_loaded: 1, purchase: 1 }, gross: { USD: 29 }, ref: { 'google.com': 3 }, cc: { US: 4 } }));
  const calls = [];
  const deps = { fetch: tg(calls) };
  assert.equal(await maybeDigest(env, deps, new Date('2026-10-12T17:59:00Z')), true, 'before 18:00 UTC it reports the previous day');
  assert.match(calls[0].body.text, /2026-10-11/);
  assert.equal(await maybeDigest(env, deps, new Date('2026-10-12T18:30:00Z')), true);
  assert.match(calls[1].body.text, /2026-10-12/);
  assert.match(calls[1].body.text, /LocalLedger: визиты 3/);
  assert.match(calls[1].body.text, /29 USD/);
  assert.equal(await maybeDigest(env, deps, new Date('2026-10-12T20:00:00Z')), false);
  assert.equal(calls.length, 2);
});

test('texts never contain file data and read in Russian', () => {
  assert.match(visitText({ path: '/app.html', ref: 'google.com', cc: 'US', dev: 'desktop', os: 'macOS' }), /Соедин[её]нные Штаты|США/);
  assert.match(digestText('2026-10-12', {}), /Итоги дня/);
});

test('event endpoint alerts on a human visit, not on curl', async () => {
  const env = { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1', LL_KV: memKv() };
  const calls = [];
  const pending = [];
  const deps = { fetch: tg(calls), waitUntil: (p) => pending.push(p) };
  const send = (headers) => handle(new Request('https://ll.example/api/event', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ name: 'pageview', path: '/', visit: true, ref: 'google.com' }) }), env, deps);
  await send({ 'User-Agent': 'curl/8.0' });
  await send({ 'User-Agent': 'Mozilla/5.0 (Macintosh) Chrome/141' });
  await send({ 'User-Agent': 'Mozilla/5.0 (Macintosh) Chrome/141', 'Accept-Language': 'en-US' });
  await Promise.all(pending);
  const visits = calls.filter((c) => /новый визит/.test(c.body.text || ''));
  assert.equal(visits.length, 1);
});
