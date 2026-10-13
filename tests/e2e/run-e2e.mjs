// Browser end-to-end test: real Chromium, real pdf.js, local API, and a fake
// lava.top that mimics the documented invoice API. Run: npm run test:e2e
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startServer, memoryKv } from '../../scripts/dev-server.mjs';
import { generateKeyPair } from '../../public/assets/js/core/license.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const outDir = join(here, 'output');
mkdirSync(outDir, { recursive: true });
const fixtures = join(root, 'tests', 'fixtures', 'pdf');
if (!existsSync(join(fixtures, 'us.pdf'))) execFileSync(process.execPath, [join(root, 'tests', 'fixtures', 'make-pdfs.mjs')]);

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  const require = createRequire(import.meta.url);
  const globalRoot = execFileSync('npm', ['root', '-g']).toString().trim();
  ({ chromium } = require(join(globalRoot, 'playwright')));
}

// ---- fake lava.top -----------------------------------------------------------
const invoices = new Map();
const LAVA_PORT = 9911;
const APP_PORT = 8799;
const lava = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${LAVA_PORT}`);
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.headers['x-api-key'] !== 'test-lava-key' && !url.pathname.startsWith('/pay/')) return send(401, { error: 'bad key' });
  if (req.method === 'POST' && url.pathname === '/api/v3/invoice') {
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    const id = randomUUID();
    invoices.set(id, { body, status: 'NEW' });
    return send(201, { id, status: 'in-progress', paymentUrl: `http://localhost:${LAVA_PORT}/pay/${id}` });
  }
  if (req.method === 'GET' && url.pathname.startsWith('/pay/')) {
    const inv = invoices.get(url.pathname.slice(5));
    inv.status = 'COMPLETED';
    res.writeHead(302, { Location: inv.body.successful_return_url });
    return res.end();
  }
  const m = url.pathname.match(/^\/api\/v1\/invoices\/(.+)$/);
  if (req.method === 'GET' && m) {
    const inv = invoices.get(m[1]);
    if (!inv) return send(404, { error: 'not found' });
    return send(200, {
      id: m[1], status: inv.status, datetime: new Date().toISOString(),
      receipt: { amount: 29, currency: inv.body.currency, fee: 2.32 },
      buyer: { email: inv.body.email }, product: { name: 'LocalLedger Pro', offer: 'Lifetime' },
    });
  }
  send(404, { error: 'no route' });
});
await new Promise((r) => lava.listen(LAVA_PORT, r));

const { privateJwk } = await generateKeyPair();
const kv = memoryKv();
const app = await startServer({
  port: APP_PORT,
  quiet: true,
  env: {
    LAVA_API_KEY: 'test-lava-key', LAVA_OFFER_ID: '836b9fc5-7ae9-4a27-9642-592bc44072b7', LAVA_API_BASE: `http://localhost:${LAVA_PORT}`,
    LICENSE_PRIVATE_JWK: JSON.stringify(privateJwk), SITE_URL: `http://localhost:${APP_PORT}`, LAVA_PRODUCT_NAME: 'LocalLedger Pro', LL_KV: kv,
  },
});
const BASE = `http://localhost:${APP_PORT}`;

// A regular desktop UA: the analytics endpoint ignores headless/bot user agents.
const browser = await chromium.launch({ args: ['--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'] });
const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
    console.log('PASS', name);
  } catch (e) {
    results.push(['FAIL', name, e.message]);
    console.log('FAIL', name, '\n  ', e.message);
  }
};

