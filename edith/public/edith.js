// E.D.I.T.H. — HUD logic: hands-free voice, wake word, female voice,
// live screen awareness, streaming chat, in-HUD windows, proactive channel.
'use strict';
const $ = (s) => document.querySelector(s);

const core = $('#core'), coreLabel = $('#core-label');
const youEl = $('#you'), captionEl = $('#caption'), hintEl = $('#hint');
const log = $('#log'), input = $('#input'), composer = $('#composer');
const stage = $('#stage'), banner = $('#banner');
const brainLabel = $('#brain-label'), clockEl = $('#clock');
const statMic = $('#stat-mic'), statBrain = $('#stat-brain');

let messages = [];
let busy = false;
const opts = loadOpts();

// ---------- settings persistence ----------
function loadOpts() {
  const def = { wake: false, speak: true, saymac: true, proactive: true, eco: true, eyes: true, voiceURI: '' };
  try { return { ...def, ...JSON.parse(localStorage.getItem('edith-opts') || '{}') }; } catch { return def; }
}
function saveOpts() { try { localStorage.setItem('edith-opts', JSON.stringify(opts)); } catch {} }

// ---------- core state ----------
function setState(s, label) { core.dataset.state = s; if (label) coreLabel.textContent = label; }

// ---------- clock ----------
setInterval(() => { clockEl.textContent = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }, 1000);
clockEl.textContent = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

// ---------- core ticks ----------
(() => {
  const g = $('#ticks');
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2, big = i % 6 === 0;
    const r1 = 168, r2 = big ? 180 : 174;
    const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    ln.setAttribute('x1', 200 + Math.cos(a) * r1); ln.setAttribute('y1', 200 + Math.sin(a) * r1);
    ln.setAttribute('x2', 200 + Math.cos(a) * r2); ln.setAttribute('y2', 200 + Math.sin(a) * r2);
    g.appendChild(ln);
  }
})();

// ---------- history log ----------
function addLog(role, text, cls) {
  const el = document.createElement('div');
  el.className = `msg ${cls || role}`;
  el.textContent = text;
  log.appendChild(el); log.scrollTop = log.scrollHeight;
  return el;
}

// ---------- banner ----------
function showBanner(text, actionLabel, onAction) {
  banner.innerHTML = '';
  const span = document.createElement('span'); span.textContent = text; banner.appendChild(span);
  if (actionLabel) { const b = document.createElement('button'); b.className = 'btn warn'; b.textContent = actionLabel; b.onclick = onAction; banner.appendChild(b); }
  const x = document.createElement('button'); x.className = 'btn'; x.textContent = 'ок'; x.onclick = () => banner.hidden = true; banner.appendChild(x);
  banner.hidden = false;
}

// ---------- streaming request (chat + confirm) ----------
async function streamPost(url, payload) {
  busy = true; setState('thinking', 'обработка'); captionEl.classList.add('cursor');
  let liveText = '';
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n'); buf = parts.pop() || '';
      for (const part of parts) {
        const line = part.split('\n').find((l) => l.startsWith('data:')); if (!line) continue;
        const ev = JSON.parse(line.slice(5).trim());
        if (ev.type === 'text') { liveText += ev.delta; captionEl.textContent = liveText; setState('speaking', 'ответ'); }
        else if (ev.type === 'status') { coreLabel.textContent = ev.text; }
        else if (ev.type === 'panel') { if (ev.op === 'close_all') stage.innerHTML = ''; else openWindow(ev.window); }
        else if (ev.type === 'confirm') { messages = ev.messages; finishCaption(liveText); showConfirm(ev.actions); return; }
        else if (ev.type === 'done') { messages = ev.messages; finishCaption(liveText); if (liveText) addLog('edith', liveText); speak(liveText); return; }
        else if (ev.type === 'error') { finishCaption(''); showBanner('⚠ ' + ev.error); addLog('sys', ev.error, 'sys'); return; }
      }
    }
  } catch (e) { showBanner('⚠ ' + e.message); }
  finally { finishCaption(liveText); }
}
function finishCaption(text) {
  busy = false; captionEl.classList.remove('cursor'); setState('idle', 'в режиме ожидания'); if (text) captionEl.textContent = text;
  // hands-free: resume listening after the answer (speak() resumes it itself when it talks)
  if (mode === 'wake' && !speaking && !(opts.speak && text)) setTimeout(startRec, 400);
}

