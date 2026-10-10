// Heuristic extraction of transactions from the text lines of a bank or
// credit-card statement. Works on any text-based PDF (not scanned images).

import { isAmountToken, parseAmount, round2 } from './amounts.js';
import { matchDateAtStart, detectDateOrder, resolveDate } from './dates.js';

/**
 * @typedef {import('./pdf-layout.js').Line} Line
 * @typedef {{
 *   date: string, description: string, amount: number, balance: number|null,
 *   sign: 'column'|'explicit'|'balance'|'card'|'unknown', page: number
 * }} Transaction
 */

const ROLE_WORDS = [
  ['debit', /^(debits?|withdrawals?|paid\s*out|money\s*out|payments?\s*(?:&|and)?\s*debits?|charges?|outgoings?|spent|out|dr)$/i],
  ['credit', /^(credits?|deposits?(?:\s*(?:&|and)\s*(?:other\s*)?credits?)?|paid\s*in|money\s*in|receipts?|incomings?|received|in|cr)$/i],
  ['balance', /^(balance|running\s*balance|balance\s*\(.*\)|ledger\s*balance|available\s*balance)$/i],
  ['amount', /^(amount|amount\s*\(.*\)|transaction\s*amount|value|sum)$/i],
  ['date', /^((transaction|trans\.?|posting|post|value|effective)?\s*date|date\s*posted)$/i],
  ['desc', /^(description|details|transaction\s*details|particulars|narrative|memo|payee|merchant|reference|transaction|transactions)$/i],
];

const OPENING_RE = /\b(opening|previous|beginning|starting|start)\s+balance\b|\bbalance\s+(brought|b\/?f)\b|\bbrought\s+forward\b/i;
const CLOSING_RE = /\b(closing|ending|new|end)\s+balance\b|\bbalance\s+(carried|c\/?f)\b|\bcarried\s+forward\b/i;
const NOISE_RE = /\b(page\s+\d+(\s+of\s+\d+)?|continued\s+(on|from)|statement\s+(date|period)|account\s+(number|no\.?)|sort\s+code|iban|swift|bic|customer\s+service|www\.|https?:\/\/)\b/i;
const TOTAL_RE = /\b(total|subtotal|sub-total|summary|totals|fees\s+charged|interest\s+charged|minimum\s+payment|payment\s+due|credit\s+limit|available\s+credit)\b/i;
const CARD_RE = /\b(credit\s+card|card\s+statement|minimum\s+payment|credit\s+limit|payment\s+due\s+date|new\s+balance)\b/i;

/**
 * @param {Line[]} lines all lines of the document, in reading order
 * @param {{dateOrder?: 'DMY'|'MDY'|'auto', kind?: 'auto'|'bank'|'card'}} [opts]
 */
