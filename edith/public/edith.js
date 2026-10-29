// E.D.I.T.H. — HUD logic: chat panel, voice in/out, barge-in by "Эдит",
// live screen awareness, in-HUD windows, proactive channel.
'use strict';
const $ = (s) => document.querySelector(s);

const core = $('#core'), coreLabel = $('#core-label');
const youEl = $('#you'), hintEl = $('#hint');
const log = $('#log'), input = $('#input'), composer = $('#composer');
const stage = $('#stage'), banner = $('#banner');
const brainLabel = $('#brain-label'), clockEl = $('#clock');
const statMic = $('#stat-mic'), statBrain = $('#stat-brain');

let messages = [];
let busy = false;
let currentReq = null;   // AbortController of the running answer
const opts = loadOpts();

// ---------- settings persistence ----------
function loadOpts() {
  const def = { wake: false, speak: true, saymac: true, proactive: true, notify: true, eco: true, eyes: true, voiceURI: '' };
  try { return { ...def, ...JSON.parse(localStorage.getItem('edith-opts') || '{}') }; } catch { return def; }
}
function saveOpts() { try { localStorage.setItem('edith-opts', JSON.stringify(opts)); } catch {} }

// ---------- core state ----------
function setState(s, label) { core.dataset.state = s; if (label) coreLabel.textContent = label; }

// ---------- clock ----------
const hhmm = (d = new Date()) => d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
setInterval(() => { clockEl.textContent = hhmm(); }, 1000);
clockEl.textContent = hhmm();

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

// ---------- chat panel ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Models sometimes leak JSON escapes: \"Почта\", \n. Show and say them as plain text.
const unescapeModel = (t) => String(t || '').replace(/\\n/g, '\n').replace(/\\t/g, ' ').replace(/\\(["'`\\/])/g, '$1');

// Small, safe markdown: escape first, then bold, code, links, lists, paragraphs.
function renderMd(text) {
  const lines = esc(unescapeModel(text)).split('\n');
  let html = '', list = false;
  const inline = (s) => s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  for (const raw of lines) {
    const line = raw.trim();
    const item = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (item) { if (!list) { html += '<ul>'; list = true; } html += `<li>${inline(item[1])}</li>`; continue; }
    if (list) { html += '</ul>'; list = false; }
    if (line) html += `<p>${inline(line.replace(/^#+\s*/, ''))}</p>`;
  }
  if (list) html += '</ul>';
  return html;
}

function addMsg(role, text, extra = '') {
  const el = document.createElement('div');
  el.className = `msg ${role} ${extra}`.trim();
  if (role !== 'sys') {
    const who = document.createElement('div'); who.className = 'who';
    who.innerHTML = `<span>${role === 'user' ? 'вы' : 'эдит'}</span><time>${hhmm()}</time>`;
    el.appendChild(who);
  }
  const body = document.createElement('div'); body.className = 'body';
  if (role === 'edith') body.innerHTML = renderMd(text); else body.textContent = text;
  el.appendChild(body);
  log.appendChild(el); log.scrollTop = log.scrollHeight;
  return el;
}
const sysMsg = (text, extra) => addMsg('sys', text, extra);

$('#btn-clear').onclick = () => {
  stopSpeaking(); if (currentReq) currentReq.abort();
  messages = []; log.innerHTML = '';
  addMsg('edith', 'Начнём с чистого листа, босс.');
};

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
  busy = true; setState('thinking', 'думаю');
  currentReq = new AbortController();
  let liveText = '', bubble = null;
  const ensureBubble = () => { if (!bubble) { bubble = addMsg('edith', '', 'typing'); } return bubble; };
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: currentReq.signal });
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n'); buf = parts.pop() || '';
      for (const part of parts) {
        const line = part.split('\n').find((l) => l.startsWith('data:')); if (!line) continue;
        const ev = JSON.parse(line.slice(5).trim());
        if (ev.type === 'text') {
          liveText += ev.delta;
          ensureBubble().querySelector('.body').innerHTML = renderMd(liveText);
          log.scrollTop = log.scrollHeight;
          setState('speaking', 'отвечаю');
        }
        else if (ev.type === 'status') { coreLabel.textContent = ev.text; }
        else if (ev.type === 'panel') { if (ev.op === 'close_all') stage.innerHTML = ''; else openWindow(ev.window); }
        else if (ev.type === 'confirm') { messages = ev.messages; showConfirm(ev.actions); return finish(bubble, liveText, false); }
        else if (ev.type === 'done') { messages = ev.messages; return finish(bubble, liveText, true); }
        else if (ev.type === 'error') { sysMsg('⚠ ' + ev.error, 'err'); return finish(bubble, liveText, false); }
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') sysMsg('⚠ ' + e.message, 'err');
  }
  finish(bubble, liveText, false);
}
function finish(bubble, text, say) {
  if (!busy) return;
  busy = false; currentReq = null;
  if (bubble) { bubble.classList.remove('typing'); if (!text) bubble.remove(); }
  setState('idle', 'в режиме ожидания');
  if (say && text) speak(text);
  else if (mode === 'wake') setTimeout(startRec, 400); // hands-free: keep listening
}

