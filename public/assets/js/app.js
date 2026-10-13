// LocalLedger converter UI. Everything here runs in the browser; statement
// files are never uploaded anywhere.

import * as pdfjs from '../vendor/pdfjs/pdf.min.mjs';
import { take } from './handoff.js';
import { extractLines } from './core/pdf-extract.js';
import { parseStatement } from './core/statement-parser.js';
import { importCsv } from './core/csv-import.js';
import { exportTransactions, FORMATS } from './core/exporters.js';
import { parseAmount, round2, formatAmount } from './core/amounts.js';
import { CONFIG } from './config.js';
import { getStatus, initProDialog, deactivate, spendOneShot } from './pro.js';
import { track } from './track.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

const $ = (sel, root = document) => root.querySelector(sel);

const state = {
  files: [], // {id, name, type: 'pdf'|'csv', lines?, text?, result, error?}
  rows: [], // {id, fileId, date, description, amount, balance, sign}
  pro: false,
  email: null,
  nextId: 1,
};

const settings = () => ({
  dateOrder: $('#opt-date-order').value,
  kind: $('#opt-kind').value,
  exportDate: $('#opt-export-date').value,
  currency: $('#opt-currency').value.trim().toUpperCase() || 'USD',
  accountId: $('#opt-account').value.trim(),
});

// ---------------------------------------------------------------- loading files

async function addFiles(fileList) {
  for (const file of fileList) {
    if (file.size > CONFIG.MAX_FILE_MB * 1024 * 1024) {
      toast(`${file.name}: file is larger than ${CONFIG.MAX_FILE_MB} MB.`, 'error');
      continue;
    }
    const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    const isText = /\.(csv|tsv|txt)$/i.test(file.name) || /text|csv/.test(file.type);
    if (!isPdf && !isText) {
      toast(`${file.name}: please use a PDF or CSV file.`, 'error');
      continue;
    }
    const entry = { id: state.nextId++, name: file.name, type: isPdf ? 'pdf' : 'csv', result: null, error: null };
    state.files.push(entry);
    renderFiles();
    track('file_loaded');
    try {
      if (isPdf) await loadPdf(entry, new Uint8Array(await file.arrayBuffer()));
      else {
        entry.text = await file.text();
        parseEntry(entry);
      }
    } catch (e) {
      entry.error = e.message || String(e);
    }
    rebuildRows();
  }
}

async function loadPdf(entry, data, password) {
  try {
    // pdf.js transfers the buffer to its worker, so pass a copy we can reuse.
    const { lines, textItems } = await extractLines(pdfjs, data.slice(), { password });
    entry.lines = lines;
    if (!textItems) {
      entry.error = 'This PDF has no text layer (it is probably a scanned image). Download the statement again from online banking as a PDF or CSV.';
      track('parse_empty');
      return;
    }
    parseEntry(entry);
  } catch (e) {
    if (e && e.name === 'PasswordException') {
      const pw = await askPassword(entry.name, e.code === 2);
      if (pw === null) {
        entry.error = 'Password required.';
        return;
      }
      return loadPdf(entry, data, pw);
    }
    throw new Error('Could not read this PDF: ' + (e?.message || e));
  }
}

function parseEntry(entry) {
  const s = settings();
  if (entry.type === 'pdf') {
    entry.result = parseStatement(entry.lines, { dateOrder: s.dateOrder, kind: s.kind });
  } else {
    entry.result = importCsv(entry.text, { dateOrder: s.dateOrder });
    entry.result.kind = s.kind === 'card' ? 'card' : 'bank';
  }
  track(entry.result.transactions.length ? 'parse_ok' : 'parse_empty');
}

function reparseAll() {
  if (state.rows.some((r) => r.edited) && !confirm('Re-reading the files will discard your manual edits. Continue?')) return;
  for (const f of state.files) if (f.result || f.lines || f.text) parseEntry(f);
  rebuildRows();
}

