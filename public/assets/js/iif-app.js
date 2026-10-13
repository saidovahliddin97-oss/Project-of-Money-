// IIF Kit: bank CSV / PDF statement → QuickBooks Desktop IIF, in the browser.
import * as pdfjs from '../vendor/pdfjs/pdf.min.mjs';
import { extractLines } from './core/pdf-extract.js';
import { parseStatement } from './core/statement-parser.js';
import { importCsv } from './core/csv-import.js';
import { toIif, parseRules, categorize } from './core/iif.js';
import { formatAmount } from './core/amounts.js';
import { CONFIG } from './config.js';
import { getStatus, initProDialog, spendOneShot } from './pro.js';
import { track } from './track.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
const $ = (s) => document.querySelector(s);
const state = { rows: [], files: [], pro: false };
const PRICES = { USD: CONFIG.PRICE_IIF_USD, EUR: CONFIG.PRICE_IIF_EUR };

function opts() {
  return {
    bankAccount: $('#opt-bank').value,
    accountType: $('#opt-type').value,
    expenseAccount: $('#opt-expense').value,
    incomeAccount: $('#opt-income').value,
    rules: $('#opt-rules').value,
  };
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show';
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.className = 'toast'), 4000);
}

async function addFiles(list) {
  for (const file of list) {
    if (file.size > CONFIG.MAX_FILE_MB * 1024 * 1024) {
      toast(`${file.name}: larger than ${CONFIG.MAX_FILE_MB} MB`);
      continue;
    }
    const entry = { name: file.name, meta: 'Reading…' };
    state.files.push(entry);
    renderFiles();
    track('file_loaded');
    try {
      const order = $('#opt-date-order').value;
      let result;
      if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
        const { lines, textItems } = await extractLines(pdfjs, new Uint8Array(await file.arrayBuffer()));
        if (!textItems) throw new Error('no text layer (scanned PDF) — use the bank CSV export instead');
        result = parseStatement(lines, { dateOrder: order });
      } else {
        result = importCsv(await file.text(), { dateOrder: order });
      }
      if (result.kind === 'card') $('#opt-type').value = 'card';
      state.rows.push(...result.transactions.map((t) => ({ ...t, account: '' })));
      entry.meta = `${result.transactions.length} transactions${result.warnings.length ? ' · ' + result.warnings[0] : ''}`;
      track(result.transactions.length ? 'parse_ok' : 'parse_empty');
    } catch (e) {
      entry.meta = `Could not read: ${e.message}`;
      entry.bad = true;
    }
    renderFiles();
    renderTable();
  }
}

function renderFiles() {
  $('#files-section').hidden = !state.files.length;
  $('#file-list').replaceChildren(
    ...state.files.map((f) => {
      const li = document.createElement('li');
      li.className = 'file';
      const n = document.createElement('strong');
      n.textContent = f.name;
      const m = document.createElement('span');
      m.className = `file-meta${f.bad ? ' bad' : ''}`;
      m.textContent = f.meta;
      li.append(n, m);
      return li;
    }),
  );
}

function renderTable() {
  const o = opts();
  const rules = parseRules(o.rules);
  const defaults = { expenseAccount: o.expenseAccount || 'Ask My Accountant', incomeAccount: o.incomeAccount || 'Ask My Accountant' };
  $('#review-section').hidden = !state.rows.length;
  $('#export-section').hidden = !state.rows.length;
  $('#t-count').textContent = `${state.rows.length} transactions`;
  const frag = document.createDocumentFragment();
  for (const r of state.rows) {
    const tr = document.createElement('tr');
    const cell = (node) => {
      const td = document.createElement('td');
      td.append(node);
      tr.append(td);
    };
    const span = (txt, cls) => {
      const s = document.createElement('span');
      s.textContent = txt;
      if (cls) s.className = cls;
      return s;
    };
    cell(span(r.date));
    cell(span(r.description));
    cell(span(formatAmount(r.amount), r.amount < 0 ? 'neg' : 'pos'));
    const acc = document.createElement('input');
    acc.type = 'text';
    acc.value = r.account || categorize(r, rules, defaults);
    acc.setAttribute('aria-label', 'QuickBooks account');
    acc.addEventListener('change', () => (r.account = acc.value.trim()));
    cell(acc);
    frag.append(tr);
  }
  $('#txn-body').replaceChildren(frag);
  $('#export-note').textContent = state.pro
    ? 'Pro active — unlimited exports.'
    : state.rows.length > CONFIG.FREE_EXPORT_ROWS
      ? `Free version exports the first ${CONFIG.FREE_EXPORT_ROWS} rows. Unlock all ${state.rows.length} with Pro ($${PRICES.USD} once).`
      : 'Small enough to export for free.';
}

