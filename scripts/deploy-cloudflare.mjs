// One-command deploy to Cloudflare Pages (free plan).
//
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node scripts/deploy-cloudflare.mjs
//
// Token permissions: Account → Cloudflare Pages: Edit, Account → Workers KV Storage: Edit.
// What it does (safe to re-run):
//   1. creates the Pages project (default name "localledger") if missing
//   2. creates the KV namespace for counters/webhook idempotency and binds it as LL_KV
//   3. generates the license signing key once and stores it as an encrypted secret
//      (it is never printed; use POST /api/admin/issue to issue keys by hand)
//   4. copies optional settings from your environment into the project:
//      LAVA_API_KEY, LAVA_OFFER_ID, LAVA_PRODUCT_NAME, LAVA_WEBHOOK_SECRET,
//      TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ADMIN_TOKEN
//   5. uploads public/ + functions/ with wrangler and checks /api/health
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyPair } from '../public/assets/js/core/license.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const PROJECT = process.env.CF_PAGES_PROJECT || 'localledger';
const BRANCH = 'main';
const COMPAT_DATE = '2026-09-01';
const WRANGLER = 'wrangler@4.139.0';
const API = process.env.CF_API_BASE || 'https://api.cloudflare.com/client/v4'; // overridable for tests
const SECRET_KEYS = ['LAVA_API_KEY', 'LAVA_WEBHOOK_SECRET', 'TELEGRAM_BOT_TOKEN', 'ADMIN_TOKEN'];
const PLAIN_KEYS = ['LAVA_OFFER_ID', 'LAVA_PRODUCT_NAME', 'TELEGRAM_CHAT_ID'];

if (!TOKEN || !ACCOUNT) {
  console.error('Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (see docs/DEPLOY.md).');
  process.exit(1);
}

async function cf(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok && data.success !== false, data };
}

function fail(step, r) {
  const errs = (r.data?.errors || []).map((e) => `${e.code}: ${e.message}`).join('; ');
  console.error(`✖ ${step} failed (HTTP ${r.status}) ${errs}`);
  process.exit(1);
}

// 0. token check
const verify = await cf('GET', `/accounts/${ACCOUNT}/tokens/verify`);
const verifyUser = verify.ok ? verify : await cf('GET', '/user/tokens/verify');
if (!verifyUser.ok) fail('Token verification', verifyUser);
console.log('✔ API token is valid');

// 1. project
let proj = await cf('GET', `/accounts/${ACCOUNT}/pages/projects/${PROJECT}`);
if (proj.status === 404 || (!proj.ok && proj.data?.errors?.some((e) => e.code === 8000007))) {
  const created = await cf('POST', `/accounts/${ACCOUNT}/pages/projects`, { name: PROJECT, production_branch: BRANCH });
  if (!created.ok) fail('Creating Pages project', created);
  proj = await cf('GET', `/accounts/${ACCOUNT}/pages/projects/${PROJECT}`);
  console.log(`✔ Created Pages project "${PROJECT}"`);
}
if (!proj.ok) fail('Reading Pages project', proj);
const subdomain = proj.data.result.subdomain;
const siteUrl = process.env.SITE_URL || `https://${subdomain}`;
console.log(`✔ Project "${PROJECT}" → ${siteUrl}`);

// 2. KV namespace
const kvTitle = `${PROJECT}-LL_KV`;
const list = await cf('GET', `/accounts/${ACCOUNT}/storage/kv/namespaces?per_page=100`);
if (!list.ok) fail('Listing KV namespaces', list);
let ns = list.data.result.find((n) => n.title === kvTitle);
if (!ns) {
  const made = await cf('POST', `/accounts/${ACCOUNT}/storage/kv/namespaces`, { title: kvTitle });
  if (!made.ok) fail('Creating KV namespace', made);
  ns = made.data.result;
  console.log(`✔ Created KV namespace ${kvTitle}`);
}

// 3–4. variables and secrets
const existing = proj.data.result.deployment_configs?.production?.env_vars || {};
const envVars = { SITE_URL: { type: 'plain_text', value: siteUrl } };
if (!existing.LICENSE_PRIVATE_JWK) {
  const { privateJwk } = await generateKeyPair();
  envVars.LICENSE_PRIVATE_JWK = { type: 'secret_text', value: JSON.stringify(privateJwk) };
  console.log('✔ Generated a new license signing key (stored only as a Cloudflare secret)');
} else {
  console.log('✔ License signing key already set — keeping it');
}
for (const k of SECRET_KEYS) if (process.env[k]) envVars[k] = { type: 'secret_text', value: process.env[k] };
for (const k of PLAIN_KEYS) if (process.env[k]) envVars[k] = { type: 'plain_text', value: process.env[k] };

const config = { compatibility_date: COMPAT_DATE, env_vars: envVars, kv_namespaces: { LL_KV: { namespace_id: ns.id } } };
const patched = await cf('PATCH', `/accounts/${ACCOUNT}/pages/projects/${PROJECT}`, {
  production_branch: BRANCH,
  deployment_configs: { production: config, preview: config },
});
if (!patched.ok) fail('Updating project settings', patched);
console.log(`✔ Settings updated: ${Object.keys(envVars).join(', ')}, KV binding LL_KV`);

// 5. upload
console.log('… Uploading site and functions with wrangler');
if (process.env.CF_SKIP_UPLOAD) {
  console.log('(upload skipped)');
  process.exit(0);
}
const run = spawnSync('npx', ['-y', WRANGLER, 'pages', 'deploy', 'public', '--project-name', PROJECT, '--branch', BRANCH, '--commit-dirty=true'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: ACCOUNT },
});
if (run.status !== 0) {
  console.error('✖ wrangler pages deploy failed');
  process.exit(1);
}

// 6. smoke check (the production alias can take a few seconds to update)
for (let i = 0; i < 12; i++) {
  try {
    const r = await fetch(`${siteUrl}/api/health`, { cache: 'no-store' });
    if (r.ok) {
      const h = await r.json();
      console.log(`✔ ${siteUrl}/api/health → ${JSON.stringify(h)}`);
      if (h.licensing && h.events) break;
    }
  } catch {
    /* DNS for a brand-new *.pages.dev name may take a moment */
  }
  await new Promise((r) => setTimeout(r, 5000));
}
console.log(`\nDone. Site: ${siteUrl}\nNext: SITE_URL=${siteUrl} npm run guides  (updates canonical links and sitemap)`);