function rebuildRows() {
  state.rows = [];
  for (const f of state.files) {
    if (!f.result) continue;
    for (const t of f.result.transactions) {
      state.rows.push({ id: state.nextId++, fileId: f.id, ...t });
    }
  }
  renderFiles();
  renderTable();
}

function askPassword(name, wrong) {
  const dlg = $('#password-dialog');
  $('#password-file').textContent = name;
  $('#password-wrong').hidden = !wrong;
  $('#password-input').value = '';
  dlg.showModal();
  return new Promise((resolve) => {
    dlg.addEventListener(
      'close',
      () => resolve(dlg.returnValue === 'ok' ? $('#password-input').value : null),
      { once: true },
    );
  });
}

// ---------------------------------------------------------------- rendering

function renderFiles() {
  const list = $('#file-list');
  list.replaceChildren();
  $('#files-section').hidden = state.files.length === 0;
  for (const f of state.files) {
    const li = document.createElement('li');
    li.className = 'file';
    const name = document.createElement('strong');
    name.textContent = f.name;
    const meta = document.createElement('span');
    meta.className = 'file-meta';
    const notes = [];
    if (f.error) {
      meta.classList.add('bad');
      notes.push(f.error);
    } else if (!f.result) {
      notes.push('Reading…');
    } else {
      const r = f.result;
      notes.push(`${r.transactions.length} transactions`);
      if (r.kind) notes.push(r.kind === 'card' ? 'credit card' : 'bank account');
      if (r.reconciliation) {
        notes.push(r.reconciliation.ok ? '✓ balances reconcile' : `⚠ off by ${formatAmount(r.reconciliation.difference)}`);
        meta.classList.add(r.reconciliation.ok ? 'good' : 'warn');
      }
    }
    meta.textContent = notes.join(' · ');
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'link';
    rm.textContent = 'Remove';
    rm.addEventListener('click', () => {
      state.files = state.files.filter((x) => x !== f);
      rebuildRows();
    });
    li.append(name, meta, rm);
    if (f.result?.warnings?.length) {
      const w = document.createElement('ul');
      w.className = 'warnings';
      for (const msg of f.result.warnings) {
        const wi = document.createElement('li');
        wi.textContent = msg;
        w.append(wi);
      }
      li.append(w);
    }
    list.append(li);
  }
}

function renderTable() {
  const section = $('#review-section');
  section.hidden = state.rows.length === 0 && !state.files.some((f) => f.result);
  const tbody = $('#txn-body');
  const frag = document.createDocumentFragment();
  for (const r of state.rows) frag.append(rowEl(r));
  tbody.replaceChildren(frag);
  renderTotals();
  $('#export-section').hidden = state.rows.length === 0;
  updateExportNote();
}

function rowEl(r) {
  const tr = document.createElement('tr');
  if (r.sign === 'unknown') tr.className = 'needs-review';
  tr.dataset.id = r.id;

  const td = (child) => {
    const c = document.createElement('td');
    c.append(child);
    return c;
  };
  const date = document.createElement('input');
  date.type = 'date';
  date.value = r.date;
  date.setAttribute('aria-label', 'Date');
  date.addEventListener('change', () => {
    if (date.value) update(r, { date: date.value });
  });

  const desc = document.createElement('input');
  desc.type = 'text';
  desc.value = r.description;
  desc.setAttribute('aria-label', 'Description');
  desc.addEventListener('change', () => update(r, { description: desc.value }));

  const amt = document.createElement('input');
  amt.type = 'text';
  amt.inputMode = 'decimal';
  amt.value = formatAmount(r.amount);
  amt.className = r.amount < 0 ? 'neg' : 'pos';
  amt.setAttribute('aria-label', 'Amount');
  amt.addEventListener('change', () => {
    const p = parseAmount(amt.value);
    if (!p) {
      amt.value = formatAmount(r.amount);
      return;
    }
    update(r, { amount: p.value, sign: 'explicit' });
    amt.value = formatAmount(r.amount);
    amt.className = r.amount < 0 ? 'neg' : 'pos';
    tr.classList.remove('needs-review');
  });

  const bal = document.createElement('span');
  bal.textContent = r.balance === null || r.balance === undefined ? '' : formatAmount(r.balance);

  const actions = document.createElement('span');
  actions.className = 'row-actions';
  const flip = button('±', 'Flip sign', () => {
    update(r, { amount: round2(-r.amount), sign: 'explicit' });
    amt.value = formatAmount(r.amount);
    amt.className = r.amount < 0 ? 'neg' : 'pos';
    tr.classList.remove('needs-review');
  });
  const del = button('✕', 'Delete row', () => {
    state.rows = state.rows.filter((x) => x !== r);
    tr.remove();
    renderTotals();
    updateExportNote();
  });
  actions.append(flip, del);

  tr.append(td(date), td(desc), td(amt), td(bal), td(actions));
  return tr;
}

