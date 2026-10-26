#!/bin/bash
# Отключить фоновый автозапуск Эдит.
LABEL="com.edith.assistant"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl unload "$PLIST" >/dev/null 2>&1
rm -f "$PLIST"
echo "Фоновый автозапуск Эдит отключён."
echo "Если Эдит сейчас открыта в браузере — просто закройте вкладку."
echo
read -n 1 -s -r -p "Нажмите любую клавишу, чтобы закрыть…"
