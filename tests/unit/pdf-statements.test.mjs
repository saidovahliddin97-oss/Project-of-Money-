// End-to-end parsing of generated statement PDFs through pdf.js (Node build).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractLines } from '../../public/assets/js/core/pdf-extract.js';
import { parseStatement } from '../../public/assets/js/core/statement-parser.js';

const dir = new URL('../fixtures/pdf/', import.meta.url);
if (!existsSync(new URL('us.pdf', dir))) {
  execFileSync(process.execPath, [fileURLToPath(new URL('../fixtures/make-pdfs.mjs', import.meta.url))]);
}

async function parse(name, opts) {
  const data = new Uint8Array(readFileSync(new URL(`${name}.pdf`, dir)));
  const { lines } = await extractLines(pdfjs, data);
  return parseStatement(lines, opts);
}

const brief = (r) => r.transactions.map((t) => [t.date, t.amount]);

test('US checking: yearless MM/DD dates, wrapped description, 2 pages, reconciles', async () => {
  const r = await parse('us');
  assert.deepEqual(brief(r), [
    ['2026-01-02', 3200], ['2026-01-03', -1800], ['2026-01-05', -4.5], ['2026-01-09', -120.33],
    ['2026-01-12', -200], ['2026-01-15', -89.99], ['2026-01-20', 25], ['2026-01-31', -12],
  ]);
  assert.equal(r.transactions[1].description, 'RENT PAYMENT ONLINE TRANSFER REF 99812 CONFIRMATION 5512');
  assert.equal(r.reconciliation.ok, true);
  assert.equal(r.kind, 'bank');
});

test('UK current account: paid out/paid in columns, date printed once per day', async () => {
  const r = await parse('uk');
  assert.deepEqual(brief(r), [
    ['2026-01-03', -150], ['2026-01-03', -42.1], ['2026-01-10', 2100],
    ['2026-01-14', -300], ['2026-01-14', -58.4], ['2026-01-14', 20],
  ]);
  assert.equal(r.openingBalance, 1000);
  assert.equal(r.closingBalance, 2569.5);
  assert.equal(r.reconciliation.ok, true);
});

test('credit card: purchases become money out, payments money in', async () => {
  const r = await parse('card');
  assert.equal(r.kind, 'card');
  assert.deepEqual(brief(r), [
    ['2026-01-16', 600], ['2026-01-18', -76.23], ['2026-01-25', -15.99], ['2026-02-01', -412.8], ['2026-02-03', 50],
  ]);
  assert.equal(r.transactions[3].description, 'AIRLINE TICKET 0123456789');
  assert.equal(r.reconciliation.ok, true);
});

test('European format: DD.MM.YYYY and 1.234,56 amounts', async () => {
  const r = await parse('eu');
  assert.equal(r.dateOrder, 'DMY');
  assert.deepEqual(brief(r), [['2026-01-02', -45.9], ['2026-01-15', 2750], ['2026-01-28', -1200]]);
  assert.equal(r.reconciliation.ok, true);
});

test('scanned PDF without text gives a clear warning', async () => {
  const r = await parse('scan');
  assert.equal(r.transactions.length, 0);
  assert.match(r.warnings[0], /scan/);
});
