import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runEngine } from '../run.mjs';
import { relevance } from '../src/score.js';
import { validateReply, templateReply, generateReply } from '../src/reply.js';
import { makeLlm } from '../src/llm.js';

const product = { name: 'LocalLedger', url: 'https://ll.example', pitch: 'a browser-based converter', limitations: 'no OCR' };
const config = {
  product,
  keywords: ['bank statement pdf to csv'],
  sources: { stackexchange: { enabled: true, sites: ['money'], perKeyword: 3 }, hackernews: { enabled: true, perKeyword: 3 }, medium: { enabled: true, tags: ['bookkeeping'] } },
  minRelevance: 0.3, maxAgeDays: 730, maxRequestsPerRun: 10, requestDelayMs: 0, maxRepliesPerRun: 10,
  linkPolicy: { stackexchange: 'disclose', hackernews: 'none', medium: 'disclose' },
};
const NOW = Date.parse('2026-10-12T00:00:00Z');
const se = { items: [
  { question_id: 1, link: 'https://money.stackexchange.com/q/1', title: 'How do I convert a PDF bank statement to CSV for QuickBooks?', body: '<p>My bank only gives PDF statements. How can I import the transactions?</p>', creation_date: NOW / 1000 - 86400 * 30, is_answered: false, score: 3 },
  { question_id: 2, link: 'https://money.stackexchange.com/q/2', title: 'Hiring a bookkeeper salary', body: '<p>job offer</p>', creation_date: NOW / 1000 - 86400, is_answered: true, score: 0 },
] };
const hn = { hits: [{ objectID: '9', title: 'Show HN: extract transactions from bank statement PDF to CSV', created_at: '2026-09-01T00:00:00Z', points: 10 }] };
const rss = '<rss><channel><item><title><![CDATA[How I import bank statement CSV into Xero]]></title><link>https://medium.com/@a/x?source=rss</link><pubDate>Mon, 01 Sep 2026 00:00:00 GMT</pubDate><content:encoded><![CDATA[<p>Convert the PDF statement then import</p>]]></content:encoded></item></channel></rss>';

function fakeFetch(overrides = {}) {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    for (const [k, v] of Object.entries(overrides)) if (String(url).includes(k)) return v();
    if (url.includes('stackexchange')) return new Response(JSON.stringify(se), { status: 200 });
    if (url.includes('algolia')) return new Response(JSON.stringify(hn), { status: 200 });
    if (url.includes('medium.com/feed')) return new Response(rss, { status: 200 });
    return new Response('{}', { status: 404 });
  };
  fn.calls = calls;
  return fn;
}

test('relevance favours real how-to questions and penalises noise', () => {
  const good = relevance({ title: se.items[0].title, text: 'My bank only gives PDF statements', keyword: 'bank statement pdf to csv', createdAt: '2026-09-01T00:00:00Z' }, { now: NOW });
  const bad = relevance({ title: 'Hiring a bookkeeper salary', text: 'job offer', keyword: 'bank statement pdf to csv', createdAt: '2026-10-01T00:00:00Z' }, { now: NOW });
  assert.ok(good > 0.6, `good=${good}`);
  assert.ok(bad < 0.2, `bad=${bad}`);
});

test('dry run: collects, dedupes, filters, drafts replies, writes nothing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'te-'));
  const r = await runEngine({ config, env: {}, fetchImpl: fakeFetch(), dataDir: dir, live: false, log() {}, now: NOW });
  assert.equal(r.errors.length, 0);
  assert.ok(r.rows.length >= 2);
  assert.ok(!r.rows.some((x) => /Hiring/.test(x.title)), 'noise filtered');
  const hnRow = r.rows.find((x) => x.source === 'hackernews');
  assert.equal(hnRow.publication_status, 'competitor_intel', 'Show HN launches are not reply targets');
  assert.equal(hnRow.generated_reply, '');
  const seRow = r.rows.find((x) => x.source.startsWith('stackexchange'));
  assert.match(seRow.generated_reply, /Disclosure: I built LocalLedger/);
  assert.ok(r.rows.filter((x) => x.source !== 'hackernews').every((x) => x.publication_status === 'needs_human_review'));
  assert.equal(existsSync(join(dir, 'opportunities.csv')), false);
});

