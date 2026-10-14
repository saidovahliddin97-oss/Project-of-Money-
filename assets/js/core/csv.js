// Minimal RFC 4180 CSV reader/writer with delimiter auto-detection.

const CANDIDATES = [',', ';', '\t', '|'];

export function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  let best = ',';
  let bestScore = -1;
  for (const d of CANDIDATES) {
    const counts = lines.map((l) => countOutsideQuotes(l, d));
    const nonZero = counts.filter((c) => c > 0);
    if (!nonZero.length) continue;
    // Prefer delimiters that appear consistently across lines.
    const mode = mostCommon(nonZero);
    const consistent = counts.filter((c) => c === mode).length;
    const score = consistent * 100 + mode;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function countOutsideQuotes(line, d) {
  let n = 0;
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === d && !q) n++;
  }
  return n;
}

function mostCommon(arr) {
  const m = new Map();
  for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

/**
 * Parse CSV text into an array of rows (arrays of strings).
 * @param {string} text
 * @param {string} [delimiter] auto-detected when omitted
 */
export function parseCsv(text, delimiter) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const d = delimiter || detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === d) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function escapeField(v, d) {
  const s = v === null || v === undefined ? '' : String(v);
  if (s.includes(d) || s.includes('"') || s.includes('\n') || s.includes('\r') || /^\s|\s$/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  // Neutralise spreadsheet formula injection from untrusted statement text.
  if (/^[=+\-@]/.test(s) && !/^[+-]?\d/.test(s)) return "'" + s;
  return s;
}

/**
 * @param {Array<Array<any>>} rows
 * @param {{delimiter?: string, bom?: boolean, eol?: string}} [opts]
 */
export function toCsv(rows, opts = {}) {
  const d = opts.delimiter || ',';
  const eol = opts.eol || '\r\n';
  const body = rows.map((r) => r.map((v) => escapeField(v, d)).join(d)).join(eol) + eol;
  return (opts.bom ? '﻿' : '') + body;
}
