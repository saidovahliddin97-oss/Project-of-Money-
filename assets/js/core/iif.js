// QuickBooks Desktop IIF export for bank / credit-card transactions.
// Format per Intuit's IIF overview: tab-separated, header rows !TRNS / !SPL /
// !ENDTRNS, one TRNS line for the bank side, SPL lines whose amounts sum to the
// negative of the TRNS amount, then ENDTRNS.

import { formatAmount, round2 } from './amounts.js';

/**
 * Rules: one per line, "keyword => Account name" (case-insensitive substring match).
 * Lines starting with # are comments.
 * @returns {{keyword: string, account: string}[]}
 */
export function parseRules(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('=>'))
    .map((l) => {
      const [k, ...rest] = l.split('=>');
      return { keyword: k.trim().toLowerCase(), account: rest.join('=>').trim() };
    })
    .filter((r) => r.keyword && r.account);
}

/** First matching rule wins; otherwise the default income/expense account. */
export function categorize(txn, rules, { expenseAccount, incomeAccount }) {
  const d = String(txn.description || '').toLowerCase();
  const hit = rules.find((r) => d.includes(r.keyword));
  if (hit) return hit.account;
  return txn.amount < 0 ? expenseAccount : incomeAccount;
}

// IIF fields cannot contain tabs or line breaks; QuickBooks also chokes on double quotes.
function field(v) {
  return String(v ?? '')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/"/g, "'")
    .trim();
}

function iifDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}/${y}`;
}

/**
 * @param {{date: string, description: string, amount: number, account?: string, name?: string}[]} txns
 *   amount: money in > 0, money out < 0 (from the bank/card account's point of view).
 * @param {{bankAccount: string, accountType?: 'bank'|'card', expenseAccount?: string, incomeAccount?: string, rules?: string}} opts
 * @returns {string}
 */
export function toIif(txns, opts) {
  const bank = field(opts.bankAccount);
  if (!bank) throw new Error('Bank account name is required');
  const card = opts.accountType === 'card';
  const defaults = { expenseAccount: field(opts.expenseAccount || 'Ask My Accountant'), incomeAccount: field(opts.incomeAccount || 'Ask My Accountant') };
  const rules = parseRules(opts.rules);
  const cols = ['TRNSTYPE', 'DATE', 'ACCNT', 'NAME', 'AMOUNT', 'MEMO'];
  const lines = [['!TRNS', ...cols].join('\t'), ['!SPL', ...cols].join('\t'), '!ENDTRNS'];
  for (const t of txns) {
    const amount = round2(t.amount);
    if (!amount) continue;
    // Bank accounts: checks for money out, deposits for money in. Card accounts
    // are written as general journal entries, which QuickBooks accepts for any account.
    const type = card ? 'GENERAL JOURNAL' : amount < 0 ? 'CHECK' : 'DEPOSIT';
    const date = iifDate(t.date);
    const memo = field(t.description).slice(0, 4000);
    const name = field(t.name || '');
    const offset = field(t.account || categorize(t, rules, defaults));
    lines.push(['TRNS', type, date, bank, name, formatAmount(amount), memo].join('\t'));
    lines.push(['SPL', type, date, offset, name, formatAmount(-amount), memo].join('\t'));
    lines.push('ENDTRNS');
  }
  return lines.join('\r\n') + '\r\n';
}