// ---------- confirm ----------
const confirmEl = $('#confirm');
function showConfirm(actions) {
  const sensitive = actions.filter((a) => a.sensitive);
  confirmEl.innerHTML = '<div class="ask">Эдит хочет выполнить действие на Mac:</div>';
  for (const a of actions) { const d = document.createElement('div'); d.className = 'act'; d.innerHTML = `• <code>${a.name}</code> — ${esc(a.desc)}`; confirmEl.appendChild(d); }
  const row = document.createElement('div'); row.className = 'buttons';
  const yes = document.createElement('button'); yes.className = 'btn'; yes.textContent = 'разрешить';
  const no = document.createElement('button'); no.className = 'btn warn'; no.textContent = 'отклонить';
  row.append(yes, no); confirmEl.appendChild(row); confirmEl.hidden = false;
  const done = (ok) => { confirmEl.hidden = true; const approvals = {}; for (const a of sensitive) approvals[a.id] = ok; addLog('sys', ok ? 'Разрешено.' : 'Отклонено.', 'sys'); streamPost('/api/confirm', { messages, approvals }); };
  yes.onclick = () => done(true); no.onclick = () => done(false);
}
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// ---------- send ----------
// only glance at the screen when the message is actually about it — keeps
// normal chat fast (a vision round-trip adds several seconds)
const SCREEN_WORDS = /(экран|вид(ишь|ел|но)|сейчас на|что (у меня |тут |здесь )?(на|в)|открыт|слева|справа|сверху|снизу|в углу|в центре|кнопк|надпис|这|screen|что это|что показ|прочти|прочитай|смотр)/i;
async function send(text) {
  text = (text || '').trim(); if (!text || busy) return;
  youEl.textContent = text; youEl.classList.remove('active'); hintEl.style.display = 'none';
  addLog('user', text);
  messages.push({ role: 'user', content: text });
  input.value = '';
  const eyes = opts.eyes && SCREEN_WORDS.test(text);
  await streamPost('/api/chat', { messages, eyes });
}
composer.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });

// ---------- voice output ----------
// Two paths: the Mac's own voice via `say` on the server (best quality, uses
// your system/Siri voice) or the browser's built-in voices.
let voices = [], chosenVoice = null, speaking = false;
const FEMALE_RU = /(Milena|Katya|Katerina|Alena|Yuliya|Polina|Google русский|Russian Female|Женск|Siri)/i;
const FEMALE_ANY = /(female|woman|Samantha|Karen|Moira|Tessa|Serena|Victoria|Zira|Jenny|Aria|Siri)/i;
function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  voices = speechSynthesis.getVoices();
  const sel = $('#voice-select');
  if (sel) {
    sel.innerHTML = '';
    const ru = voices.filter((v) => /ru/i.test(v.lang)), rest = voices.filter((v) => !/ru/i.test(v.lang));
    for (const v of [...ru, ...rest]) { const o = document.createElement('option'); o.value = v.voiceURI; o.textContent = `${v.name} (${v.lang})`; sel.appendChild(o); }
  }
  chosenVoice = voices.find((v) => v.voiceURI === opts.voiceURI)
    || voices.find((v) => /ru/i.test(v.lang) && FEMALE_RU.test(v.name))
    || voices.find((v) => /ru/i.test(v.lang))
    || voices.find((v) => FEMALE_ANY.test(v.name)) || voices[0] || null;
  if (sel && chosenVoice) sel.value = chosenVoice.voiceURI;
  const note = $('#voice-note');
  if (note) note.textContent = 'Лучший вариант — «голос Mac» выше: он берёт ваш системный голос Mac (в т.ч. Siri/Улучшенный). Выбрать его: Системные настройки → Универсальный доступ → Устная речь → Системный голос. Список ниже — это запасные голоса браузера.';
}
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }

