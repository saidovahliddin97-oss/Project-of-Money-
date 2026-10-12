// Deterministic relevance scoring (0..1) — no AI needed for this step.
const FIT = ['bank statement', 'statement', 'pdf', 'csv', 'qif', 'ofx', 'qfx', 'quickbooks', 'xero', 'quicken', 'gnucash', 'ynab', 'excel', 'spreadsheet', 'transactions', 'credit card', 'import', 'convert', 'reconcile', 'bookkeeping'];
const INTENT = ['how do i', 'how can i', 'how to', 'is there a', 'any tool', 'any software', 'looking for', 'best way', 'recommend', 'convert', 'import', 'extract', 'help', '?'];
const NEGATIVE = ['hiring', 'job offer', 'salary', 'resume', 'crypto', 'casino', 'loan offer', 'scam'];

export function relevance(item, { maxAgeDays = 730, now = Date.now() } = {}) {
  const t = `${item.title} ${item.text}`.toLowerCase();
  const fit = FIT.filter((w) => t.includes(w)).length / 6;
  const intent = INTENT.filter((w) => t.includes(w)).length / 3;
  const kw = item.keyword && !item.keyword.startsWith('tag:') ? item.keyword.toLowerCase().split(/\s+/).filter((w) => t.includes(w)).length / item.keyword.split(/\s+/).length : 0.5;
  const neg = NEGATIVE.some((w) => t.includes(w)) ? 0.5 : 0;
  const ageDays = (now - Date.parse(item.createdAt || now)) / 86400000;
  const fresh = ageDays > maxAgeDays ? 0 : 1 - (ageDays / maxAgeDays) * 0.5;
  const raw = (Math.min(fit, 1) * 0.45 + Math.min(intent, 1) * 0.25 + kw * 0.3) * fresh - neg;
  return Math.max(0, Math.min(1, Math.round(raw * 100) / 100));
}

/** What the person is trying to do, for choosing reply content. */
export function topicOf(item) {
  const t = `${item.title} ${item.text}`.toLowerCase();
  const target = ['quickbooks', 'xero', 'quicken', 'gnucash', 'ynab', 'excel'].find((w) => t.includes(w)) || 'spreadsheet';
  const input = t.includes('pdf') ? 'pdf' : t.includes('csv') ? 'csv' : 'statement';
  const card = t.includes('credit card');
  return { target, input, card };
}
