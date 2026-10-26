// Универсальный клиент к бесплатным LLM через OpenAI-совместимый протокол
// (/chat/completions). Один код работает с Ollama (локально), Groq, Gemini,
// OpenRouter, Mistral — провайдер выбирается в edith/.env.
// Zero-dependency: глобальный fetch (Node 20+).

const PRESETS = {
  // Локально на Mac. Бесплатно, без ключа, без VPN. Нужен установленный Ollama.
  ollama:     { base: 'http://localhost:11434/v1', keyEnv: null,                model: 'llama3.1',                              vision: false },
  // Облачные бесплатные (нужен бесплатный ключ, без карты).
  groq:       { base: 'https://api.groq.com/openai/v1',                        keyEnv: 'GROQ_API_KEY',       model: 'llama-3.3-70b-versatile',               vision: false },
  gemini:     { base: 'https://generativelanguage.googleapis.com/v1beta/openai', keyEnv: 'GEMINI_API_KEY',   model: 'gemini-2.0-flash',                      vision: true },
  openrouter: { base: 'https://openrouter.ai/api/v1',                          keyEnv: 'OPENROUTER_API_KEY', model: 'meta-llama/llama-3.3-70b-instruct:free', vision: false },
  mistral:    { base: 'https://api.mistral.ai/v1',                             keyEnv: 'MISTRAL_API_KEY',    model: 'mistral-small-latest',                  vision: false },
};

export function config() {
  const provider = (process.env.EDITH_PROVIDER || 'ollama').toLowerCase();
  const preset = PRESETS[provider] || PRESETS.ollama;
  const base = (process.env.EDITH_BASE_URL || preset.base).replace(/\/$/, '');
  const key = process.env.EDITH_API_KEY || (preset.keyEnv ? process.env[preset.keyEnv] : '') || 'none';
  const model = process.env.EDITH_MODEL || preset.model;
  const vision = process.env.EDITH_VISION === '1' || preset.vision;
  return { provider, base, key, model, vision };
}

export const MODEL_LABEL = () => { const c = config(); return `${c.provider}:${c.model}`; };

function headers(key) {
  const h = { 'content-type': 'application/json' };
  if (key && key !== 'none') h.authorization = `Bearer ${key}`;
  return h;
}

async function post(body, stream) {
  const c = config();
  const res = await fetch(`${c.base}/chat/completions`, {
    method: 'POST',
    headers: headers(c.key),
    body: JSON.stringify({ model: c.model, ...body, stream }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const hint = c.provider === 'ollama'
      ? ' (Ollama запущен? Модель скачана: `ollama pull ' + c.model + '`?)'
      : ' (проверьте ключ в edith/.env)';
    throw new Error(`LLM ${res.status}: ${text.slice(0, 300)}${hint}`);
  }
  return res;
}

/** Непотоковый вызов. Возвращает строку-ответ. */
export async function chat(messages, { system, max_tokens = 300, temperature = 0.6 } = {}) {
  const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages;
  const res = await post({ messages: msgs, max_tokens, temperature }, false);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

/**
 * Потоковый вызов с инструментами. onText(delta) на каждый кусок текста.
 * Возвращает { content, tool_calls, finish_reason }.
 */
export async function streamChat({ messages, system, tools, max_tokens = 1024, temperature = 0.6 }, onText) {
  const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages;
  const body = { messages: msgs, max_tokens, temperature };
  if (tools?.length) { body.tools = tools; body.tool_choice = 'auto'; }

  const res = await post(body, true);
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
          toolCalls[i] ||= { id: tc.id || `call_${i}`, type: 'function', function: { name: '', arguments: '' } };
          if (tc.id) toolCalls[i].id = tc.id;
          if (tc.function?.name) toolCalls[i].function.name = tc.function.name;
          if (tc.function?.arguments) toolCalls[i].function.arguments += tc.function.arguments;
        }
      }
      if (choice.finish_reason) finish = choice.finish_reason;
    }
  }

  return { content, tool_calls: toolCalls.filter(Boolean), finish_reason: finish };
}