function speak(text) {
  if (!opts.speak || !text) return;
  if (opts.saymac) { speakViaMac(text); return; }
  speakViaBrowser(text);
}
function speakViaBrowser(text) {
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\s+/g, ' ').slice(0, 700));
    u.lang = 'ru-RU'; if (chosenVoice) u.voice = chosenVoice; u.rate = 1.0; u.pitch = 1.05;
    u.onstart = () => { speaking = true; micPause(true); };
    u.onend = () => { speaking = false; micPause(false); };
    speechSynthesis.speak(u);
  } catch {}
}
async function speakViaMac(text) {
  speaking = true; micPause(true);
  try {
    const r = await fetch('/api/say', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: text.slice(0, 700) }) });
    if (!r.ok) { speaking = false; micPause(false); speakViaBrowser(text); return; } // say failed → browser voice
  } catch { speaking = false; micPause(false); speakViaBrowser(text); return; }
  speaking = false; micPause(false);
}

// ---------- voice input ----------
// Browsers block the microphone until the user interacts with the page once,
// so the mic turns on with a tap. End of a phrase is detected by our own
// silence timer (Chrome's "final" flag comes late or never in continuous mode),
// so Эдит knows you've finished and goes to work.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const micBtn = $('#mic'), micText = $('#mic-text');
const SILENCE_MS = 1300;      // pause that means "I'm done"
const MAX_PHRASE_MS = 30000;  // safety cap for one phrase
const WAKE_IDLE_MS = 8000;    // after "Эдит", wait this long for the command
const WAKE = /(эдит|edith|едит|эдис|эдди|едить|идит)/i;

let rec = null, mode = 'off';  // 'off' | 'ptt' (tap-to-talk) | 'wake' (hands-free)
let listening = false, awake = false, committed = false;
let heard = '', wakeAt = -1, silenceTimer = null, maxTimer = null, idleTimer = null;

function micUI(state, label) { // state: off | on | rec
  micBtn.className = 'mic-big' + (state === 'rec' ? ' rec' : state === 'on' ? ' on' : '');
  if (label) micText.textContent = label;
  statMic.className = 'stat ' + (state === 'rec' ? 'live' : state === 'on' ? 'on' : '');
  statMic.querySelector('span').textContent = state === 'off' ? 'микрофон' : (state === 'rec' ? 'слушаю' : 'готов');
}

// short earcons: rising = "listening", falling = "got it"
let audioCtx = null;
function beep(freqs) {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    let t = audioCtx.currentTime;
    for (const f of freqs) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + 0.13); t += 0.1;
    }
  } catch {}
}
const beepListen = () => beep([660, 880]);
const beepDone = () => beep([880, 590]);

// Speech recognition returns Russian without punctuation, so the model can't
// tell a question from a statement. Add the sign from the phrase itself.
const Q_START = /^(а\s+|и\s+|ну\s+|слушай,?\s+|скажи,?\s+)?(что|чего|чему|чем|как|какой|какая|какое|какие|каких|каким|какую|где|куда|откуда|когда|почему|зачем|отчего|кто|кого|кому|кем|сколько|чей|чья|чьё|чьи|можешь|можно|сможешь|умеешь|знаешь|помнишь|видишь|есть\s+ли|правда\s+ли|разве|неужели|what|how|why|where|when|who|can|is|are|do|does)(?=[\s,]|$)/i;
const Q_LI = /(^|\s)ли(\s|$)/i;
function punctuate(t) {
  t = t.replace(/\s+/g, ' ').trim();
  if (!t) return t;
  t = t[0].toUpperCase() + t.slice(1);
  if (/[.!?…]$/.test(t)) return t;
  return t + (Q_START.test(t) || Q_LI.test(t) ? '?' : '.');
}