// ---------- confirm ----------
const confirmEl = $('#confirm');
function showConfirm(actions) {
  const sensitive = actions.filter((a) => a.sensitive);
  confirmEl.innerHTML = '<div class="ask">Эдит хочет выполнить действие на Mac:</div>';
  for (const a of actions) { const d = document.createElement('div'); d.className = 'act'; d.innerHTML = `• <code>${esc(a.name)}</code> — ${esc(a.desc)}`; confirmEl.appendChild(d); }
  const row = document.createElement('div'); row.className = 'buttons';
  const yes = document.createElement('button'); yes.className = 'btn'; yes.textContent = 'разрешить';
  const no = document.createElement('button'); no.className = 'btn warn'; no.textContent = 'отклонить';
  row.append(yes, no); confirmEl.appendChild(row); confirmEl.hidden = false;
  log.scrollTop = log.scrollHeight;
  const done = (ok) => { confirmEl.hidden = true; const approvals = {}; for (const a of sensitive) approvals[a.id] = ok; sysMsg(ok ? 'Разрешено.' : 'Отклонено.'); streamPost('/api/confirm', { messages, approvals }); };
  yes.onclick = () => done(true); no.onclick = () => done(false);
}

// ---------- send ----------
// only glance at the screen when the message is actually about it — keeps
// normal chat fast (a vision round-trip adds several seconds)
const SCREEN_WORDS = /(экран|вид(ишь|ел|но)|сейчас на|что (у меня |тут |здесь )?(на|в)|открыт|слева|справа|сверху|снизу|в углу|в центре|кнопк|надпис|screen|что это|что показ|прочти|прочитай|смотр)/i;
async function send(text) {
  text = (text || '').trim(); if (!text) return;
  if (busy) { if (currentReq) currentReq.abort(); busy = false; } // new request replaces the old one
  stopSpeaking();
  youEl.textContent = ''; youEl.classList.remove('active');
  addMsg('user', text);
  messages.push({ role: 'user', content: text });
  input.value = '';
  const eyes = opts.eyes && SCREEN_WORDS.test(text);
  await streamPost('/api/chat', { messages, eyes });
}
composer.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });

// ---------- voice output ----------
// Turn a written answer into something that sounds natural when spoken:
// no markdown, slashes, links, emoji or list markers.
function speakable(t) {
  return unescapeModel(t)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(https?:\/\/|www\.)\S+/gi, ' ')
    .replace(/^\s*#+\s*/gm, '')
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/[*_~#>|\\/{}[\]<>^=+]+/g, ' ')
    .replace(/(^|[\s,])эдит(?=[\s,.!?]|$)/gi, '$1')   // never say her own name: it is the barge-in word
    .replace(/\n{2,}/g, '. ').replace(/\n/g, ', ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([,.!?;:])(?:\s*[,.;:])+/g, '$1')
    .replace(/^[\s,.;:]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

let voices = [], chosenVoice = null, speaking = false, speechId = 0;
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

// Echo guard: the mic hears her own voice from the speakers. Anything that is
// mostly the words she is saying (or just said) is her, not the boss.
let spokenNow = '', spokenUntil = 0;
const words = (t) => (String(t).toLowerCase().match(/[а-яёa-z0-9]{3,}/g) || []);
function isEcho(text) {
  if (!spokenNow || (!speaking && Date.now() > spokenUntil)) return false;
  const heardW = words(text);
  if (!heardW.length) return false;
  const said = new Set(words(spokenNow));
  const hits = heardW.filter((w) => said.has(w)).length;
  return hits / heardW.length >= 0.5 && hits >= 2;
}

function speak(text) {
  const clean = speakable(text);
  spokenNow = clean;
  if (!opts.speak || !clean) { if (mode === 'wake') setTimeout(startRec, 400); return; }
  stopSpeaking();
  const id = ++speechId;
  onSpeakStart();
  const end = () => { if (id === speechId) { spokenUntil = Date.now() + 5000; onSpeakEnd(); } };
  if (opts.saymac) speakViaMac(clean, id, end);
  else speakViaBrowser(clean, id, end);
}
// browser voice: sentence by sentence — natural pauses, and Chrome doesn't cut long text
function speakViaBrowser(text, id, end) {
  if (!('speechSynthesis' in window)) { end(); return; }
  const parts = text.match(/[^.!?…]+[.!?…]*/g) || [text];
  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p.trim());
    u.lang = 'ru-RU'; if (chosenVoice) u.voice = chosenVoice; u.rate = 1.02; u.pitch = 1.05;
    if (i === parts.length - 1) { u.onend = end; u.onerror = end; }
    speechSynthesis.speak(u);
  });
}
async function speakViaMac(text, id, end) {
  try {
    const r = await fetch('/api/say', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: text.slice(0, 1200) }) });
    if (!r.ok && id === speechId) { speakViaBrowser(text, id, end); return; } // say failed → browser voice
  } catch { if (id === speechId) { speakViaBrowser(text, id, end); return; } }
  end();
}
// stop talking right now (barge-in, new question, clear)
function stopSpeaking() {
  if (!speaking) return;
  speechId++;
  speaking = false;
  try { speechSynthesis.cancel(); } catch {}
  if (opts.saymac) fetch('/api/hush', { method: 'POST' }).catch(() => {});
  setState('idle', 'в режиме ожидания');
}

// ---------- voice input ----------
// Browsers block the microphone until the user interacts with the page once,
// so the mic turns on with a tap. End of a phrase is detected by our own
// silence timer (Chrome's "final" flag comes late or never in continuous mode).
// While Эдит speaks, the mic listens only for "Эдит" — saying it interrupts her.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const micBtn = $('#mic'), micText = $('#mic-text');
const SILENCE_MS = 1300;      // pause that means "I'm done"
const MAX_PHRASE_MS = 30000;  // safety cap for one phrase
const WAKE_IDLE_MS = 8000;    // after "Эдит", wait this long for the command
// whole word only: «видите», «сидит», «победит» must not wake her up
const WAKE = /(?:^|[^а-яёa-z])(эдит[аеуы]?|edith|едит|эдис|эдди)(?=$|[^а-яёa-z])/i;

let rec = null, mode = 'off';  // 'off' | 'ptt' (tap-to-talk) | 'wake' (listen for "Эдит")
let listening = false, awake = false, committed = false, micGranted = false;
let barge = null;              // { saved } while listening for "Эдит" during speech
let heard = '', wakeAt = -1, silenceTimer = null, maxTimer = null, idleTimer = null;

