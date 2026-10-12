// Owner notifications in Telegram (Russian). No LLM calls: plain counters from KV.
// Chat ID: TELEGRAM_CHAT_ID if set, otherwise taken once from the first private
// chat that pressed /start in the bot (getUpdates) and pinned in KV forever.

const TG = 'https://api.telegram.org/bot';
const HOURLY_CAP = 30; // more live alerts than this per hour → stay quiet, the digest covers the rest
const DIGEST_HOUR_UTC = 18; // 21:00 Moscow

const COUNTRY = new Intl.DisplayNames(['ru'], { type: 'region' });
export const countryName = (cc) => {
  try {
    return cc && cc !== 'XX' ? COUNTRY.of(cc) : 'страна неизвестна';
  } catch {
    return cc || '?';
  }
};

async function call(env, deps, method, payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await (deps.fetch || fetch)(`${TG}${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
      signal: ctrl.signal,
    });
    return await res.json().catch(() => ({}));
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

export async function chatId(env, deps = {}) {
  if (env.TELEGRAM_CHAT_ID) return String(env.TELEGRAM_CHAT_ID);
  if (!env.TELEGRAM_BOT_TOKEN || !env.LL_KV) return null;
  const pinned = await env.LL_KV.get('tg:chat');
  if (pinned) return pinned;
  const r = await call(env, deps, 'getUpdates', { allowed_updates: ['message'], limit: 50 });
  const first = (r.result || []).map((u) => u.message?.chat).find((c) => c && c.type === 'private');
  if (!first) return null;
  await env.LL_KV.put('tg:chat', String(first.id));
  await call(env, deps, 'sendMessage', { chat_id: first.id, text: 'Бот подключён. Сюда будут приходить визиты, покупки и итоги дня по LocalLedger и IIF Kit.' });
  return String(first.id);
}

export async function send(env, deps, text) {
  if (!env.TELEGRAM_BOT_TOKEN) return false;
  const chat = await chatId(env, deps);
  if (!chat) return false;
  const r = await call(env, deps, 'sendMessage', { chat_id: chat, text, disable_web_page_preview: true });
  return r.ok !== false;
}

/** Live alert with an hourly cap so a traffic spike does not flood the chat. */
export async function live(env, deps, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.LL_KV) return false;
  const key = `tg:h:${new Date().toISOString().slice(0, 13)}`;
  const n = Number(await env.LL_KV.get(key)) || 0;
  if (n >= HOURLY_CAP) return false;
  await env.LL_KV.put(key, String(n + 1), { expirationTtl: 60 * 60 * 3 });
  if (n + 1 === HOURLY_CAP) text += '\n\n(лимит уведомлений на этот час исчерпан — остальное будет в итогах дня)';
  return send(env, deps, text);
}

const PRODUCT = (path, product) => (product === 'iif' || String(path || '').startsWith('/iif') ? 'IIF Kit' : 'LocalLedger');

export function visitText({ path, ref, src, cc, dev, os }) {
  const from = src ? `метка ${src}` : ref && ref !== '(direct)' ? ref : 'прямой заход';
  return `👀 ${PRODUCT(path)} · новый визит\nОткуда: ${countryName(cc)} · ${from}\nУстройство: ${dev} · ${os}\nСтраница: ${path}`;
}

const ACTION = {
  file_loaded: '📄 загрузил файл',
  export_locked: '🔒 упёрся в бесплатный лимит',
  checkout_start: '🛒 нажал «Купить»',
  license_activated: '🔑 активировал лицензию',
};
export const ALERT_EVENTS = new Set(Object.keys(ACTION));
export const actionText = (name, product, cc, dev) => `${ACTION[name]} · ${PRODUCT('', product)}\n${countryName(cc)} · ${dev}`;

const sumMoney = (m = {}) => Object.entries(m).map(([c, v]) => `${Math.round(v * 100) / 100} ${c}`).join(', ') || '0';
const top = (m = {}, n = 3) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v}`).join(', ') || '—';

export function digestText(date, d = {}, prev = {}) {
  const ev = d.ev || {};
  const pe = prev.ev || {};
  const delta = (a, b) => (b ? ` (вчера ${b})` : '');
  const ll = (n) => (ev[n] || 0) - (ev[`iif_${n}`] || 0);
  const lines = [
    `📊 Итоги дня ${date}`,
    '',
    `LocalLedger: визиты ${ll('visit')}${delta(0, (pe.visit || 0) - (pe.iif_visit || 0))} · загрузили файл ${ev.file_loaded || 0} · лимит ${ev.export_locked || 0} · «Купить» ${ev.checkout_start || 0} · оплаты ${ev.purchase || 0}`,
    `IIF Kit: визиты ${ev.iif_visit || 0}${delta(0, pe.iif_visit)} · загрузили файл ${ev.iif_file_loaded || 0} · «Купить» ${ev.iif_checkout_start || 0} · оплаты ${ev.iif_purchase || 0}`,
    `Выручка: LocalLedger ${sumMoney(d.gross)} · IIF Kit ${sumMoney(d.gross_iif)}`,
    '',
    `Источники: ${top(d.ref)}`,
    `Страны: ${top(Object.fromEntries(Object.entries(d.cc || {}).map(([k, v]) => [countryName(k), v])))}`,
    `Устройства: ${top(d.dev)}`,
  ];
  return lines.join('\n');
}

/**
 * Called on any event; sends the day's digest once after 21:00 MSK. There is no cron on
 * Pages, so the first event after that hour triggers it (a quiet evening sends it next morning).
 */
export async function maybeDigest(env, deps, now = new Date()) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.LL_KV) return false;
  const day = new Date(now);
  if (now.getUTCHours() < DIGEST_HOUR_UTC) day.setUTCDate(day.getUTCDate() - 1);
  const date = day.toISOString().slice(0, 10);
  const flag = `tg:digest:${date}`;
  if (await env.LL_KV.get(flag)) return false;
  await env.LL_KV.put(flag, '1', { expirationTtl: 60 * 60 * 24 * 10 });
  const prevDay = new Date(day);
  prevDay.setUTCDate(prevDay.getUTCDate() - 1);
  const read = async (k) => JSON.parse((await env.LL_KV.get(`day:${k}`)) || '{}');
  return send(env, deps, digestText(date, await read(date), await read(prevDay.toISOString().slice(0, 10))));
}

