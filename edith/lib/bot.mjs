// Telegram-бот «Эдит»: босс пишет или наговаривает голосовые с любого устройства,
// Эдит отвечает. Без библиотек: Bot API через fetch, long polling (getUpdates) —
// не нужен ни домен, ни открытый порт, работает и с Mac, и с сервера.
//
// Безопасность: бот отвечает только владельцу (EDITH_BOT_OWNER — id чата,
// закреплённый командой `node connect.mjs bot`); любые отправки писем и
// сообщений подтверждаются кнопками в чате.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = path.join(HERE, '..', '.bot-history.json');
const API = (process.env.EDITH_TG_API || 'https://api.telegram.org').replace(/\/$/, '');
const MAX_HISTORY = 60;   // messages kept for context
const TG_LIMIT = 4000;    // Telegram allows 4096 chars per message

export const botReady = () => Boolean(process.env.EDITH_BOT_TOKEN && process.env.EDITH_BOT_OWNER);

// ---------- Bot API ----------
export async function tg(token, method, body = {}, timeoutMs = 65000) {
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
  if (!data.ok) { const e = new Error(data.description || 'Telegram error'); e.code = data.error_code; throw e; }
  return data.result;
}

// ---------- formatting: model markdown → Telegram HTML ----------
const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unescapeModel = (t) => String(t || '').replace(/\\n/g, '\n').replace(/\\t/g, ' ').replace(/\\(["'`\\/])/g, '$1');
function toHtml(md) {
  return escHtml(unescapeModel(md))
    .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/^#{1,6}\s*(.+)$/gm, '<b>$1</b>')
    .replace(/^\s*[-*]\s+/gm, '• ');
}
function chunks(text) {
  const out = [];
  let rest = text;
  while (rest.length > TG_LIMIT) {
    let cut = rest.lastIndexOf('\n', TG_LIMIT);
    if (cut < TG_LIMIT / 2) cut = TG_LIMIT;
    out.push(rest.slice(0, cut)); rest = rest.slice(cut);
  }
  if (rest.trim()) out.push(rest);
  return out;
}

// ---------- history ----------
async function loadHistory() {
  try { const h = JSON.parse(await readFile(HISTORY_FILE, 'utf8')); return Array.isArray(h) ? h : []; } catch { return []; }
}
async function saveHistory(h) {
  try { await writeFile(HISTORY_FILE, JSON.stringify(h), { mode: 0o600 }); } catch {}
}
// keep the tail, starting at a user message, so tool calls/results stay paired
function trim(h) {
  const clean = h.filter((m) => !(m.role === 'system' && String(m.content).startsWith('[Экран босса')));
  if (clean.length <= MAX_HISTORY) return clean;
  let i = clean.length - MAX_HISTORY;
  while (i < clean.length && clean[i].role !== 'user') i++;
  return clean.slice(i);
}

// ---------- voice → text (free Groq Whisper) ----------
// A key added to edith/.env while Эдит runs is picked up without a restart.
function envKey(name) {
  if (!process.env[name]) { try { process.loadEnvFile(path.join(HERE, '..', '.env')); } catch {} }
  return process.env[name];
}

async function transcribe(buf) {
  const key = envKey('GROQ_API_KEY');
  if (!key) throw new Error('Голосовые я пойму, если подключить бесплатный ключ Groq: впишите GROQ_API_KEY в edith/.env (ключ на console.groq.com). Пока пишите текстом.');
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'audio/ogg' }), 'voice.ogg');
  fd.append('model', process.env.EDITH_STT_MODEL || 'whisper-large-v3-turbo');
  fd.append('language', 'ru');
  const res = await fetch(`${process.env.EDITH_STT_BASE || 'https://api.groq.com/openai/v1'}/audio/transcriptions`, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: fd, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`Не удалось распознать голосовое (Groq ${res.status}).`);
  return String((await res.json()).text || '').trim();
}

