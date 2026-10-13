// Import transactions from a bank CSV/TSV export with automatic column mapping.

import { parseCsv } from './csv.js';
import { parseAmount, round2 } from './amounts.js';
import { matchDateAtStart, detectDateOrder, resolveDate } from './dates.js';

const HEADER_HINTS = {
  date: /^(date|transaction date|trans\.? date|posting date|posted date|post date|booking date|value date|datum|fecha|data|date posted|дата|дата операции|дата проводки|дата документа)$/i,
  description: /^(description|details|transaction details|narrative|particulars|payee|merchant|name|memo|transaction|reference|beschreibung|concepto|descripción|libellé|описание|описание операции|назначение|назначение платежа|детали|операция|контрагент|наименование)$/i,
  amount: /^(amount|transaction amount|value|sum|amount \(.*\)|betrag|importe|montant|сумма|сумма операции|сумма в валюте счета)$/i,
  debit: /^(debit|debits|withdrawal|withdrawals|money out|paid out|debit amount|out|charges?|расход|списание|списания|дебет|снятие|сумма списания)$/i,
  credit: /^(credit|credits|deposit|deposits|money in|paid in|credit amount|in|приход|поступление|поступления|зачисление|зачисления|кредит|пополнение|сумма зачисления)$/i,
  balance: /^(balance|running balance|ledger balance|остаток|баланс|сальдо)$/i,
  memo: /^(memo|notes?|category|type|transaction type)$/i,
};

/**
 * Guess which column holds what.
 * @param {string[][]} rows
 * @returns {{hasHeader: boolean, date: number, description: number, amount: number, debit: number, credit: number, balance: number, memo: number}}
 */
export function guessMapping(rows) {
  const map = { hasHeader: false, date: -1, description: -1, amount: -1, debit: -1, credit: -1, balance: -1, memo: -1 };
  if (!rows.length) return map;
  const head = rows[0].map((h) => h.trim());
  for (const [key, re] of Object.entries(HEADER_HINTS)) {
    const idx = head.findIndex((h, i) => re.test(h) && !Object.values(map).includes(i));
    if (idx !== -1) map[key] = idx;
  }
  const found = ['date', 'description', 'amount', 'debit', 'credit'].filter((k) => map[k] !== -1).length;
  if (found >= 2) {
    map.hasHeader = true;
    if (map.description === -1 && map.memo !== -1) {
      map.description = map.memo;
      map.memo = -1;
    }
    return map;
  }

  // No usable header: infer from the content of the first rows.
  const sample = rows.slice(0, 30);
  const cols = Math.max(...sample.map((r) => r.length));
  const score = (fn) => Array.from({ length: cols }, (_, i) => sample.filter((r) => fn((r[i] || '').trim())).length);
  const dateScore = score((v) => {
    const hit = matchDateAtStart(v);
    return !!hit && hit.length >= v.length;
  });
  const amtScore = score((v) => !!parseAmount(v) && /\d[.,]\d{1,2}\s*$|^\(?-?\d/.test(v));
  const textScore = score((v) => /[a-z]{3,}/i.test(v));
  map.date = argMax(dateScore);
  const amountCols = amtScore
    .map((s, i) => [s, i])
    .filter(([s, i]) => i !== map.date && s >= sample.length * 0.5)
    .map(([, i]) => i);
  if (amountCols.length) map.amount = amountCols[0];
  if (amountCols.length >= 2) map.balance = amountCols[amountCols.length - 1];
  textScore[map.date] = -1;
  if (map.amount !== -1) textScore[map.amount] = -1;
  map.description = argMax(textScore);
  return map;
}

function argMax(arr) {
  let best = -1;
  let bestV = 0;
  arr.forEach((v, i) => {
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  });
  return best;
}

/**
 * @param {string} text CSV file contents
 * @param {{mapping?: object, dateOrder?: 'auto'|'DMY'|'MDY', decimal?: 'auto'|'.'|','}} [opts]
 */
export function importCsv(text, opts = {}) {
  const rows = parseCsv(text);
  const mapping = opts.mapping || guessMapping(rows);
  const warnings = [];
  if (mapping.date === -1 || (mapping.amount === -1 && mapping.debit === -1 && mapping.credit === -1)) {
    return { transactions: [], mapping, warnings: ['Could not find date and amount columns. Please check the column mapping.'], dateOrder: null, headers: rows[0] || [] };
  }
  const body = mapping.hasHeader ? rows.slice(1) : rows;
  const raws = body.map((r) => {
    const v = (r[mapping.date] || '').trim();
    const hit = matchDateAtStart(v);
    return hit ? hit.raw : null;
  });
  const order = opts.dateOrder && opts.dateOrder !== 'auto' ? opts.dateOrder : detectDateOrder(raws) || 'MDY';
  const decimal = opts.decimal && opts.decimal !== 'auto' ? opts.decimal : detectCsvDecimal(body, mapping);

  const transactions = [];
  let skipped = 0;
  body.forEach((r, i) => {
    const date = raws[i] ? resolveDate(raws[i], { order }) : null;
    let amount = null;
    if (mapping.amount !== -1 && (r[mapping.amount] || '').trim()) {
      const p = parseAmount(r[mapping.amount], { decimal });
      if (p) amount = p.value;
    } else {
      const d = mapping.debit !== -1 ? parseAmount(r[mapping.debit], { decimal }) : null;
      const c = mapping.credit !== -1 ? parseAmount(r[mapping.credit], { decimal }) : null;
      if (d || c) amount = round2((c ? Math.abs(c.value) : 0) - (d ? Math.abs(d.value) : 0));
    }
    if (!date || amount === null) {
      skipped++;
      return;
    }
    const descParts = [r[mapping.description], mapping.memo !== -1 ? r[mapping.memo] : '']
      .map((x) => (x || '').trim())
      .filter(Boolean);
    const bal = mapping.balance !== -1 ? parseAmount(r[mapping.balance], { decimal }) : null;
    transactions.push({
      date,
      description: descParts.join(' — ') || '(no description)',
      amount,
      balance: bal ? bal.value : null,
      sign: 'explicit',
      page: 0,
    });
  });
  if (skipped) warnings.push(`${skipped} row(s) without a valid date or amount were skipped.`);
  return { transactions, mapping, warnings, dateOrder: order, headers: mapping.hasHeader ? rows[0] : [] };
}

function detectCsvDecimal(body, mapping) {
  const cols = [mapping.amount, mapping.debit, mapping.credit, mapping.balance].filter((c) => c !== -1);
  let comma = 0;
  let dot = 0;
  for (const r of body.slice(0, 200)) {
    for (const c of cols) {
      const v = (r[c] || '').trim();
      if (/\d,\d{2}\)?(\s*(CR|DR|-))?$/i.test(v)) comma++;
      else if (/\d\.\d{2}\)?(\s*(CR|DR|-))?$/i.test(v)) dot++;
    }
  }
  return comma > dot ? ',' : '.';
}
