// Records vertical (1080x1920) product demos of the live site for YouTube
// Shorts, following common Shorts practice: hook text in the first second,
// 15–20 s, big captions, an ending that loops back to the start. Each video is
// saved twice: with an original synthesized music bed (scripts/make-music.py,
// no third-party rights) and silent (to add a trending sound in the YouTube app).
//   node scripts/record-demo.mjs [siteUrl] [variant]
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.argv[2] || 'https://localledger-40f.pages.dev';
const ONLY = process.argv[3];
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = require(join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')));
}
const fixtures = join(root, 'tests', 'fixtures', 'pdf');
try {
  readdirSync(fixtures);
} catch {
  execFileSync(process.execPath, [join(root, 'tests', 'fixtures', 'make-pdfs.mjs')]);
}

// Captions are drawn through the CSSOM (the site's CSP forbids inline styles in markup).
let recStart = 0;
let firstCaptionAt = null;
async function caption(page, text, ms, { pos = 'top', color = 'rgba(15,118,110,0.96)' } = {}) {
  ms += 300;
  await page.evaluate(
    ([t, p, c]) => {
      let el = document.getElementById('demo-cap');
      if (!el) {
        el = document.createElement('div');
        el.id = 'demo-cap';
        Object.assign(el.style, { position: 'fixed', left: '14px', right: '14px', zIndex: 9999, color: '#fff', font: '800 30px/1.2 system-ui, sans-serif', padding: '18px 18px', borderRadius: '18px', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,.35)', letterSpacing: '-0.5px' });
        document.body.append(el);
      }
      el.textContent = t;
      el.style.background = c;
      el.style.top = p === 'top' ? '9%' : p === 'mid' ? '40%' : '';
      el.style.bottom = p === 'bottom' ? '12%' : '';
      el.style.display = 'block';
    },
    [text, pos, color],
  );
  if (firstCaptionAt === null) firstCaptionAt = (Date.now() - recStart) / 1000;
  await page.waitForTimeout(ms);
}
const hideCaption = (page) => page.evaluate(() => document.getElementById('demo-cap')?.style.setProperty('display', 'none'));
const RED = 'rgba(180,35,24,0.96)';

const VARIANTS = {
  'retyping': async (page) => {
    await page.goto(`${SITE}/app`);
    await caption(page, 'Still retyping bank statements? 😩', 1500, { color: RED });
    await page.click('#btn-sample');
    await page.waitForFunction(() => document.querySelectorAll('#txn-body tr').length > 0, null, { timeout: 30000 });
    await caption(page, 'Drop the PDF → every transaction ✅', 1800);
    await page.locator('#review-section').scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 400);
    await caption(page, 'Checked against the statement balance', 1800);
    await page.locator('#export-section').scrollIntoViewIfNeeded();
    await page.selectOption('#export-format', 'qbo_csv');
    await caption(page, 'Export for QuickBooks · Xero · Excel', 1800);
    await caption(page, 'Nothing uploaded. Runs in your browser 🔒', 1800, { pos: 'mid' });
    await caption(page, 'Free preview — link in bio', 1600, { pos: 'mid' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await hideCaption(page);
    await page.waitForTimeout(500);
  },
  'privacy': async (page) => {
    await page.goto(`${SITE}/app`);
    await caption(page, 'Where does your bank statement go when you "convert" it online? 🤔', 2000, { color: RED });
    await caption(page, 'Here: nowhere. It never leaves your computer.', 1800);
    await page.click('#btn-sample');
    await page.waitForFunction(() => document.querySelectorAll('#txn-body tr').length > 0, null, { timeout: 30000 });
    await page.locator('.file-meta').first().scrollIntoViewIfNeeded();
    await caption(page, 'Read inside your browser — 0 uploads', 1800, { pos: 'bottom' });
    await page.locator('#review-section').scrollIntoViewIfNeeded();
    await caption(page, 'Review every row before export', 1600, { pos: 'bottom' });
    await caption(page, 'Bank statement converter — link in bio', 1700, { pos: 'mid' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await hideCaption(page);
    await page.waitForTimeout(500);
  },
  'credit-card': async (page) => {
    await page.goto(`${SITE}/app`);
    await caption(page, 'Your credit card statement is BACKWARDS 🙃', 1700, { color: RED });
    await page.setInputFiles('#file-input', join(fixtures, 'card.pdf'));
    await page.waitForFunction(() => document.querySelectorAll('#txn-body tr').length > 0, null, { timeout: 30000 });
    await page.locator('.file-meta').first().scrollIntoViewIfNeeded();
    await caption(page, 'Purchases print as +, your books need −', 1800, { pos: 'bottom' });
    await page.locator('#review-section').scrollIntoViewIfNeeded();
    await caption(page, 'Detected as a card → signs flipped ✅', 1800, { pos: 'bottom' });
    await page.locator('#export-section').scrollIntoViewIfNeeded();
    await page.selectOption('#export-format', 'xero_csv');
    await caption(page, 'Export for Xero / QuickBooks — link in bio', 1800, { pos: 'mid' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await hideCaption(page);
    await page.waitForTimeout(500);
  },
  'iif-desktop': async (page) => {
    await page.goto(`${SITE}/iif`);
    await caption(page, 'QuickBooks Desktop won\'t import your bank CSV? 😤', 1800, { color: RED });
    await page.click('#btn-sample');
    await page.waitForFunction(() => document.querySelectorAll('#txn-body tr').length > 0, null, { timeout: 30000 });
    await page.locator('.iif-settings').scrollIntoViewIfNeeded();
    await caption(page, 'Rules: "shell => Fuel" — done', 1800, { pos: 'bottom' });
    await page.locator('#review-section').scrollIntoViewIfNeeded();
    await caption(page, 'Every row mapped to your accounts', 1700, { pos: 'top' });
    await page.locator('#export-section').scrollIntoViewIfNeeded();
    await caption(page, 'Download .IIF → File › Utilities › Import', 1900, { pos: 'mid' });
    await caption(page, 'IIF Kit — link in bio', 1500, { pos: 'mid' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await hideCaption(page);
    await page.waitForTimeout(500);
  },
};

const outDir = join(root, 'marketing', 'videos');
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--user-agent=Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1 LocalLedgerDemo'] });
let seed = 3;
for (const [name, play] of Object.entries(VARIANTS)) {
  if (ONLY && ONLY !== name) continue;
  const tmp = mkdtempSync(join(tmpdir(), 'rec-'));
  const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, recordVideo: { dir: tmp, size: { width: 540, height: 960 } } });
  const page = await ctx.newPage();
  recStart = Date.now();
  firstCaptionAt = null;
  await play(page);
  await ctx.close();
  const webm = join(tmp, readdirSync(tmp).find((f) => f.endsWith('.webm')));
  const silent = join(outDir, `${name}-silent.mp4`);
  // start exactly at the hook caption (skips page loading), upscale to 1080x1920
  const start = Math.max(0, (firstCaptionAt || 0.7) + 0.15).toFixed(2);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', start, '-i', webm, '-vf', 'scale=1080:1920:flags=lanczos', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-preset', 'veryfast', '-movflags', '+faststart', '-an', silent]);
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', silent]).toString());
  const wav = join(tmp, 'music.wav');
  execFileSync('python3', [join(root, 'scripts', 'make-music.py'), wav, String(Math.ceil(dur)), String(seed++)]);
  const withMusic = join(outDir, `${name}-music.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', wav, '-filter_complex', '[1:a]loudnorm=I=-18:TP=-3:LRA=11,afade=t=out:st=' + (dur - 0.8).toFixed(2) + ':d=0.8[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', withMusic]);
  console.log(`saved ${name}: ${dur.toFixed(1)} s`);
}
await browser.close();
