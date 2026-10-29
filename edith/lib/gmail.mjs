// Gmail целиком (все папки, архив) через IMAP + отправка через SMTP.
// Вход — по «паролю приложения» Google (16 символов, не основной пароль):
// GMAIL_USER и GMAIL_APP_PASSWORD в edith/.env. Пароль приложения можно отозвать
// в любой момент на myaccount.google.com/apppasswords.
// Библиотеки подгружаются только при использовании: без них Эдит работает как раньше.

const HOST_IMAP = 'imap.gmail.com';
const HOST_SMTP = 'smtp.gmail.com';

const user = () => (process.env.GMAIL_USER || '').trim();
const pass = () => (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
export const gmailReady = () => Boolean(user() && pass());

const AUTH_HINT = 'Gmail не пустил. Проверьте в edith/.env: GMAIL_USER — ваш адрес, GMAIL_APP_PASSWORD — пароль приложения (16 букв с myaccount.google.com/apppasswords), а не обычный пароль. В Gmail должен быть включён IMAP.';
const DEPS_HINT = 'Модули почты не установлены. Перезапустите Эдит кнопкой — она поставит их сама.';

async function deps() {
  try {
    const [{ ImapFlow }, { simpleParser }, nodemailer] = await Promise.all([import('imapflow'), import('mailparser'), import('nodemailer')]);
    return { ImapFlow, simpleParser, nodemailer: nodemailer.default || nodemailer };
  } catch { throw new Error(DEPS_HINT); }
}

const fmt = (d) => (d ? new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const clip = (s, n) => (s && s.length > n ? s.slice(0, n) + '…' : s || '');
const who = (a) => (a ? (a.name ? `${a.name} <${a.address}>` : a.address) : '');

async function withImap(fn) {
  const { ImapFlow } = await deps();
  const client = new ImapFlow({ host: HOST_IMAP, port: 993, secure: true, auth: { user: user(), pass: pass() }, logger: false, socketTimeout: 60000 });
  try { await client.connect(); }
  catch (e) { throw new Error(/auth|credential|invalid|AUTHENTICATIONFAILED/i.test(String(e.responseText || e.message)) ? AUTH_HINT : 'Нет связи с Gmail: ' + e.message); }
  try { return await fn(client); }
  finally { await client.logout().catch(() => {}); }
}

// "All Mail" has a localized name ("[Gmail]/Вся почта"), so find it by its flag.
async function allMailPath(client) {
  const boxes = await client.list();
  return (boxes.find((b) => b.specialUse === '\\All') || boxes.find((b) => /all mail|вся почта/i.test(b.path)) || { path: 'INBOX' }).path;
}

async function envelopes(client, path, uids) {
  const out = [];
  if (!uids.length) return out;
  for await (const m of client.fetch(uids.join(','), { uid: true, envelope: true, flags: true, internalDate: true, labels: true }, { uid: true })) {
    out.push({
      id: `${path}|${m.uid}`,
      date: m.internalDate || m.envelope?.date,
      from: who(m.envelope?.from?.[0]),
      to: (m.envelope?.to || []).map(who).join(', '),
      subject: m.envelope?.subject || '(без темы)',
      unread: !m.flags?.has('\\Seen'),
    });
  }
  return out.sort((a, b) => new Date(b.date) - new Date(a.date));
}

/** Newest messages in a folder (INBOX by default). */
export async function gmailList({ limit = 10, unreadOnly = false } = {}) {
  const n = Math.min(Math.max(Number(limit) || 10, 1), 50);
  return withImap(async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      let uids = await client.search(unreadOnly ? { seen: false } : { all: true }, { uid: true });
      uids = (uids || []).slice(-n);
      return envelopes(client, 'INBOX', uids);
    } finally { lock.release(); }
  });
}

/** Search the whole mailbox with Gmail syntax: "from:bank", "subject:счёт newer_than:7d", "has:attachment". */
export async function gmailSearch(query, limit = 10) {
  const n = Math.min(Math.max(Number(limit) || 10, 1), 30);
  return withImap(async (client) => {
    const path = await allMailPath(client);
    const lock = await client.getMailboxLock(path);
    try {
      const uids = ((await client.search({ gmraw: String(query || '') }, { uid: true })) || []).slice(-n);
      return envelopes(client, path, uids);
    } finally { lock.release(); }
  });
}

/** Full text of one message (id from gmailList/gmailSearch). */
export async function gmailRead(id) {
  const [path, uidStr] = String(id).split('|');
  const uid = Number(uidStr);
  if (!path || !uid) throw new Error('Неверный id письма.');
  const { simpleParser } = await deps();
  return withImap(async (client) => {
    const lock = await client.getMailboxLock(path);
    try {
      const { content } = await client.download(String(uid), undefined, { uid: true });
      const mail = await simpleParser(content);
      return {
        from: mail.from?.text || '', to: mail.to?.text || '', date: mail.date, subject: mail.subject || '(без темы)',
        body: clip((mail.text || '').replace(/\n{3,}/g, '\n\n').trim(), 8000),
        attachments: (mail.attachments || []).map((a) => a.filename).filter(Boolean),
        messageId: mail.messageId || '',
      };
    } finally { lock.release(); }
  });
}

/** Send mail from the boss's Gmail (only after the confirm card). Gmail files it in "Sent". */
export async function gmailSend({ to, subject = '', body = '', inReplyTo = '' }) {
  if (!to) throw new Error('Не указан адресат.');
  const { nodemailer } = await deps();
  const transport = nodemailer.createTransport({ host: HOST_SMTP, port: 465, secure: true, auth: { user: user(), pass: pass() } });
  try {
    await transport.sendMail({ from: user(), to, subject, text: body, ...(inReplyTo ? { inReplyTo, references: inReplyTo } : {}) });
  } catch (e) {
    throw new Error(/auth|credential|535/i.test(String(e.message)) ? AUTH_HINT : 'Не удалось отправить: ' + e.message);
  } finally { transport.close(); }
}

export const gmailFmt = { fmt, clip };
