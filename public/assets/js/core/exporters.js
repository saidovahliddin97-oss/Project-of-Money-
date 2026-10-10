// Export transactions to the formats accounting and budgeting apps import.

import { toCsv } from './csv.js';
import { buildXlsx } from './xlsx.js';
import { formatAmount, round2 } from './amounts.js';

/**
 * @typedef {{date: string, description: string, amount: number, balance?: number|null}} Txn
 * @typedef {{accountType?: 'bank'|'card', dateFormat?: 'ISO'|'MDY'|'DMY', currency?: string, accountId?: string}} ExportOpts
 */

export const FORMATS = {
  csv: { label: 'CSV (generic)', ext: 'csv', mime: 'text/csv;charset=utf-8' },
  xlsx: { label: 'Excel (.xlsx)', ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  qbo_csv: { label: 'QuickBooks Online (CSV)', ext: 'csv', mime: 'text/csv;charset=utf-8' },
  xero_csv: { label: 'Xero (CSV)', ext: 'csv', mime: 'text/csv;charset=utf-8' },
  qif: { label: 'QIF (Quicken, GnuCash, Moneydance…)', ext: 'qif', mime: 'application/qif' },
  ofx: { label: 'OFX (Money, GnuCash, YNAB, banks…)', ext: 'ofx', mime: 'application/x-ofx' },
};

export function fmtDate(iso, style = 'ISO') {
  const [y, m, d] = iso.split('-');
  if (style === 'MDY') return `${m}/${d}/${y}`;
  if (style === 'DMY') return `${d}/${m}/${y}`;
  return iso;
}

/**
 * @param {keyof typeof FORMATS} format
 * @param {Txn[]} txns
 * @param {ExportOpts} [opts]
 * @returns {string|Uint8Array}
 */
export function exportTransactions(format, txns, opts = {}) {
  switch (format) {
    case 'csv':
      return toCsv(
        [['Date', 'Description', 'Amount', 'Money In', 'Money Out', 'Balance'], ...txns.map((t) => [
          fmtDate(t.date, opts.dateFormat),
          t.description,
          formatAmount(t.amount),
          t.amount > 0 ? formatAmount(t.amount) : '',
          t.amount < 0 ? formatAmount(-t.amount) : '',
          t.balance === null || t.balance === undefined ? '' : formatAmount(t.balance),
        ])],
        { bom: true },
      );
    case 'xlsx':
      return buildXlsx(
        [['Date', 'Description', 'Amount', 'Money In', 'Money Out', 'Balance'], ...txns.map((t) => [
          { date: t.date },
          t.description,
          round2(t.amount),
          t.amount > 0 ? round2(t.amount) : null,
          t.amount < 0 ? round2(-t.amount) : null,
          t.balance ?? null,
        ])],
        { numberFormatCols: [2, 3, 4, 5] },
      );
    case 'qbo_csv':
      // QuickBooks Online "3-column" bank upload: Date, Description, Amount
      // (negative = money out). QBO accepts MM/DD/YYYY or DD/MM/YYYY.
      return toCsv([['Date', 'Description', 'Amount'], ...txns.map((t) => [fmtDate(t.date, opts.dateFormat === 'DMY' ? 'DMY' : 'MDY'), cleanText(t.description), formatAmount(t.amount)])]);
    case 'xero_csv':
      // Xero "precoded" bank statement CSV template.
      return toCsv([
        ['*Date', '*Amount', 'Payee', 'Description', 'Reference'],
        ...txns.map((t) => [fmtDate(t.date, opts.dateFormat === 'MDY' ? 'MDY' : 'DMY'), formatAmount(t.amount), payeeOf(t.description), cleanText(t.description), '']),
      ]);
    case 'qif':
      return toQif(txns, opts);
    case 'ofx':
      return toOfx(txns, opts);
    default:
      throw new Error(`Unknown format: ${format}`);
  }
}

function cleanText(s) {
  return String(s).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** A short payee guess: the description up to the first long digit run or separator. */
export function payeeOf(desc) {
  const s = cleanText(desc);
  const cut = s.split(/\s{2,}| - | \* |#\d|\b\d{4,}\b/)[0].trim();
  return (cut || s).slice(0, 32);
}

function toQif(txns, opts) {
  const type = opts.accountType === 'card' ? 'CCard' : 'Bank';
  const lines = [`!Type:${type}`];
  for (const t of txns) {
    lines.push(`D${fmtDate(t.date, opts.dateFormat === 'DMY' ? 'DMY' : 'MDY')}`);
    lines.push(`T${formatAmount(t.amount)}`);
    lines.push(`P${payeeOf(t.description)}`);
    lines.push(`M${cleanText(t.description).slice(0, 250)}`);
    lines.push('^');
  }
  return lines.join('\r\n') + '\r\n';
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Stable transaction ids so re-importing the same file does not duplicate rows. */
export function fitIds(txns) {
  const seen = new Map();
  return txns.map((t) => {
    const key = `${t.date}|${formatAmount(t.amount)}|${cleanText(t.description)}`;
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    return `${t.date.replace(/-/g, '')}${fnv1a(key + '|' + n)}`;
  });
}

function sgml(s) {
  // OFX 1.x SGML files are declared as CP1252/ASCII: fold accents, drop the rest.
  return cleanText(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toOfx(txns, opts) {
  const card = opts.accountType === 'card';
  const cur = (opts.currency || 'USD').toUpperCase();
  const acct = (opts.accountId || '000000000').replace(/[^0-9A-Za-z]/g, '').slice(0, 22) || '000000000';
  const dates = txns.map((t) => t.date).sort();
  const start = (dates[0] || '1970-01-01').replace(/-/g, '');
  const end = (dates[dates.length - 1] || '1970-01-01').replace(/-/g, '');
  const now = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const ids = fitIds(txns);
  const lastBal = [...txns].reverse().find((t) => t.balance !== null && t.balance !== undefined);
  const stmt = txns
    .map((t, i) =>
      [
        '<STMTTRN>',
        `<TRNTYPE>${t.amount < 0 ? 'DEBIT' : 'CREDIT'}`,
        `<DTPOSTED>${t.date.replace(/-/g, '')}120000`,
        `<TRNAMT>${formatAmount(t.amount)}`,
        `<FITID>${ids[i]}`,
        `<NAME>${sgml(payeeOf(t.description))}`,
        `<MEMO>${sgml(t.description).slice(0, 255)}`,
        '</STMTTRN>',
      ].join('\r\n'),
    )
    .join('\r\n');
  const acctBlock = card
    ? `<CCACCTFROM>\r\n<ACCTID>${acct}\r\n</CCACCTFROM>`
    : `<BANKACCTFROM>\r\n<BANKID>000000000\r\n<ACCTID>${acct}\r\n<ACCTTYPE>CHECKING\r\n</BANKACCTFROM>`;
  const wrapOpen = card ? '<CREDITCARDMSGSRSV1>\r\n<CCSTMTTRNRS>' : '<BANKMSGSRSV1>\r\n<STMTTRNRS>';
  const wrapClose = card ? '</CCSTMTTRNRS>\r\n</CREDITCARDMSGSRSV1>' : '</STMTTRNRS>\r\n</BANKMSGSRSV1>';
  const rsOpen = card ? '<CCSTMTRS>' : '<STMTRS>';
  const rsClose = card ? '</CCSTMTRS>' : '</STMTRS>';
  return [
    'OFXHEADER:100',
    'DATA:OFXSGML',
    'VERSION:102',
    'SECURITY:NONE',
    'ENCODING:USASCII',
    'CHARSET:1252',
    'COMPRESSION:NONE',
    'OLDFILEUID:NONE',
    'NEWFILEUID:NONE',
    '',
    '<OFX>',
    '<SIGNONMSGSRSV1>',
    '<SONRS>',
    '<STATUS>\r\n<CODE>0\r\n<SEVERITY>INFO\r\n</STATUS>',
    `<DTSERVER>${now}`,
    '<LANGUAGE>ENG',
    '</SONRS>',
    '</SIGNONMSGSRSV1>',
    wrapOpen,
    '<TRNUID>1',
    '<STATUS>\r\n<CODE>0\r\n<SEVERITY>INFO\r\n</STATUS>',
    rsOpen,
    `<CURDEF>${cur}`,
    acctBlock,
    '<BANKTRANLIST>',
    `<DTSTART>${start}`,
    `<DTEND>${end}`,
    stmt,
    '</BANKTRANLIST>',
    '<LEDGERBAL>',
    `<BALAMT>${lastBal ? formatAmount(lastBal.balance) : '0.00'}`,
    `<DTASOF>${end}`,
    '</LEDGERBAL>',
    rsClose,
    wrapClose,
    '</OFX>',
    '',
  ].join('\r\n');
}
