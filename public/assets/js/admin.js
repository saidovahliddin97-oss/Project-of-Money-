// Owner dashboard. Reads /api/admin/summary with the admin password (Bearer).
const $ = (s) => document.querySelector(s);
const LS = 'll_admin_token';
let days = 30;
let proj = location.hash.includes('iif') ? 'iif' : 'ledger';
let lastData = null;

const store = {
  get() {
    try {
      return localStorage.getItem(LS);
    } catch {
      return null;
    }
  },
  set(v) {
    try {
      if (v) localStorage.setItem(LS, v);
      else localStorage.removeItem(LS);
    } catch {
      /* private mode */
    }
  },
};

// A login link can carry the password in the URL fragment (never sent to the server).
const m = location.hash.match(/k=([^&]+)/);
if (m) {
  store.set(decodeURIComponent(m[1]));
  history.replaceState(null, '', location.pathname);
}

const nf = new Intl.NumberFormat('ru-RU');
const money = (n, cur) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 2 }).format(n || 0);
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1).replace('.', ',')}%` : '—');
let regionNames;
try {
  regionNames = new Intl.DisplayNames(['ru'], { type: 'region' });
} catch {
  regionNames = null;
}

const EV = {
  visit: 'Визиты',
  pageview: 'Просмотры страниц',
  visit_app: 'Открыли конвертер',
  file_loaded: 'Загрузили файл',
  parse_ok: 'Файл распознан',
  export_free: 'Скачали бесплатно',
  export_locked: 'Упёрлись в лимит',
  checkout_start: 'Нажали «Купить»',
  checkout_created: 'Открыли оплату',
  purchase: 'Оплатили',
};
const DEV = { desktop: '💻 Компьютер', mobile: '📱 Телефон', tablet: '📱 Планшет' };

function show(id) {
  $('#login').hidden = id !== 'login';
  $('#dash').hidden = id !== 'dash';
}

async function load() {
  const token = store.get();
  if (!token) return show('login');
  $('#status-line').textContent = 'Загрузка…';
  let res;
  try {
    res = await fetch(`/api/admin/summary?days=${days}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  } catch {
    $('#status-line').textContent = 'Нет связи с сервером.';
    return show('dash');
  }
  if (res.status === 401) {
    store.set(null);
    $('#login-err').textContent = 'Неверный пароль.';
    return show('login');
  }
  if (!res.ok) {
    $('#status-line').textContent = `Ошибка сервера (${res.status}).`;
    return show('dash');
  }
  const data = await res.json();
  show('dash');
  render(data);
}