export function parseStatement(lines, opts = {}) {
  const warnings = [];
  const docText = lines.map((l) => l.text).join('\n');
  const kind = opts.kind && opts.kind !== 'auto' ? opts.kind : CARD_RE.test(docText) ? 'card' : 'bank';

  // ---- Pass 1: classify lines --------------------------------------------
  let header = null; // { roles: [{role, x0, x1, cx}] , descX }
  const rows = [];
  let opening = null;
  let closing = null;
  let lastTxnIdx = -1;
  let prevLine = null;

  for (const line of lines) {
    if (prevLine && line.page !== prevLine.page) lastTxnIdx = -1;
    const h = detectHeader(line);
    if (h) {
      header = h;
      prevLine = line;
      lastTxnIdx = -1;
      continue;
    }

    const parsed = splitLine(line, header);
    const lowered = parsed.description.toLowerCase();

    if (OPENING_RE.test(line.text) && parsed.amounts.length) {
      if (opening === null) opening = pickBalanceAmount(parsed);
      prevLine = line;
      continue;
    }
    if (CLOSING_RE.test(line.text) && parsed.amounts.length) {
      closing = pickBalanceAmount(parsed);
      prevLine = line;
      lastTxnIdx = -1;
      continue;
    }

    if (parsed.dateRaw && parsed.amounts.length && !TOTAL_RE.test(lowered)) {
      rows.push({ ...parsed, page: line.page, carried: false });
      lastTxnIdx = rows.length - 1;
    } else if (parsed.dateRaw && !parsed.amounts.length && parsed.description && !NOISE_RE.test(line.text)) {
      // Date + description with the amount on a following line.
      rows.push({ ...parsed, page: line.page, carried: false, pending: true });
      lastTxnIdx = rows.length - 1;
    } else if (!parsed.dateRaw && parsed.amounts.length && lastTxnIdx >= 0) {
      const last = rows[lastTxnIdx];
      if (last.pending) {
        last.amounts = parsed.amounts;
        if (parsed.description) last.description += ' ' + parsed.description;
        last.pending = false;
      } else if (
        header &&
        parsed.description &&
        !TOTAL_RE.test(lowered) &&
        !NOISE_RE.test(line.text) &&
        parsed.amounts.every((a) => a.role !== 'unknown')
      ) {
        // Same-day transaction where the bank prints the date only once.
        rows.push({ ...parsed, dateRaw: last.dateRaw, page: line.page, carried: true });
        lastTxnIdx = rows.length - 1;
      }
    } else if (!parsed.dateRaw && !parsed.amounts.length && lastTxnIdx >= 0 && parsed.description) {
      const last = rows[lastTxnIdx];
      const gap = prevLine ? Math.abs(prevLine.y - line.y) : 0;
      const lineH = line.h || 10;
      const inDescColumn = !header || header.descX === null || line.cells[0].x0 >= header.descX - lineH * 1.5;
      if (
        (last.continuations || 0) < 3 &&
        gap <= lineH * 2.6 &&
        inDescColumn &&
        !NOISE_RE.test(line.text) &&
        !TOTAL_RE.test(lowered)
      ) {
        last.description += ' ' + parsed.description;
        last.continuations = (last.continuations || 0) + 1;
      } else {
        lastTxnIdx = -1;
      }
    }
    prevLine = line;
  }

  const txRows = rows.filter((r) => !r.pending && r.amounts.length);
  if (!txRows.length) {
    return { transactions: [], openingBalance: opening, closingBalance: closing, kind, dateOrder: null, warnings: ['No transactions found. Is this a text-based PDF (not a scan)?'], reconciliation: null };
  }

  // ---- Pass 2: dates --------------------------------------------------------
  const order =
    opts.dateOrder && opts.dateOrder !== 'auto'
      ? opts.dateOrder
      : detectDateOrder(txRows.map((r) => r.dateRaw)) || detectDateOrder(scanDates(docText)) || 'MDY';
  const latest = latestYearMonth(docText, txRows, order);
  for (const r of txRows) r.date = resolveDate(r.dateRaw, { order, latest });

  // ---- Pass 3: amounts, balances and signs -----------------------------------
  /** @type {Transaction[]} */
  const txns = txRows
    .filter((r) => r.date)
    .map((r) => toTransaction(r, kind));

  inferSignsFromBalances(txns, opening);

  if (kind === 'card') {
    for (const t of txns) {
      if (t.sign !== 'column') {
        // Card statements print purchases as positive numbers and payments or
        // refunds as negative/CR. In accounting terms purchases are money out.
        t.amount = round2(-t.amount);
        t.sign = 'card';
      }
    }
  }

  const unknown = txns.filter((t) => t.sign === 'unknown').length;
  if (unknown) warnings.push(`${unknown} transaction(s) have no sign information; they are shown as money in. Review them or use "Flip sign".`);

  const reconciliation = reconcile(txns, opening, closing, kind);
  if (reconciliation && !reconciliation.ok) {
    warnings.push(`Totals do not match the statement balance (difference ${reconciliation.difference.toFixed(2)}). Please review the rows.`);
  }

  return { transactions: txns, openingBalance: opening, closingBalance: closing, kind, dateOrder: order, warnings, reconciliation };
}

