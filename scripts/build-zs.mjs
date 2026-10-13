// Builds the «Счёт за рубежом» site into dist/zs: its own pages from sites/zs plus the
// shared engine (parser, pdf.js, license/checkout, design system) copied from public/.
//   node scripts/build-zs.mjs
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'zs');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const shared = [
  'assets/css/style.css', 'assets/js/ui.js', 'assets/js/pv.js', 'assets/js/track.js', 'assets/js/pro.js',
  'assets/js/config.js', 'assets/js/license-pubkey.js', 'assets/js/core', 'assets/vendor/pdfjs', 'assets/fonts', 'assets/img/favicon.svg',
];
for (const p of shared) cpSync(join(root, 'public', p), join(out, p), { recursive: true });
cpSync(join(root, 'sites', 'zs'), out, { recursive: true });
// IndexNow key (Bing/Yandex) — same key file as the main site.
const key = readFileSync(join(root, '.indexnow-key'), 'utf8').trim();
writeFileSync(join(out, `${key}.txt`), key);
// Same security headers as the main site.
writeFileSync(join(out, '_headers'), readFileSync(join(root, 'public', '_headers'), 'utf8'));
console.log(`Built ${out}`);