function button(text, label, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon';
  b.textContent = text;
  b.title = label;
  b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
}

function update(r, patch) {
  Object.assign(r, patch, { edited: true });
  renderTotals();
}

function renderTotals() {
  let inSum = 0;
  let outSum = 0;
  for (const r of state.rows) {
    if (r.amount >= 0) inSum += r.amount;
    else outSum += r.amount;
  }
  $('#t-count').textContent = String(state.rows.length);
  $('#t-in').textContent = money(inSum);
  $('#t-out').textContent = money(-outSum);
  $('#t-net').textContent = money(inSum + outSum);
  const unknown = state.rows.filter((r) => r.sign === 'unknown').length;
  $('#t-review').hidden = unknown === 0;
  $('#t-review').textContent = `${unknown} highlighted row(s) had no +/− sign in the statement — check them.`;
}

function money(n) {
  return round2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function updateExportNote() {
  const note = $('#export-note');
  if (state.pro) {
    note.textContent = `Pro license active${state.email ? ` (${state.email})` : ''}. Unlimited exports.`;
  } else if (state.rows.length > CONFIG.FREE_EXPORT_ROWS) {
    note.textContent = `Free version exports the first ${CONFIG.FREE_EXPORT_ROWS} rows. Unlock all ${state.rows.length} rows with Pro ($${CONFIG.PRICE_USD} once).`;
  } else {
    note.textContent = 'This file is small enough to export for free.';
  }
}

// ---------------------------------------------------------------- toolbar

function sortByDate() {
  state.rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  renderTable();
}

function removeDuplicates() {
  const seen = new Set();
  const before = state.rows.length;
  state.rows = state.rows.filter((r) => {
    const k = `${r.date}|${r.amount}|${r.description.trim().toLowerCase().replace(/\s+/g, ' ')}|${r.balance ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  renderTable();
  toast(`${before - state.rows.length} duplicate row(s) removed.`);
}

function flipAll() {
  for (const r of state.rows) {
    r.amount = round2(-r.amount);
    r.sign = 'explicit';
    r.edited = true;
  }
  renderTable();
}

function addRow() {
  const last = state.rows[state.rows.length - 1];
  state.rows.push({ id: state.nextId++, fileId: 0, date: last?.date || new Date().toISOString().slice(0, 10), description: '', amount: 0, balance: null, sign: 'explicit', edited: true });
  renderTable();
  $('#txn-body tr:last-child input[type=text]')?.focus();
}

// ---------------------------------------------------------------- export

function download(format, rows) {
  const s = settings();
  const kinds = new Set(state.files.map((f) => f.result?.kind).filter(Boolean));
  const accountType = kinds.size === 1 && kinds.has('card') ? 'card' : 'bank';
  const data = exportTransactions(format, rows, { dateFormat: s.exportDate, currency: s.currency, accountId: s.accountId, accountType });
  const meta = FORMATS[format];
  const base = (state.files[0]?.name || 'transactions').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_');
  const blob = new Blob([data], { type: meta.mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${base}-${format.replace('_csv', '')}.${meta.ext}`;
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

let pro;
let pendingFormat = null;

async function onExport() {
  const format = $('#export-format').value;
  if (!state.rows.length) return;
  const status = await getStatus();
  state.pro = status.pro;
  if (state.pro || state.rows.length <= CONFIG.FREE_EXPORT_ROWS) {
    download(format, state.rows);
    track('export_free', { once: true });
    if (status.oneShot && state.rows.length > CONFIG.FREE_EXPORT_ROWS) {
      spendOneShot(status);
      toast('Your single full export is done. Thanks!');
      refreshPro();
    }
    return;
  }
  pendingFormat = format;
  track('export_locked');
  $('#free-download').hidden = false;
  pro.open(`Your file has ${state.rows.length} transactions. The free version exports the first ${CONFIG.FREE_EXPORT_ROWS}.`, { one: true });
}

// ---------------------------------------------------------------- misc UI

function toast(msg, kind = 'info') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.className = 'toast'), 4200);
}

async function refreshPro() {
  const s = await getStatus();
  state.pro = s.pro;
  state.email = s.email || null;
  $('#pro-badge').hidden = !s.pro;
  $('#upgrade-btn').hidden = s.pro;
  updateExportNote();
}

function init() {
  const fmt = $('#export-format');
  for (const [k, v] of Object.entries(FORMATS)) {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = v.label;
    fmt.append(o);
  }
  try {
    const savedFmt = localStorage.getItem('ll_format');
    if (savedFmt && FORMATS[savedFmt]) fmt.value = savedFmt;
  } catch {
    /* ignore */
  }
  fmt.addEventListener('change', () => {
    try {
      localStorage.setItem('ll_format', fmt.value);
    } catch {
      /* ignore */
    }
  });
  const lang = navigator.language || 'en-US';
  if (!/^en-US|^en-CA|^en-PH/i.test(lang)) $('#opt-export-date').value = 'ISO';

  const input = $('#file-input');
  input.addEventListener('change', () => {
    addFiles([...input.files]);
    input.value = '';
  });
  const drop = $('#dropzone');
  ['dragenter', 'dragover'].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add('over');
    }),
  );
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    addFiles([...e.dataTransfer.files]);
  });

  ['#opt-date-order', '#opt-kind'].forEach((s) => $(s).addEventListener('change', reparseAll));
  $('#btn-sort').addEventListener('click', sortByDate);
  $('#btn-dedupe').addEventListener('click', removeDuplicates);
  $('#btn-flip').addEventListener('click', flipAll);
  $('#btn-add').addEventListener('click', addRow);
  $('#btn-export').addEventListener('click', onExport);
  $('#btn-sample').addEventListener('click', loadSample);

  pro = initProDialog({ onActivated: refreshPro });
  $('#upgrade-btn').addEventListener('click', () => {
    $('#free-download').hidden = true;
    pro.open('');
  });
  $('#free-download').addEventListener('click', () => {
    download(pendingFormat || $('#export-format').value, state.rows.slice(0, CONFIG.FREE_EXPORT_ROWS));
    track('export_free', { once: true });
    $('#pro-dialog').close();
  });
  $('#signout')?.addEventListener('click', () => {
    deactivate();
    refreshPro();
  });
  refreshPro();
  track('visit_app', { once: true });
  if (location.hash === '#sample') loadSample();
  if (location.hash === '#handoff') {
    history.replaceState(null, '', location.pathname);
    take().then((files) => files.length && addFiles(files));
  }
}

async function loadSample() {
  const res = await fetch('/assets/sample-statement.pdf');
  if (!res.ok) return toast('Sample file is not available.', 'error');
  const blob = await res.blob();
  addFiles([new File([blob], 'sample-statement.pdf', { type: 'application/pdf' })]);
}

init();
