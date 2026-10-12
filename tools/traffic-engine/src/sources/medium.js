// Medium public tag RSS feeds (read-only): https://medium.com/feed/tag/<tag>
import { strip, decode } from './stackexchange.js';

export async function readMediumTag(get, { tag }) {
  const xml = await get(`https://medium.com/feed/tag/${encodeURIComponent(tag)}`, { asText: true });
  const items = xml.split('<item>').slice(1).map((chunk) => chunk.split('</item>')[0]);
  return items.map((it) => {
    const pick = (t) => {
      const m = it.match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`));
      return m ? m[1] : '';
    };
    const link = decode(pick('link')).split('?')[0];
    return {
      source: `medium:${tag}`,
      id: `medium:${link}`,
      url: link,
      title: strip(pick('title')),
      text: strip(pick('content:encoded') || pick('description')).slice(0, 2000),
      createdAt: new Date(pick('pubDate') || Date.now()).toISOString(),
      answered: false,
      score: 0,
      keyword: `tag:${tag}`,
    };
  });
}
