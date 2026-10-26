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

# 2) Настройки есть? (без .env используется Ollama по умолчанию)
if [ ! -f edith/.env ]; then
  cp edith/.env.example edith/.env
  echo
  echo "Создан edith/.env с настройками по умолчанию (бесплатный мозг — Ollama)."
  echo "Если захотите облачный вариант (Groq/Gemini) — впишите ключ в этот файл."
fi

# 3) Провайдер
PROVIDER=$(grep -E '^EDITH_PROVIDER=' edith/.env | tail -1 | cut -d= -f2 | tr -d ' ')
PROVIDER=${PROVIDER:-ollama}
PORT=$(grep -E '^EDITH_PORT=' edith/.env | tail -1 | cut -d= -f2 | tr -d ' ')
PORT=${PORT:-4330}
MODEL=$(grep -E '^EDITH_MODEL=' edith/.env | tail -1 | cut -d= -f2 | tr -d ' ')
MODEL=${MODEL:-llama3.1}

# 4) Для Ollama — проверить, что он установлен и модель скачана
if [ "$PROVIDER" = "ollama" ]; then
  if ! command -v ollama >/dev/null 2>&1; then
    echo
    echo "Выбран бесплатный локальный мозг Ollama, но он не установлен."
    echo "Установите один раз с https://ollama.com (обычное приложение),"
    echo "затем снова откройте этот файл — остальное произойдёт само."
    echo
    read -n 1 -s -r -p "Нажмите любую клавишу, чтобы закрыть…"
    exit 1
  fi
  if ! ollama list 2>/dev/null | grep -q "$MODEL"; then
    echo "Скачиваю модель $MODEL (один раз, несколько ГБ)…"
    ollama pull "$MODEL"
  fi
fi

# 5) Открыть браузер, когда сервер поднимется
( sleep 2; open "http://localhost:${PORT}" ) &

echo "Запускаю… Эдит откроется в браузере на http://localhost:${PORT}"
echo "Чтобы остановить — закройте это окно."
echo

exec node --env-file=edith/.env edith/server.mjs
