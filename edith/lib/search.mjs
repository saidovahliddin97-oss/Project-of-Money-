// Бесплатный веб-поиск без ключа — через HTML-выдачу DuckDuckGo.
// Возвращает краткий текст с топ-результатами для модели.

function decode(s) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .trim();
}

export async function webSearch(query, limit = 5) {
  if (!query) return 'Пустой запрос.';
  const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
  let html;
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return `Поиск недоступен (HTTP ${res.status}).`;
    html = await res.text();
  } catch (e) {
    return `Поиск недоступен: ${e.message}. (Нужен доступ в интернет / VPN.)`;
  }

  const results = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snipRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  const snippets = [];
  while ((m = snipRe.exec(html))) snippets.push(decode(m[1]));
  let i = 0;
  while ((m = re.exec(html)) && results.length < limit) {
    let link = m[1];
    const um = link.match(/uddg=([^&]+)/);
    if (um) { try { link = decodeURIComponent(um[1]); } catch {} }
    const title = decode(m[2]);
    if (!title) continue;
    const snip = snippets[i++] || '';
    results.push(`${results.length + 1}. ${title}\n   ${snip}\n   ${link}`);
  }
  if (!results.length) return 'Ничего не найдено.';
  return results.join('\n');
}