function micUI(state, label) { // state: off | on | rec
  micBtn.className = 'mic-big' + (state === 'rec' ? ' rec' : state === 'on' ? ' on' : '');
  if (label) micText.textContent = label;
  statMic.className = 'stat ' + (state === 'rec' ? 'live' : state === 'on' ? 'on' : '');
  statMic.querySelector('span').textContent = state === 'off' ? 'микрофон' : (state === 'rec' ? 'слушаю' : 'готов');
}
function idleMicUI() {
  if (mode === 'wake' && !barge) micUI('on', 'скажите «Эдит»');
  else if (speaking && barge) micUI('on', 'скажите «Эдит», чтобы перебить');
  else micUI('off', 'нажмите, чтобы говорить');
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
// Leading fillers/greetings are skipped before looking for a question word:
// «привет, как дела», «слушай, а где…», «окей, сколько…».
const FILLER = /^(?:привет|здравствуй(?:те)?|добрый\s+(?:день|вечер|утро)|доброе\s+утро|эй|слушай(?:те)?|скажи(?:те)?|подскажи(?:те)?|босс|а|и|ну|так|ок|окей|хорошо|кстати|извини(?:те)?|прости|пожалуйста)[\s,.!]+/i;
const Q_WORD = /^(?:(?:ты|вы)\s+(?:умеешь|умеете|можешь|можете|сможешь|сможете|знаешь|знаете|помнишь|помните|видишь|видите)|который|которая|которое|какого|что|чего|чему|чем|как|какой|какая|какое|какие|каких|каким|какую|где|куда|откуда|когда|почему|зачем|отчего|кто|кого|кому|кем|сколько|чей|чья|чьё|чьи|можешь|можно|сможешь|умеешь|знаешь|помнишь|видишь|есть\s+ли|правда\s+ли|разве|неужели|what|how|why|where|when|who|can|is|are|do|does)(?=[\s,]|$)/i;
const Q_LI = /(^|\s)ли(\s|$)/i;
function isQuestion(t) {
  let s = t.toLowerCase();
  for (let i = 0; i < 4 && FILLER.test(s); i++) s = s.replace(FILLER, '');
  return Q_WORD.test(s) || Q_LI.test(s) || /(^|\s)как\s+дела(\s|$)/.test(s);
}
function punctuate(t) {
  t = t.replace(/\s+/g, ' ').trim();
  if (!t) return t;
  t = t[0].toUpperCase() + t.slice(1);
  if (/[.!?…]$/.test(t)) return t;
  return t + (isQuestion(t) ? '?' : '.');
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
    listening = true; micGranted = true; committed = false; heard = ''; wakeAt = -1;
    if (mode === 'ptt') { micUI('rec', 'говорите… (пауза — отправлю)'); setState('listening', 'слушаю'); }
    else if (mode === 'wake') { if (awake) micUI('rec', 'слушаю, босс'); else idleMicUI(); }
  };
  rec.onresult = (e) => {
    if (committed) return;
    // rebuild the whole phrase of this session: finals + current interim
    let full = '';
    for (let i = 0; i < e.results.length; i++) full += e.results[i][0].transcript;
    heard = full;

    if (mode === 'wake' && !awake) {
      const m = [...heard.matchAll(new RegExp(WAKE.source, 'gi'))].pop();
      if (!m) return;                 // not addressed to Эдит — ignore
      if (speaking) stopSpeaking();   // barge-in: she goes quiet at once
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
      mode = 'off'; barge = null; listening = false; micGranted = false; micUI('off', 'нет доступа к микрофону');
      showBanner('Нет доступа к микрофону. В Chrome нажмите значок замка слева от адреса → Микрофон → Разрешить, затем обновите страницу.', 'обновить', () => location.reload());
    } else if (e.error === 'network') {
      showBanner('Распознавание речи не может связаться с сервером Google. Проверьте интернет/VPN.');
    }
  };
  rec.onend = () => {
    listening = false;
    // Chrome may end the session itself at a pause: treat it as "done"
    if (!committed && commandText()) { commit(); return; }
    if (mode === 'wake' && (!busy || speaking)) { setTimeout(startRec, 200); return; }
    if (mode === 'ptt') { mode = 'off'; idleMicUI(); if (!busy) setState('idle', 'в режиме ожидания'); }
  };
}