function download(rows) {
  let text;
  try {
    text = toIif(rows, opts());
  } catch (e) {
    toast(e.message);
    $('#opt-bank').focus();
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }));
  a.download = `${($('#opt-bank').value || 'bank').replace(/[^\w-]+/g, '_')}-import.iif`;
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

let pro;
async function onExport() {
  const status = await getStatus('iif');
  state.pro = status.pro;
  if (state.pro || state.rows.length <= CONFIG.FREE_EXPORT_ROWS) {
    download(state.rows);
    track('export_free', { once: true });
    if (status.oneShot && state.rows.length > CONFIG.FREE_EXPORT_ROWS) {
      spendOneShot(status);
      refreshPro();
    }
    return;
  }
  track('export_locked');
  $('#free-download').hidden = false;
  pro.open(`Your files have ${state.rows.length} transactions. The free version exports the first ${CONFIG.FREE_EXPORT_ROWS}.`, { pass: true });
}

async function refreshPro() {
  state.pro = (await getStatus('iif')).pro;
  $('#pro-badge').hidden = !state.pro;
  $('#upgrade-btn').hidden = state.pro;
  if (state.rows.length) renderTable();
}

const input = $('#file-input');
input.addEventListener('change', () => {
  addFiles([...input.files]);
  input.value = '';
});
const dz = $('#dropzone');
['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => (e.preventDefault(), dz.classList.add('over'))));
['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove('over')));
dz.addEventListener('drop', (e) => {
  e.preventDefault();
  addFiles([...e.dataTransfer.files]);
});
['#opt-rules', '#opt-expense', '#opt-income', '#opt-type'].forEach((s) => $(s).addEventListener('change', renderTable));
$('#btn-export').addEventListener('click', onExport);
$('#btn-sample').addEventListener('click', async () => {
  const csv = 'Date,Description,Amount\n01/03/2026,SHELL OIL 1234,-45.10\n01/05/2026,Client payment ACME,1200.00\n01/09/2026,AMAZON MKTPLACE,-23.99\n01/15/2026,PAYROLL JAN,-2500.00\n';
  addFiles([new File([csv], 'sample-bank.csv', { type: 'text/csv' })]);
});
pro = initProDialog({ product: 'iif', prices: PRICES, onActivated: refreshPro });
$('#upgrade-btn').addEventListener('click', () => {
  $('#free-download').hidden = true;
  pro.open('');
});
$('#buy-one')?.addEventListener('click', () => {
  $('#free-download').hidden = true;
  pro.open('', { one: true });
});
$('#buy-pass')?.addEventListener('click', () => {
  $('#free-download').hidden = true;
  pro.open('', { pass: true });
});
$('#buy-bundle')?.addEventListener('click', () => {
  $('#free-download').hidden = true;
  pro.open('', { bundle: true });
});
$('#buy-btn').addEventListener('click', () => {
  $('#free-download').hidden = true;
  pro.open('');
});
$('#free-download').addEventListener('click', () => {
  download(state.rows.slice(0, CONFIG.FREE_EXPORT_ROWS));
  $('#pro-dialog').close();
});
refreshPro();
track('visit_app', { once: true });
