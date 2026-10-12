import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toIif, parseRules, categorize } from '../../public/assets/js/core/iif.js';

const txns = [
  { date: '2026-01-03', description: 'SHELL OIL 1234', amount: -45.1 },
  { date: '2026-01-05', description: 'Client payment ACME', amount: 1200 },
  { date: '2026-01-09', description: 'Office "Depot"\tpens', amount: -12.5 },
  { date: '2026-01-10', description: 'zero', amount: 0 },
];

test('rules parsing and categorisation', () => {
  const rules = parseRules('# comment\nshell => Automobile:Fuel\nACME => Sales\nbad line\n => x');
  assert.deepEqual(rules, [{ keyword: 'shell', account: 'Automobile:Fuel' }, { keyword: 'acme', account: 'Sales' }]);
  const d = { expenseAccount: 'Ask My Accountant', incomeAccount: 'Other Income' };
  assert.equal(categorize(txns[0], rules, d), 'Automobile:Fuel');
  assert.equal(categorize(txns[2], rules, d), 'Ask My Accountant');
  assert.equal(categorize({ description: 'x', amount: 5 }, rules, d), 'Other Income');
});

test('bank IIF: headers, CHECK/DEPOSIT, balanced splits, clean fields', () => {
  const out = toIif(txns, { bankAccount: 'Checking', rules: 'shell => Automobile:Fuel', incomeAccount: 'Sales' });
  const lines = out.trimEnd().split('\r\n');
  assert.deepEqual(lines.slice(0, 3), ['!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO', '!SPL\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO', '!ENDTRNS']);
  assert.equal(lines.length, 3 + 3 * 3, 'zero-amount row skipped');
  assert.equal(lines[3], 'TRNS\tCHECK\t1/3/2026\tChecking\t\t-45.10\tSHELL OIL 1234');
  assert.equal(lines[4], 'SPL\tCHECK\t1/3/2026\tAutomobile:Fuel\t\t45.10\tSHELL OIL 1234');
  assert.equal(lines[5], 'ENDTRNS');
  assert.equal(lines[6].split('\t')[1], 'DEPOSIT');
  assert.equal(lines[7].split('\t')[3], 'Sales');
  assert.equal(lines[9].split('\t').length, 7, 'tab inside memo removed');
  assert.ok(!lines[9].includes('"'));
  // every TRNS/SPL pair sums to zero
  for (let i = 3; i < lines.length; i += 3) {
    assert.equal(Number(lines[i].split('\t')[5]) + Number(lines[i + 1].split('\t')[5]), 0);
  }
});

test('card IIF uses general journal; bank account name required', () => {
  const out = toIif([txns[0]], { bankAccount: 'Visa Card', accountType: 'card' });
  assert.match(out, /TRNS\tGENERAL JOURNAL\t1\/3\/2026\tVisa Card\t\t-45.10/);
  assert.throws(() => toIif(txns, { bankAccount: ' ' }), /required/);
});
