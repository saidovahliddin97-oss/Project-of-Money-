// Lists your lava.top products with their offer ids and prices, so you can
// copy the right LAVA_OFFER_ID.   LAVA_API_KEY=... node scripts/lava-products.mjs
const key = process.env.LAVA_API_KEY;
if (!key) {
  console.error('Set LAVA_API_KEY first (lava.top → Integrations → API).');
  process.exit(1);
}
const base = process.env.LAVA_API_BASE || 'https://gate.lava.top';
let url = `${base}/api/v2/products`;
while (url) {
  const res = await fetch(url, { headers: { 'X-Api-Key': key, Accept: 'application/json' } });
  if (!res.ok) {
    console.error(`lava.top answered ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const page = await res.json();
  for (const item of page.items || []) {
    const p = item.data || item;
    if (!p.offers) continue;
    console.log(`\nProduct: ${p.title}  (product id ${p.id})`);
    for (const o of p.offers) {
      const prices = (o.prices || []).map((x) => `${x.amount} ${x.currency}`).join(', ');
      console.log(`  offer id: ${o.id}   ${o.name || ''}   ${prices}`);
    }
  }
  url = page.nextPage || null;
}
