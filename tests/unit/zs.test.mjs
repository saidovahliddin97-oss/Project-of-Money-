import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yearTotals, reconciles, thresholdVerdict, thousands, OKV } from '../../sites/zs/assets/js/zs-calc.js';

const tx = (date, amount, balance = null) => ({ date, amount, balance, description: 'x' });

test('year totals: credits, debits and balances from running balance', () => {
  const t = yearTotals([tx('2024-12-30', 100, 1100), tx('2025-01-05', 500, 1600), tx('2025-06-01', -250.5, 1349.5), tx('2025-12-31', 1000, 2349.5), tx('2026-01-02', -9, 2340.5)], 2025);
  assert.deepEqual(t, { opening: 1100, credits: 1500, debits: 250.5, closing: 2349.5, count: 3, outside: 2 });
  assert.ok(reconciles(t));
});

test('year totals: statement balances used when rows have no balance column', () => {
  const t = yearTotals([tx('2025-02-01', 300), tx('2025-03-01', -100)], 2025, { opening: 1000, closing: 1200 });
  assert.equal(t.opening, 1000);
  assert.equal(t.closing, 1200);
  assert.ok(reconciles(t));
});

test('year totals: missing opening is derived from closing', () => {
  const t = yearTotals([tx('2025-02-01', 300), tx('2025-03-01', -100)], 2025, { closing: 1200 });
  assert.equal(t.opening, 1000);
});

test('thousands: rounded to whole units, shown in thousands with 3 decimals', () => {
  assert.equal(thousands(1775379.6).replace(/\s/g, ' '), '1 775,380');
  assert.equal(thousands(null), '—');
});

test('threshold verdict is conservative', () => {
  const small = { opening: 0, credits: 5000, debits: 4000, closing: 1000 };
  const big = { opening: 0, credits: 9000, debits: 1000, closing: 8000 };
  assert.equal(thresholdVerdict(small, 100, 'eaeu').need, false); // 500k and 400k ₽
  assert.equal(thresholdVerdict(big, 100, 'crs').need, true); // 900k ₽ credited
  assert.equal(thresholdVerdict({ opening: 7000, credits: 9000, debits: 9500, closing: 5000 }, 100, 'eaeu').need, true); // turnover above, balance below → still file
  assert.equal(thresholdVerdict({ opening: 5000, credits: 0, debits: 100, closing: 4900 }, 100, 'eaeu').need, false); // no credits, balance 490k
  assert.equal(thresholdVerdict(small, 100, 'other').need, true);
  assert.equal(thresholdVerdict(small, 0, 'eaeu').need, null);
});

test('currency codes follow OKV', () => {
  assert.equal(OKV.USD, '840');
  assert.equal(OKV.KZT, '398');
  assert.equal(OKV.AMD, '051');
});

import { noticeDeadline, icsCalendar } from '../../sites/zs/assets/js/zs-calc.js';

test('notice deadline is one month after the date (end of month clamps)', () => {
  assert.equal(noticeDeadline('2026-10-14'), '2026-11-14');
  assert.equal(noticeDeadline('2026-01-31'), '2026-02-28');
  assert.equal(noticeDeadline('2026-12-20'), '2027-01-20');
});

test('ics calendar has one VEVENT per reminder with an alarm', () => {
  const ics = icsCalendar([{ date: '2026-11-14', title: 'Уведомление, счёт; банк' }, { date: '2027-05-15', title: 'ОДДС' }]);
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 2);
  assert.match(ics, /DTSTART;VALUE=DATE:20261114/);
  assert.ok(ics.includes('SUMMARY:Уведомление\\, счёт\\; банк'));
  assert.match(ics, /TRIGGER:-P3D/);
});
