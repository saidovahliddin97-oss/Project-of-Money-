// Anonymous funnel counters (event name and product only — never file contents or emails).
const sent = new Set();
export function track(name, { once = false } = {}) {
  if (once && sent.has(name)) return;
  sent.add(name);
  try {
    const product = document.body?.dataset.product || undefined;
    const body = JSON.stringify({ name, product });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/event', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/event', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
    }
  } catch {
    /* analytics must never break the app */
  }
}
