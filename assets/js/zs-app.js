// «Счёт за рубежом»: цифры листа 3 отчёта о движении средств (ОДДС) из выписок.
// Выписки читаются только в браузере; на сервер уходят лишь обезличенные счётчики.
import * as pdfjs from '../vendor/pdfjs/pdf.min.mjs';
import { extractLines } from './core/pdf-extract.js';
import { parseStatement } from './core/statement-parser.js';
import { importCsv } from './core/csv-import.js';
import { OKV, ZONES, thousands, yearTotals, reconciles, thresholdVerdict, round2 } from './zs-calc.js';
import { isUnlocked, unlockWithCode, PAY_URL } from './zs-unlock.js';

// Статический сайт (GitHub Pages, доступен из РФ без VPN): счётчиков на сервер нет.
const track = () => {};

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

const $ = (s, r = document) => r.querySelector(s);
// ---------- состояние ----------
const state = { year: new Date().getFullYear() - 1, accounts: [], pro: false, defaultZone: 'other' };
let nextId = 1;

function newAccount(init = {}) {
  return { id: nextId++, name: init.name || '', currency: init.currency || 'USD', zone: init.zone || state.defaultZone, rate: init.rate || '', files: [], overrides: {}, ...init };
}

function totalsOf(acc) {
  const txns = acc.files.flatMap((f) => f.txns || []);
  const statement = {};
  const withBal = acc.files.filter((f) => f.opening !== null || f.closing !== null);
  if (withBal.length) {
    statement.opening = withBal[0].opening ?? null;
    statement.closing = withBal[withBal.length - 1].closing ?? null;
  }
  const t = yearTotals(txns, state.year, statement);
  for (const k of ['opening', 'credits', 'debits', 'closing']) if (acc.overrides[k] !== undefined && acc.overrides[k] !== '') t[k] = Number(acc.overrides[k]);
  return t;
}

// ---------- чтение файлов ----------
async function readFile(acc, file) {
  const entry = { name: file.name, status: 'Читаю…', txns: [], opening: null, closing: null };
  acc.files.push(entry);
  render();
  track('file_loaded');
  try {
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      const data = new Uint8Array(await file.arrayBuffer());
      const { lines, textItems } = await extractLines(pdfjs, data, {});
      if (!textItems) throw new Error('В PDF нет текстового слоя (похоже на скан). Скачайте выписку из интернет-банка заново или используйте CSV.');
      const r = parseStatement(lines, { kind: 'bank', ru: true });
      entry.txns = r.transactions;
      entry.opening = r.reconciliation?.opening ?? null;
      entry.closing = r.reconciliation?.closing ?? null;
    } else {
      const r = importCsv(await file.text(), { ru: true });
      entry.txns = r.transactions;
    }
    entry.status = entry.txns.length ? `Операций: ${entry.txns.length}` : 'Операции не найдены — введите итоги вручную';
    track(entry.txns.length ? 'parse_ok' : 'parse_empty');
  } catch (e) {
    entry.status = e.message || String(e);
    entry.error = true;
    track('parse_empty');
  }
  render();
}

// ---------- отрисовка ----------
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined) n.append(k.nodeType ? k : String(k));
  return n;
}

