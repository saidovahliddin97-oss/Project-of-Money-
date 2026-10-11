// Build → test → deploy → ping search engines → health check, with terse output
// (designed so an automated agent spends as few tokens as possible).
//   npm run ship            (full: also runs browser e2e if app code changed)
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.env.SITE_URL || 'https://localledger-40f.pages.dev';

function run(label, cmd, args, env = {}) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  if (r.status !== 0) {
    console.log(`✖ ${label}\n${out.split('\n').filter((l) => /^(not ok|FAIL|✖)|Error:|^\s+\S.*(expected|actual)/.test(l)).slice(0, 25).join('\n')}`);
    process.exit(1);
  }
  return out;
}

run('guides', 'node', ['scripts/build-guides.mjs'], { SITE_URL: SITE });
const unit = run('unit tests', 'node', ['--test', 'tests/unit/**/*.test.mjs']);
console.log(`✔ unit tests ${(unit.match(/# pass (\d+)/) || [])[1]} passed`);

const changed = spawnSync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout;
if (/public\/assets\/js|server\/|public\/app\.html/.test(changed) || process.argv.includes('--e2e')) {
  const e2e = run('e2e', 'node', ['tests/e2e/run-e2e.mjs']);
  console.log(`✔ ${(e2e.match(/\d+\/\d+ e2e checks passed/) || ['e2e passed'])[0]}`);
} else {
  console.log('• e2e skipped (no app code changes)');
}

// deploy-cloudflare.mjs also syncs settings from the environment (e.g. a new
// ADMIN_TOKEN or LAVA_API_KEY the owner added) before uploading.
const dep = run('deploy', 'node', ['scripts/deploy-cloudflare.mjs']);
console.log(dep.split('\n').filter((l) => /^✔ Settings|Deployment complete/.test(l)).join('\n'));
const ix = run('indexnow', 'node', ['scripts/indexnow.mjs']);
console.log(`✔ ${ix.trim()}`);
const h = await fetch(`${SITE}/api/health`, { cache: 'no-store' });
console.log(`✔ health ${h.status} ${await h.text()}`);