// the command part of what we heard: everything after the wake word (wake
// mode) or everything (tap-to-talk)
function commandText() {
  const raw = mode === 'wake' ? (wakeAt >= 0 ? heard.slice(wakeAt) : '') : heard;
  return raw.replace(/^[\s,.!?:;-]+/, '').trim();
}

if (!SR) { micUI('off', 'голос не работает (нужен Chrome)'); micBtn.disabled = true; }
else {
  rec = new SR(); rec.lang = 'ru-RU'; rec.interimResults = true; rec.maxAlternatives = 1;
  rec.onstart = () => {
    listening = true; committed = false; heard = ''; wakeAt = -1;
    if (mode === 'ptt') { micUI('rec', 'говорите… (пауза — отправлю)'); setState('listening', 'слушаю, босс'); }
    else if (mode === 'wake') micUI(awake ? 'rec' : 'on', awake ? 'слушаю, босс' : 'слушаю фоном — скажите «Эдит»');
  };
  rec.onresult = (e) => {
    if (committed) return;
    // rebuild the whole phrase of this session: finals + current interim
    let full = '';
    for (let i = 0; i < e.results.length; i++) full += e.results[i][0].transcript;
    heard = full;

    if (mode === 'wake' && !awake) {
      const m = [...heard.matchAll(new RegExp(WAKE.source, 'gi'))].pop();
      if (!m) return;
      wakeUp(); wakeAt = m.index + m[0].length;
    } else if (mode === 'wake' && wakeAt < 0) {
      wakeAt = 0;
    }

    const cmd = commandText();
    youEl.classList.add('active');
    youEl.textContent = cmd || '…';
    if (!cmd) return;
    clearTimeout(idleTimer);
    // every new word restarts the silence timer
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(commit, SILENCE_MS);
    if (!maxTimer) maxTimer = setTimeout(commit, MAX_PHRASE_MS);
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      mode = 'off'; listening = false; micUI('off', 'нет доступа к микрофону');
      showBanner('Нет доступа к микрофону. В Chrome нажмите значок замка слева от адреса → Микрофон → Разрешить, затем обновите страницу.', 'обновить', () => location.reload());
    } else if (e.error === 'network') {
      showBanner('Распознавание речи не может связаться с сервером Google. Проверьте интернет/VPN.');
    }
  };
  rec.onend = () => {
    listening = false;
    // Chrome may end the session itself at a pause: treat it as "done"
    if (!committed && commandText()) { commit(); return; }
    if (mode === 'wake' && !speaking && !busy) { setTimeout(startRec, 200); return; }
    if (mode === 'ptt') { mode = 'off'; if (!busy) micUI('off', 'нажмите, чтобы говорить'); setState(busy ? 'thinking' : 'idle', busy ? 'обработка' : 'в режиме ожидания'); }
  };
}

function clearTimers() { clearTimeout(silenceTimer); clearTimeout(maxTimer); clearTimeout(idleTimer); silenceTimer = maxTimer = idleTimer = null; }

function startRec() {
  if (!rec || listening) return;
  rec.continuous = mode === 'wake'; // tap-to-talk: one phrase per tap
  try { rec.start(); } catch {}
}

function commit() {
  if (committed) return;
  const cmd = commandText();
  committed = true; clearTimers(); awake = false;
  try { rec.abort(); } catch {}
  if (mode === 'ptt') mode = 'off';
  if (cmd.length < 2) { micUI(mode === 'wake' ? 'on' : 'off', mode === 'wake' ? 'скажите «Эдит»' : 'нажмите, чтобы говорить'); return; }
  beepDone();
  micUI(mode === 'wake' ? 'on' : 'off', mode === 'wake' ? 'скажите «Эдит»' : 'нажмите, чтобы говорить');
  send(punctuate(cmd));
}