function accountCard(acc) {
  const t = totalsOf(acc);
  const input = el('input', { type: 'file', accept: '.pdf,.csv,.txt,application/pdf,text/csv', multiple: true, class: 'sr-only', onchange: (e) => { for (const f of e.target.files) readFile(acc, f); e.target.value = ''; } });
  const drop = el('label', { class: 'dropzone dz-small' }, input, el('span', { class: 'dz-title' }, 'Перетащите выписки за год'), el('span', { class: 'dz-sub' }, 'PDF или CSV, можно несколько файлов'));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); for (const f of e.dataTransfer.files) readFile(acc, f); });

  const field = (key, label) => el('label', {}, label, el('input', {
    type: 'number', step: '0.01', inputmode: 'decimal', value: acc.overrides[key] ?? (state.pro ? (t[key] ?? '') : ''),
    placeholder: state.pro ? '' : 'посчитаем', disabled: !state.pro && !acc.files.length ? true : undefined,
    onchange: (e) => { acc.overrides[key] = e.target.value; render(); },
  }));

  const files = el('ul', { class: 'file-list' }, acc.files.map((f) => el('li', { class: 'file' }, el('strong', {}, f.name), el('span', { class: `file-meta ${f.error ? 'bad' : f.txns.length ? 'good' : 'warn'}` }, f.status))));
  const ok = acc.files.length ? (reconciles(t) ? el('span', { class: 'ok' }, '✓ остатки сходятся с оборотами') : el('span', { class: 'error' }, 'Остатки не сходятся или не найдены — проверьте и при необходимости введите вручную')) : null;

  return el('article', { class: 'card account' },
    el('div', { class: 'account-head' },
      el('label', {}, 'Банк / брокер', el('input', { value: acc.name, placeholder: 'например, Kaspi Bank', onchange: (e) => { acc.name = e.target.value; render(); } })),
      el('label', {}, 'Валюта', el('select', { onchange: (e) => { acc.currency = e.target.value; render(); } }, Object.keys(OKV).filter((c) => c !== 'RUB').map((c) => el('option', { value: c, selected: c === acc.currency }, `${c} · ${OKV[c]}`)))),
      el('label', {}, 'Страна банка', el('select', { onchange: (e) => { acc.zone = e.target.value; render(); } }, Object.entries(ZONES).map(([k, v]) => el('option', { value: k, selected: k === acc.zone }, v)))),
      el('button', { type: 'button', class: 'icon', title: 'Удалить счёт', 'aria-label': 'Удалить счёт', onclick: () => { state.accounts = state.accounts.filter((a) => a !== acc); render(); } }, '✕'),
    ),
    drop, files, ok,
    state.pro ? el('details', { class: 'options' }, el('summary', {}, 'Поправить итоги вручную'), el('div', { class: 'grid-options' }, field('opening', 'Остаток на начало'), field('credits', 'Зачислено'), field('debits', 'Списано'), field('closing', 'Остаток на конец'))) : null,
  );
}

function render() {
  const box = $('#accounts');
  box.replaceChildren(...state.accounts.map(accountCard));
  const used = state.accounts.filter((a) => a.files.length || Object.keys(a.overrides).length);
  $('#result').hidden = !used.length;
  if (!used.length) return;

  $('#result-body').replaceChildren(...used.map((a) => {
    const t = totalsOf(a);
    const cell = (v) => el('td', { class: state.pro ? 'num' : 'num masked' }, state.pro ? thousands(v) : '•••,•••');
    return el('tr', {}, el('td', {}, a.name || 'Счёт'), el('td', {}, OKV[a.currency] || a.currency), cell(t.opening), cell(t.credits), cell(t.debits), cell(t.closing));
  }));

  $('#threshold').replaceChildren(el('h4', {}, 'Порог 600 000 ₽'), ...used.map((a) => {
    const t = totalsOf(a);
    const v = thresholdVerdict(t, Number(String(a.rate).replace(',', '.')), a.zone);
    const rate = a.zone === 'other' ? null : el('label', { class: 'rate' }, `Курс ЦБ на 31.12.${state.year}, ₽ за 1 ${a.currency}`, el('input', { type: 'text', inputmode: 'decimal', value: a.rate, placeholder: 'например, 101,68', onchange: (e) => { a.rate = e.target.value; render(); } }));
    return el('div', { class: `verdict ${v.need === false ? 'good' : v.need ? 'warn' : ''}` }, el('strong', {}, `${a.name || 'Счёт'} (${ZONES[a.zone]}): `), v.reason, rate);
  }));

  $('#paywall').hidden = state.pro;
  $('#paid-actions').hidden = !state.pro;
  $('#pro-badge').hidden = !state.pro;
  if (!state.pro) track('export_locked', { once: true });
}

