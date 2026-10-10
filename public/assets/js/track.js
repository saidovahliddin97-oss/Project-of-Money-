// Anonymous funnel counters (event name only — never file contents or emails).
const sent = new Set();
export function track(name, { once = false } = {}) {
  if (once && sent.has(name)) return;
  sent.add(name);
  try {
    const body = JSON.stringify({ name });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/event', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/event', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
    }
  } catch {
    /* analytics must never break the app */
  }
}
