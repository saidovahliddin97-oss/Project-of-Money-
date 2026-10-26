// macOS control bridge for Эдит. Runs ONLY on the owner's own Mac.
// Every action that changes anything is classified: "safe" actions run
// immediately, "sensitive" actions must be confirmed by the user in the UI
// before the server will call runAction(). Uses only tools built into macOS
// (osascript, open, screencapture, say) plus optional cliclick for precise
// mouse/keyboard. Nothing here runs without the local user's machine and key.

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { readFile, unlink } from 'node:fs/promises';

const execp = promisify(exec);

// Actions Эдит may perform. `sensitive: true` means the UI must get an explicit
// "да" from the user for that specific call before it runs.
export const ACTIONS = {
  say:        { sensitive: false, desc: 'произнести текст голосом macOS' },
  open_app:   { sensitive: false, desc: 'открыть приложение' },
  open_url:   { sensitive: false, desc: 'открыть ссылку в браузере' },
  screenshot: { sensitive: false, desc: 'сделать снимок экрана' },
  notify:     { sensitive: false, desc: 'показать уведомление' },
  type_text:  { sensitive: true,  desc: 'напечатать текст в активном окне' },
  key:        { sensitive: true,  desc: 'нажать сочетание клавиш' },
  click:      { sensitive: true,  desc: 'кликнуть мышью по координатам' },
  applescript:{ sensitive: true,  desc: 'выполнить AppleScript' },
  shell:      { sensitive: true,  desc: 'выполнить команду в терминале' },
};

// Arbitrary command / AppleScript execution is OFF by default — it is a large
// surface. Turn on only deliberately with EDITH_ALLOW_SHELL=1 in your own env.
export const SHELL_ENABLED = process.env.EDITH_ALLOW_SHELL === '1';

// The default, safe action set: everything except the two free-form executors.
export function enabledActions() {
  const names = Object.keys(ACTIONS);
  return SHELL_ENABLED ? names : names.filter((n) => n !== 'shell' && n !== 'applescript');
}

export function isEnabled(name) {
  return enabledActions().includes(name);
}

export function isSensitive(name) {
  return ACTIONS[name]?.sensitive ?? true; // unknown => treat as sensitive
}

export function describe(action) {
  const meta = ACTIONS[action?.name];
  if (!meta) return `неизвестное действие: ${action?.name}`;
  const arg = action.text || action.app || action.url || action.command || action.script || '';
  return meta.desc + (arg ? ` — «${String(arg).slice(0, 120)}»` : '');
}

// Shell-quote a single argument safely for /bin/sh.
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

async function osascript(script) {
  const { stdout } = await execp(`osascript -e ${q(script)}`, { timeout: 20000 });
  return stdout.trim();
}

export async function runAction(action) {
  if (!isEnabled(action.name)) {
    return { ok: false, error: `Действие «${action.name}» отключено. Включите EDITH_ALLOW_SHELL=1, если это shell/applescript.` };
  }
  if (os.platform() !== 'darwin' && action.name !== 'shell' && action.name !== 'say') {
    // The visual/input actions are macOS-specific; shell works anywhere.
    return { ok: false, error: 'Это действие доступно только на macOS.' };
  }
  switch (action.name) {
    case 'say':
      await execp(`say ${q(action.text || '')}`, { timeout: 30000 });
      return { ok: true };

    case 'open_app':
      await execp(`open -a ${q(action.app)}`, { timeout: 15000 });
      return { ok: true };

    case 'open_url':
      await execp(`open ${q(action.url)}`, { timeout: 15000 });
      return { ok: true };

    case 'notify':
      await osascript(`display notification ${JSON.stringify(action.text || '')} with title "Эдит"`);
      return { ok: true };

    case 'screenshot': {
      const file = path.join(os.tmpdir(), `edith-shot-${Date.now()}.png`);
      await execp(`screencapture -x ${q(file)}`, { timeout: 15000 });
      const data = await readFile(file);
      await unlink(file).catch(() => {});
      return { ok: true, image: data.toString('base64'), media_type: 'image/png' };
    }

    case 'type_text':
      // Prefer cliclick if present; fall back to System Events keystroke.
      try {
        await execp(`cliclick t:${q(action.text || '')}`, { timeout: 15000 });
      } catch {
        await osascript(`tell application "System Events" to keystroke ${JSON.stringify(action.text || '')}`);
      }
      return { ok: true };

    case 'key':
      // action.key like "cmd+s"; System Events uses modifier phrasing.
      await osascript(buildKeystroke(action.key || ''));
      return { ok: true };

    case 'click':
      await execp(`cliclick c:${Number(action.x)},${Number(action.y)}`, { timeout: 15000 });
      return { ok: true };

    case 'applescript':
      return { ok: true, result: await osascript(action.script || '') };

    case 'shell': {
      const { stdout, stderr } = await execp(action.command || '', { timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
      return { ok: true, result: (stdout || '') + (stderr ? `\n[stderr] ${stderr}` : '') };
    }

    default:
      return { ok: false, error: `Неизвестное действие: ${action.name}` };
  }
}

// Translate "cmd+shift+4" into an AppleScript keystroke with modifiers.
function buildKeystroke(combo) {
  const parts = combo.toLowerCase().split('+').map((p) => p.trim());
  const key = parts.pop();
  const modMap = { cmd: 'command down', command: 'command down', ctrl: 'control down', control: 'control down', alt: 'option down', option: 'option down', shift: 'shift down' };
  const mods = parts.map((p) => modMap[p]).filter(Boolean);
  const using = mods.length ? ` using {${mods.join(', ')}}` : '';
  return `tell application "System Events" to keystroke ${JSON.stringify(key)}${using}`;
}
