// Эдит — local server. Serves the HUD and bridges the browser to Claude and to
// this Mac. Runs entirely on the owner's machine. Start: `node edith/server.mjs`
// then open http://localhost:4330

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { streamMessage, DEFAULT_MODEL } from './lib/claude.mjs';
import { runAction, describe, isSensitive, isEnabled, enabledActions } from './lib/computer.mjs';
import { Proactive } from './lib/proactive.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, 'public');
const PORT = Number(process.env.EDITH_PORT || 4330);

const proactive = new Proactive();
const eventClients = new Set();

const SYSTEM = `Ты — Эдит (EDITH), персональный ИИ-ассистент босса в стиле Джарвиса из фильмов про Железного человека.
Характер: спокойный, собранный, предельно полезный, с лёгкой иронией. Обращайся к пользователю «босс».
Язык: русский. Пиши кратко и по делу, без эмодзи.
У тебя есть инструменты управления этим Mac (открыть программу/ссылку, печатать, клики, горячие клавиши, снимок экрана, уведомления, AppleScript, команды терминала) и веб-поиск.
Используй инструменты, когда это помогает выполнить просьбу. Опасные действия (ввод текста, клики, клавиши, AppleScript, терминал) система сама попросит подтвердить у босса — не спрашивай подтверждение словами, просто вызывай инструмент, подтверждение возьмёт на себя интерфейс.
Если инструмент недоступен или вернул ошибку — честно скажи об этом.`;

// --- Claude tool definitions mirroring the computer bridge -----------------
const COMPUTER_TOOLS = [
  { name: 'say', description: 'Произнести текст вслух голосом macOS.', input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false } },
  { name: 'open_app', description: 'Открыть приложение по имени (например "Safari").', input_schema: { type: 'object', properties: { app: { type: 'string' } }, required: ['app'], additionalProperties: false } },
  { name: 'open_url', description: 'Открыть ссылку в браузере по умолчанию.', input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'], additionalProperties: false } },
  { name: 'notify', description: 'Показать системное уведомление.', input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false } },
  { name: 'screenshot', description: 'Сделать снимок экрана и посмотреть, что на нём.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'type_text', description: 'Напечатать текст в активном окне.', input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false } },
  { name: 'key', description: 'Нажать сочетание клавиш, например "cmd+s" или "cmd+shift+4".', input_schema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'], additionalProperties: false } },
  { name: 'click', description: 'Кликнуть левой кнопкой мыши по координатам экрана.', input_schema: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'], additionalProperties: false } },
  { name: 'applescript', description: 'Выполнить AppleScript для управления приложениями macOS.', input_schema: { type: 'object', properties: { script: { type: 'string' } }, required: ['script'], additionalProperties: false } },
  { name: 'shell', description: 'Выполнить команду в терминале (bash).', input_schema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'], additionalProperties: false } },
];

function tools() {
  // Only expose the actions that are actually enabled (shell/applescript are
  // off unless EDITH_ALLOW_SHELL=1), so Claude is never offered a disabled tool.
  const allowed = new Set(enabledActions());
  const t = COMPUTER_TOOLS.filter((tool) => allowed.has(tool.name));
  if (process.env.EDITH_WEBSEARCH !== '0') {
    t.push({ type: 'web_search_20260209', name: 'web_search', max_uses: 5 });
  }
  return t;
}

// Localhost-only guard: refuse requests driven from another origin (a stray
// webpage must not be able to reach this bridge via the browser). Same-origin
// fetches from the HUD send no Origin header or one that matches the host.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin fetch / curl — allowed
  try {
    const h = new URL(origin).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  } catch { return false; }
}

// --- tiny SSE helpers ------------------------------------------------------
function sseHead(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
}
function sse(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

// Run the Claude agent loop, streaming to the SSE response. `messages` is the
// full history (client-owned). Returns when it needs confirmation or is done.
async function runLoop(res, messages) {
  for (;;) {
    const msg = await streamMessage(
      { max_tokens: 8000, system: SYSTEM, tools: tools(), messages },
      (delta) => sse(res, { type: 'text', delta }),
    );
    messages.push({ role: 'assistant', content: msg.content });

    if (msg.stop_reason === 'pause_turn') continue; // server tool (web_search) — resume

    const toolUses = msg.content.filter((b) => b.type === 'tool_use');
    if (toolUses.length === 0) {
      sse(res, { type: 'done', messages });
      return;
    }

    // If any tool in this turn is sensitive, hand the whole turn to the user.
    if (toolUses.some((t) => isSensitive(t.name))) {
      sse(res, {
        type: 'confirm',
        messages,
        actions: toolUses.map((t) => ({
          id: t.id, name: t.name, input: t.input,
          sensitive: isSensitive(t.name), desc: describe({ name: t.name, ...t.input }),
        })),
      });
      return;
    }

    // All safe — execute now and continue without bothering the user.
    const results = [];
    for (const t of toolUses) results.push(await execToResult(t));
    messages.push({ role: 'user', content: results });
  }
}

// Execute one tool_use and wrap it as a tool_result content block.
async function execToResult(toolUse, approved = true) {
  if (!approved) {
    return { type: 'tool_result', tool_use_id: toolUse.id, is_error: true, content: 'Босс отклонил это действие.' };
  }
  try {
    const out = await runAction({ name: toolUse.name, ...toolUse.input });
    if (!out.ok) {
      return { type: 'tool_result', tool_use_id: toolUse.id, is_error: true, content: out.error || 'Не удалось выполнить.' };
    }
    if (out.image) {
      return { type: 'tool_result', tool_use_id: toolUse.id, content: [
        { type: 'image', source: { type: 'base64', media_type: out.media_type, data: out.image } },
      ] };
    }
    return { type: 'tool_result', tool_use_id: toolUse.id, content: String(out.result ?? 'Готово.') };
  } catch (e) {
    return { type: 'tool_result', tool_use_id: toolUse.id, is_error: true, content: String(e.message || e) };
  }
}

// --- request body reader ---------------------------------------------------
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
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
  } catch {
    res.writeHead(404).end('Not found');
  }
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
      // The last assistant message holds the tool_use blocks awaiting answers.
      const last = messages[messages.length - 1];
      const toolUses = (last?.content || []).filter((b) => b.type === 'tool_use');
      const results = [];
      for (const t of toolUses) {
        const approved = !isSensitive(t.name) || approvals?.[t.id] === true;
        results.push(await execToResult(t, approved));
      }
      messages.push({ role: 'user', content: results });
      await runLoop(res, messages);
      res.end();
      return;
    }

    if (req.method === 'POST' && url === '/api/beat') {
      proactive.touch('beat');
      res.writeHead(204).end();
      return;
    }

    if (req.method === 'POST' && url === '/api/proactive') {
      const { enabled } = await readBody(req);
      proactive.enabled = enabled !== false;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ enabled: proactive.enabled }));
      return;
    }

    if (req.method === 'GET' && url === '/api/events') {
      sseHead(res);
      sse(res, { type: 'hello', model: DEFAULT_MODEL, actions: enabledActions() });
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
  console.log(`\n  ЭДИТ запущена.  Откройте  http://localhost:${PORT}\n  Модель: ${DEFAULT_MODEL}  |  ключ: ${process.env.ANTHROPIC_API_KEY ? 'найден' : 'НЕ задан (см. edith/.env.example)'}\n`);
});
