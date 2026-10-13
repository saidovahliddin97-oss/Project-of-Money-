// Publishes «Счёт за рубежом» to GitHub Pages (branch gh-pages of this repo), which opens in Russia
// without VPN — Cloudflare and Vercel are throttled by Russian ISPs (checked 13.10.2026 via check-host.net).
//   npm run ship:zs
// One-time owner setup: GitHub → Settings → Pages → Source «Deploy from a branch» → gh-pages / (root).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function run(label, cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts });
  if (r.status !== 0) {
    console.log(`✖ ${label}\n${`${r.stdout || ''}${r.stderr || ''}`.split('\n').filter((l) => /not ok|✖|error|fatal/i.test(l)).slice(0, 20).join('\n')}`);
    process.exit(1);
  }
  return `${r.stdout || ''}${r.stderr || ''}`;
}

const unit = run('unit tests', 'node', ['--test', 'tests/unit/**/*.test.mjs']);
console.log(`✔ unit tests ${(unit.match(/# pass (\d+)/) || [])[1]} passed`);
console.log(run('build', 'node', ['scripts/build-zs.mjs']).trim().split('\n')[0]);

// Push dist/zs as the single commit of gh-pages (the branch holds only the built site).
const tmp = mkdtempSync(join(tmpdir(), 'zs-pages-'));
cpSync(join(root, 'dist', 'zs'), tmp, { recursive: true });
const remote = run('remote', 'git', ['remote', 'get-url', 'origin']).trim();
const git = (...a) => run(`git ${a[0]}`, 'git', a, { cwd: tmp });
git('init', '-q', '-b', 'gh-pages');
git('add', '-A');
git('-c', 'user.name=Claude', '-c', 'user.email=noreply@anthropic.com', 'commit', '-q', '-m', 'Publish «Счёт за рубежом»');
for (let i = 0, wait = 2000; ; i++, wait *= 2) {
  const r = spawnSync('git', ['push', '-q', '--force', remote, 'gh-pages'], { cwd: tmp, encoding: 'utf8' });
  if (r.status === 0) break;
  if (i === 3) {
    console.log(`✖ push gh-pages\n${r.stderr}`);
    process.exit(1);
  }
  await new Promise((res) => setTimeout(res, wait));
}
console.log('✔ pushed gh-pages → https://saidovahliddin97-oss.github.io/Project-of-Money-/ (GitHub Pages updates in ~1 min)');
