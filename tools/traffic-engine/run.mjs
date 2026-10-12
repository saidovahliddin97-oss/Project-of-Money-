// Traffic engine: find relevant public discussions, score them, draft helpful
// replies, save a review queue. It never posts anything (publication is manual
// by design: none of the sources allow automated promotional posting).
//   node run.mjs [--live]    (default is dry-run: no files written)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Budget, makeHttp } from './src/http.js';
import { searchStackExchange } from './src/sources/stackexchange.js';
import { searchHackerNews } from './src/sources/hackernews.js';
import { readMediumTag } from './src/sources/medium.js';
import { relevance } from './src/score.js';
import { makeLlm } from './src/llm.js';
import { generateReply } from './src/reply.js';
import { loadSeen, saveSeen, appendRows } from './src/store.js';

export async function runEngine({ config, env = process.env, fetchImpl = fetch, dataDir, live = false, log = console.log, now = Date.now() }) {
  const budget = new Budget(config.maxRequestsPerRun);
  const get = makeHttp({ fetchImpl, budget, delayMs: config.requestDelayMs });
  const seenFile = join(dataDir, 'seen.json');
  const seen = loadSeen(seenFile);
  const errors = [];
  const found = [];
  const collect = async (label, fn) => {
    try {
      found.push(...(await fn()));
    } catch (e) {
      errors.push(`${label}: ${e.message}`);
    }
  };

  const s = config.sources;
  for (const keyword of config.keywords) {
    if (s.stackexchange?.enabled) for (const site of s.stackexchange.sites) await collect(`se:${site}:${keyword}`, () => searchStackExchange(get, { keyword, site, perKeyword: s.stackexchange.perKeyword, key: env.STACKEXCHANGE_KEY }));
    if (s.hackernews?.enabled) await collect(`hn:${keyword}`, () => searchHackerNews(get, { keyword, perKeyword: s.hackernews.perKeyword }));
  }
  if (s.medium?.enabled) for (const tag of s.medium.tags) await collect(`medium:${tag}`, () => readMediumTag(get, { tag }));

  const unique = new Map();
  for (const it of found) if (!seen.has(it.id) && !unique.has(it.id)) unique.set(it.id, it);
  const scored = [...unique.values()]
    .map((it) => ({ ...it, relevance: relevance(it, { maxAgeDays: config.maxAgeDays, now }) }))
    .filter((it) => it.relevance >= config.minRelevance)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, config.maxRepliesPerRun);

  const llm = makeLlm({ baseUrl: env.LLM_BASE_URL, apiKey: env.LLM_API_KEY, model: env.LLM_MODEL, maxCalls: Number(env.LLM_MAX_CALLS) || 20, cacheFile: live ? join(dataDir, 'llm-cache.json') : null, fetchImpl });
  const rows = [];
  for (const it of scored) {
    const policy = config.linkPolicy[it.source.split(':')[0]] || 'none';
    // Product launches ("Show HN: …") are competitor intelligence, not questions to answer.
    const competitor = /^(show hn|launch hn)\b/i.test(it.title);
    const r = competitor ? { reply: '', engine: 'none' } : await generateReply(it, { llm, policy, product: config.product });
    rows.push({
      source: it.source, source_url: it.url, keyword: it.keyword, title: it.title, discovered_at: new Date(now).toISOString(), created_at: it.createdAt,
      relevance_score: it.relevance, generated_reply: r.reply, reply_engine: r.engine, publication_status: competitor ? 'competitor_intel' : 'needs_human_review', last_error: r.error || '',
    });
  }

  if (live) {
    mkdirSync(dataDir, { recursive: true });
    appendRows(join(dataDir, 'opportunities.csv'), rows);
    for (const it of found) seen.add(it.id);
    saveSeen(seenFile, seen);
    writeFileSync(join(dataDir, 'last-run.json'), JSON.stringify({ at: new Date(now).toISOString(), requests: budget.used, found: found.length, new: unique.size, kept: rows.length, llm: llm.stats, errors }, null, 2));
  }
  log(`requests ${budget.used}/${config.maxRequestsPerRun} · found ${found.length} · new ${unique.size} · kept ${rows.length} · llm calls ${llm.stats.calls} · errors ${errors.length}${live ? '' : ' · DRY RUN (nothing saved)'}`);
  return { rows, errors, stats: { requests: budget.used, found: found.length, new: unique.size }, llm: llm.stats };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const here = dirname(fileURLToPath(import.meta.url));
  const config = JSON.parse(readFileSync(join(here, 'config.json'), 'utf8'));
  const live = process.argv.includes('--live');
  const { rows, errors } = await runEngine({ config, dataDir: join(here, 'data'), live });
  for (const r of rows.slice(0, 5)) console.log(`- [${r.relevance_score}] ${r.source} ${r.title.slice(0, 80)} — ${r.source_url}`);
  for (const e of errors.slice(0, 5)) console.log(`! ${e}`);
}
