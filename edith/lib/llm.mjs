// Универсальный клиент к бесплатным LLM через OpenAI-совместимый протокол
// (/chat/completions). Держит цепочку провайдеров: если текущий упёрся в лимит
// или недоступен, запрос молча уходит следующему (бесшовно для пользователя).
// Zero-dependency: глобальный fetch (Node 20+).

const PRESETS = {
  // Через приложение Ollama. По умолчанию облачная модель (*-cloud): считает на
  // серверах Ollama, Mac почти не нагружается; нужен вход в аккаунт Ollama.
  ollama:     { base: 'http://localhost:11434/v1',                             keyEnv: null,                 model: 'gemma4:31b-cloud' },
  // Облачные бесплатные (нужен бесплатный ключ, без карты).
  groq:       { base: 'https://api.groq.com/openai/v1',                        keyEnv: 'GROQ_API_KEY',       model: 'llama-3.3-70b-versatile' },
  gemini:     { base: 'https://generativelanguage.googleapis.com/v1beta/openai', keyEnv: 'GEMINI_API_KEY',   model: 'gemini-2.0-flash' },
  openrouter: { base: 'https://openrouter.ai/api/v1',                          keyEnv: 'OPENROUTER_API_KEY', model: 'meta-llama/llama-3.3-70b-instruct:free' },
  mistral:    { base: 'https://api.mistral.ai/v1',                             keyEnv: 'MISTRAL_API_KEY',    model: 'mistral-small-latest' },
};

const DEFAULT_CHAIN = 'ollama,groq,gemini,openrouter,mistral';
const VISION_RE = /gemma-?[34]|gemini|llava|vision|qwen.*vl|pixtral|llama-?4/i;

// Build one provider entry from env. EDITH_PROVIDER/EDITH_MODEL/EDITH_BASE_URL
// keep working and describe the primary provider.
function entry(name) {
  const p = PRESETS[name];
  if (!p) return null;
  const primary = (process.env.EDITH_PROVIDER || 'ollama').toLowerCase() === name;
  const key = (p.keyEnv && process.env[p.keyEnv]) || (primary && process.env.EDITH_API_KEY) || '';
  if (p.keyEnv && !key) return null; // cloud provider without a key: skip
  const model = process.env[`${name.toUpperCase()}_MODEL`] || (primary && process.env.EDITH_MODEL) || p.model;
  const base = (process.env[`${name.toUpperCase()}_BASE_URL`] || (primary && process.env.EDITH_BASE_URL) || p.base).replace(/\/$/, '');
  const vision = process.env.EDITH_VISION === '1' || VISION_RE.test(model);
  return { provider: name, base, key: key || 'none', model, vision, id: `${name}:${model}` };
}

/** Configured providers in priority order (only usable ones). */
export function chain() {
  const primary = (process.env.EDITH_PROVIDER || 'ollama').toLowerCase();
  const order = (process.env.EDITH_CHAIN || DEFAULT_CHAIN).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const names = [primary, ...order.filter((n) => n !== primary)];
  return names.map(entry).filter(Boolean);
}

/** The primary provider (first in the chain). Kept for older callers. */
export function config() { return chain()[0] || entry('ollama'); }

// --- failover bookkeeping ---------------------------------------------------
const cooldownUntil = new Map(); // provider id -> timestamp
let lastServed = null;

export const MODEL_LABEL = () => (lastServed || config()).id;

function cool(p, err) {
  // 429 honours Retry-After; auth/billing problems back off longer.
  let ms = 10 * 60 * 1000;
  if (err.retryAfter) ms = Math.max(5000, err.retryAfter * 1000);
  else if ([401, 402, 403, 404].includes(err.status)) ms = 30 * 60 * 1000;
  else if (!err.status) ms = 2 * 60 * 1000; // network / not running
  cooldownUntil.set(p.id, Date.now() + ms);
}

// Errors worth switching provider for (limits, auth, outages, network).
const shouldFailover = (err) => !err.status || [401, 402, 403, 404, 408, 409, 429].includes(err.status) || err.status >= 500;

// Conversations with mail/messages/screen never go to these providers
// (free Gemini may use data to improve its products).
const PRIVATE_EXCLUDE = new Set((process.env.EDITH_PRIVATE_EXCLUDE ?? 'gemini').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));

function orderedProviders(need = {}) {
  const now = Date.now();
  let list = chain();
  if (need.vision) list = list.filter((p) => p.vision);
  if (need.private) list = list.filter((p) => !PRIVATE_EXCLUDE.has(p.provider));
  const ready = list.filter((p) => (cooldownUntil.get(p.id) || 0) <= now);
  // Everyone cooling down: try them anyway, soonest-to-recover first.
  return ready.length ? ready : [...list].sort((a, b) => (cooldownUntil.get(a.id) || 0) - (cooldownUntil.get(b.id) || 0));
}

function headers(key) {
  const h = { 'content-type': 'application/json' };
  if (key && key !== 'none') h.authorization = `Bearer ${key}`;
  return h;
}