try {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await step('landing page renders without errors', async () => {
    await page.goto(BASE + '/');
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.screenshot({ path: join(outDir, 'landing-desktop.png'), fullPage: true });
    assert.deepEqual(errors, []);
  });

  await step('statement dropped on the landing page opens parsed in the converter', async () => {
    await page.goto(BASE + '/');
    await page.setInputFiles('#home-file', join(fixtures, 'us.pdf'));
    await page.waitForURL(/\/app/);
    await page.waitForFunction(() => document.querySelectorAll('#txn-body tr').length === 8, null, { timeout: 15000 });
    assert.match(await page.locator('.file-meta').first().textContent(), /balances reconcile/);
    assert.ok(!page.url().includes('#handoff'), 'hash is cleared so a reload does not re-add files');
    assert.deepEqual(errors, []);
  });

  await step('US PDF parses into 8 reconciled rows', async () => {
    await page.goto(BASE + '/app.html');
    await page.setInputFiles('#file-input', join(fixtures, 'us.pdf'));
    await page.waitForFunction(() => document.querySelectorAll('#txn-body tr').length === 8, null, { timeout: 15000 });
    const meta = await page.locator('.file-meta').first().textContent();
    assert.match(meta, /8 transactions/);
    assert.match(meta, /balances reconcile/);
    assert.equal(await page.locator('#t-net').textContent(), '998.18');
    assert.deepEqual(errors, []);
  });

  await step('free export of a small file downloads every row (CSV)', async () => {
    await page.selectOption('#export-format', 'csv');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
    const text = readFileSync(await dl.path(), 'utf8');
    assert.equal(text.trim().split(/\r?\n/).length, 9);
    assert.match(text, /RENT PAYMENT ONLINE TRANSFER REF 99812 CONFIRMATION 5512/);
  });

  await step('editing a row and flipping its sign updates totals', async () => {
    const amt = page.locator('#txn-body tr').nth(2).locator('input').nth(2);
    await amt.fill('-5.00');
    await amt.press('Tab');
    assert.equal(await page.locator('#t-net').textContent(), '997.68');
    await page.locator('#txn-body tr').nth(2).getByRole('button', { name: 'Flip sign' }).click();
    assert.equal(await page.locator('#t-net').textContent(), '1,007.68');
  });

  await step('multiple PDFs (UK, card, EU) and CSV load together', async () => {
    writeFileSync(join(outDir, 'bank.csv'), 'Date,Description,Amount\n02/01/2026,Client payment,1500.00\n02/03/2026,Software subscription,-49.00\n');
    await page.setInputFiles('#file-input', [join(fixtures, 'uk.pdf'), join(fixtures, 'card.pdf'), join(fixtures, 'eu.pdf'), join(outDir, 'bank.csv')]);
    await page.waitForFunction(() => document.querySelectorAll('#txn-body tr').length === 8 + 6 + 5 + 3 + 2, null, { timeout: 15000 });
    const metas = await page.locator('.file-meta').allTextContents();
    assert.equal(metas.filter((m) => /balances reconcile/.test(m)).length, 4, metas.join(' | '));
    assert.ok(metas.some((m) => /credit card/.test(m)));
    await page.screenshot({ path: join(outDir, 'app-desktop.png'), fullPage: true });
  });

  await step('large export is gated: dialog offers free 15 rows', async () => {
    await page.selectOption('#export-format', 'xlsx');
    await page.click('#btn-export');
    await page.locator('#pro-dialog[open]').waitFor();
    await page.screenshot({ path: join(outDir, 'pro-dialog.png') });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#free-download')]);
    const file = join(outDir, 'free.xlsx');
    await dl.saveAs(file);
    const rows = execFileSync('python3', ['-I', '-c', 'import openpyxl,sys;print(openpyxl.load_workbook(sys.argv[1]).active.max_row)', file]).toString().trim();
    assert.equal(rows, '16');
  });

  await step('checkout → fake lava.top → success page issues a license', async () => {
    await page.click('#btn-export');
    await page.locator('#pro-dialog[open]').waitFor();
    await page.fill('#checkout-form input[name=email]', 'Buyer@Example.com');
    await page.selectOption('#checkout-currency', 'EUR');
    await Promise.all([page.waitForURL('**/success.html', { timeout: 15000 }), page.click('#checkout-form button[type=submit]')]);
    await page.locator('[data-state=done]:not([hidden])').waitFor({ timeout: 15000 }).catch(async (e) => {
      throw new Error(e.message.split('\n')[0] + ' | page: ' + (await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 400));
    });
    const key = await page.inputValue('#license');
    assert.match(key, /^LL1\./);
    assert.equal(await page.locator('#license-email').textContent(), 'buyer@example.com');
    const sent = [...invoices.values()][0].body;
    assert.equal(sent.currency, 'EUR');
    assert.equal(sent.offerId, '836b9fc5-7ae9-4a27-9642-592bc44072b7');
    await page.screenshot({ path: join(outDir, 'success.png') });
  });

  await step('Pro unlocks unlimited export (OFX with all rows)', async () => {
    await page.goto(BASE + '/app.html');
    await page.locator('#pro-badge:not([hidden])').waitFor();
    await page.setInputFiles('#file-input', [join(fixtures, 'us.pdf'), join(fixtures, 'uk.pdf'), join(fixtures, 'card.pdf')]);
    await page.waitForFunction(() => document.querySelectorAll('#txn-body tr').length === 19, null, { timeout: 15000 });
    await page.selectOption('#export-format', 'ofx');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
    const ofx = readFileSync(await dl.path(), 'utf8');
    assert.equal((ofx.match(/<STMTTRN>/g) || []).length, 19);
  });

  await step('license key activates in a fresh browser profile', async () => {
    const key = await page.evaluate(() => localStorage.getItem('ll_license'));
    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    await p2.goto(BASE + '/app.html');
    await p2.click('#upgrade-btn');
    await p2.click('#pro-dialog summary');
    await p2.fill('#activate-form textarea', key);
    await p2.click('#activate-form button');
    await p2.locator('#pro-badge:not([hidden])').waitFor();
    await p2.click('#upgrade-btn', { trial: true }).catch(() => {});
    await ctx2.close();
  });

  await step('forged license is rejected', async () => {
    const ctx3 = await browser.newContext();
    const p3 = await ctx3.newPage();
    await p3.goto(BASE + '/app.html');
    await p3.click('#upgrade-btn');
    await p3.click('#pro-dialog summary');
    await p3.fill('#activate-form textarea', 'LL1.eyJ2IjoxLCJlIjoieEB5LnoifQ.AAAA');
    await p3.click('#activate-form button');
    await p3.locator('#activate-msg.error').waitFor();
    assert.equal(await p3.locator('#pro-badge').isHidden(), true);
    await ctx3.close();
  });

  await step('scanned PDF shows a helpful error', async () => {
    const ctx4 = await browser.newContext();
    const p4 = await ctx4.newPage();
    await p4.goto(BASE + '/app.html');
    await p4.setInputFiles('#file-input', join(fixtures, 'scan.pdf'));
    await p4.locator('.file-meta.bad').waitFor();
    assert.match(await p4.locator('.file-meta').textContent(), /no text layer/);
    await ctx4.close();
  });

  await step('mobile layout: no horizontal scroll on key pages', async () => {
    const m = await browser.newContext({ viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true });
    const mp = await m.newPage();
    for (const path of ['/', '/app.html', '/iif.html', '/guides/', '/guides/import-bank-statement-into-quickbooks-online.html', '/success.html', '/privacy.html']) {
      await mp.goto(BASE + path);
      const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 1, `${path} overflows by ${overflow}px`);
    }
    await mp.goto(BASE + '/');
    await mp.screenshot({ path: join(outDir, 'landing-mobile.png'), fullPage: true });
    await mp.goto(BASE + '/app.html');
    await mp.setInputFiles('#file-input', join(fixtures, 'us.pdf'));
    await mp.waitForFunction(() => document.querySelectorAll('#txn-body tr').length === 8);
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `app with table overflows by ${overflow}px`);
    await mp.screenshot({ path: join(outDir, 'app-mobile.png'), fullPage: true });
    await m.close();
  });

  await step('no file content is sent to the server', async () => {
    const ctx5 = await browser.newContext();
    const p5 = await ctx5.newPage();
    const posts = [];
    p5.on('request', (r) => {
      if (r.method() === 'POST') posts.push({ url: r.url(), body: r.postData() || '' });
    });
    await p5.goto(BASE + '/app.html');
    await p5.setInputFiles('#file-input', join(fixtures, 'us.pdf'));
    await p5.waitForFunction(() => document.querySelectorAll('#txn-body tr').length === 8);
    await p5.waitForTimeout(300);
    for (const p of posts) {
      assert.match(p.url, /\/api\/event$/, `unexpected POST ${p.url}`);
      assert.ok(!/PAYROLL|RENT|3,200|XXXXXX1234/.test(p.body), 'statement data leaked: ' + p.body);
    }
    await ctx5.close();
  });

  await step('server-side counters recorded the funnel', async () => {
    const day = new Date().toISOString().slice(0, 10);
    const blob = JSON.parse(await kv.get(`day:${day}`));
    assert.ok(blob.ev.parse_ok >= 1);
    assert.ok(blob.ev.checkout_start >= 1);
    assert.ok(blob.ev.pageview >= 1, 'page views are counted');
  });

  await step('IIF Kit: sample CSV → rules → valid IIF download', async () => {
    const p6 = await browser.newPage();
    const errs = [];
    p6.on('pageerror', (e) => errs.push(e.message));
    await p6.goto(BASE + '/iif.html');
    await p6.click('#btn-sample');
    await p6.waitForFunction(() => document.querySelectorAll('#txn-body tr').length === 4, null, { timeout: 15000 });
    const accounts = await p6.locator('#txn-body input').evaluateAll((els) => els.map((e) => e.value));
    assert.deepEqual(accounts, ['Automobile:Fuel', 'Ask My Accountant', 'Office Supplies', 'Payroll Expenses']);
    const [dl] = await Promise.all([p6.waitForEvent('download'), p6.click('#btn-export')]);
    const iif = readFileSync(await dl.path(), 'utf8');
    assert.ok(iif.startsWith('!TRNS\tTRNSTYPE'));
    assert.match(iif, /TRNS\tCHECK\t1\/3\/2026\tChecking\t\t-45.10/);
    assert.match(iif, /SPL\tDEPOSIT\t1\/5\/2026\tAsk My Accountant\t\t-1200.00/);
    assert.deepEqual(errs, []);
    await p6.close();
  });

  await step('no browser errors during the run', async () => {
    assert.deepEqual(errors.filter((e) => !/favicon/.test(e)), []);
  });
} finally {
  await browser.close();
  app.close();
  lava.close();
}

const failed = results.filter((r) => r[0] === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} e2e checks passed`);
process.exit(failed.length ? 1 : 0);
