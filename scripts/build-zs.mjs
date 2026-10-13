// Builds «Счёт за рубежом» into dist/zs as a fully static site for GitHub Pages
// (Cloudflare and Vercel are throttled by Russian ISPs since June 2025; github.io opens without VPN).
// No server calls: payment happens on the lava.top product page, and lava's "after payment" link
// brings the buyer to /unlock.html#<code>. Only the code's SHA-256 is published.
//   node scripts/build-zs.mjs [--base /Project-of-Money-/]
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { dirname, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'zs');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const shared = ['assets/css/style.css', 'assets/js/ui.js', 'assets/js/core', 'assets/vendor/pdfjs', 'assets/fonts', 'assets/img/favicon.svg'];
for (const p of shared) cpSync(join(root, 'public', p), join(out, p), { recursive: true });
cpSync(join(root, 'sites', 'zs'), out, { recursive: true });
writeFileSync(join(out, '.nojekyll'), '');

// Unlock code: generated once, kept out of git (.secrets/ is ignored). Rotate by deleting the file.
const secretFile = join(root, '.secrets', 'zs-unlock-code');
if (!existsSync(secretFile)) {
  mkdirSync(dirname(secretFile), { recursive: true });
  writeFileSync(secretFile, randomBytes(12).toString('base64url'), { mode: 0o600 });
}
const code = readFileSync(secretFile, 'utf8').trim();

// Payment link: the lava.top product whose title contains «Счёт за рубежом».
async function payUrl() {
  if (process.env.ZS_PAY_URL) return process.env.ZS_PAY_URL;
  if (!process.env.LAVA_API_KEY) return '';
  try {
    const d = await (await fetch('https://gate.lava.top/api/v2/products', { headers: { 'X-Api-Key': process.env.LAVA_API_KEY, Accept: 'application/json' } })).json();
    const p = (d.items || []).find((x) => /сч[её]т за рубежом/i.test(x.title || ''));
    return p?.offers?.[0] ? `https://app.lava.top/products/${p.id}/${p.offers[0].id}?currency=RUB` : '';
  } catch {
    return '';
  }
}
const PAY_URL = await payUrl();
writeFileSync(join(out, 'assets/js/zs-config.js'), `export const ZS = ${JSON.stringify({ PAY_URL, UNLOCK_SHA256: createHash('sha256').update(code).digest('hex') })};\n`);

// Root-absolute links → relative, so the site works under any base path (e.g. /Project-of-Money-/).
function walk(dir) {
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
}
for (const file of walk(out)) {
  const ext = extname(file);
  if (!['.html', '.css'].includes(ext) && !file.endsWith('zs-app.js')) continue;
  const up = relative(dirname(file), out) || '.';
  let s = readFileSync(file, 'utf8');
  if (ext === '.html') s = s.replace(/(href|src)="\/(?!\/)/g, `$1="${up}/`);
  if (ext === '.css') s = s.replace(/url\(\/assets\//g, `url(${up}/assets/`);
  if (file.endsWith('zs-app.js')) s = s.replace("'/assets/vendor/pdfjs/pdf.worker.min.mjs'", "new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href");
  writeFileSync(file, s);
}

const SITE = process.env.ZS_SITE_URL || 'https://saidovahliddin97-oss.github.io/Project-of-Money-';
for (const f of ['index.html', 'sitemap.xml', 'robots.txt']) {
  const p = join(out, f);
  writeFileSync(p, readFileSync(p, 'utf8').replaceAll('https://schet-za-rubezhom.pages.dev', SITE));
}
console.log(`Built ${out} · pay link: ${PAY_URL ? 'yes' : 'not yet (create the lava product)'}`);
console.log(`Lava «После оплаты» link: ${SITE}/unlock.html#<code from .secrets/zs-unlock-code>`);
