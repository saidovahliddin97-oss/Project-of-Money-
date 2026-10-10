import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, isAmountToken } from '../../public/assets/js/core/amounts.js';
import { matchDateAtStart, detectDateOrder, resolveDate, parseDateCell } from '../../public/assets/js/core/dates.js';
import { parseCsv, toCsv, detectDelimiter } from '../../public/assets/js/core/csv.js';

test('parseAmount handles common money formats', () => {
  const cases = [
    ['1,234.56', 1234.56, false],
    ['1.234,56', 1234.56, false],
    ['1 234,56', 1234.56, false],
    ['(12.00)', -12, true],
    ['-12.00', -12, true],
    ['12.00-', -12, true],
    ['12.00 CR', 12, true],
    ['12.00 DR', -12, true],
    ['$1,234.56', 1234.56, false],
    ['-$45.10', -45.1, true],
    ['€ 12,50', 12.5, false],
    ['USD 99.99', 99.99, false],
    ['+5.00', 5, true],
    ['1,234', 1234, false],
  ];
  for (const [raw, value, explicit] of cases) {
    const p = parseAmount(raw);
    assert.ok(p, raw);
    assert.equal(p.value, value, raw);
    assert.equal(p.explicitSign, explicit, raw);
  }
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('1.2.3'), null);
});

test('isAmountToken rejects ids and years', () => {
  for (const ok of ['1,234.56', '12.00', '(5.00)', '12.00 CR', '$3.50', '1.234,56', '-0.99']) assert.ok(isAmountToken(ok), ok);
  for (const bad of ['2026', '123456', 'REF123', '12/05', 'abc', '1.5', '']) assert.ok(!isAmountToken(bad), bad);
});

test('dates: formats, order detection, missing years', () => {
  assert.deepEqual(matchDateAtStart('2026-01-31 AMAZON').raw, { kind: 'ymd', y: 2026, m: 1, d: 31 });
  assert.equal(resolveDate(matchDateAtStart('31 Jan 2026').raw), '2026-01-31');
  assert.equal(resolveDate(matchDateAtStart('Jan 5, 2026').raw), '2026-01-05');
  assert.equal(resolveDate(matchDateAtStart('05-Jan-26').raw), '2026-01-05');
  assert.equal(resolveDate(matchDateAtStart('March 3rd 2025').raw), '2025-03-03');
  const raws = ['03/04/2026', '25/04/2026'].map((s) => matchDateAtStart(s).raw);
  assert.equal(detectDateOrder(raws), 'DMY');
  assert.equal(resolveDate(raws[0], { order: 'DMY' }), '2026-04-03');
  assert.equal(detectDateOrder(['04/25/2026'].map((s) => matchDateAtStart(s).raw)), 'MDY');
  assert.equal(detectDateOrder(['04/05/2026'].map((s) => matchDateAtStart(s).raw)), null);
  // Year rollover for statements without years (Dec -> Jan statement ending Jan 2026)
  assert.equal(resolveDate(matchDateAtStart('12/28').raw, { order: 'MDY', latest: { y: 2026, m: 1 } }), '2025-12-28');
  assert.equal(resolveDate(matchDateAtStart('01/03').raw, { order: 'MDY', latest: { y: 2026, m: 1 } }), '2026-01-03');
  assert.equal(parseDateCell('31.12.2025', { order: 'DMY' }), '2025-12-31');
  assert.equal(parseDateCell('02/30/2026', { order: 'MDY' }), null, 'invalid day rejected');
  assert.equal(matchDateAtStart('12.50 coffee'), null, 'money is not a date');
});

test('csv parse/write round trip with quotes, BOM and formula guard', () => {
  const text = '﻿Date;Description;Amount\r\n01.02.2026;"Shop; ""Best"" Ltd";-12,50\r\n';
  assert.equal(detectDelimiter(text), ';');
  const rows = parseCsv(text);
  assert.deepEqual(rows, [['Date', 'Description', 'Amount'], ['01.02.2026', 'Shop; "Best" Ltd', '-12,50']]);
  const out = toCsv([['a,b', '=HYPERLINK("x")', '-5.00', 'x"y']]);
  assert.equal(out, '"a,b","=HYPERLINK(""x"")",-5.00,"x""y"\r\n');
  assert.equal(toCsv([['=1+1']]), "'=1+1\r\n");
  assert.equal(toCsv([['@SUM']]), "'@SUM\r\n");
});
