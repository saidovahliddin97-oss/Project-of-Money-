// Stack Exchange API v2.3 (public, documented; 300 req/day without a key).
// https://api.stackexchange.com/docs/advanced-search
export async function searchStackExchange(get, { keyword, site, perKeyword, key }) {
  const q = new URLSearchParams({ order: 'desc', sort: 'relevance', q: keyword, site, pagesize: String(perKeyword), filter: 'withbody' });
  if (key) q.set('key', key);
  const data = await get(`https://api.stackexchange.com/2.3/search/advanced?${q}`);
  return (data.items || []).map((it) => ({
    source: `stackexchange:${site}`,
    id: `se:${site}:${it.question_id}`,
    url: it.link,
    title: decode(it.title),
    text: strip(it.body || '').slice(0, 2000),
    createdAt: new Date(it.creation_date * 1000).toISOString(),
    answered: Boolean(it.is_answered),
    score: it.score,
    keyword,
  }));
}

export function strip(html) {
  return decode(String(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function decode(s) {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