function micPause(on) { // don't let Эдит hear herself
  if (!rec) return;
  if (on) { try { rec.abort(); } catch {} }
  else if (mode === 'wake') setTimeout(startRec, 350);
}

function wakeUp() {
  awake = true; beepListen();
  micUI('rec', 'слушаю, босс'); setState('listening', 'слушаю, босс'); youEl.textContent = '…';
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { // said "Эдит" but nothing after it
    if (committed || commandText()) return;
    awake = false; wakeAt = -1;
    try { rec.abort(); } catch {}
    if (!busy) { setState('idle', 'в режиме ожидания'); micUI('on', 'скажите «Эдит»'); youEl.textContent = ''; }
  }, WAKE_IDLE_MS);
}

// tap the mic: talk right now (works from the very first tap)
micBtn.addEventListener('click', () => {
  if (!rec) return;
  if (listening && mode === 'ptt') { // tap again = "I'm done", send now
    if (commandText()) commit(); else { mode = 'off'; try { rec.abort(); } catch {} micUI('off', 'нажмите, чтобы говорить'); }
    return;
  }
  if (busy) return;
  try { speechSynthesis.cancel(); } catch {}
  try { rec.abort(); } catch {}
  clearTimers();
  mode = 'ptt'; awake = true; beepListen();
  setTimeout(startRec, 120);
});

// hands-free toggle: continuous wake-word listening (needs one tap on the page
// first — browser rule)
function setWakeMode(on) {
  if (on) { mode = 'wake'; awake = false; startRec(); micUI('on', 'скажите «Эдит»'); }
  else { mode = 'off'; clearTimers(); try { rec && rec.abort(); } catch {} micUI('off', 'нажмите, чтобы говорить'); }
}

// ---------- in-HUD windows ----------
let winCount = 0;
function openWindow(w) {
  const el = document.createElement('div'); el.className = 'win';
  const off = (winCount++ % 5) * 26; el.style.left = `calc(14% + ${off}px)`; el.style.top = `calc(16% + ${off}px)`;
  const bar = document.createElement('div'); bar.className = 'win-bar';
  const title = document.createElement('div'); title.className = 'win-title'; title.textContent = w.title || 'окно'; bar.appendChild(title);
  if (w.kind === 'web' && w.url) { const e = document.createElement('button'); e.className = 'win-x'; e.textContent = '↗'; e.onclick = () => window.open(w.url, '_blank', 'noopener'); bar.appendChild(e); }
  const x = document.createElement('button'); x.className = 'win-x'; x.textContent = '✕'; x.onclick = () => el.remove(); bar.appendChild(x);
  const body = document.createElement('div'); body.className = 'win-body';
  if (w.kind === 'web' && w.url) {
    const f = document.createElement('iframe'); f.src = w.url; f.referrerPolicy = 'no-referrer';
    const fb = document.createElement('div'); fb.className = 'win-fallback'; fb.innerHTML = '<div>Сайт не разрешает встраивание.</div>';
    const o = document.createElement('button'); o.className = 'btn'; o.textContent = 'открыть в браузере'; o.onclick = () => window.open(w.url, '_blank', 'noopener'); fb.appendChild(o);
    body.append(f, fb); let ok = false; f.addEventListener('load', () => ok = true); setTimeout(() => { if (!ok) body.classList.add('blocked'); }, 4500);
  } else if (w.kind === 'image' && w.url) { const img = document.createElement('img'); img.src = w.url; body.appendChild(img); }
  else { const n = document.createElement('div'); n.className = 'win-note'; n.textContent = w.text || w.url || ''; body.appendChild(n); }
  el.append(bar, body); stage.appendChild(el); drag(el, bar);
}
function drag(el, handle) {
  let sx, sy, ox, oy, on = false;
  handle.addEventListener('pointerdown', (e) => { if (e.target.classList.contains('win-x')) return; on = true; handle.classList.add('drag'); handle.setPointerCapture(e.pointerId); const r = el.getBoundingClientRect(); ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY; el.style.left = ox + 'px'; el.style.top = oy + 'px'; });
  handle.addEventListener('pointermove', (e) => { if (!on) return; el.style.left = (ox + e.clientX - sx) + 'px'; el.style.top = Math.max(0, oy + e.clientY - sy) + 'px'; });
  const end = () => { on = false; handle.classList.remove('drag'); };
  handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
}

