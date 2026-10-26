// Эдит — local server. Serves the HUD and bridges the browser to a (free) LLM
// and to this Mac. Runs entirely on the owner's machine.
// Start: `node edith/server.mjs` then open http://localhost:4330

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { streamChat, MODEL_LABEL, config } from './lib/llm.mjs';
import { runAction, describe, isSensitive, isEnabled, enabledActions } from './lib/computer.mjs';
import { webSearch } from './lib/search.mjs';
import { Proactive } from './lib/proactive.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, 'public');
const PORT = Number(process.env.EDITH_PORT || 4330);

const proactive = new Proactive();
const eventClients = new Set();

const SYSTEM = `Ты — Эдит (EDITH), персональный ИИ-ассистент босса в стиле Джарвиса из фильмов про Железного человека.
Характер: спокойный, собранный, предельно полезный, с лёгкой иронией. Обращайся к пользователю «босс».
Язык: русский. Пиши кратко и по делу, без эмодзи.
У тебя есть инструменты: управление этим Mac (открыть программу/ссылку, печатать, клики, горячие клавиши, снимок экрана, уведомления), веб-поиск (web_search) и окна внутри собственного интерфейса (open_window / close_windows).
Используй инструменты, когда это помогает выполнить просьбу. Опасные действия (ввод текста, клики, клавиши) система сама попросит подтвердить у босса — не проси подтверждение словами, просто вызови инструмент.
Чтобы показать сайт/заметку/картинку КИНОШНО внутри твоего интерфейса — open_window (kind web/note/image). Чтобы передать в обычный браузер — open_url.
Если нужен свежий факт из интернета — вызови web_search и перескажи результат своими словами со ссылкой.
Отвечай кратко — это экономит время и заряд батареи. Если инструмент вернул ошибку — честно скажи.`;

// --- tool definitions (OpenAI function-calling format) ---------------------
const fn = (name, description, properties, required = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } },
});

const COMPUTER_TOOLS = {
  say:        fn('say', 'Произнести текст вслух голосом macOS.', { text: { type: 'string' } }, ['text']),
  open_app:   fn('open_app', 'Открыть приложение по имени (например "Safari").', { app: { type: 'string' } }, ['app']),
  open_url:   fn('open_url', 'Открыть ссылку в браузере по умолчанию.', { url: { type: 'string' } }, ['url']),
  notify:     fn('notify', 'Показать системное уведомление.', { text: { type: 'string' } }, ['text']),
  screenshot: fn('screenshot', 'Сделать снимок экрана.', {}),
  type_text:  fn('type_text', 'Напечатать текст в активном окне.', { text: { type: 'string' } }, ['text']),
  key:        fn('key', 'Нажать сочетание клавиш, например "cmd+s".', { key: { type: 'string' } }, ['key']),
  click:      fn('click', 'Кликнуть мышью по координатам экрана.', { x: { type: 'number' }, y: { type: 'number' } }, ['x', 'y']),
  applescript:fn('applescript', 'Выполнить AppleScript.', { script: { type: 'string' } }, ['script']),
  shell:      fn('shell', 'Выполнить команду в терминале (bash).', { command: { type: 'string' } }, ['command']),
};

const HUD_TOOLS = {
  open_window:   fn('open_window', 'Открыть окно ВНУТРИ интерфейса Эдит (киношно). kind: "web" — сайт по url; "note" — текст; "image" — картинка по url.', { title: { type: 'string' }, kind: { type: 'string', enum: ['web', 'note', 'image'] }, url: { type: 'string' }, text: { type: 'string' } }, ['title', 'kind']),
  close_windows: fn('close_windows', 'Закрыть все окна в интерфейсе Эдит.', {}),
};

const SEARCH_TOOL = fn('web_search', 'Искать в интернете (бесплатно, без ключа). Вернёт топ-результаты.', { query: { type: 'string' } }, ['query']);

const HUD_NAMES = new Set(Object.keys(HUD_TOOLS));
const isHud = (name) => HUD_NAMES.has(name);
const isSearch = (name) => name === 'web_search';
// HUD and search tools are never sensitive; Mac tools use the bridge's class.
const sensitive = (name) => (isHud(name) || isSearch(name) ? false : isSensitive(name));

function tools() {
  const allowed = new Set(enabledActions());
  const list = Object.entries(COMPUTER_TOOLS).filter(([n]) => allowed.has(n)).map(([, t]) => t);
  list.push(...Object.values(HUD_TOOLS));
  if (process.env.EDITH_WEBSEARCH !== '0') list.push(SEARCH_TOOL);
  return list;
}

function argsOf(toolCall) {
  try { return JSON.parse(toolCall.function.arguments || '{}'); } catch { return {}; }
}