async function postTo(p, body, stream) {
  let res;
  try {
    res = await fetch(`${p.base}/chat/completions`, {
      method: 'POST',
      headers: headers(p.key),
      body: JSON.stringify({ model: p.model, ...body, stream }),
      signal: AbortSignal.timeout(90000),
    });
  } catch (e) {
    const err = new Error(`${p.provider}: нет связи (${e.message})${hint(p)}`);
    err.status = 0;
    throw err;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`${p.provider} ${res.status}: ${text.slice(0, 200)}${hint(p, res.status)}`);
    err.status = res.status;
    err.retryAfter = Number(res.headers.get('retry-after')) || 0;
    err.noTools = /does not support tools|tool(s)? (are|is) not supported|tool use is not supported/i.test(text);
    throw err;
  }
  return res;
}

function hint(p, status) {
  if (p.provider !== 'ollama') return '';
  if (/-cloud$/.test(p.model) && (status === 401 || status === 403)) return ' (нужен вход: приложение Ollama → Sign In)';
  if (status === 404) return ` (модель не найдена: ollama pull ${p.model})`;
  if (!status) return ' (приложение Ollama запущено?)';
  return '';
}

// Providers/models that rejected tool calling: we stop sending tools to them.
const noToolModels = new Set();

/**
 * Send a request down the chain until one provider accepts it. Failover happens
 * before any output is shown, so the switch is invisible to the user.
 */
async function request(body, stream, need = {}) {
  const errors = [];
  for (const p of orderedProviders(need)) {
    const b = { ...body };
    if (b.tools && noToolModels.has(p.id)) { delete b.tools; delete b.tool_choice; }
    try {
      let res;
      try {
        res = await postTo(p, b, stream);
      } catch (e) {
        if (!e.noTools || !b.tools) throw e;
        noToolModels.add(p.id); // chat without tools rather than switch
        delete b.tools; delete b.tool_choice;
        res = await postTo(p, b, stream);
      }
      cooldownUntil.delete(p.id);
      lastServed = p;
      return { res, provider: p };
    } catch (e) {
      errors.push(e.message);
      if (!shouldFailover(e)) throw e;
      cool(p, e);
    }
  }
  if (!errors.length && need.private) throw new Error('Для личных данных нет подходящей модели: все разрешённые недоступны (Gemini для писем и сообщений отключён ради приватности).');
  if (!errors.length) throw new Error(need.vision ? 'Нет модели со зрением: подключите Gemini (GEMINI_API_KEY) или облачную модель Ollama.' : 'Не настроено ни одного провайдера.');
  throw new Error('Все модели сейчас недоступны:\n' + errors.join('\n'));
}

/** Непотоковый вызов. Возвращает строку-ответ. */
export async function chat(messages, { system, max_tokens = 300, temperature = 0.6, vision = false, private: priv = false } = {}) {
  const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages;
  const { res } = await request({ messages: msgs, max_tokens, temperature }, false, { vision, private: priv });
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

/**
 * Потоковый вызов с инструментами. onText(delta) на каждый кусок текста.
 * Возвращает { content, tool_calls, finish_reason, provider }.
 */
export async function streamChat({ messages, system, tools, max_tokens = 1024, temperature = 0.6, private: priv = false }, onText) {
  const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages;
  const body = { messages: msgs, max_tokens, temperature };
  if (tools?.length) { body.tools = tools; body.tool_choice = 'auto'; }

  const { res, provider } = await request(body, true, { private: priv });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let content = '';
  const toolCalls = []; // accumulated by index
  let finish = null;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      let ev;
      try { ev = JSON.parse(payload); } catch { continue; }
      const choice = ev.choices?.[0];
      if (!choice) continue;
      const d = choice.delta || {};
      if (d.content) { content += d.content; if (onText) onText(d.content); }
      if (Array.isArray(d.tool_calls)) {
        for (const tc of d.tool_calls) {
          const i = tc.index ?? 0;
          toolCalls[i] ||= { id: tc.id || `call_${Date.now().toString(36)}_${i}`, type: 'function', function: { name: '', arguments: '' } };
          if (tc.id) toolCalls[i].id = tc.id;
          if (tc.function?.name) toolCalls[i].function.name = tc.function.name;
          if (tc.function?.arguments) toolCalls[i].function.arguments += tc.function.arguments;
        }
      }
      if (choice.finish_reason) finish = choice.finish_reason;
    }
  }

  return { content, tool_calls: toolCalls.filter(Boolean), finish_reason: finish, provider: provider.id };
}

/** Ask a vision-capable model about an image (data URL). Returns text. */
export async function describeImage(dataUrl, question, { system } = {}) {
  return chat([{ role: 'user', content: [
    { type: 'text', text: question },
    { type: 'image_url', image_url: { url: dataUrl } },
  ] }], { system, max_tokens: 500, temperature: 0.2, vision: true, private: true });
}