// ---------- proactive + status channel ----------
const es = new EventSource('/api/events');
es.onmessage = (e) => {
  const ev = JSON.parse(e.data);
  if (ev.type === 'hello') { brainLabel.textContent = ev.model; statBrain.className = 'stat on'; }
  else if (ev.type === 'proactive') { captionEl.textContent = ev.text; addLog('edith', ev.text, 'edith proactive'); speak(ev.text); setState('speaking', 'инициатива'); setTimeout(() => !busy && setState('idle', 'в режиме ожидания'), 3500); }
};
setInterval(() => { if (!document.hidden) fetch('/api/beat', { method: 'POST' }).catch(() => {}); }, 60000);

// ---------- eco / visibility ----------
function applyEco() { document.body.classList.toggle('eco', opts.eco || document.hidden); }
document.addEventListener('visibilitychange', applyEco);
if (navigator.getBattery) navigator.getBattery().then((b) => {
  const check = () => { const el = $('#stat-batt'); if (el) { el.hidden = false; $('#batt-label').textContent = Math.round(b.level * 100) + '%' + (b.charging ? ' ⚡' : ''); } if (!b.charging && b.level < 0.3 && !opts.eco) { opts.eco = true; syncOpts(); applyEco(); } };
  b.addEventListener('levelchange', check); b.addEventListener('chargingchange', check); check();
}).catch(() => {});

// ---------- settings / drawer wiring ----------
$('#btn-log').onclick = () => $('#drawer').classList.add('open');
$('#btn-log-close').onclick = () => $('#drawer').classList.remove('open');
$('#btn-settings').onclick = () => { $('#settings').hidden = false; };
$('#btn-settings-close').onclick = () => { $('#settings').hidden = true; };
const bind = (id, key, after) => { const el = $(id); if (!el) return; el.checked = opts[key]; el.onchange = () => { opts[key] = el.checked; saveOpts(); after && after(); }; };
bind('#opt-saymac', 'saymac');
bind('#opt-wake', 'wake', () => setWakeMode(opts.wake));
bind('#opt-speak', 'speak');
bind('#opt-proactive', 'proactive', () => fetch('/api/proactive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: opts.proactive }) }));
bind('#opt-eco', 'eco', applyEco);
$('#voice-select').onchange = (e) => { opts.voiceURI = e.target.value; saveOpts(); chosenVoice = voices.find((v) => v.voiceURI === opts.voiceURI) || chosenVoice; };
$('#voice-test').onclick = () => speak('Я Эдит. Всегда на связи, босс.');
function syncOpts() { $('#opt-eco').checked = opts.eco; saveOpts(); }

// ---------- boot ----------
(function boot() {
  applyEco();
  const o = $('#boot');
  setTimeout(() => { o.classList.add('done'); setTimeout(() => o.remove(), 700); }, 1600);
})();

// greeting. Mic needs one tap first (browser rule), so prompt for it.
setState('idle', 'в режиме ожидания');
captionEl.textContent = 'Системы в норме, босс.';
addLog('edith', 'Системы в норме, босс. Нажмите микрофон и говорите.', 'edith');
micUI('off', SR ? 'нажмите, чтобы говорить' : 'голос не работает (нужен Chrome)');
