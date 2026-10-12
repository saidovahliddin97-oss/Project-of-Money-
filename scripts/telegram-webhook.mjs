// Points the owner bot at /api/telegram and registers its command menu (safe to re-run).
//   TELEGRAM_BOT_TOKEN=... SITE_URL=... node scripts/telegram-webhook.mjs
import { webhookSecret } from '../server/telegram.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SITE = (process.env.SITE_URL || 'https://localledger-40f.pages.dev').replace(/\/+$/, '');
if (!TOKEN) {
  console.log('telegram: skipped (no TELEGRAM_BOT_TOKEN)');
  process.exit(0);
}
const api = async (method, body) => (await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})).json();

const hook = await api('setWebhook', { url: `${SITE}/api/telegram`, secret_token: await webhookSecret(TOKEN), allowed_updates: ['message'] });
const cmds = await api('setMyCommands', { commands: [{ command: 'stats', description: 'Статистика: сегодня и 7 дней' }, { command: 'help', description: 'Справка' }] });
if (!hook.ok || !cmds.ok) {
  console.error(`✖ telegram webhook: ${hook.description || cmds.description}`);
  process.exit(1);
}
console.log(`telegram webhook → ${SITE}/api/telegram`);
