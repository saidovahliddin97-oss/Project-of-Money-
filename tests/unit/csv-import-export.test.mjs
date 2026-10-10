import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importCsv, guessMapping } from '../../public/assets/js/core/csv-import.js';
import { exportTransactions, fitIds, payeeOf } from '../../public/assets/js/core/exporters.js';
import { parseCsv } from '../../public/assets/js/core/csv.js';

const sample = [
  { date: '2026-01-02', description: 'PAYROLL DEPOSIT ACME CORP', amount: 3200, balance: 5700 },
  { date: '2026-01-05', description: 'COFFEE HOUSE #123 SEATTLE & CO <WA>', amount: -4.5, balance: 5695.5 },
  { date: '2026-01-05', description: 'COFFEE HOUSE #123 SEATTLE & CO <WA>', amount: -4.5, balance: 5691 },
  { date: '2026-01-09', description: 'Café Zürich', amount: -10, balance: null },
];

test('CSV import: header mapping with single amount column', () => {
  const r = importCsv('Date,Description,Amount\n01/02/2026,Salary,"1,000.00"\n01/31/2026,Rent,-500.00\n');
  assert.deepEqual(r.transactions.map((t) => [t.date, t.description, t.amount]), [
    ['2026-01-02', 'Salary', 1000],
    ['2026-01-31', 'Rent', -500],
  ]);
});

test('CSV import: debit/credit columns, semicolons, comma decimals, DMY', () => {
  const r = importCsv('Booking date;Details;Debit;Credit;Balance\n31.01.2026;Rent;1.200,00;;800,00\n01.02.2026;Salary;;2.000,00;2.800,00\n');
  assert.equal(r.dateOrder, 'DMY');
  assert.deepEqual(r.transactions.map((t) => [t.date, t.amount, t.balance]), [
    ['2026-01-31', -1200, 800],
    ['2026-02-01', 2000, 2800],
  ]);
});

test('CSV import: headerless file is inferred from content', () => {
  const rows = parseCsv('2026-01-03,STARBUCKS STORE 1234,-5.75,994.25\n2026-01-04,DIRECT DEPOSIT,100.00,1094.25\n');
  const m = guessMapping(rows);
  assert.equal(m.hasHeader, false);
  assert.equal(m.date, 0);
  assert.equal(m.description, 1);
  assert.equal(m.amount, 2);
  assert.equal(m.balance, 3);
  const r = importCsv('2026-01-03,STARBUCKS STORE 1234,-5.75,994.25\n2026-01-04,DIRECT DEPOSIT,100.00,1094.25\n');
  assert.equal(r.transactions.length, 2);
});

test('exports: QBO, Xero, QIF and OFX shapes', () => {
  const qbo = exportTransactions('qbo_csv', sample);
  assert.equal(qbo.split('\r\n')[0], 'Date,Description,Amount');
  assert.equal(qbo.split('\r\n')[1], '01/02/2026,PAYROLL DEPOSIT ACME CORP,3200.00');

  const xero = exportTransactions('xero_csv', sample);
  assert.equal(xero.split('\r\n')[0], '*Date,*Amount,Payee,Description,Reference');
  assert.match(xero.split('\r\n')[2], /^05\/01\/2026,-4.50,/);

  const qif = exportTransactions('qif', sample, { accountType: 'card' });
  assert.ok(qif.startsWith('!Type:CCard\r\nD01/02/2026\r\nT3200.00\r\n'));
  assert.equal((qif.match(/\^/g) || []).length, 4);

  const ofx = exportTransactions('ofx', sample, { currency: 'usd' });
  assert.ok(ofx.startsWith('OFXHEADER:100'));
  assert.equal((ofx.match(/<STMTTRN>/g) || []).length, 4);
  assert.match(ofx, /<CURDEF>USD/);
  assert.match(ofx, /<NAME>COFFEE HOUSE/);
  assert.match(ofx, /&amp; CO &lt;WA&gt;/);
  assert.match(ofx, /<MEMO>Cafe Zurich/);
  assert.match(ofx, /<BALAMT>5691.00/);
  const ids = fitIds(sample);
  assert.equal(new Set(ids).size, 4, 'identical rows still get unique FITIDs');
  assert.deepEqual(fitIds(sample), ids, 'FITIDs are stable');
  const card = exportTransactions('ofx', sample, { accountType: 'card' });
  assert.match(card, /<CREDITCARDMSGSRSV1>/);
  assert.match(card, /<CCACCTFROM>/);
});

test('payee guess trims reference numbers', () => {
  assert.equal(payeeOf('AIRLINE TICKET 0123456789'), 'AIRLINE TICKET');
  assert.equal(payeeOf('COFFEE HOUSE #123 SEATTLE'), 'COFFEE HOUSE');
});

test('xlsx export is a valid workbook (checked with openpyxl when available)', (t) => {
  const bytes = exportTransactions('xlsx', sample);
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  const dir = mkdtempSync(join(tmpdir(), 'll-'));
  const file = join(dir, 't.xlsx');
  writeFileSync(file, bytes);
  let out;
  try {
    out = execFileSync('python3', ['-I', '-c', `
import openpyxl, sys
wb = openpyxl.load_workbook(sys.argv[1])
ws = wb.active
rows = list(ws.iter_rows(values_only=True))
print(len(rows), rows[0][0], rows[1][0].date(), rows[1][2], rows[2][4], rows[4][1])
`, file]).toString().trim();
  } catch {
    t.skip('python3/openpyxl not available');
    return;
  }
  assert.equal(out, '5 Date 2026-01-02 3200 4.5 Café Zürich');
});