function clearTimers() { clearTimeout(silenceTimer); clearTimeout(maxTimer); clearTimeout(idleTimer); silenceTimer = maxTimer = idleTimer = null; }

function startRec() {
  if (!rec || listening) return;
  rec.continuous = mode === 'wake'; // tap-to-talk: one phrase per tap
  try { rec.start(); } catch {}
}

function leaveBarge() { if (barge) { mode = barge.saved; barge = null; } }

function commit() {
  if (committed) return;
  const cmd = commandText();
  committed = true; clearTimers(); awake = false;
  try { rec.abort(); } catch {}
  if (barge) leaveBarge(); else if (mode === 'ptt') mode = 'off';
  idleMicUI();
  if (cmd.length < 2) return;
  if (isEcho(cmd)) { youEl.textContent = ''; return; } // her own voice — ignore
  beepDone();
  send(punctuate(cmd));
}

// While she speaks: listen only for "Эдит" (works once the mic was allowed).
function onSpeakStart() {
  speaking = true; setState('speaking', 'говорю');
  if (!rec || !micGranted) return;
  if (mode !== 'wake') { barge = { saved: mode }; mode = 'wake'; }
  awake = false; wakeAt = -1; heard = ''; committed = false;
  if (!listening) startRec(); else { try { rec.abort(); } catch {} } // fresh session, onend restarts it
  idleMicUI();
}
function onSpeakEnd() {
  speaking = false;
  if (!busy) setState('idle', 'в режиме ожидания');
  if (barge && !awake) { // finished without being interrupted
    leaveBarge(); clearTimers();
    if (mode !== 'wake') { try { rec.abort(); } catch {} }
  }
  if (mode === 'wake' && !listening) setTimeout(startRec, 800);
  idleMicUI();
}

function wakeUp() {
  awake = true; beepListen();
  micUI('rec', 'слушаю, босс'); setState('listening', 'слушаю'); youEl.textContent = '…';
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { // said "Эдит" but nothing after it
    if (committed || commandText()) return;
    awake = false; wakeAt = -1; heard = '';
    leaveBarge();
    try { rec.abort(); } catch {}
    if (!busy) { setState('idle', 'в режиме ожидания'); youEl.textContent = ''; }
    idleMicUI();
  }, WAKE_IDLE_MS);
}

// tap the mic: talk right now (works from the very first tap)
micBtn.addEventListener('click', () => {
  if (!rec) return;
  if (listening && mode === 'ptt') { // tap again = "I'm done", send now
    if (commandText()) commit(); else { mode = 'off'; try { rec.abort(); } catch {} idleMicUI(); }
    return;
  }
  stopSpeaking();
  barge = null;
  try { rec.abort(); } catch {}
  clearTimers();
  mode = 'ptt'; awake = true; beepListen();
  setTimeout(startRec, 150);
});

// hands-free toggle: continuous wake-word listening (needs one tap on the page
// first — browser rule)
function setWakeMode(on) {
  barge = null;
  if (on) { mode = 'wake'; awake = false; startRec(); idleMicUI(); }
  else { mode = 'off'; clearTimers(); try { rec && rec.abort(); } catch {} idleMicUI(); }
}

// ---------- in-HUD windows ----------
let winCount = 0;
function openWindow(w) {
  const el = document.createElement('div'); el.className = 'win';
  const off = (winCount++ % 5) * 26; el.style.left = `calc(8% + ${off}px)`; el.style.top = `calc(14% + ${off}px)`;
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
  else if (ev.type === 'proactive') { addMsg('edith', ev.text, 'proactive'); if (!busy && !speaking) speak(ev.text); }
  else if (ev.type === 'notify') announce(ev.items);
  else if (ev.type === 'notice') showBanner(ev.text);
};

