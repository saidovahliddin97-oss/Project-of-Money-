// Pings Bing/Yandex (IndexNow) with every URL in public/sitemap.xml.
//   node scripts/indexnow.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const key = readFileSync(join(root, '.indexnow-key'), 'utf8').trim();
// Optional argument: another sitemap (e.g. dist/zs/sitemap.xml for «Счёт за рубежом»).
const urls = [...readFileSync(join(root, process.argv[2] || 'public/sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const host = new URL(urls[0]).host;
const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host, key, keyLocation: `https://${host}/${key}.txt`, urlList: urls }),
});
console.log(`IndexNow: HTTP ${res.status} for ${urls.length} URLs`);
