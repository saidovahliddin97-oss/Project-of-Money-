#!/bin/bash
# Одна кнопка: запускает Ollama (в фоне), Эдит (без окна Терминала) и открывает
# её в Chrome. Если Эдит уже работает — просто показывает её.
# Подходит для приложения «Команды» (Shortcuts): действие «Выполнить скрипт оболочки».

# «Команды» запускают скрипты с урезанным PATH — добавим, где обычно лежит node.
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"

DIR="$(cd "$(dirname "$0")" && pwd)"   # .../edith
PORT="$(grep -E '^EDITH_PORT=' "$DIR/.env" 2>/dev/null | tail -1 | cut -d= -f2 | tr -d ' ')"
PORT="${PORT:-4330}"
URL="http://localhost:$PORT"
LOG="$DIR/edith.log"

up() { curl -s -o /dev/null --max-time 1 "$1"; }

# 1) Ollama — в фоне, без окна (если установлен)
if [ -d "/Applications/Ollama.app" ] && ! up "http://localhost:11434/api/version"; then
  open -ga Ollama
  for _ in $(seq 1 20); do up "http://localhost:11434/api/version" && break; sleep 0.5; done
fi

# 1b) Библиотеки почты и Telegram: поставить, если их нет или версия изменилась
if [ -f "$DIR/package-lock.json" ] && command -v npm >/dev/null 2>&1; then
  STAMP="$(shasum "$DIR/package-lock.json" | cut -d' ' -f1)"
  if [ ! -d "$DIR/node_modules" ] || [ "$(cat "$DIR/node_modules/.edith-stamp" 2>/dev/null)" != "$STAMP" ]; then
    (cd "$DIR" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund >"$DIR/npm.log" 2>&1) \
      && echo "$STAMP" > "$DIR/node_modules/.edith-stamp"
  fi
fi

# 2) Эдит — если ещё не запущена, поднять в фоне
if ! up "$URL"; then
  if ! command -v node >/dev/null 2>&1; then
    osascript -e 'display notification "Не найден Node.js — установите с nodejs.org" with title "Эдит"'
    exit 1
  fi
  [ -f "$DIR/.env" ] || cp "$DIR/.env.example" "$DIR/.env"
  nohup node "$DIR/server.mjs" >"$LOG" 2>&1 </dev/null &
  disown 2>/dev/null
  for _ in $(seq 1 20); do up "$URL" && break; sleep 0.5; done
fi

if ! up "$URL"; then
  osascript -e 'display notification "Эдит не запустилась — см. edith.log" with title "Эдит"'
  exit 1
fi

# 3) Открыть Эдит отдельным окном Chrome (без вкладок и адресной строки)
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app="$URL"
else
  open "$URL"
fi
