// Copies the pdf.js browser build from node_modules into public/assets/vendor/pdfjs
// so the site has no runtime CDN dependency.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'pdfjs-dist', 'build');
const dest = join(root, 'public', 'assets', 'vendor', 'pdfjs');

if (!existsSync(src)) {
  console.error('pdfjs-dist is not installed; run `npm install` first.');
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  cpSync(join(src, f), join(dest, f));
}
cpSync(join(root, 'node_modules', 'pdfjs-dist', 'LICENSE'), join(dest, 'LICENSE'));
console.log('pdf.js copied to public/assets/vendor/pdfjs');