test('live run writes CSV once and skips already-seen discussions next time', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'te-'));
  const a = await runEngine({ config, env: {}, fetchImpl: fakeFetch(), dataDir: dir, live: true, log() {}, now: NOW });
  const b = await runEngine({ config, env: {}, fetchImpl: fakeFetch(), dataDir: dir, live: true, log() {}, now: NOW });
  assert.ok(a.rows.length > 0);
  assert.equal(b.rows.length, 0);
  const csv = readFileSync(join(dir, 'opportunities.csv'), 'utf8');
  assert.match(csv.split('\n')[0], /^source,source_url,keyword,title/);
  assert.equal(csv.trim().split('\n').length >= a.rows.length + 1, true);
});

test('HTTP errors and 429 are retried a bounded number of times and reported', async () => {
  let n = 0;
  const f = fakeFetch({ algolia: () => (n++, new Response('', { status: 503, headers: { 'retry-after': '0' } })) });
  const r = await runEngine({ config, env: {}, fetchImpl: f, dataDir: mkdtempSync(join(tmpdir(), 'te-')), live: false, log() {}, now: NOW });
  assert.equal(n, 3, 'one try + two retries');
  assert.ok(r.errors.some((e) => /HTTP 503/.test(e)));
  assert.ok(r.rows.length > 0, 'other sources still work');
});

test('request budget stops the run cleanly', async () => {
  const r = await runEngine({ config: { ...config, maxRequestsPerRun: 1 }, env: {}, fetchImpl: fakeFetch(), dataDir: mkdtempSync(join(tmpdir(), 'te-')), live: false, log() {}, now: NOW });
  assert.ok(r.errors.some((e) => /budget/.test(e)));
});

test('reply validation rules', () => {
  const long = 'x'.repeat(300);
  assert.deepEqual(validateReply(long, { policy: 'none', product }), []);
  assert.ok(validateReply('short', { policy: 'none', product }).length);
  assert.ok(validateReply(long + ' https://ll.example', { policy: 'none', product }).some((p) => /must not/.test(p)));
  assert.ok(validateReply(long + ' try LocalLedger https://ll.example', { policy: 'disclose', product }).some((p) => /disclosure/.test(p)));
  assert.deepEqual(validateReply(long + ' Disclosure: I built LocalLedger https://ll.example', { policy: 'disclose', product }), []);
  assert.ok(validateReply(long + ' guaranteed results', { policy: 'none', product }).length);
  assert.ok(templateReply({ title: 'credit card statement to quickbooks', text: 'pdf' }, { policy: 'none', product }).includes('flip the signs'));
});

test('LLM self-correction: bad output is retried with reasons, then accepted', async () => {
  const outputs = ['too short', 'A'.repeat(300) + ' guaranteed', 'Here is how. ' + 'B'.repeat(300)];
  const bodies = [];
  const f = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: outputs.shift() } }], usage: { total_tokens: 100 } }), { status: 200 });
  };
  const llm = makeLlm({ baseUrl: 'https://llm.example/v1', apiKey: 'k', model: 'm', fetchImpl: f });
  const r = await generateReply({ title: 'q', text: 'pdf statement', url: 'https://x' }, { llm, policy: 'none', product });
  assert.equal(r.engine, 'llm');
  assert.equal(r.attempts, 3);
  assert.match(bodies[1].messages.at(-1).content, /too short/);
  assert.equal(llm.stats.calls, 3);
});

test('LLM gives up after 3 attempts and on quota errors, falling back to the template', async () => {
  const f429 = async () => new Response('{}', { status: 429 });
  const llm = makeLlm({ baseUrl: 'https://llm.example/v1', apiKey: 'k', model: 'm', fetchImpl: f429 });
  const r1 = await generateReply({ title: 'q', text: 'pdf', url: 'https://x' }, { llm, policy: 'none', product });
  assert.equal(r1.engine, 'template');
  assert.match(r1.error, /429/);
  const r2 = await generateReply({ title: 'q2', text: 'pdf', url: 'https://x' }, { llm, policy: 'none', product });
  assert.equal(llm.stats.calls, 1, 'no further calls after quota stop');
  assert.equal(r2.engine, 'template');

  const fbad = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'bad' } }] }), { status: 200 });
  const llm2 = makeLlm({ baseUrl: 'https://llm.example/v1', apiKey: 'k', model: 'm', fetchImpl: fbad });
  const r3 = await generateReply({ title: 'q', text: 'pdf', url: 'https://x' }, { llm: llm2, policy: 'none', product });
  assert.equal(llm2.stats.calls, 2, 'identical corrective retry is served from cache, not re-billed');
  assert.equal(r3.engine, 'template');
  assert.match(r3.error, /rejected/);
});
