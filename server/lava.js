// Minimal client for the lava.top public API (https://gate.lava.top/docs).
// Authentication: X-Api-Key header with a key from lava.top → Integrations → API.

export class LavaError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function lavaClient({ apiKey, baseUrl = 'https://gate.lava.top', fetchImpl = fetch, timeoutMs = 8000 }) {
  async function call(method, path, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(baseUrl + path, {
        method,
        headers: {
          'X-Api-Key': apiKey,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new LavaError(e.name === 'AbortError' ? 'Payment provider timed out' : 'Payment provider unreachable', 502);
    } finally {
      clearTimeout(timer);
    }
    let data = null;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 300) };
    }
    if (!res.ok) {
      throw new LavaError(data?.error || `Payment provider error (${res.status})`, res.status, data?.details);
    }
    return data;
  }

  return {
    /**
     * POST /api/v3/invoice — returns {id, status, amountTotal, paymentUrl}
     */
    createInvoice(params) {
      return call('POST', '/api/v3/invoice', params);
    },
    /**
     * GET /api/v1/invoices/{id} — source of truth for payment state.
     * status: NEW | IN_PROGRESS | COMPLETED | FAILED
     */
    getInvoice(id) {
      return call('GET', `/api/v1/invoices/${encodeURIComponent(id)}`);
    },
  };
}
