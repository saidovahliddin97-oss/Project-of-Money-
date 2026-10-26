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
function finishCaption(text) { busy = false; captionEl.classList.remove('cursor'); setState('idle', 'в режиме ожидания'); if (text) captionEl.textContent = text; }

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
// Browsers block the microphone until the user interacts with the page at least
// once, so the mic turns on with a tap. After that, hands-free mode (wake word
// "Эдит") keeps listening on its own.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const micBtn = $('#mic'), micText = $('#mic-text');
let rec = null, mode = 'off';          // 'off' | 'ptt' (tap-to-talk) | 'wake' (hands-free)
let listening = false, awake = false, finalBuf = '', awakeTimer = null, commitTimer = null;
const WAKE = /(эдит|edith|едит|эдис|эдди|едить)/i;

function micUI(state, label) { // state: off | on | rec
  micBtn.className = 'mic-big' + (state === 'rec' ? ' rec' : state === 'on' ? ' on' : '');
  if (label) micText.textContent = label;
  statMic.className = 'stat ' + (state === 'rec' ? 'live' : state === 'on' ? 'on' : '');
  statMic.querySelector('span').textContent = state === 'off' ? 'микрофон' : (state === 'rec' ? 'слушаю' : 'готов');
}

if (!SR) { micUI('off', 'голос не работает (нужен Chrome)'); micBtn.disabled = true; }
else {
  rec = new SR(); rec.lang = 'ru-RU'; rec.interimResults = true;
  rec.continuous = true;
  rec.onstart = () => { listening = true; micUI(mode === 'ptt' || awake ? 'rec' : 'on', mode === 'wake' && !awake ? 'слушаю фоном — скажите «Эдит»' : 'говорите…'); };
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) handleFinal(t); else interim += t;
    }
    if (interim) {
      youEl.classList.add('active');
      if (mode === 'ptt' || awake) { youEl.textContent = interim; setState('listening', 'слушаю, босс'); }
      else if (WAKE.test(interim)) { wake(); }
    }
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      mode = 'off'; listening = false; micUI('off', 'нет доступа к микрофону');
      showBanner('Нет доступа к микрофону. В Chrome нажмите значок замка слева от адреса → Микрофон → Разрешить, затем обновите страницу.', 'обновить', () => location.reload());
    }
  };
  rec.onend = () => {
    listening = false;
    // hands-free: keep it alive; tap-to-talk: stop after the utterance
    if (mode === 'wake' && !speaking) { try { rec.start(); } catch {} }
    else if (mode === 'ptt') { /* one utterance done */ if (!busy) micUI('off', 'нажмите, чтобы говорить'); }
  };
}

function startRec() { if (rec && !listening) { try { rec.start(); } catch {} } }
function micPause(on) { // don't let Эдит hear herself
  if (!rec) return;
  if (on) { try { rec.stop(); } catch {} }
  else if (mode === 'wake') setTimeout(() => startRec(), 300);
}
function wake() {
  awake = true; finalBuf = ''; micUI('rec', 'слушаю, босс'); setState('listening', 'слушаю, босс'); youEl.textContent = '';
  clearTimeout(awakeTimer); awakeTimer = setTimeout(() => { awake = false; if (!busy) { setState('idle', 'в режиме ожидания'); micUI('on', 'скажите «Эдит»'); } }, 9000);
}
function handleFinal(text) {
  const clean = text.trim(); if (!clean) return;
  if (mode === 'wake' && !awake) {
    if (WAKE.test(clean)) { wake(); const after = clean.replace(WAKE, '').replace(/^[,.\s]+/, '').trim(); if (after.length > 1) { finalBuf = after; commitSoon(); } }
    return;
  }
  // ptt, or awake
  finalBuf = (finalBuf ? finalBuf + ' ' : '') + clean.replace(WAKE, '').trim();
  youEl.textContent = finalBuf;
  commitSoon();
}
function commitSoon() {
  clearTimeout(awakeTimer); clearTimeout(commitTimer);
  commitTimer = setTimeout(() => {
    const t = finalBuf.trim(); finalBuf = ''; awake = false;
    if (mode === 'ptt') { mode = 'off'; try { rec.stop(); } catch {} }
    if (t.length > 1) send(t);
  }, 1100);
}

// tap the mic: start tap-to-talk right now (works on the very first tap)
micBtn.addEventListener('click', () => {
  if (!rec) return;
  if (listening) { // stop / cancel
    mode = 'off'; try { rec.stop(); } catch {} micUI('off', 'нажмите, чтобы говорить'); return;
  }
  mode = opts.wake ? 'wake' : 'ptt';
  awake = mode === 'ptt'; // tap-to-talk is immediately active, no wake word needed
  finalBuf = '';
  startRec();
});

// hands-free toggle: enable continuous wake-word listening (still needs one
// tap on the mic or this toggle as the first user gesture)
function setWakeMode(on) {
  if (on) { mode = 'wake'; awake = false; startRec(); micUI('on', 'скажите «Эдит»'); }
  else { mode = 'off'; try { rec && rec.stop(); } catch {} micUI('off', 'нажмите, чтобы говорить'); }
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
