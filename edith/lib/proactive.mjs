// Proactive engine: lets Эдит speak first. Tracks when the user last acted and
// how long they've been working, and occasionally produces a short line —
// a break reminder, a check-in, or a hello after a long silence.

import { createMessage, DEFAULT_MODEL } from './claude.mjs';

const MIN = 60 * 1000;

const CFG = {
  workReminderMs: 90 * MIN,   // nudge to take a break after this much continuous work
  idleCheckMs: 25 * MIN,      // if present but silent this long, check in
  minGapMs: 20 * MIN,         // never nudge more often than this
};

const FALLBACKS = {
  break: ['Босс, вы за работой уже больше полутора часов. Разомнитесь пару минут — я никуда не денусь.',
          'Долгая сессия, босс. Советую сделать паузу и выпить воды.'],
  idle: ['Я рядом, босс. Если что-то понадобится — только скажите.',
         'Всё тихо. Напомнить вам о чём-нибудь или помочь с задачей?'],
  hello: ['С возвращением, босс. Готов к работе.'],
};

const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Proactive {
  constructor() {
    const now = Date.now();
    this.sessionStart = now;
    this.lastUserMsg = now;
    this.lastActivity = now;
    this.lastNudge = 0;
    this.workBlockStart = now; // start of the current uninterrupted work block
    this.enabled = true;
  }

  // Called on any sign of life from the browser (heartbeat or message).
  touch(kind = 'beat') {
    const now = Date.now();
    // A gap of >10 min means the user stepped away; that counts as a break.
    if (now - this.lastActivity > 10 * MIN) this.workBlockStart = now;
    this.lastActivity = now;
    if (kind === 'message') this.lastUserMsg = now;
  }

  // Returns a short line to say, or null. Call every ~60s from the server.
  async maybeNudge() {
    if (!this.enabled) return null;
    const now = Date.now();
    if (now - this.lastActivity > 3 * MIN) return null;   // user not actually here
    if (now - this.lastNudge < CFG.minGapMs) return null; // too soon

    let reason = null;
    if (now - this.workBlockStart > CFG.workReminderMs) reason = 'break';
    else if (now - this.lastUserMsg > CFG.idleCheckMs) reason = 'idle';
    if (!reason) return null;

    this.lastNudge = now;
    if (reason === 'break') this.workBlockStart = now; // reset so it doesn't repeat immediately
    return this.compose(reason);
  }

  async compose(reason) {
    const minutes = Math.round((Date.now() - this.workBlockStart) / MIN);
    const prompt = reason === 'break'
      ? `Пользователь непрерывно работает примерно ${minutes} минут. Напомни ему мягко сделать паузу.`
      : 'Пользователь давно ничего не писал, но он за компьютером. Ненавязчиво предложи помощь.';
    try {
      const msg = await createMessage({
        model: DEFAULT_MODEL,
        max_tokens: 120,
        system: 'Ты — Эдит, персональный ИИ-ассистент в стиле Джарвиса. Обращайся к пользователю «босс». Отвечай ОДНОЙ короткой фразой на русском, спокойно и по делу, без эмодзи.',
        messages: [{ role: 'user', content: prompt }],
      });
      const text = (msg.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      return text || pick(FALLBACKS[reason]);
    } catch {
      return pick(FALLBACKS[reason]); // offline / no key — still speak
    }
  }
}
