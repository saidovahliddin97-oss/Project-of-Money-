// Deploys «Счёт за рубежом» as its own Cloudflare Pages project (own KV, own license key)
// sharing the API code in functions/ and server/.
//   npm run ship:zs      (needs CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID; LAVA_OFFER_ID_ZS once the offer exists)
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = 'schet-za-rubezhom';
const API = 'https://api.cloudflare.com/client/v4';
const { CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: ACCOUNT } = process.env;

function run(label, cmd, args, env = {}) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  if (r.status !== 0) {
    console.log(`✖ ${label}\n${out.split('\n').filter((l) => /^(not ok|✖)|Error/.test(l)).slice(0, 20).join('\n')}`);
    process.exit(1);
  }
  return out;
}

// Same guard as ship.mjs: never roll back another session's newer work.
if (!process.env.SHIP_FORCE) {
  spawnSync('git', ['fetch', '-q', 'origin'], { cwd: root });
  const heads = spawnSync('git', ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin'], { cwd: root, encoding: 'utf8' }).stdout.split('\n').filter((b) => b && !b.endsWith('/HEAD'));
  const ahead = heads.filter((b) => spawnSync('git', ['merge-base', '--is-ancestor', b, 'HEAD'], { cwd: root }).status === 1);
  if (ahead.length) {
    console.log(`✖ not deploying: ${ahead.join(', ')} has commits missing here. Merge first, or SHIP_FORCE=1.`);
    process.exit(1);
  }
}

const unit = run('unit tests', 'node', ['--test', 'tests/unit/**/*.test.mjs']);
console.log(`✔ unit tests ${(unit.match(/# pass (\d+)/) || [])[1]} passed`);
run('build', 'node', ['scripts/build-zs.mjs']);

// Telegram: reuse the owner's chat pinned in the main site's KV, so alerts work without setup.
async function ownerChat() {
  if (process.env.TELEGRAM_CHAT_ID) return process.env.TELEGRAM_CHAT_ID;
  try {
    const h = { Authorization: `Bearer ${TOKEN}` };
    const ns = await (await fetch(`${API}/accounts/${ACCOUNT}/storage/kv/namespaces?per_page=100`, { headers: h })).json();
    const main = (ns.result || []).find((n) => n.title === 'localledger-LL_KV');
    if (!main) return '';
    const r = await fetch(`${API}/accounts/${ACCOUNT}/storage/kv/namespaces/${main.id}/values/tg%3Achat`, { headers: h });
    return r.ok ? (await r.text()).trim() : '';
  } catch {
    return '';
  }
}

// The lava.top offer is found by product title, so the owner only has to create the product.
async function lavaOffer() {
  if (process.env.LAVA_OFFER_ID_ZS) return process.env.LAVA_OFFER_ID_ZS;
  if (!process.env.LAVA_API_KEY) return '';
  try {
    const d = await (await fetch('https://gate.lava.top/api/v2/products', { headers: { 'X-Api-Key': process.env.LAVA_API_KEY, Accept: 'application/json' } })).json();
    const p = (d.items || []).find((x) => /счёт за рубежом|счет за рубежом/i.test(x.title || ''));
    return p?.offers?.[0]?.id || '';
  } catch {
    return '';
  }
}

const env = {
  CF_PAGES_PROJECT: PROJECT,
  CF_PUBLIC_DIR: 'dist/zs',
  SITE_URL: '',
  SITE_LABEL: 'Счёт за рубежом',
  TELEGRAM_CHAT_ID: await ownerChat(),
  LAVA_OFFER_ID: await lavaOffer(),
  LAVA_PRODUCT_NAME: process.env.LAVA_PRODUCT_NAME_ZS || 'Счёт за рубежом — цифры для ОДДС',
  // The main site's offers must not leak into this project.
  LAVA_OFFER_ID_IIF: '', LAVA_OFFER_ID_BUNDLE: '', LAVA_OFFER_ID_PASS: '', LAVA_OFFER_ID_ONE: '',
};
const dep = run('deploy', 'node', ['scripts/deploy-cloudflare.mjs'], env);
const url = (dep.match(/Site: (\S+)/) || dep.match(/→ (https:\/\/\S+)/) || [])[1] || `https://${PROJECT}.pages.dev`;
console.log(`✔ deployed → ${url}`);
const h = await fetch(`${url}/api/health`).then((r) => r.text()).catch((e) => e.message);
console.log(`✔ health ${h}`);
console.log(`✔ ${run('indexnow', 'node', ['scripts/indexnow.mjs', 'dist/zs/sitemap.xml']).trim()}`);
