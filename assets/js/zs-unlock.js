// Доступ к цифрам без сервера: после оплаты lava.top ведёт покупателя на /unlock.html#<код>.
// В коде сайта хранится только SHA-256 кода, сам код — в настройке товара lava.top «После оплаты».
import { ZS } from './zs-config.js';

const KEY = 'zs_unlock';
export const PAY_URL = ZS.PAY_URL;

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function isUnlocked() {
  try {
    const code = localStorage.getItem(KEY);
    return Boolean(code && ZS.UNLOCK_SHA256 && (await sha256(code)) === ZS.UNLOCK_SHA256);
  } catch {
    return false;
  }
}

export async function unlockWithCode(raw) {
  const code = String(raw || '').trim();
  if (!code || !ZS.UNLOCK_SHA256 || (await sha256(code)) !== ZS.UNLOCK_SHA256) return false;
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* приватный режим: доступ будет до закрытия вкладки */
  }
  return true;
}
