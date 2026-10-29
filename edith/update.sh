#!/bin/bash
# Обновить Эдит до последней версии с GitHub. Настройки (edith/.env) сохраняются.
# Если Эдит была запущена — после обновления она запустится снова.
# Ставится в ~/EDITH/app; подходит для «Команд»: bash ~/EDITH/app/edith/update.sh

export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
URL="https://github.com/saidovahliddin97-oss/Project-of-Money-/archive/refs/heads/claude/admiring-franklin-ognj19.zip"
APP="$HOME/EDITH/app"

# Скрипт заменяет собственную папку — поэтому сначала копирует себя во временный файл.
if [ "$1" != "--run" ]; then
  T="$(mktemp)"; cp "$0" "$T"; exec bash "$T" --run
fi

note() { command -v osascript >/dev/null && osascript -e "display notification \"$1\" with title \"Эдит\""; echo "$1"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
if ! curl -sfL -o "$TMP/e.zip" "$URL" || ! unzip -q "$TMP/e.zip" -d "$TMP"; then
  note "Не удалось скачать обновление — проверьте интернет/VPN"; exit 1
fi
NEW="$(ls -d "$TMP"/Project-of-Money-* | head -1)"

PORT="$(grep -E '^EDITH_PORT=' "$APP/edith/.env" 2>/dev/null | tail -1 | cut -d= -f2 | tr -d ' ')"
PORT="${PORT:-4330}"
WAS_RUNNING=0
curl -s -o /dev/null --max-time 1 "http://localhost:$PORT" && WAS_RUNNING=1

[ -f "$APP/edith/.env" ] && cp "$APP/edith/.env" "$NEW/edith/.env"
pkill -f "node .*edith/server\.mjs"
mkdir -p "$(dirname "$APP")"
rm -rf "$APP" && mv "$NEW" "$APP" && chmod +x "$APP"/edith/*.sh

note "Эдит обновлена"
[ "$WAS_RUNNING" = 1 ] && bash "$APP/edith/start.sh"
exit 0