function delta(cur, prev) {
  if (!prev && !cur) return '<span class="k-delta flat">—</span>';
  if (!prev) return '<span class="k-delta up">новое</span>';
  const d = ((cur - prev) / prev) * 100;
  const cls = d > 0.5 ? 'up' : d < -0.5 ? 'down' : 'flat';
  return `<span class="k-delta ${cls}">${d > 0 ? '▲' : d < 0 ? '▼' : '•'} ${Math.abs(d).toFixed(0)}% к прошлому периоду</span>`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

// The API returns site-wide counters; IIF Kit events are prefixed with "iif_".
// Build the view for the selected project.
function viewEv(ev = {}) {
  const out = {};
  if (proj === 'iif') {
    for (const [k, v] of Object.entries(ev)) if (k.startsWith('iif_')) out[k.slice(4)] = v;
    return out;
  }
  for (const [k, v] of Object.entries(ev)) if (!k.startsWith('iif_')) out[k] = v;
  for (const k of ['visit', 'pageview']) out[k] = Math.max(0, (ev[k] || 0) - (ev[`iif_${k}`] || 0));
  return out;
}

function projectView(d) {
  const pick = (block) => ({
    ...block,
    ev: viewEv(block.ev),
    gross: (proj === 'iif' ? block.gross_iif : block.gross) || {},
    refunds: (proj === 'iif' ? block.refunds_iif : block.refunds) || {},
    pg: Object.fromEntries(Object.entries(block.pg || {}).filter(([k]) => (proj === 'iif') === k.startsWith('/iif'))),
  });
  const isIif = (s) => /iif/i.test(s.product || '');
  return {
    ...d,
    current: pick(d.current),
    previous: pick(d.previous),
    series: d.series.map((x) => ({ ...x, ev: viewEv(x.ev) })),
    sales: d.sales.filter((s) => (proj === 'iif') === isIif(s)),
    config: { ...d.config, checkout: proj === 'iif' ? d.config.checkoutIif : d.config.checkout },
  };
}

function render(raw) {
  lastData = raw;
  const d = projectView(raw);
  $('#scope-note').textContent = 'Источники, страны и устройства — по всему сайту (оба проекта).';
  const c = d.current.ev || {};
  const p = d.previous.ev || {};
  const gross = d.current.gross || {};
  const prevGross = d.previous.gross || {};
  const mainCur = Object.keys(gross)[0] || 'USD';
  const conv = (ev) => (ev.visit ? (ev.purchase || 0) / ev.visit : 0);

  $('#status-line').textContent = `Обновлено ${new Date(d.generatedAt).toLocaleString('ru-RU')} · период: ${days === 1 ? 'сегодня' : `последние ${days} дн.`}`;

  const kpis = [
    ['Визиты', nf.format(c.visit || 0), delta(c.visit || 0, p.visit || 0)],
    ['Просмотры страниц', nf.format(c.pageview || 0), delta(c.pageview || 0, p.pageview || 0)],
    ['Загрузили файл', nf.format(c.file_loaded || 0), delta(c.file_loaded || 0, p.file_loaded || 0)],
    ['Продажи', nf.format(c.purchase || 0), delta(c.purchase || 0, p.purchase || 0)],
    ['Выручка', money(gross[mainCur] || 0, mainCur), delta(gross[mainCur] || 0, prevGross[mainCur] || 0)],
    ['Конверсия в покупку', pct(c.purchase || 0, c.visit || 0), delta(conv(c), conv(p))],
  ];
  $('#kpis').innerHTML = kpis
    .map(([l, v, dl]) => `<div class="kpi"><div class="k-label">${l}</div><div class="k-value">${v}</div>${dl}</div>`)
    .join('');

  renderChart(d.series);
  renderFunnel(c);
  renderMoney(d.current, c);
  table('#t-ref', d.current.ref, (k) => (k === '(direct)' ? 'Прямые заходы / закладки' : k));
  table('#t-pg', d.current.pg, (k) => (k === '/' ? '/ (главная)' : k));
  table('#t-cc', d.current.cc, (k) => (regionNames && /^[A-Z]{2}$/.test(k) && k !== 'XX' ? `${flag(k)} ${regionNames.of(k)}` : 'Неизвестно'));
  table('#t-dev', d.current.dev, (k) => DEV[k] || k);
  table('#t-os', d.current.os, (k) => k);
  table('#t-src', d.current.src, (k) => k);
  renderQuality(c);
  renderSales(d.sales);
  renderHealth(d.config, c);
  // CSP forbids inline style attributes, so widths are applied through the CSSOM.
  document.querySelectorAll('[data-w]').forEach((el) => (el.style.width = `${el.dataset.w}%`));
}

function flag(cc) {
  return String.fromCodePoint(...[...cc].map((ch) => 0x1f1a5 + ch.charCodeAt(0)));
}

function table(sel, map, label) {
  const rows = Object.entries(map || {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const el = $(sel);
  if (!rows.length) {
    el.innerHTML = '<p class="empty">Пока нет данных</p>';
    return;
  }
  const max = rows[0][1];
  el.innerHTML = `<ul class="bars">${rows
    .map(([k, v]) => `<li><i class="fill" data-w="${(v / max) * 100}"></i><span title="${esc(k)}">${esc(label(k))}</span><b>${nf.format(v)}</b></li>`)
    .join('')}</ul>`;
}

function renderFunnel(c) {
  const steps = ['visit', 'visit_app', 'file_loaded', 'parse_ok', 'export_locked', 'checkout_start', 'purchase'];
  const top = Math.max(1, c.visit || 0, ...steps.map((s) => c[s] || 0));
  $('#funnel').innerHTML = `<div class="funnel">${steps
    .map((s, i) => {
      const v = c[s] || 0;
      const prev = i ? c[steps[i - 1]] || 0 : 0;
      return `<div class="f-row"><span>${EV[s]}</span><div class="f-bar"><i data-w="${(v / top) * 100}"></i></div><span class="f-num">${nf.format(v)}${i ? `<small>${pct(v, prev)}</small>` : ''}</span></div>`;
    })
    .join('')}</div><p class="muted small">Процент — доля от предыдущего шага.</p>`;
}

function renderMoney(cur, c) {
  const gross = cur.gross || {};
  const refunds = cur.refunds || {};
  const curs = [...new Set([...Object.keys(gross), ...Object.keys(refunds)])];
  if (!curs.length) curs.push('USD');
  const rows = curs.flatMap((k) => {
    const g = gross[k] || 0;
    const r = refunds[k] || 0;
    const fee = g * 0.08;
    return [
      ['Выручка', money(g, k)],
      ['Возвраты и чарджбэки', money(r, k)],
      ['Комиссия lava.top (≈8%)', money(fee, k)],
      ['Чистыми (до налогов)', money(g - r - fee, k)],
    ];
  });
  rows.push(['Средний чек', c.purchase ? money((gross[curs[0]] || 0) / c.purchase, curs[0]) : '—']);
  rows.push(['Неудачные оплаты', nf.format(c.payment_failed || 0)]);
  $('#money').innerHTML = `<dl class="money">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}

function renderQuality(c) {
  const loaded = c.file_loaded || 0;
  const rows = [
    ['Успешно распознано', pct(c.parse_ok || 0, loaded)],
    ['Не распознано (сканы и т. п.)', pct(c.parse_empty || 0, loaded)],
    ['Скачали бесплатно', nf.format(c.export_free || 0)],
    ['Активировали ключ', nf.format(c.license_activated || 0)],
  ];
  $('#quality').innerHTML = `<dl class="money">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}

function renderSales(sales) {
  if (!sales.length) {
    $('#sales').innerHTML = '<p class="empty">Продаж пока нет</p>';
    return;
  }
  $('#sales').innerHTML = `<div class="table-wrap-x"><table class="tbl"><thead><tr><th>Дата</th><th>Покупатель</th><th>Сумма</th></tr></thead><tbody>${sales
    .map((s) => `<tr><td>${new Date(s.at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}</td><td>${esc(s.email || '—')}</td><td>${money(Number(s.amount), s.currency)}</td></tr>`)
    .join('')}</tbody></table></div>`;
}

function renderHealth(cfg, c) {
  const items = [
    [true, 'ok', 'Сайт и сервер работают'],
    [cfg.checkout, cfg.checkout ? 'ok' : 'bad', cfg.checkout ? 'Приём оплаты включён (lava.top)' : 'Приём оплаты выключен — нет ключа платёжной системы'],
    [cfg.licensing, cfg.licensing ? 'ok' : 'bad', cfg.licensing ? 'Выдача лицензий работает' : 'Ключ подписи лицензий не задан'],
    [cfg.webhookAuth, cfg.webhookAuth ? 'ok' : 'warn', cfg.webhookAuth ? 'Уведомления об оплатах от lava.top защищены' : 'Вебхук lava.top ещё не настроен'],
    [cfg.notifications, cfg.notifications ? 'ok' : 'warn', cfg.notifications ? 'Уведомления о продажах в Telegram включены' : 'Уведомления в Telegram не подключены'],
  ];
  const loaded = c.file_loaded || 0;
  if (loaded >= 5 && (c.parse_empty || 0) / loaded > 0.3) items.push([false, 'warn', 'Больше 30% файлов не распознаются — нужно улучшить распознавание']);
  $('#health').innerHTML = items.map(([, cls, text]) => `<li><span class="dot ${cls}"></span>${text}</li>`).join('');
}

function renderChart(series) {
  const W = 800;
  const H = 220;
  const pad = { l: 34, r: 8, t: 10, b: 24 };
  const n = series.length;
  const keys = [
    ['visit', '#0f766e'],
    ['file_loaded', '#f59e0b'],
    ['purchase', '#6366f1'],
  ];
  const max = Math.max(1, ...series.flatMap((s) => keys.map(([k]) => s.ev[k] || 0)));
  const step = (W - pad.l - pad.r) / Math.max(1, n);
  const bw = Math.max(2, Math.min(14, step / 4));
  const y = (v) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  let out = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="График визитов, загрузок и продаж"><g class="grid">`;
  for (const f of [0, 0.5, 1]) {
    const v = Math.round(max * f);
    out += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`;
  }
  out += '</g>';
  series.forEach((s, i) => {
    const x0 = pad.l + i * step + step / 2 - (bw * 3) / 2;
    keys.forEach(([k, color], j) => {
      const v = s.ev[k] || 0;
      if (v) out += `<rect x="${x0 + j * bw}" y="${y(v)}" width="${bw - 1}" height="${H - pad.b - y(v)}" fill="${color}" rx="1"><title>${s.date}: ${EV[k]} — ${v}</title></rect>`;
    });
    const every = Math.ceil(n / 8);
    if (i % every === 0 || i === n - 1) out += `<text x="${pad.l + i * step + step / 2}" y="${H - 6}" text-anchor="middle">${s.date.slice(8, 10)}.${s.date.slice(5, 7)}</text>`;
  });
  $('#chart').innerHTML = `${out}</svg>`;
}

$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  store.set($('#pw').value.trim());
  $('#login-err').textContent = '';
  load();
});
$('#logout').addEventListener('click', () => {
  store.set(null);
  show('login');
});
$('#refresh').addEventListener('click', load);
document.querySelectorAll('#period button').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('#period button').forEach((x) => x.classList.toggle('on', x === b));
    days = Number(b.dataset.days);
    load();
  }),
);
document.querySelectorAll('#proj button').forEach((b) => {
  b.classList.toggle('on', b.dataset.proj === proj);
  b.addEventListener('click', () => {
    proj = b.dataset.proj;
    document.querySelectorAll('#proj button').forEach((x) => x.classList.toggle('on', x === b));
    history.replaceState(null, '', proj === 'iif' ? '#iif' : location.pathname);
    if (lastData) render(lastData);
  });
});
load();
