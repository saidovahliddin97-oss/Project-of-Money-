// Личный Telegram через официальный API (MTProto, библиотека GramJS).
// Один раз: `node edith/connect.mjs telegram` — вход по коду из Telegram.
// Сессия (TG_SESSION) хранится только в edith/.env (права 600) и в модель не
// передаётся. Завершить её можно в Telegram: Настройки → Устройства.

const SESSION_HINT = 'Telegram не подключён. Выполните в Терминале: node ~/EDITH/app/edith/connect.mjs telegram';
const DEPS_HINT = 'Модуль Telegram не установлен. Перезапустите Эдит кнопкой — она поставит его сама.';

export const telegramReady = () => Boolean(process.env.TG_API_ID && process.env.TG_API_HASH && process.env.TG_SESSION);

export async function tgLib() {
  try {
    const tg = (await import('telegram')).default;
    const sessions = (await import('telegram/sessions/index.js')).default;
    return { TelegramClient: tg.TelegramClient, Api: tg.Api, StringSession: sessions.StringSession };
  } catch { throw new Error(DEPS_HINT); }
}

let clientP = null;
async function client() {
  if (!telegramReady()) throw new Error(SESSION_HINT);
  if (!clientP) {
    clientP = (async () => {
      const { TelegramClient, StringSession } = await tgLib();
      let session;
      try { session = new StringSession(process.env.TG_SESSION); }
      catch { throw new Error('Сохранённая сессия Telegram повреждена. Подключите заново: node ~/EDITH/app/edith/connect.mjs telegram'); }
      const c = new TelegramClient(session, Number(process.env.TG_API_ID), process.env.TG_API_HASH, { connectionRetries: 5 });
      c.setLogLevel('none');
      await c.connect();
      if (!(await c.checkAuthorization())) throw new Error('Сессия Telegram больше не действует (её завершили). ' + SESSION_HINT);
      return c;
    })().catch((e) => { clientP = null; throw e; });
  }
  return clientP;
}

const fmt = (sec) => (sec ? new Date(sec * 1000).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const clip = (s, n) => (s && s.length > n ? s.slice(0, n) + '…' : s || '');
function nameOf(e) {
  if (!e) return 'неизвестно';
  if (e.title) return e.title;
  const n = [e.firstName, e.lastName].filter(Boolean).join(' ');
  return n || (e.username ? '@' + e.username : e.phone ? '+' + e.phone : 'без имени');
}
const kindOf = (d) => (d.isUser ? 'личный' : d.isChannel && !d.isGroup ? 'канал' : 'группа');

// dialogs are needed to resolve names → cache them briefly
let dialogsCache = { at: 0, list: [] };
async function dialogs(limit = 300) {
  if (Date.now() - dialogsCache.at < 120000 && dialogsCache.list.length >= Math.min(limit, 300)) return dialogsCache.list.slice(0, limit);
  const c = await client();
  const list = await c.getDialogs({ limit: Math.max(limit, 300) });
  dialogsCache = { at: Date.now(), list };
  return list.slice(0, limit);
}

/** Recent chats (optionally only unread). */
export async function tgChats({ limit = 15, unreadOnly = false } = {}) {
  const n = Math.min(Math.max(Number(limit) || 15, 1), 50);
  const list = (await dialogs(300)).filter((d) => !d.archived && (!unreadOnly || d.unreadCount > 0)).slice(0, n);
  return list.map((d) => ({
    name: d.title || nameOf(d.entity), kind: kindOf(d), username: d.entity?.username ? '@' + d.entity.username : '',
    unread: d.unreadCount || 0, last: clip(d.message?.message || (d.message?.media ? '[медиа]' : ''), 160), at: fmt(d.date),
  }));
}

/** Find people/chats by name, @username or phone among dialogs, contacts and global search. */
export async function tgFind(query, limit = 8) {
  const q = String(query || '').trim();
  if (!q) throw new Error('Пустой запрос.');
  const c = await client();
  const { Api } = await tgLib();
  const low = q.toLowerCase().replace(/^@/, '');
  const found = new Map();
  for (const d of await dialogs(300)) {
    const title = (d.title || '').toLowerCase(), un = (d.entity?.username || '').toLowerCase();
    if (title.includes(low) || (un && un.includes(low))) found.set(String(d.id), { name: d.title || nameOf(d.entity), username: un ? '@' + un : '', kind: kindOf(d), inChats: true });
  }
  try {
    const r = await c.invoke(new Api.contacts.Search({ q, limit: 10 }));
    for (const u of r.users || []) if (!found.has(String(u.id))) found.set(String(u.id), { name: nameOf(u), username: u.username ? '@' + u.username : '', kind: u.bot ? 'бот' : 'личный', inChats: false, contact: Boolean(u.contact) });
    for (const ch of r.chats || []) if (!found.has(String(ch.id))) found.set(String(ch.id), { name: nameOf(ch), username: ch.username ? '@' + ch.username : '', kind: ch.broadcast ? 'канал' : 'группа', inChats: false });
  } catch { /* global search is a bonus */ }
  return [...found.values()].slice(0, limit);
}

// name / @username / +phone → entity
async function resolve(chat) {
  const q = String(chat || '').trim();
  if (!q) throw new Error('Не указан чат.');
  const c = await client();
  const low = q.toLowerCase().replace(/^@/, '');
  const ds = await dialogs(300);
  const exact = ds.find((d) => (d.title || '').toLowerCase() === low || (d.entity?.username || '').toLowerCase() === low);
  if (exact) return exact.entity;
  if (/^@?[a-z0-9_]{4,}$/i.test(q) || /^\+?\d{7,}$/.test(q)) { try { return await c.getEntity(q); } catch {} }
  const partial = ds.filter((d) => (d.title || '').toLowerCase().includes(low));
  if (partial.length === 1) return partial[0].entity;
  if (partial.length > 1) throw new Error(`Нашла несколько чатов: ${partial.slice(0, 5).map((d) => d.title).join(', ')}. Уточните, какой.`);
  const hits = await tgFind(q, 3);
  if (hits[0]?.username) return c.getEntity(hits[0].username);
  throw new Error(`Не нашла чат «${q}». Скажите точное имя, @username или номер.`);
}

/** Last messages of a chat, oldest first. Does not mark them as read. */
export async function tgRead(chat, limit = 20) {
  const c = await client();
  const entity = await resolve(chat);
  const msgs = await c.getMessages(entity, { limit: Math.min(Math.max(Number(limit) || 20, 1), 100) });
  return {
    chat: nameOf(entity),
    messages: msgs.map((m) => ({ at: fmt(m.date), out: Boolean(m.out), from: m.out ? 'босс' : nameOf(m.sender || entity), text: clip(m.message || (m.media ? '[медиа]' : ''), 600) })).reverse(),
  };
}

/** Send a message as the boss (only after the confirm card). */
export async function tgSend(chat, text) {
  if (!String(text || '').trim()) throw new Error('Пустое сообщение.');
  const c = await client();
  const entity = await resolve(chat);
  await c.sendMessage(entity, { message: String(text) });
  dialogsCache.at = 0;
  return nameOf(entity);
}
