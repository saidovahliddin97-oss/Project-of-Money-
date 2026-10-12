// OpenAI-compatible chat client with hard limits: timeout, bounded retries,
// call budget, response cache and a stop flag once the free quota is exhausted.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export class LlmQuotaError extends Error {}

export function makeLlm({ baseUrl, apiKey, model, maxCalls = 20, timeoutMs = 30000, cacheFile, fetchImpl = fetch }) {
  const enabled = Boolean(baseUrl && apiKey && model);
  const cache = cacheFile && existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  const stats = { calls: 0, cached: 0, promptTokensEst: 0, completionTokensEst: 0, reportedTokens: 0, stoppedReason: null };

  async function chat(messages, { maxTokens = 400 } = {}) {
    if (!enabled) throw new Error('LLM not configured');
    if (stats.stoppedReason) throw new LlmQuotaError(stats.stoppedReason);
    const key = createHash('sha256').update(JSON.stringify([model, messages, maxTokens])).digest('hex');
    if (cache[key]) {
      stats.cached++;
      return cache[key];
    }
    if (stats.calls >= maxCalls) {
      stats.stoppedReason = `call budget of ${maxCalls} reached`;
      throw new LlmQuotaError(stats.stoppedReason);
    }
    stats.calls++;
    stats.promptTokensEst += Math.ceil(JSON.stringify(messages).length / 4);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.4 }),
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'LLM timeout' : 'LLM network error');
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 429 || res.status === 402) {
      // Free quota or rate limit: stop this run instead of hammering the API.
      stats.stoppedReason = `provider returned ${res.status} (quota/rate limit)`;
      throw new LlmQuotaError(stats.stoppedReason);
    }
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    stats.completionTokensEst += Math.ceil(text.length / 4);
    stats.reportedTokens += data.usage?.total_tokens || 0;
    cache[key] = text;
    if (cacheFile) writeFileSync(cacheFile, JSON.stringify(cache));
    return text;
  }

  return { enabled, chat, stats };
}
