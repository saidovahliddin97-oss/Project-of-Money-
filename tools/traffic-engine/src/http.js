// Polite HTTP helper: timeout, request budget, fixed delay, bounded retry on 429/5xx.
export class Budget {
  constructor(max) {
    this.max = max;
    this.used = 0;
  }
  take() {
    if (this.used >= this.max) throw new Error(`request budget of ${this.max} exhausted`);
    this.used++;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function makeHttp({ fetchImpl = fetch, budget, delayMs = 400, timeoutMs = 15000, retries = 2, userAgent = 'LocalLedgerTrafficEngine/1.0' }) {
  let last = 0;
  return async function get(url, { asText = false, headers = {} } = {}) {
    for (let attempt = 0; ; attempt++) {
      budget.take();
      const wait = last + delayMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let res;
      try {
        res = await fetchImpl(url, { headers: { 'User-Agent': userAgent, Accept: asText ? '*/*' : 'application/json', ...headers }, signal: ctrl.signal });
      } catch (e) {
        clearTimeout(timer);
        if (attempt < retries) continue;
        throw new Error(e.name === 'AbortError' ? `timeout: ${url}` : `network error: ${url}`);
      }
      clearTimeout(timer);
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const ra = Number(res.headers.get('retry-after')) || 2 ** attempt * 2;
        await sleep(Math.min(ra, 30) * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
      return asText ? res.text() : res.json();
    }
  };
}