// ---------- the bot ----------
export function startBot({ turn, resume }) {
  const token = process.env.EDITH_BOT_TOKEN;
  const owner = String(process.env.EDITH_BOT_OWNER);
  let history = [];
  let pending = null;   // { nonce, messages, actions } while a confirm card is open
  let busy = false;
  let offset = 0;
  const strangers = new Set();

  const send = async (text, extra = {}) => {
    for (const part of chunks(text)) {
      try { await tg(token, 'sendMessage', { chat_id: owner, text: toHtml(part), parse_mode: 'HTML', disable_web_page_preview: true, ...extra }); }
      catch { await tg(token, 'sendMessage', { chat_id: owner, text: unescapeModel(part), disable_web_page_preview: true, ...extra }).catch(() => {}); }
      extra = {}; // buttons go under the first part only
    }
  };
  const typing = () => tg(token, 'sendChatAction', { chat_id: owner, action: 'typing' }).catch(() => {});

  // run one turn of the agent and deliver its outcome to Telegram
  async function run(work) {
    busy = true;
    const sink = { text: '', windows: [], result: null, event(o) {
      if (o.type === 'text') this.text += o.delta;
      else if (o.type === 'panel' && o.op === 'open') this.windows.push(o.window);
      else if (o.type === 'confirm' || o.type === 'done' || o.type === 'error') this.result = o;
    } };
    typing();
    const keepTyping = setInterval(typing, 4500);
    try { await work(sink); }
    catch (e) { sink.result = { type: 'error', error: e.message || String(e) }; }
    finally { clearInterval(keepTyping); busy = false; }

    const r = sink.result || { type: 'done', messages: history };
    const links = sink.windows.filter((w) => w.url).map((w) => `${w.title || 'ссылка'}: ${w.url}`).join('\n');
    if (r.type === 'error') { await send('⚠️ ' + r.error); return; }
    history = trim(r.messages || history);
    await saveHistory(history);
    if (r.type === 'confirm') {
      const nonce = Math.random().toString(36).slice(2, 10);
      pending = { nonce, messages: r.messages, actions: r.actions };
      const what = r.actions.filter((a) => a.sensitive).map((a) => '• ' + a.desc).join('\n');
      if (sink.text.trim()) await send(sink.text);
      await send(`Подтвердите действие:\n${what}`, { reply_markup: { inline_keyboard: [[{ text: 'Разрешить', callback_data: `ok:${nonce}` }, { text: 'Отклонить', callback_data: `no:${nonce}` }]] } });
      return;
    }
    await send([sink.text.trim() || 'Готово.', links].filter(Boolean).join('\n\n'));
  }

  async function onText(text) {
    if (busy) { await send('Секунду, ещё работаю над прошлой просьбой.'); return; }
    if (pending) pending = null; // a new request cancels an unanswered confirm card
    history.push({ role: 'user', content: text });
    await run((sink) => turn(sink, history));
  }

  async function onMessage(m) {
    const chat = String(m.chat?.id);
    if (chat !== owner || m.chat?.type !== 'private') {
      if (!strangers.has(chat)) { strangers.add(chat); await tg(token, 'sendMessage', { chat_id: m.chat.id, text: 'Это личный бот.' }).catch(() => {}); }
      return;
    }
    const text = (m.text || m.caption || '').trim();
    if (text === '/start' || text === '/help') { await send('Я на связи, босс. Пишите или присылайте голосовые.\n/new — начать разговор заново'); return; }
    if (text === '/new') { history = []; pending = null; await saveHistory(history); await send('Начнём с чистого листа.'); return; }
    if (m.voice || m.audio) {
      try {
        typing();
        const file = await tg(token, 'getFile', { file_id: (m.voice || m.audio).file_id });
        const audio = await fetch(`${API}/file/bot${token}/${file.file_path}`, { signal: AbortSignal.timeout(60000) });
        const said = await transcribe(Buffer.from(await audio.arrayBuffer()));
        if (!said) { await send('Не расслышала, повторите, пожалуйста.'); return; }
        await send(`Вы сказали: «${said}»`);
        await onText(said);
      } catch (e) { await send(e.message); }
      return;
    }
    if (text) { await onText(text); return; }
    await send('Пока понимаю текст и голосовые сообщения.');
  }

  async function onCallback(q) {
    if (String(q.from?.id) !== owner) { await tg(token, 'answerCallbackQuery', { callback_query_id: q.id, text: 'Нет доступа' }).catch(() => {}); return; }
    const [verdict, nonce] = String(q.data || '').split(':');
    await tg(token, 'answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
    // remove the buttons so the card can't be pressed twice
    await tg(token, 'editMessageReplyMarkup', { chat_id: owner, message_id: q.message?.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
    if (!pending || pending.nonce !== nonce || busy) { await send('Эта кнопка устарела.'); return; }
    const { messages, actions } = pending; pending = null;
    const ok = verdict === 'ok';
    const approvals = Object.fromEntries(actions.filter((a) => a.sensitive).map((a) => [a.id, ok]));
    await send(ok ? 'Разрешено, выполняю.' : 'Отклонено.');
    await run((sink) => resume(sink, messages, approvals));
  }

  async function loop() {
    history = await loadHistory();
    // skip messages sent while Эдит was off, so an old backlog never triggers actions
    try { const old = await tg(token, 'getUpdates', { offset: -1, timeout: 0 }); if (old.length) offset = old[old.length - 1].update_id + 1; } catch {}
    console.log('  Telegram-бот Эдит: на связи');
    let backoff = 2000;
    for (;;) {
      try {
        const updates = await tg(token, 'getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] });
        backoff = 2000;
        for (const u of updates) {
          offset = u.update_id + 1;
          try {
            if (u.message) await onMessage(u.message);
            else if (u.callback_query) await onCallback(u.callback_query);
          } catch (e) { console.error('bot:', e.message); }
        }
      } catch (e) {
        if (e.code === 409) console.error('bot: этого бота уже слушает другая копия Эдит (409) — повторю позже');
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 60000);
      }
    }
  }
  loop();
}
