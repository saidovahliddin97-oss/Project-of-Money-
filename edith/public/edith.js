// EDITH front-end — HUD logic, streaming chat, voice, proactive channel.
'use strict';

const $ = (s) => document.querySelector(s);
const log = $('#log'), input = $('#input'), composer = $('#composer');
const reactor = $('#reactor'), statusEl = $('#status'), modelLabel = $('#model-label');
const confirmBar = $('#confirm-bar'), micBtn = $('#mic'), proactiveToggle = $('#proactive');

let messages = [];      // full Claude conversation (client-owned)
let voiceOut = true;    // speak Эдит's replies aloud
let busy = false;

// ---- reactor ticks ----
(() => {
  const g = $('#ticks');
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r1 = 150 + Math.cos(a) * 70, r1y = 150 + Math.sin(a) * 70;
    const r2 = 150 + Math.cos(a) * (i % 5 ? 76 : 80), r2y = 150 + Math.sin(a) * (i % 5 ? 76 : 80);
    const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    ln.setAttribute('x1', r1); ln.setAttribute('y1', r1y);
    ln.setAttribute('x2', r2); ln.setAttribute('y2', r2y);
    g.appendChild(ln);
  }
})();

function setState(s, label) {
  reactor.dataset.state = s;
  if (label) statusEl.textContent = label;
}

// ---- rendering ----
function addMsg(role, text, cls) {
  const el = document.createElement('div');
  el.className = `msg ${cls || role}`;
  const who = role === 'user' ? 'БОСС' : role === 'edith' ? 'EDITH' : '';
  el.innerHTML = who ? `<span class="who">${who}</span>` : '';
  const body = document.createElement('span');
  body.textContent = text || '';
  el.appendChild(body);
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return body;
}

// ---- SSE reader shared by /api/chat and /api/confirm ----
async function streamPost(url, payload) {
  busy = true;
  setState('thinking', 'обработка');
  const res = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', liveBody = null, liveText = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n\n'); buf = parts.pop() || '';
    for (const part of parts) {
      const line = part.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      const ev = JSON.parse(line.slice(5).trim());

      if (ev.type === 'text') {
        if (!liveBody) { liveBody = addMsg('edith', ''); liveBody.parentElement.classList.add('cursor'); setState('speaking', 'ответ'); }
        liveText += ev.delta; liveBody.textContent = liveText; log.scrollTop = log.scrollHeight;
      } else if (ev.type === 'confirm') {
        messages = ev.messages;
        if (liveBody) liveBody.parentElement.classList.remove('cursor');
        showConfirm(ev.actions);
        if (liveText) speak(liveText);
        busy = false; setState('idle', 'ожидание'); return;
      } else if (ev.type === 'done') {
        messages = ev.messages;
        if (liveBody) liveBody.parentElement.classList.remove('cursor');
        if (liveText) speak(liveText);
        busy = false; setState('idle', 'в сети'); return;
      } else if (ev.type === 'error') {
        if (liveBody) liveBody.parentElement.classList.remove('cursor');
        addMsg('sys', '⚠ ' + ev.error, 'sys');
        busy = false; setState('idle', 'сбой'); return;
      }
    }
  }
  busy = false; setState('idle', 'в сети');
}

