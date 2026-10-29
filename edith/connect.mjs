#!/usr/bin/env node
// Одноразовое подключение аккаунтов к Эдит. Запуск в Терминале:
//   node ~/EDITH/app/edith/connect.mjs gmail      — вся почта Gmail
//   node ~/EDITH/app/edith/connect.mjs telegram   — личный Telegram
// Данные проверяются входом и только потом сохраняются в edith/.env (права 600:
// читать файл можете только вы). Никуда, кроме Google/Telegram, они не уходят.

import readline from 'node:readline';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV = path.join(HERE, '.env');
try { process.loadEnvFile(ENV); } catch {}

async function saveEnv(values) {
  let text = '';
  try { text = await readFile(ENV, 'utf8'); } catch { try { text = await readFile(path.join(HERE, '.env.example'), 'utf8'); } catch {} }
  const lines = text.split('\n');
  for (const [k, v] of Object.entries(values)) {
    const i = lines.findIndex((l) => l.startsWith(k + '='));
    if (i >= 0) lines[i] = `${k}=${v}`; else lines.push(`${k}=${v}`);
  }
  await writeFile(ENV, lines.join('\n').replace(/\n*$/, '\n'), { mode: 0o600 });
  await chmod(ENV, 0o600);
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(question); };
    rl.question(question, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a.trim()); });
  });
}
const say = (...l) => console.log(l.join('\n'));

async function gmail() {
  say('', '=== Подключение Gmail (вся почта) ===', '',
    'Нужен «пароль приложения» Google — это НЕ ваш обычный пароль, а отдельный ключ только для Эдит:',
    '  1. Включите двухэтапную проверку: https://myaccount.google.com/signinoptions/twosv',
    '  2. Создайте пароль приложения: https://myaccount.google.com/apppasswords',
    '     (название — «Эдит»), Google покажет 16 букв.',
    'Отозвать доступ можно там же в любой момент.', '');
  const user = await ask('Ваш адрес Gmail: ');
  const pass = (await ask('Пароль приложения (16 букв, ввод скрыт): ', { hidden: true })).replace(/\s+/g, '');
  if (!/@/.test(user) || pass.length < 16) { say('Похоже, адрес или пароль введены неверно. Запустите ещё раз.'); process.exit(1); }
  process.env.GMAIL_USER = user; process.env.GMAIL_APP_PASSWORD = pass;
  say('Проверяю вход…');
  const { gmailList } = await import('./lib/gmail.mjs');
  try {
    const last = await gmailList({ limit: 1 });
    await saveEnv({ GMAIL_USER: user, GMAIL_APP_PASSWORD: pass });
    say(`Готово: Gmail подключён. Последнее письмо: «${last[0]?.subject || '—'}».`, 'Перезапустите Эдит кнопкой, чтобы она начала пользоваться почтой.');
  } catch (e) { say('Не получилось: ' + e.message); process.exit(1); }
}

async function telegram() {
  say('', '=== Подключение Telegram (официальный API) ===', '',
    'Шаг 1. Получите ключи приложения (это бесплатно и официально):',
    '  откройте https://my.telegram.org → войдите по номеру → «API development tools»',
    '  → заполните App title (например, Edith) и Short name (edith) → Create application.',
    '  Скопируйте App api_id (число) и App api_hash (строка).',
    'Шаг 2. Войдите кодом, который Telegram пришлёт в приложение.',
    'Сеанс появится в Telegram → Настройки → Устройства; завершите его там — и доступ Эдит пропадёт.', '');
  const apiId = Number(await ask('api_id: '));
  const apiHash = await ask('api_hash: ');
  if (!apiId || !/^[0-9a-f]{32}$/i.test(apiHash)) { say('api_id — число, api_hash — 32 символа 0-9/a-f. Запустите ещё раз.'); process.exit(1); }
  const { tgLib } = await import('./lib/telegram.mjs');
  const { TelegramClient, StringSession } = await tgLib();
  const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 5 });
  client.setLogLevel('none');
  try {
    await client.start({
      phoneNumber: () => ask('Номер телефона Telegram (+7…): '),
      phoneCode: () => ask('Код из Telegram: '),
      password: () => ask('Облачный пароль (двухэтапная проверка), ввод скрыт: ', { hidden: true }),
      onError: (e) => { say('Ошибка: ' + e.message); },
    });
    const me = await client.getMe();
    await saveEnv({ TG_API_ID: String(apiId), TG_API_HASH: apiHash, TG_SESSION: client.session.save() });
    say(`Готово: Telegram подключён как ${[me.firstName, me.lastName].filter(Boolean).join(' ')}${me.username ? ' (@' + me.username + ')' : ''}.`, 'Перезапустите Эдит кнопкой.');
  } catch (e) { say('Не получилось: ' + e.message); process.exitCode = 1; }
  finally { await client.disconnect().catch(() => {}); process.exit(process.exitCode || 0); }
}

const what = (process.argv[2] || '').toLowerCase();
if (what === 'gmail') await gmail();
else if (what === 'telegram') await telegram();
else say('Использование:', '  node connect.mjs gmail', '  node connect.mjs telegram');
