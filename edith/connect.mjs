#!/usr/bin/env node
// Одноразовое подключение аккаунтов к Эдит. Запуск в Терминале:
//   node ~/EDITH/app/edith/connect.mjs gmail      — вся почта Gmail
//   node ~/EDITH/app/edith/connect.mjs telegram   — личный Telegram
//   node ~/EDITH/app/edith/connect.mjs bot        — Telegram-бот «Эдит»
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

async function bot() {
  say('', '=== Telegram-бот «Эдит» ===', '',
    'Создайте отдельного бота (не трогайте бота продаж):',
    '  в Telegram откройте @BotFather → /newbot → имя (например, Эдит) → адрес, оканчивающийся на bot.',
    '  BotFather пришлёт токен — длинную строку вида 1234567890:AA…', '');
  const token = await ask('Токен нового бота (ввод скрыт): ', { hidden: true });
  const { tg } = await import('./lib/bot.mjs');
  let me;
  try { me = await tg(token, 'getMe', {}, 20000); }
  catch (e) { say('Токен не подошёл: ' + e.message); process.exit(1); }
  // never hijack a bot that already delivers to a website (e.g. the sales bot)
  const hook = await tg(token, 'getWebhookInfo', {}, 20000).catch(() => ({}));
  if (hook.url) {
    say(`Этот бот уже работает на сайте (${hook.url}) — похоже, это бот продаж.`, 'Его я не трогаю. Создайте нового бота в @BotFather и запустите команду ещё раз.');
    process.exit(1);
  }
  say('', `Откройте в Telegram https://t.me/${me.username} и нажмите «Start» (или напишите что угодно).`, 'Жду до 3 минут…');
  let offset = 0, owner = null;
  const until = Date.now() + 180000;
  try { const old = await tg(token, 'getUpdates', { offset: -1, timeout: 0 }, 20000); if (old.length) offset = old[old.length - 1].update_id + 1; } catch {}
  while (!owner && Date.now() < until) {
    const ups = await tg(token, 'getUpdates', { offset, timeout: 30, allowed_updates: ['message'] }, 40000).catch(() => []);
    for (const u of ups) {
      offset = u.update_id + 1;
      if (u.message?.chat?.type === 'private') { owner = u.message.from; break; }
    }
  }
  if (!owner) { say('Не дождалась сообщения. Запустите команду ещё раз.'); process.exit(1); }
  const name = [owner.first_name, owner.last_name].filter(Boolean).join(' ') + (owner.username ? ` (@${owner.username})` : '');
  const yes = (await ask(`Написал(а): ${name}. Это вы? (да/нет): `)).toLowerCase();
  if (!/^(д|y)/.test(yes)) { say('Хорошо, ничего не сохраняю.'); process.exit(1); }
  await tg(token, 'getUpdates', { offset, timeout: 0 }, 20000).catch(() => {}); // mark handled
  await saveEnv({ EDITH_BOT_TOKEN: token, EDITH_BOT_OWNER: String(owner.id) });
  await tg(token, 'sendMessage', { chat_id: owner.id, text: 'Готово, босс. Бот подключён. Перезапустите Эдит — и я начну отвечать здесь.' }, 20000).catch(() => {});
  say('', `Готово: бот @${me.username} будет отвечать только вам.`, 'Перезапустите Эдит кнопкой (или: bash ~/EDITH/app/edith/stop.sh, затем кнопка «Эдит»).');
}

const what = (process.argv[2] || '').toLowerCase();
if (what === 'gmail') await gmail();
else if (what === 'telegram') await telegram();
else if (what === 'bot') await bot();
else say('Использование:', '  node connect.mjs bot        — Telegram-бот «Эдит»', '  node connect.mjs gmail      — вся почта Gmail', '  node connect.mjs telegram   — личный Telegram');