// ---------------------------------------------------------------------------
// Webhook: Telegram pushes the owner's messages to /api/telegram. /start pins the
// chat at once (no 24 h getUpdates window); /stats answers from the same KV counters.

/** Secret Telegram echoes in X-Telegram-Bot-Api-Secret-Token, derived from the bot token. */
export async function webhookSecret(token) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ll-webhook:${token}`));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 48);
}

const HELP = 'Команды:\n/stats — сегодня и 7 дней\n/help — эта справка\n\nСами приходят: визиты людей, загрузки файлов, «Купить», продажи, итоги дня после 21:00 МСК.';

export function weekText(days) {
  const sum = {};
  const money = {};
  for (const { data } of days) {
    for (const [k, v] of Object.entries(data.ev || {})) sum[k] = (sum[k] || 0) + v;
    for (const m of ['gross', 'gross_iif']) for (const [c, v] of Object.entries(data[m] || {})) money[c] = (money[c] || 0) + v;
  }
  const ll = (n) => (sum[n] || 0) - (sum[`iif_${n}`] || 0);
  const visits = ll('visit') + (sum.iif_visit || 0);
  const buys = (sum.purchase || 0) + (sum.iif_purchase || 0);
  return [
    `📈 7 дней (${days[0].date} — ${days[days.length - 1].date})`,
    `LocalLedger: визиты ${ll('visit')} · файл ${sum.file_loaded || 0} · лимит ${sum.export_locked || 0} · «Купить» ${sum.checkout_start || 0} · оплаты ${sum.purchase || 0}`,
    `IIF Kit: визиты ${sum.iif_visit || 0} · файл ${sum.iif_file_loaded || 0} · «Купить» ${sum.iif_checkout_start || 0} · оплаты ${sum.iif_purchase || 0}`,
    `Выручка: ${sumMoney(money)} · конверсия визит→оплата ${visits ? Math.round((buys / visits) * 1000) / 10 : 0}%`,
  ].join('\n');
}

async function readDay(env, date) {
  return JSON.parse((await env.LL_KV.get(`day:${date}`)) || '{}');
}

/** Handles one Telegram update; returns the reply text (null = stay silent). */
export async function onUpdate(env, deps, update, now = new Date()) {
  const msg = update?.message;
  const chat = msg?.chat;
  if (!chat || chat.type !== 'private' || typeof msg.text !== 'string') return null;
  const id = String(chat.id);
  const cmd = msg.text.trim().split(/[\s@]/)[0].toLowerCase();
  let owner = env.TELEGRAM_CHAT_ID ? String(env.TELEGRAM_CHAT_ID) : await env.LL_KV.get('tg:chat');
  if (!owner && cmd === '/start') {
    await env.LL_KV.put('tg:chat', id);
    owner = id;
    return reply(env, deps, id, `Бот подключён. Сюда будут приходить визиты, покупки и итоги дня по LocalLedger и IIF Kit.\n\n${HELP}`);
  }
  if (owner !== id) return reply(env, deps, id, 'Это закрытый бот владельца сайта.');
  if (cmd === '/stats') {
    const dates = [];
    for (let i = 6; i >= 0; i--) dates.push(new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10));
    const days = await Promise.all(dates.map(async (date) => ({ date, data: await readDay(env, date) })));
    const today = days[6];
    return reply(env, deps, id, `${digestText(`${today.date} (на ${now.toISOString().slice(11, 16)} UTC)`, today.data, days[5].data).replace('Итоги дня', 'Сегодня')}\n\n${weekText(days)}`);
  }
  return reply(env, deps, id, HELP);
}

async function reply(env, deps, chatIdValue, text) {
  await call(env, deps, 'sendMessage', { chat_id: chatIdValue, text, disable_web_page_preview: true });
  return text;
}
