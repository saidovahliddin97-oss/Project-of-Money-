#!/bin/bash
# Выключить Эдит (сервер в фоне). Ollama не трогаем.
pkill -f "node .*edith/server\.mjs" && echo "Эдит выключена." || echo "Эдит и так не работала."
