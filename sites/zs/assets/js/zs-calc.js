// Чистые расчёты для листа 3 ОДДС (без DOM и зависимостей — покрыты тестами).
export const round2 = (n) => Math.round(n * 100) / 100;
const THRESHOLD_RUB = 600000;
// Цифровые коды валют по ОКВ.
export const OKV = { USD: '840', EUR: '978', KZT: '398', KGS: '417', AMD: '051', GEL: '981', AED: '784', TRY: '949', CNY: '156', GBP: '826', CHF: '756', RSD: '941', BYN: '933', UZS: '860', THB: '764', HKD: '344', SGD: '702', AZN: '944', TJS: '972', RUB: '643' };
export const ZONES = { eaeu: 'ЕАЭС', crs: 'страна автообмена', other: 'другая страна' };

const nf3 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
export const thousands = (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : nf3.format(Math.round(v) / 1000));

/**
 * Итоги счёта за отчётный год по распознанным операциям.
 * @param {{date:string, amount:number, balance:number|null}[]} txns
 * @param {{opening?:number|null, closing?:number|null}} statement остатки, найденные в выписке
 */
export function yearTotals(txns, year, statement = {}) {
  const inYear = txns.filter((t) => String(t.date).startsWith(`${year}-`)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let credits = 0;
  let debits = 0;
  for (const t of inYear) {
    if (t.amount > 0) credits += t.amount;
    else debits += -t.amount;
  }
  const first = inYear.find((t) => t.balance !== null && t.balance !== undefined);
  const last = [...inYear].reverse().find((t) => t.balance !== null && t.balance !== undefined);
  let opening = statement.opening ?? null;
  let closing = statement.closing ?? null;
  if (first && inYear[0] === first) opening = round2(first.balance - first.amount);
  if (last && inYear[inYear.length - 1] === last) closing = last.balance;
  if (opening === null && closing !== null) opening = round2(closing - credits + debits);
  if (closing === null && opening !== null) closing = round2(opening + credits - debits);
  return { opening, credits: round2(credits), debits: round2(debits), closing, count: inYear.length, outside: txns.length - inYear.length };
}

export const reconciles = (a) => a.opening !== null && a.closing !== null && Math.abs(a.opening + a.credits - a.debits - a.closing) < 0.01;

/**
 * Осторожный вывод по освобождению для ЕАЭС/автообмена: «можно не подавать» только если
 * и зачисления, и списания за год не превышают 600 тыс. ₽ (либо не было зачислений и
 * остаток на конец года не превышает порог).
 */
export function thresholdVerdict(a, rate, zone) {
  if (zone === 'other') return { need: true, reason: 'Банк не в ЕАЭС и не в стране автообмена — отчёт подаётся при любых суммах.' };
  if (!(rate > 0)) return { need: null, reason: 'Укажите курс ЦБ на 31 декабря, чтобы сравнить с порогом 600 000 ₽.' };
  const cr = a.credits * rate;
  const db = a.debits * rate;
  const cl = (a.closing ?? 0) * rate;
  if (a.credits === 0 && cl <= THRESHOLD_RUB) return { need: false, reason: 'Зачислений не было, остаток на конец года не больше 600 000 ₽ — отчёт можно не подавать.' };
  if (cr <= THRESHOLD_RUB && db <= THRESHOLD_RUB) return { need: false, reason: 'И зачисления, и списания за год не больше 600 000 ₽ — отчёт можно не подавать.' };
  if (cl <= THRESHOLD_RUB) return { need: true, reason: 'Обороты больше 600 000 ₽, остаток на конец года меньше. Закон толкуют по-разному — безопаснее подать отчёт.' };
  return { need: true, reason: 'Обороты и остаток больше 600 000 ₽ — отчёт нужен.' };
}


/** Крайний срок уведомления: «не позднее одного месяца» со дня открытия/закрытия/изменения реквизитов. */
export function noticeDeadline(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); // дней в следующем месяце
  const dt = new Date(Date.UTC(y, m, Math.min(d, last)));
  return dt.toISOString().slice(0, 10);
}

/** Календарь .ics (RFC 5545) — без сервера, файл собирается в браузере. */
export function icsCalendar(events, stamp = '20260101T000000Z') {
  const esc = (s) => String(s).replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//schet-za-rubezhom//RU', 'CALSCALE:GREGORIAN'];
  events.forEach((e, i) => {
    const day = e.date.replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${day}-${i}@schet-za-rubezhom`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day}`, `SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(e.note || '')}`,
      'BEGIN:VALARM', 'TRIGGER:-P3D', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, 'END:VALARM', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