// ---- confirmation bar ----
function showConfirm(actions) {
  const sensitive = actions.filter((a) => a.sensitive);
  confirmBar.innerHTML = '';
  const ask = document.createElement('div');
  ask.className = 'ask';
  ask.textContent = 'Эдит хочет выполнить действие на вашем Mac:';
  confirmBar.appendChild(ask);

  const acts = document.createElement('div'); acts.className = 'acts';
  for (const a of actions) {
    const row = document.createElement('div'); row.className = 'act';
    row.innerHTML = `• <code>${a.name}</code> — ${escapeHtml(a.desc)}`;
    acts.appendChild(row);
  }
  confirmBar.appendChild(acts);

  const buttons = document.createElement('div'); buttons.className = 'buttons';
  const yes = document.createElement('button'); yes.className = 'btn'; yes.textContent = 'Разрешить';
  const no = document.createElement('button'); no.className = 'btn danger'; no.textContent = 'Отклонить';
  buttons.append(yes, no); confirmBar.appendChild(buttons);
  confirmBar.classList.remove('hidden');

  const finish = (approveAll) => {
    confirmBar.classList.add('hidden'); confirmBar.innerHTML = '';
    const approvals = {};
    for (const a of sensitive) approvals[a.id] = approveAll;
    addMsg('sys', approveAll ? 'Действие разрешено.' : 'Действие отклонено.', 'sys');
    streamPost('/api/confirm', { messages, approvals });
  };
  yes.onclick = () => finish(true);
  no.onclick = () => finish(false);
}

const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// ---- send ----
async function send(text) {
  text = (text || '').trim();
  if (!text || busy) return;
  addMsg('user', text);
  messages.push({ role: 'user', content: text });
  input.value = '';
  try { await streamPost('/api/chat', { messages }); }
  catch (e) { addMsg('sys', '⚠ ' + e.message, 'sys'); busy = false; setState('idle', 'сбой'); }
}
composer.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });

// ---- voice: speech recognition (STT) ----
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false;
if (SR) {
  rec = new SR(); rec.lang = 'ru-RU'; rec.interimResults = true; rec.continuous = false;
  let finalText = '';
  rec.onstart = () => { listening = true; micBtn.classList.add('rec'); setState('listening', 'слушаю'); finalText = ''; };
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t; else interim += t;
    }
    input.value = finalText + interim;
  };
  rec.onerror = () => { stopListening(); };
  rec.onend = () => { stopListening(); if (input.value.trim()) send(input.value); };
} else {
  micBtn.title = 'Голос недоступен в этом браузере (нужен Chrome)';
}
function stopListening() { listening = false; micBtn.classList.remove('rec'); if (!busy) setState('idle', 'в сети'); }
micBtn.addEventListener('click', () => {
  if (!rec) { addMsg('sys', 'Голосовой ввод работает в Chrome. Печатайте — я всё равно вас понимаю.', 'sys'); return; }
  if (listening) rec.stop(); else { try { rec.start(); } catch {} }
});

// ---- voice: speech synthesis (TTS) ----
let ruVoice = null;
function pickVoice() {
  const voices = speechSynthesis.getVoices();
  ruVoice = voices.find((v) => /ru/i.test(v.lang)) || voices.find((v) => /Milena|Yuri/i.test(v.name)) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text) {
  if (!voiceOut || !('speechSynthesis' in window) || !text) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 600));
    u.lang = 'ru-RU'; if (ruVoice) u.voice = ruVoice; u.rate = 1.03; u.pitch = 0.95;
    speechSynthesis.speak(u);
  } catch {}
}

// ---- proactive channel (server pushes) ----
const es = new EventSource('/api/events');
es.onmessage = (e) => {
  const ev = JSON.parse(e.data);
  if (ev.type === 'hello') { modelLabel.textContent = `EDITH · ${ev.model}`; }
  else if (ev.type === 'proactive') {
    addMsg('edith', ev.text, 'edith proactive');
    speak(ev.text);
    setState('speaking', 'инициатива');
    setTimeout(() => !busy && setState('idle', 'в сети'), 3000);
  }
};

// heartbeat so Эдит knows you're present
setInterval(() => { fetch('/api/beat', { method: 'POST' }).catch(() => {}); }, 60 * 1000);
proactiveToggle.addEventListener('change', () => {
  fetch('/api/proactive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: proactiveToggle.checked }) });
});

// greeting
addMsg('edith', 'Системы в норме, босс. Я на связи. Говорите или пишите — найду, открою, выполню.', 'edith');
input.focus();
