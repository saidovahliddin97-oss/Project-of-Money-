// Hacker News search via the public Algolia API: https://hn.algolia.com/api
import { strip } from './stackexchange.js';

export async function searchHackerNews(get, { keyword, perKeyword }) {
  const q = new URLSearchParams({ query: keyword, tags: '(story,comment)', hitsPerPage: String(perKeyword) });
  const data = await get(`https://hn.algolia.com/api/v1/search?${q}`);
  return (data.hits || []).map((h) => ({
    source: 'hackernews',
    id: `hn:${h.objectID}`,
    url: `https://news.ycombinator.com/item?id=${h.objectID}`,
    title: h.title || h.story_title || '(comment)',
    text: strip(h.comment_text || h.story_text || h.title || '').slice(0, 2000),
    createdAt: h.created_at,
    answered: false,
    score: h.points || 0,
    keyword,
  }));
}