function detectHeader(line) {
  if (line.cells.length < 2) return null;
  const roles = [];
  let hits = 0;
  for (const c of line.cells) {
    const t = c.text.replace(/[:*]/g, '').trim();
    for (const [role, re] of ROLE_WORDS) {
      if (re.test(t)) {
        roles.push({ role, x0: c.x0, x1: c.x1, cx: (c.x0 + c.x1) / 2 });
        hits++;
        break;
      }
    }
  }
  const moneyRoles = roles.filter((r) => ['debit', 'credit', 'balance', 'amount'].includes(r.role));
  if (hits < 2 || !moneyRoles.length) return null;
  // At least half of the cells must be header words, otherwise it is a sentence.
  if (hits < line.cells.length / 2) return null;
  const desc = roles.find((r) => r.role === 'desc');
  return { roles: moneyRoles, descX: desc ? desc.x0 : null };
}

/** Split a line into date, description and right-hand amount cells. */
function splitLine(line, header) {
  const cells = line.cells.map((c) => ({ ...c }));
  let dateRaw = null;

  if (cells.length) {
    const first = cells[0];
    const hit = matchDateAtStart(first.text);
    if (hit) {
      dateRaw = hit.raw;
      first.text = first.text.slice(hit.length).trim();
      // Optional second (posting) date right after the first.
      const second = matchDateAtStart(first.text);
      if (second) first.text = first.text.slice(second.length).trim();
      if (!first.text) {
        cells.shift();
        if (cells.length) {
          const second2 = matchDateAtStart(cells[0].text);
          if (second2 && second2.length >= cells[0].text.trim().length) cells.shift();
        }
      }
    }
  }

  // Trailing amount cells.
  const amounts = [];
  while (cells.length) {
    const last = cells[cells.length - 1];
    if (isAmountToken(last.text)) {
      amounts.unshift({ text: last.text, x0: last.x0, x1: last.x1 });
      cells.pop();
      continue;
    }
    // An amount glued to the description with a single space ("COFFEE 4.50",
    // "PAYMENT 120.00 CR"): test the last one or two words.
    if (amounts.length < 3) {
      const words = last.text.split(' ');
      let taken = 0;
      for (const n of [2, 1]) {
        if (words.length > n && isAmountToken(words.slice(-n).join(' '))) {
          taken = n;
          break;
        }
      }
      if (taken) {
        const amt = words.slice(-taken).join(' ');
        const ratio = amt.length / last.text.length;
        const x0 = last.x1 - (last.x1 - last.x0) * ratio;
        amounts.unshift({ text: amt, x0, x1: last.x1 });
        last.text = words.slice(0, -taken).join(' ');
        last.x1 = x0;
        continue;
      }
    }
    break;
  }

  for (const a of amounts) a.role = header ? assignRole(a, header) : 'unknown';
  if (!header) assignPositionalRoles(amounts);

  const description = cells.map((c) => c.text).join(' ').replace(/\s+/g, ' ').trim();
  return { dateRaw, description, amounts };
}

