#!/bin/bash
# Эдит будет запускаться сама при входе в систему и работать в фоне (без окна
# терминала). Двойной клик — установить. Снять: «Выключить-фон.command».

DIR="$(cd "$(dirname "$0")" && pwd)"          # .../edith
NODE="$(command -v node)"
PORT="$(grep -E '^EDITH_PORT=' "$DIR/.env" 2>/dev/null | tail -1 | cut -d= -f2 | tr -d ' ')"
PORT="${PORT:-4330}"
LABEL="com.edith.assistant"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
RUN="$DIR/.edith-run.sh"

if [ -z "$NODE" ]; then echo "Node.js не найден. Установите с https://nodejs.org"; read -n1 -s; exit 1; fi

# небольшой запускатор: открыть вкладку в Chrome и поднять сервер
cat > "$RUN" <<SH
#!/bin/bash
( sleep 2; open -a "Google Chrome" "http://localhost:$PORT" ) >/dev/null 2>&1 &
exec "$NODE" "$DIR/server.mjs"
SH
chmod +x "$RUN"

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$RUN</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/edith.log</string>
  <key>StandardErrorPath</key><string>$DIR/edith.log</string>
</dict></plist>
PL

launchctl unload "$PLIST" >/dev/null 2>&1
launchctl load "$PLIST"

echo "Готово. Эдит теперь запускается сама при входе в систему и работает в фоне."
echo "Сейчас откроется в браузере. Логи: $DIR/edith.log"
( sleep 2; open -a "Google Chrome" "http://localhost:$PORT" ) >/dev/null 2>&1 &
echo
read -n 1 -s -r -p "Нажмите любую клавишу, чтобы закрыть…"
