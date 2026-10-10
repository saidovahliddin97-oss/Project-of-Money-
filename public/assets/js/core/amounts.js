// Money parsing for bank statements.
// Handles "1,234.56", "1.234,56", "(12.00)", "-12.00", "12.00-", "12.00 CR",
// "12.00 DR", "$1,234.56", "€ 12,00", "USD 12.00" and similar variants.

const CURRENCY = /(?:US\$|C\$|A\$|NZ\$|HK\$|\$|€|£|¥|₹|₽|R\$|CHF|USD|EUR|GBP|CAD|AUD|NZD|INR|JPY|ZAR|SGD|AED|MXN|BRL)/gi;

// A token that is plausibly a money amount (used for detecting amount columns).
// Requires exactly 2 decimals OR thousands separators so that bare integers such
// as reference numbers or years are not mistaken for amounts.
const AMOUNT_TOKEN = new RegExp(
  '^' +
    '[(+-]?\\s*' +
    '(?:(?:US\\$|C\\$|A\\$|\\$|€|£|¥|₹|₽|R\\$)\\s*)?' +
    '[(+-]?' +
    '(?:' +
    '\\d{1,3}(?:[,\\u00a0\\u202f\' ]\\d{3})+(?:\\.\\d{2})' + // 1,234.56 / 1 234.56
    '|\\d{1,3}(?:[.\\u00a0\\u202f\' ]\\d{3})+(?:,\\d{2})' + // 1.234,56
    '|\\d+\\.\\d{2}' + // 1234.56
    '|\\d+,\\d{2}' + // 1234,56
    ')' +
    '\\)?' +
    '(?:\\s*(?:CR|DR|Cr|Dr|cr|dr|-|\\+))?' +
    '$',
);

export function isAmountToken(str) {
  if (typeof str !== 'string') return false;
  const s = str.trim();
  if (!s || s.length > 24) return false;
  return AMOUNT_TOKEN.test(s);
}

/**
 * Parse a money string.
 * @param {string} raw
 * @param {{decimal?: '.'|','|'auto'}} [opts]
 * @returns {{value: number, explicitSign: boolean, marker: 'CR'|'DR'|null} | null}
 *   explicitSign is true when the text itself said whether it is negative/positive
 *   (minus, parentheses, trailing minus, CR/DR).
 */
export function parseAmount(raw, opts = {}) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;

  let negative = false;
  let explicitSign = false;
  let marker = null;

  const crdr = s.match(/\s*\b(CR|DR)\.?$/i);
  if (crdr) {
    marker = crdr[1].toUpperCase();
    s = s.slice(0, crdr.index).trim();
    explicitSign = true;
    if (marker === 'DR') negative = true;
  }

  s = s.replace(CURRENCY, '').trim();

  if (/^\(.*\)$/.test(s)) {
    negative = true;
    explicitSign = true;
    s = s.slice(1, -1).trim();
  }
  if (s.endsWith('-')) {
    negative = true;
    explicitSign = true;
    s = s.slice(0, -1).trim();
  } else if (s.endsWith('+')) {
    explicitSign = true;
    s = s.slice(0, -1).trim();
  }
  if (s.startsWith('-') || s.startsWith('−')) {
    negative = true;
    explicitSign = true;
    s = s.slice(1).trim();
  } else if (s.startsWith('+')) {
    explicitSign = true;
    s = s.slice(1).trim();
  }
  // currency symbol can also sit after the sign: "-$12.00"
  s = s.replace(CURRENCY, '').trim();
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    explicitSign = true;
    s = s.slice(1, -1).trim();
  }

  s = s.replace(/[  ' ]/g, '');
  if (!/^[\d.,]+$/.test(s)) return null;

  const decimal = opts.decimal && opts.decimal !== 'auto' ? opts.decimal : detectDecimal(s);
  const group = decimal === ',' ? '.' : ',';
  const [intPart, ...fracParts] = s.split(decimal);
  if (fracParts.length > 1) return null;
  if (intPart.includes(group) && !new RegExp(`^\\d{1,3}(\\${group}\\d{3})+$`).test(intPart)) return null;
  if (decimal === ',') {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  if ((s.match(/\./g) || []).length > 1) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const value = round2(negative ? -n : n);
  return { value, explicitSign, marker };
}

// Decide which character is the decimal separator in a digits-only string.
function detectDecimal(s) {
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot === -1 && lastComma === -1) return '.';
  if (lastDot !== -1 && lastComma !== -1) return lastDot > lastComma ? '.' : ',';
  const sep = lastDot !== -1 ? '.' : ',';
  const tail = s.length - s.lastIndexOf(sep) - 1;
  const count = s.split(sep).length - 1;
  // "1,234" or "1.234.567" are thousands groupings; "12,34" or "12.3" are decimals
  if (count > 1) return sep === '.' ? ',' : '.';
  if (tail === 3) return sep === '.' ? ',' : '.';
  return sep;
}

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatAmount(n) {
  return round2(n).toFixed(2);
}