function assignRole(a, header) {
  const cx = (a.x0 + a.x1) / 2;
  let best = null;
  let bestD = Infinity;
  for (const r of header.roles) {
    // Numbers are usually right-aligned under their header; score by the
    // closer of centre and right-edge distance.
    const d = Math.min(Math.abs(cx - r.cx), Math.abs(a.x1 - r.x1));
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  const width = best ? Math.max(40, best.x1 - best.x0) : 0;
  return best && bestD <= width * 1.6 + 30 ? best.role : 'unknown';
}

function assignPositionalRoles(amounts) {
  if (amounts.length === 1) amounts[0].role = 'amount';
  else if (amounts.length === 2) {
    amounts[0].role = 'amount';
    amounts[1].role = 'balance';
  } else if (amounts.length >= 3) {
    amounts.forEach((a) => (a.role = 'unknown'));
    amounts[amounts.length - 1].role = 'balance';
  }
}

function pickBalanceAmount(parsed) {
  const bal = parsed.amounts.find((a) => a.role === 'balance') || parsed.amounts[parsed.amounts.length - 1];
  const p = parseAmount(bal.text);
  return p ? p.value : null;
}

function toTransaction(r, kind) {
  let amount = null;
  let balance = null;
  let sign = 'unknown';
  for (const a of r.amounts) {
    const p = parseAmount(a.text);
    if (!p) continue;
    if (a.role === 'balance') {
      balance = p.value;
    } else if (a.role === 'debit') {
      amount = -Math.abs(p.value);
      sign = 'column';
    } else if (a.role === 'credit') {
      amount = Math.abs(p.value);
      sign = 'column';
    } else if (amount === null) {
      amount = p.value;
      sign = p.explicitSign ? 'explicit' : 'unknown';
    }
  }
  if (amount === null && balance !== null && r.amounts.length === 1) {
    // Only one number and it landed in the balance column: treat it as the amount.
    amount = balance;
    balance = null;
  }
  return {
    date: r.date,
    description: r.description || '(no description)',
    amount: round2(amount ?? 0),
    balance,
    sign,
    page: r.page,
  };
}

/** Use running balances to sign amounts that carry no sign of their own. */
function inferSignsFromBalances(txns, opening) {
  const withBal = txns.filter((t) => t.balance !== null);
  if (!withBal.length) return;
  const descending = txns.length > 1 && txns[0].date > txns[txns.length - 1].date;
  const seq = descending ? [...txns].reverse() : txns;
  let prev = descending ? null : opening;
  let pending = [];
  for (const t of seq) {
    pending.push(t);
    if (t.balance === null) continue;
    if (prev !== null) {
      const delta = round2(t.balance - prev);
      if (pending.length === 1 && t.sign !== 'column') {
        if (Math.abs(Math.abs(delta) - Math.abs(t.amount)) < 0.005) {
          t.amount = round2(Math.sign(delta || 1) * Math.abs(t.amount));
          t.sign = 'balance';
        }
      } else if (pending.length > 1) {
        // Several rows share one printed balance: if every row is unsigned and
        // they all move the same direction, sum must equal the delta.
        const unsigned = pending.filter((p) => p.sign !== 'column');
        const fixed = round2(pending.filter((p) => p.sign === 'column').reduce((s, p) => s + p.amount, 0));
        const rest = round2(delta - fixed);
        const absSum = round2(unsigned.reduce((s, p) => s + Math.abs(p.amount), 0));
        if (unsigned.length && Math.abs(Math.abs(rest) - absSum) < 0.005) {
          for (const p of unsigned) {
            p.amount = round2(Math.sign(rest || 1) * Math.abs(p.amount));
            p.sign = 'balance';
          }
        }
      }
    }
    prev = t.balance;
    pending = [];
  }
}

function reconcile(txns, opening, closing, kind) {
  if (opening === null || closing === null) return null;
  const sum = round2(txns.reduce((s, t) => s + t.amount, 0));
  // Card balances grow with spending, i.e. they move opposite to money in/out.
  const expected = round2(kind === 'card' ? opening - sum : opening + sum);
  const difference = round2(closing - expected);
  return { opening, closing, sum, expected, difference, ok: Math.abs(difference) < 0.005 };
}

function scanDates(text) {
  const out = [];
  const re = /(?:^|[\s(])(?=\d|[A-Za-z]{3})/g;
  let m;
  while ((m = re.exec(text))) {
    const start = m.index + m[0].length;
    const hit = matchDateAtStart(text.slice(start, start + 40));
    if (hit) out.push(hit.raw);
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  return out;
}

function latestYearMonth(docText, rows, order) {
  let best = null;
  const consider = (raw) => {
    if (!raw || !raw.y) return;
    const iso = resolveDate(raw, { order });
    if (!iso) return;
    if (!best || iso > best.iso) best = { iso, y: +iso.slice(0, 4), m: +iso.slice(5, 7) };
  };
  rows.forEach((r) => consider(r.dateRaw));
  if (!best) scanDates(docText).forEach(consider);
  return best ? { y: best.y, m: best.m } : null;
}