// New messages / calls from any messenger (via macOS notifications).
// Their text is someone else's data: shown as plain text, never as markup.
function announce(items) {
  for (const n of items) {
    const el = addMsg('edith', '', 'notify' + (n.important ? ' important' : ''));
    el.querySelector('.who span').textContent = (n.important ? 'важно · ' : 'входящее · ') + n.app;
    el.querySelector('.body').textContent = [n.title, n.subtitle].filter(Boolean).join(' · ') + (n.body ? ': ' + n.body : '');
  }
  if (!opts.notify || !opts.speak || busy || speaking) return;
  const n = items[items.length - 1];
  let phrase;
  if (items.length > 1) phrase = `Босс, у вас ${items.length} новых сообщения. Последнее — ${n.app}${n.title ? ', от ' + n.title : ''}.`;
  else if (n.app === 'Звонок') phrase = `Босс, вам звонят${n.title ? ': ' + n.title : ''}.`;
  else phrase = `Босс, ${n.important ? 'важное сообщение' : 'новое сообщение'} в ${n.app}${n.title ? ' от ' + n.title : ''}.`;
  if (items.length === 1 && n.important && n.body) phrase += ' ' + n.body.slice(0, 200);
  speak(phrase);
}
setInterval(() => { if (!document.hidden) fetch('/api/beat', { method: 'POST' }).catch(() => {}); }, 60000);

// ---------- eco / visibility ----------
function applyEco() { document.body.classList.toggle('eco', opts.eco || document.hidden); }
document.addEventListener('visibilitychange', applyEco);
if (navigator.getBattery) navigator.getBattery().then((b) => {
  const check = () => { const el = $('#stat-batt'); if (el) { el.hidden = false; $('#batt-label').textContent = Math.round(b.level * 100) + '%' + (b.charging ? ' ⚡' : ''); } if (!b.charging && b.level < 0.3 && !opts.eco) { opts.eco = true; syncOpts(); applyEco(); } };
  b.addEventListener('levelchange', check); b.addEventListener('chargingchange', check); check();
}).catch(() => {});

// ---------- settings ----------
$('#btn-settings').onclick = () => { $('#settings').hidden = false; };
$('#btn-settings-close').onclick = () => { $('#settings').hidden = true; };
const bind = (id, key, after) => { const el = $(id); if (!el) return; el.checked = opts[key]; el.onchange = () => { opts[key] = el.checked; saveOpts(); after && after(); }; };
bind('#opt-saymac', 'saymac');
bind('#opt-wake', 'wake', () => setWakeMode(opts.wake));
bind('#opt-speak', 'speak', () => { if (!opts.speak) stopSpeaking(); });
bind('#opt-proactive', 'proactive', () => fetch('/api/proactive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: opts.proactive }) }));
bind('#opt-notify', 'notify');
bind('#opt-eco', 'eco', applyEco);
$('#voice-select').onchange = (e) => { opts.voiceURI = e.target.value; saveOpts(); chosenVoice = voices.find((v) => v.voiceURI === opts.voiceURI) || chosenVoice; };
$('#voice-test').onclick = () => speak('Я на связи, босс. Говорю спокойно и по делу.');
function syncOpts() { $('#opt-eco').checked = opts.eco; saveOpts(); }

// ---------- boot ----------
(function boot() {
  applyEco();
  const o = $('#boot');
  setTimeout(() => { o.classList.add('done'); setTimeout(() => o.remove(), 700); }, 1600);
})();

// greeting. The mic needs one tap first (browser rule).
setState('idle', 'в режиме ожидания');
addMsg('edith', 'Системы в норме, босс. Нажмите микрофон и говорите — или напишите здесь. Спросите «что ты умеешь?», если хотите знать мои возможности.');
idleMicUI();
