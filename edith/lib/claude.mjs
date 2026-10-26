// Claude API client for Эдит — zero-dependency, uses Node 20+ global fetch.
// The API key lives only on this machine (env ANTHROPIC_API_KEY) and is never
// sent anywhere but api.anthropic.com. Supports streaming and a tool loop.

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

// Default model. Override with EDITH_MODEL. See edith/README.md on availability.
export const DEFAULT_MODEL = process.env.EDITH_MODEL || 'claude-opus-5-5';

function apiKey() {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k) throw new Error('ANTHROPIC_API_KEY не задан — см. edith/.env.example');
  return k;
}

/**
 * Non-streaming call. Returns the full parsed message object.
 * @param {object} body - a Messages API request body (without model/version).
 */
export async function createMessage(body) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey(),
      'anthropic-version': API_VERSION,
    },
    body: JSON.stringify({ model: DEFAULT_MODEL, ...body }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Claude API ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

/**
 * Streaming call. Invokes onText(delta) for each text chunk and returns the
 * final assembled message (content blocks + stop_reason).
 * @param {object} body
 * @param {(delta:string)=>void} onText
 */
export async function streamMessage(body, onText) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey(),
      'anthropic-version': API_VERSION,
    },
    body: JSON.stringify({ model: DEFAULT_MODEL, stream: true, ...body }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`Claude API ${res.status}: ${text.slice(0, 500)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const content = []; // assembled content blocks
  let stopReason = null;
  const message = { role: 'assistant', content, stop_reason: null };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const events = buf.split('\n\n');
    buf = events.pop() ?? '';
    for (const chunk of events) {
      const line = chunk.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
      switch (ev.type) {
        case 'content_block_start':
          content[ev.index] = ev.content_block;
          break;
        case 'content_block_delta': {
          const block = content[ev.index];
          if (!block) break;
          if (ev.delta.type === 'text_delta') {
            block.text = (block.text || '') + ev.delta.text;
            if (onText) onText(ev.delta.text);
          } else if (ev.delta.type === 'input_json_delta') {
            block._partialJson = (block._partialJson || '') + ev.delta.partial_json;
          } else if (ev.delta.type === 'thinking_delta') {
            block.thinking = (block.thinking || '') + ev.delta.thinking;
          }
          break;
        }
        case 'content_block_stop': {
          const block = content[ev.index];
          if (block && block.type === 'tool_use' && block._partialJson != null) {
            try { block.input = JSON.parse(block._partialJson); } catch { block.input = {}; }
            delete block._partialJson;
          }
          break;
        }
        case 'message_delta':
          if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
          break;
        case 'error':
          throw new Error(`Claude stream error: ${JSON.stringify(ev.error)}`);
      }
    }
  }

  message.stop_reason = stopReason;
  message.content = content.filter(Boolean);
  return message;
}
