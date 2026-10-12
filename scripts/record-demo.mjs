// Records a vertical (1080x1920) product demo of the live site with on-screen
// captions, for YouTube Shorts / Reels / TikTok. Output: marketing/videos/*.mp4
//   node scripts/record-demo.mjs [siteUrl]
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.argv[2] || 'https://localledger-40f.pages.dev';
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = require(join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')));
}

const tmp = mkdtempSync(join(tmpdir(), 'rec-'));
const browser = await chromium.launch({ args: ['--user-agent=Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1 LocalLedgerDemo'] });
const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, recordVideo: { dir: tmp, size: { width: 540, height: 960 } } });
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);
// Captions are drawn through the CSSOM (the site's CSP forbids inline styles in markup).
async function caption(text, ms = 2200) {
  await page.evaluate((t) => {
    let el = document.getElementById('demo-cap');
    if (!el) {
      el = document.createElement('div');
      el.id = 'demo-cap';
      Object.assign(el.style, { position: 'fixed', left: '16px', right: '16px', top: '38%', zIndex: 9999, background: 'rgba(15,118,110,0.95)', color: '#fff', font: '700 26px/1.25 system-ui, sans-serif', padding: '18px 20px', borderRadius: '16px', textAlign: 'center', boxShadow: '0 8px 30px rgba(0,0,0,.3)' });
      document.body.append(el);
    }
    el.textContent = t;
    el.style.display = 'block';
  }, text);
  await wait(ms);
  await page.evaluate(() => {
    const el = document.getElementById('demo-cap');
    if (el) el.style.display = 'none';
  });
}

await page.goto(`${SITE}/app`);
await caption('Bank statement PDF → QuickBooks in 10 seconds', 2600);
await caption('No upload. It runs in your browser.', 2200);
await page.click('#btn-sample');
await page.waitForFunction(() => document.querySelectorAll('#txn-body tr').length > 0, null, { timeout: 30000 });
await wait(800);
await page.locator('.file-meta').first().scrollIntoViewIfNeeded();
await caption('✓ Totals checked against the statement balance', 2400);
await page.locator('#review-section').scrollIntoViewIfNeeded();
await wait(1200);
await page.mouse.wheel(0, 500);
await wait(1200);
await caption('Edit any row before export', 1800);
await page.locator('#export-section').scrollIntoViewIfNeeded();
await page.selectOption('#export-format', 'qbo_csv');
await wait(900);
await caption('Excel · CSV · QuickBooks · Xero · QIF · OFX', 2400);
await caption('Free preview → localledger-40f.pages.dev', 2800);
await ctx.close();
await browser.close();

const webm = readdirSync(tmp).find((f) => f.endsWith('.webm'));
const outDir = join(root, 'marketing', 'videos');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, 'demo-statement-to-quickbooks.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '0.8', '-i', join(tmp, webm), '-vf', 'scale=1080:1920:flags=lanczos', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-preset', 'veryfast', '-movflags', '+faststart', out]);
console.log('saved', out);