function csv() {
  const rows = [['Счёт', 'Код валюты', 'Остаток на начало (тыс.)', 'Зачислено (тыс.)', 'Списано (тыс.)', 'Остаток на конец (тыс.)']];
  for (const a of state.accounts) {
    if (!a.files.length && !Object.keys(a.overrides).length) continue;
    const t = totalsOf(a);
    rows.push([a.name || 'Счёт', OKV[a.currency] || a.currency, ...['opening', 'credits', 'debits', 'closing'].map((k) => thousands(t[k]))]);
  }
  return '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
}

// ---------- проверка «нужно ли подавать» ----------
function updateCheck() {
  const f = $('#check-form');
  const abroad = f.abroad.value;
  const zone = f.zone.value;
  state.defaultZone = zone;
  const out = $('#check-verdict');
  if (abroad === 'yes') out.textContent = 'Если вы были за границей больше 183 дней в отчётном году, отчёт за этот год подавать не нужно (ч. 7 ст. 12 173-ФЗ).';
  else if (zone === 'other') out.textContent = 'Банк вне ЕАЭС и стран автообмена: отчёт подаётся при любых суммах. Добавьте счёт ниже — посчитаем цифры.';
  else out.textContent = 'Всё зависит от оборотов и остатка. Добавьте счёт и выписки ниже — сравним с порогом 600 000 ₽.';
  for (const a of state.accounts) if (!a.files.length) a.zone = zone;
  render();
}

function sample() {
  const acc = newAccount({ name: 'Пример: Kaspi Bank', currency: 'KZT', zone: 'eaeu', rate: '0,1957' });
  const y = state.year;
  const txns = [];
  let bal = 1250000;
  const ops = [[`${y}-01-15`, 410000, 'Пополнение'], [`${y}-02-03`, -152300.5, 'Перевод'], [`${y}-03-10`, 2600000, 'Пополнение'], [`${y}-05-21`, -1980000, 'Покупка'], [`${y}-08-02`, 5420500, 'Пополнение'], [`${y}-11-30`, -5772819.9, 'Перевод']];
  for (const [date, amount, description] of ops) { bal = round2(bal + amount); txns.push({ date, amount, description, balance: bal }); }
  acc.files.push({ name: 'kaspi-gold-2025.pdf (пример)', status: `Операций: ${txns.length}`, txns, opening: 1250000, closing: bal });
  state.accounts = state.accounts.filter((a) => a.files.length).concat(acc);
  render();
  $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function init() {
  const ys = $('#year');
  const now = new Date().getFullYear();
  for (const y of [now - 1, now - 2, now - 3, now]) ys.append(el('option', { value: y, selected: y === state.year }, y));
  ys.addEventListener('change', () => { state.year = Number(ys.value); render(); });
  $('#add-account').addEventListener('click', () => { state.accounts.push(newAccount()); render(); });
  $('#btn-sample').addEventListener('click', sample);
  $('#check-form').addEventListener('change', updateCheck);
  $('#copy-csv').addEventListener('click', () => {
    const a = el('a', { href: URL.createObjectURL(new Blob([csv()], { type: 'text/csv;charset=utf-8' })), download: `oddc-${state.year}.csv` });
    a.click();
    track('export_free');
  });
  const buy = $('#buy-link');
  if (PAY_URL) buy.href = PAY_URL;
  buy.addEventListener('click', (e) => {
    if (PAY_URL) return;
    e.preventDefault();
    $('#buy-error').textContent = 'Оплата подключается. Напишите на ahlak2049@gmail.com — пришлём цифры вручную.';
  });
  $('#activate-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = await unlockWithCode(e.target.code.value);
    $('#activate-msg').textContent = ok ? 'Готово, цифры открыты.' : 'Код не подошёл.';
    state.pro = await isUnlocked();
    render();
  });
  state.pro = await isUnlocked();
  state.accounts.push(newAccount());
  updateCheck();
}

if (typeof document !== 'undefined' && document.getElementById('accounts')) init();
