# CLAUDE.md — карта репозитория

Начинай сессию с этого файла, `docs/audit.md` и `docs/STRATEGY.md`. Код целиком не перечитывай.

## Что здесь
Студия «Aurora»: локальные (в браузере) инструменты для бухгалтеров и фрилансеров. Оплата — Lava Top.
- **LocalLedger** — выписки PDF/CSV → CSV/XLSX/QBO/Xero/QIF/OFX. `/`, `/app`.
- **IIF Kit** — CSV → QuickBooks Desktop .IIF. `/iif`.
- Прод: Cloudflare Pages `localledger-40f.pages.dev` (проект `localledger`, KV `LL_KV`).
- Фокус — только эти два продукта (Snaky.io исключён владельцем). Приоритет: то, что приносит продажи.

## Карта
| Путь | Что |
|---|---|
| `public/` | статический сайт (без сборки). HTML-страницы, `_headers` (CSP: без inline-стилей и скриптов) |
| `public/assets/js/core/` | парсинг и экспорт. **Логику не менять**, только UI вокруг |
| `public/assets/js/{app,iif-app,pro,success,admin,track,pv}.js` | UI, лицензии/чек-аут, кабинет, трекинг |
| `public/assets/js/config.js` | цены, лимит free (15 строк), email поддержки |
| `server/handlers.js` | весь API: checkout, claim, webhook/lava, event, admin/* |
| `server/lava.js` | клиент Lava Top |
| `server/telegram.js` | бот владельца (RU): визиты людей, «загрузил файл», «лимит», «Купить», продажи, итоги дня после 21:00 МСК (по первому событию, крона нет), лимит 30 алертов/час. Webhook `/api/telegram` (ставит `scripts/telegram-webhook.mjs` при ship): первый /start закрепляет чат в KV `tg:chat`, чужим — отказ; `/stats` — сегодня и 7 дней |
| `functions/api/[[path]].js` | адаптер Cloudflare Pages Functions |
| `api/router.js`, `vercel.json` | адаптер Vercel (старое превью) |
| `scripts/` | деплой (`deploy-cloudflare.mjs`, `ship.mjs`), гайды, видео, ключи, статистика |
| `tools/traffic-engine/` | поиск площадок для ответов (без автопостинга) |
| `tests/unit`, `tests/e2e` | node:test; Chromium e2e |
| `docs/` | аудит, деплой, платежи, маркетинг, логи роста |
| `marketing/` | сценарии и готовые Shorts |

## Команды
- `npm test` — unit-тесты (обязательно перед коммитом).
- `npm run test:e2e` — браузерные проверки (после изменений в `public/`).
- `npm run dev` — локальный сервер :8787 (имитация API).
- `npm run ship` — гайды → тесты → e2e → деплой на Cloudflare → IndexNow → health. Нужен `CLOUDFLARE_API_TOKEN`.
- `npm run stats` — дневная статистика из KV.

## Соглашения
- Дизайн «Aurora Glass»: токены и компоненты в `public/assets/css/style.css` (тёмная тема по умолчанию, светлая по системе или `[data-theme=light]`), интеракции в `public/assets/js/ui.js` (подключён синхронно в `<head>` каждой страницы). Шрифты свои: `public/assets/fonts`. Запрещено: оранжевый, Inter/Space Grotesk, эмодзи-иконки.
- SEO-страницы банков генерирует `scripts/build-guides.mjs` (`/banks/*`).
- Без фреймворков и сборки, ES-модули, без новых рантайм-зависимостей без нужды.
- CSP запрещает inline `style`/`script` → стили через классы или CSSOM.
- `[hidden]{display:none!important}` уже глобально.
- В трекере, вебхуках, админке — никаких вызовов LLM.
- Никогда не отправлять на сервер содержимое/имена файлов, суммы, описания транзакций.
- Сначала `git push`, потом деплой (иначе автозадачи затирают друг друга). На прод выкладывают несколько сессий из разных веток `claude/*`: `npm run ship` откажется деплоить, если в origin есть ветка с коммитами, которых нет локально (13.10 одна сессия так откатила прод другой). Сначала `git merge` той ветки.
- Бизнес-исследования и журнал гипотез/экспериментов: `business/` (читать перед новыми рекомендациями, не повторять проверенное).
- Тексты сайта — EN; кабинет, документы и отчёты — RU.

## Переменные окружения (значения — только в секретах)
Сервер (Cloudflare Pages): `LAVA_API_KEY`, `LAVA_WEBHOOK_SECRET`, `LAVA_OFFER_ID`, `LAVA_PRODUCT_NAME`, `LAVA_OFFER_ID_IIF`, `LAVA_PRODUCT_NAME_IIF`, `LAVA_OFFER_ID_BUNDLE`, `LAVA_PRODUCT_NAME_BUNDLE` (комплект $34.99, ключ `bundle` на оба продукта), `LAVA_OFFER_ID_PASS`, `LAVA_PRODUCT_NAME_PASS` (пропуск $5 на 24 ч, ключ `pass`), `LAVA_OFFER_ID_ONE`, `LAVA_PRODUCT_NAME_ONE` (разовая выгрузка $1, ключ `one`); без офферов эти варианты скрыты, см. docs/ECONOMICS.md, `LAVA_API_BASE` (опц.), `LICENSE_PRIVATE_JWK`, `ADMIN_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (опц., иначе авто), `SITE_URL`, привязка KV `LL_KV`.
Скрипты: `GOOGLE_SITE_VERIFICATION` (опц., имя файла `google….html` из Search Console — ship кладёт его в `public/`), `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_PAGES_PROJECT` (опц.), `CF_API_BASE` (опц.).
Планируются: `RESEND_API_KEY`, `CLARITY_PROJECT_ID`.
Новые переменные среды сессии видны только в новой сессии; после их добавления — `npm run ship`, он синхронизирует секреты в Cloudflare.
