// Date recognition for bank statements. All dates are normalised to ISO "YYYY-MM-DD".

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const MON = '(jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)[a-z]*\\.?';

const PATTERNS = [
  // 2026-01-31, 2026/01/31, 2026.01.31
  { re: /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?![\d])/, make: (m) => ({ kind: 'ymd', y: +m[1], m: +m[2], d: +m[3] }) },
  // 31 Jan 2026, 31-Jan-26, 31 January, 31Jan
  {
    re: new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?[\\s-]?${MON}(?:[\\s,-]+(\\d{4}|\\d{2}(?![\\d:])))?(?![a-z\\d])`, 'i'),
    make: (m) => ({ kind: 'named', d: +m[1], m: MONTHS[m[2].toLowerCase()], y: m[3] ? year(m[3]) : null }),
  },
  // Jan 31, 2026 / January 31 2026 / Jan 31
  {
    re: new RegExp(`^${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?![a-z\\d])`, 'i'),
    make: (m) => ({ kind: 'named', d: +m[2], m: MONTHS[m[1].toLowerCase()], y: m[3] ? +m[3] : null }),
  },
  // 01/31/2026, 31.01.26, 31-01-2026, 01/31
  {
    re: /^(\d{1,2})([/.-])(\d{1,2})(?:\2(\d{4}|\d{2}))?(?![\d/.-]\d)/,
    make: (m) => ({ kind: 'numeric', a: +m[1], b: +m[3], y: m[4] ? year(m[4]) : null }),
  },
];

function year(s) {
  const n = +s;
  if (s.length === 4) return n;
  return n >= 70 ? 1900 + n : 2000 + n;
}

/**
 * Look for a date at the very start of `text`.
 * @returns {{raw: object, length: number} | null}
 */
export function matchDateAtStart(text) {
  const s = text.trimStart();
  const lead = text.length - s.length;
  for (const p of PATTERNS) {
    const m = s.match(p.re);
    if (m) {
      const raw = p.make(m);
      if (!plausible(raw)) continue;
      return { raw, length: lead + m[0].length };
    }
  }
  return null;
}

/** True if the whole string is a single recognisable date. */
export function isDateString(text) {
  const t = String(text ?? '').trim();
  if (!t) return false;
  const hit = matchDateAtStart(t);
  return !!hit && hit.length >= t.length;
}

function plausible(raw) {
  if (raw.kind === 'numeric') {
    const { a, b } = raw;
    if (a < 1 || b < 1 || a > 31 || b > 31) return false;
    if (a > 12 && b > 12) return false;
    return true;
  }
  return raw.m >= 1 && raw.m <= 12 && raw.d >= 1 && raw.d <= 31;
}

/**
 * Work out whether ambiguous numeric dates are day-first or month-first.
 * @param {object[]} raws
 * @returns {'DMY'|'MDY'|null} null when every sample is ambiguous
 */
export function detectDateOrder(raws) {
  let dmy = 0;
  let mdy = 0;
  for (const r of raws) {
    if (!r || r.kind !== 'numeric') continue;
    if (r.a > 12 && r.b <= 12) dmy++;
    if (r.b > 12 && r.a <= 12) mdy++;
  }
  if (dmy && !mdy) return 'DMY';
  if (mdy && !dmy) return 'MDY';
  if (dmy && mdy) return dmy >= mdy ? 'DMY' : 'MDY';
  return null;
}

/**
 * Turn a raw date into ISO.
 * @param {object} raw
 * @param {{order?: 'DMY'|'MDY', fallbackYear?: number, latest?: {y:number,m:number}}} ctx
 * @returns {string|null}
 */
export function resolveDate(raw, ctx = {}) {
  if (!raw) return null;
  let y, m, d;
  if (raw.kind === 'numeric') {
    const order = ctx.order || 'MDY';
    [m, d] = order === 'DMY' ? [raw.b, raw.a] : [raw.a, raw.b];
    y = raw.y;
  } else {
    ({ y, m, d } = raw);
  }
  if (!y) {
    if (ctx.latest) {
      // Statements that omit the year: a month later than the statement's last
      // month means the transaction belongs to the previous year (Dec -> Jan).
      y = m > ctx.latest.m + 1 ? ctx.latest.y - 1 : ctx.latest.y;
    } else {
      y = ctx.fallbackYear || new Date().getFullYear();
    }
  }
  if (!validDay(y, m, d)) return null;
  return `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`;
}

function validDay(y, m, d) {
  if (m < 1 || m > 12 || d < 1) return false;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= dim;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Parse a standalone date cell (CSV import) with a known order.
 */
export function parseDateCell(text, ctx = {}) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  const hit = matchDateAtStart(t);
  if (!hit) return null;
  return resolveDate(hit.raw, ctx);
}
