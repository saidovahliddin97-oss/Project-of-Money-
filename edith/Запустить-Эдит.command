#!/bin/bash
# Двойной клик по этому файлу запускает Эдит и открывает её в браузере.
# Лежит в папке edith/ внутри репозитория Project-of-Money-.

cd "$(dirname "$0")/.." || exit 1   # корень репозитория

echo "=== ЭДИТ ==="

# 1) Node.js установлен?
if ! command -v node >/dev/null 2>&1; then
  echo
  echo "Не найден Node.js. Установите его один раз с https://nodejs.org (версия 20+),"
  echo "затем снова откройте этот файл."
  echo
  read -n 1 -s -r -p "Нажмите любую клавишу, чтобы закрыть…"
  exit 1
fi

# 2) Есть ли ключ (edith/.env)?
if [ ! -f edith/.env ]; then
  cp edith/.env.example edith/.env
  echo
  echo "Создан файл edith/.env — впишите в него ваш ключ Claude (ANTHROPIC_API_KEY),"
  echo "сохраните и снова откройте этот файл."
  open -e edith/.env 2>/dev/null || true
  echo
  read -n 1 -s -r -p "Нажмите любую клавишу, чтобы закрыть…"
  exit 1
fi

# 3) Порт (по умолчанию 4330)
PORT=$(grep -E '^EDITH_PORT=' edith/.env | cut -d= -f2)
PORT=${PORT:-4330}

# 4) Открыть браузер чуть позже, когда сервер поднимется
( sleep 2; open "http://localhost:${PORT}" ) &

echo "Запускаю… Эдит откроется в браузере на http://localhost:${PORT}"
echo "Чтобы остановить — закройте это окно."
echo

# 5) Старт сервера (ключ подхватывается из edith/.env)
exec node --env-file=edith/.env edith/server.mjs
