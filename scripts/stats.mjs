// Prints funnel counters straight from the Cloudflare KV namespace
// (needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID).   node scripts/stats.mjs [days]
const T = process.env.CLOUDFLARE_API_TOKEN;
const A = process.env.CLOUDFLARE_ACCOUNT_ID;
const days = Number(process.argv[2]) || 14;
const api = (p) => fetch(`https://api.cloudflare.com/client/v4/accounts/${A}${p}`, { headers: { Authorization: `Bearer ${T}` } });
const ns = (await (await api('/storage/kv/namespaces?per_page=100')).json()).result.find((n) => n.title === 'localledger-LL_KV');
if (!ns) throw new Error('KV namespace localledger-LL_KV not found');
const keys = (await (await api(`/storage/kv/namespaces/${ns.id}/keys?prefix=day:&limit=1000`)).json()).result;
const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const byDay = {};
const totals = {};
for (const { name } of keys) {
  const day = name.slice(4);
  if (day < since) continue;
  const blob = await (await api(`/storage/kv/namespaces/${ns.id}/values/${encodeURIComponent(name)}`)).json();
  byDay[day] = blob.ev || {};
  for (const [k, v] of Object.entries(blob.ev || {})) totals[k] = (totals[k] || 0) + v;
}
console.log(JSON.stringify({ days, totals, byDay }));
