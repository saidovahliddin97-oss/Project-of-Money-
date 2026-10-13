// Russian-language statements (KZ/AM/KG banks used by Russian residents): header words,
// opening/closing balance labels and space-grouped amounts with decimal commas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractLines } from '../../public/assets/js/core/pdf-extract.js';
import { parseStatement } from '../../public/assets/js/core/statement-parser.js';
import { importCsv } from '../../public/assets/js/core/csv-import.js';
import { yearTotals, reconciles } from '../../sites/zs/assets/js/zs-calc.js';

const fx = (n) => new URL(`../fixtures/ru/${n}`, import.meta.url);

test('Russian PDF statement: rows, opening and closing balance', async () => {
  const { lines } = await extractLines(pdfjs, new Uint8Array(readFileSync(fx('statement-ru.pdf'))));
  const r = parseStatement(lines, { kind: 'bank' });
  assert.equal(r.transactions.length, 5);
  assert.deepEqual(r.transactions.map((t) => t.amount), [410000, -152300.5, 2600000, -1980000, -352320.1]);
  assert.equal(r.transactions[0].date, '2025-01-05');
  assert.equal(r.reconciliation?.opening, 1250000);
  assert.equal(r.reconciliation?.closing, 1775379.4);
  assert.ok(r.reconciliation.ok);
  const t = yearTotals(r.transactions, 2025, r.reconciliation);
  assert.deepEqual([t.opening, t.credits, t.debits, t.closing], [1250000, 3010000, 2484620.6, 1775379.4]);
  assert.ok(reconciles(t));
});

test('Russian CSV with Приход/Расход/Остаток columns', () => {
  const r = importCsv(readFileSync(fx('kaspi-like.csv'), 'utf8'), {});
  assert.deepEqual(r.transactions.map((t) => t.amount), [410000, -152300.5, 2600000, -1980000]);
  const t = yearTotals(r.transactions, 2025);
  assert.equal(t.opening, 1250000);
  assert.equal(t.closing, 2127699.5);
});