// --- tiny SSE helpers ------------------------------------------------------
function sseHead(res) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
}
const sse = (res, obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

// Run the agent loop, streaming to the SSE response. `messages` is the full
// history (client-owned, OpenAI format). Returns when it needs confirmation
// or is done.
async function runLoop(res, messages) {
  for (let guard = 0; guard < 12; guard++) {
    const result = await streamChat(
      { messages, system: SYSTEM, tools: tools(), max_tokens: 1024 },
      (delta) => sse(res, { type: 'text', delta }),
    );

    const assistant = { role: 'assistant', content: result.content || '' };
    if (result.tool_calls.length) assistant.tool_calls = result.tool_calls;
    messages.push(assistant);

    if (!result.tool_calls.length) { sse(res, { type: 'done', messages }); return; }

    if (result.tool_calls.some((tc) => sensitive(tc.function.name))) {
      sse(res, {
        type: 'confirm', messages,
        actions: result.tool_calls.map((tc) => {
          const input = argsOf(tc);
          return { id: tc.id, name: tc.function.name, input, sensitive: sensitive(tc.function.name), desc: describe({ name: tc.function.name, ...input }) };
        }),
      });
      return;
    }

    for (const tc of result.tool_calls) messages.push(await execToResult(res, tc));
  }
  sse(res, { type: 'done', messages });
}

// Execute one tool_call and wrap it as an OpenAI tool-result message.
async function execToResult(res, toolCall, approved = true) {
  const id = toolCall.id;
  const name = toolCall.function.name;
  const input = argsOf(toolCall);
  const result = (content) => ({ role: 'tool', tool_call_id: id, content: String(content) });

  if (!approved) return result('Босс отклонил это действие.');

  if (isSearch(name)) return result(await webSearch(input.query));

  if (isHud(name)) {
    if (name === 'close_windows') { sse(res, { type: 'panel', op: 'close_all' }); return result('Окна закрыты.'); }
    sse(res, { type: 'panel', op: 'open', window: { id, ...input } });
    return result(`Окно «${input.title || ''}» открыто в интерфейсе.`);
  }

  try {
    const out = await runAction({ name, ...input });
    if (!out.ok) return result(out.error || 'Не удалось выполнить.');
    if (out.image) return result('Снимок экрана сделан.'); // free/local models обычно без зрения
    return result(out.result ?? 'Готово.');
  } catch (e) {
    return result('Ошибка: ' + (e.message || e));
  }
}

// --- request helpers -------------------------------------------------------
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const h = new URL(origin).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  } catch { return false; }
}

// --- static files ----------------------------------------------------------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
async function serveStatic(req, res) {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const file = path.join(PUBLIC, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404).end('Not found'); }
}

// --- server ----------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  try {
    if (req.method === 'POST' && !sameOrigin(req)) {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'cross-origin запрещён' }));
      return;
    }

    if (req.method === 'POST' && url === '/api/chat') {
      const { messages } = await readBody(req);
      proactive.touch('message');
      sseHead(res);
      await runLoop(res, Array.isArray(messages) ? messages : []);
      res.end();
      return;
    }

    if (req.method === 'POST' && url === '/api/confirm') {
      const { messages, approvals } = await readBody(req);
      proactive.touch('message');
      sseHead(res);
      const last = messages[messages.length - 1];
      const toolCalls = last?.tool_calls || [];
      for (const tc of toolCalls) {
        const approved = !sensitive(tc.function.name) || approvals?.[tc.id] === true;
        messages.push(await execToResult(res, tc, approved));
      }
      await runLoop(res, messages);
      res.end();
      return;
    }

    if (req.method === 'POST' && url === '/api/beat') { proactive.touch('beat'); res.writeHead(204).end(); return; }

    if (req.method === 'POST' && url === '/api/proactive') {
      const { enabled } = await readBody(req);
      proactive.enabled = enabled !== false;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ enabled: proactive.enabled }));
      return;
    }

    if (req.method === 'GET' && url === '/api/events') {
      sseHead(res);
      sse(res, { type: 'hello', model: MODEL_LABEL(), actions: enabledActions() });
      eventClients.add(res);
      req.on('close', () => eventClients.delete(res));
      return;
    }

    await serveStatic(req, res);
  } catch (e) {
    if (res.headersSent) { try { sse(res, { type: 'error', error: String(e.message || e) }); res.end(); } catch {} }
    else { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String(e.message || e) })); }
  }
});

// Proactive loop: once a minute, maybe push a line to the open HUDs.
setInterval(async () => {
  if (!eventClients.size) return;
  const line = await proactive.maybeNudge();
  if (!line) return;
  for (const res of eventClients) { try { sse(res, { type: 'proactive', text: line }); } catch {} }
}, 60 * 1000);

server.listen(PORT, () => {
  const c = config();
  const keyNote = c.provider === 'ollama' ? 'локально, ключ не нужен' : (c.key && c.key !== 'none' ? 'ключ найден' : 'КЛЮЧ НЕ ЗАДАН — см. edith/.env.example');
  console.log(`\n  ЭДИТ запущена.  Откройте  http://localhost:${PORT}\n  Мозг: ${MODEL_LABEL()}  |  ${keyNote}\n`);
});
