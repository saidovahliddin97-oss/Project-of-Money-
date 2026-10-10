# Развёртывание и подключение оплаты (пошагово)

Итоговая схема: **Cloudflare Pages (бесплатно)** — сайт + серверные функции `/api/*`; **lava.top** — приём оплаты; **Telegram** — уведомления о продажах (опционально).

Почему не Vercel: бесплатный тариф Vercel Hobby разрешён только для некоммерческого использования. Cloudflare Pages Free: статика без лимита запросов, функции — 100 000 запросов в сутки (общий лимит Workers Free), сброс в полночь UTC ([документация](https://developers.cloudflare.com/pages/functions/pricing/)). Для MVP этого с запасом хватает. Свой домен не обязателен — подходит `*.pages.dev`.

---

## Часть 1. Публикация сайта на Cloudflare Pages (~10 минут)

**ДЕЙСТВИЕ 1.** Откройте https://dash.cloudflare.com/sign-up и зарегистрируйтесь по email (бесплатно, карта не нужна).

**ДЕЙСТВИЕ 2.** В панели: **Workers & Pages → Create → Pages → Connect to Git**. Подключите GitHub и выберите репозиторий `saidovahliddin97-oss/Project-of-Money-`.

**ДЕЙСТВИЕ 3.** Настройки сборки:
- Production branch: ветка, в которую смержен код (например `main`);
- Framework preset: **None**;
- Build command: *оставить пустым*;
- Build output directory: `public`.

**ДЕЙСТВИЕ 4.** Нажмите **Save and Deploy**. Через 1–2 минуты появится адрес вида `https://localledger-xxx.pages.dev`.

**ДЕЙСТВИЕ 5.** Проверка: откройте адрес → главная страница; `/app.html` → нажмите «Try a sample statement» → должна появиться таблица из 8 строк и «✓ balances reconcile». Откройте `/api/health` → должен прийти JSON `{"ok":true,...}` (значит, функции работают).

**ДЕЙСТВИЕ 6 (опционально, рекомендуется).** Хранилище KV для идемпотентности вебхуков и счётчиков воронки: **Workers & Pages → KV → Create namespace** (`LL_KV`), затем в проекте Pages: **Settings → Bindings → Add → KV namespace**, имя переменной `LL_KV`. Бесплатно: 1 000 записей и 100 000 чтений в сутки.

**ДЕЙСТВИЕ 7 (опционально).** Аналитика посещений без cookies: в проекте Pages → **Metrics → Web Analytics → Enable**.

## Часть 2. Ключ подписи лицензий (~2 минуты)

**ДЕЙСТВИЕ 1.** Откройте `https://<ваш-адрес>.pages.dev/setup.html`, нажмите **Generate key pair**, затем **Copy private key**. Ключ создаётся в вашем браузере и никуда не отправляется.

**ДЕЙСТВИЕ 2.** В Cloudflare: проект → **Settings → Variables and Secrets → Add** → тип **Secret**, имя `LICENSE_PRIVATE_JWK`, значение — скопированный ключ. Также сохраните его в менеджере паролей: без него нельзя будет выдавать ключи вручную.

**ДЕЙСТВИЕ 3.** Добавьте переменную `SITE_URL` = `https://<ваш-адрес>.pages.dev`. Нажмите **Deployments → Retry deployment** (секреты применяются к новым деплоям).

**ДЕЙСТВИЕ 4.** Проверка: `/setup.html` внизу показывает `"licensing": true`.

> Генерировать ключ повторно нельзя без причины: все ранее выданные лицензии перестанут работать.

## Часть 3. lava.top (требует вашей личности — сделать можете только вы)

**ДЕЙСТВИЕ 1.** Зарегистрируйтесь как автор на https://lava.top. Перед прохождением верификации напишите в поддержку (support@lava.top или чат) и уточните: *«Я гражданин Таджикистана, проживаю в России по патенту. Могу ли я пройти верификацию с паспортом Таджикистана и получать выплаты на российскую карту за продажу цифрового продукта иностранным покупателям?»* Сохраните ответ.

**ДЕЙСТВИЕ 2.** Создайте продукт: тип «цифровой продукт», название **LocalLedger Pro**, описание «Lifetime license for LocalLedger, the private bank statement converter. The license key is shown on the website right after payment.» Цена: **29 USD** и **27 EUR** (если укажете одну валюту, остальные будут по курсу lava.top). Если меняете цену — поменяйте `PRICE_USD`/`PRICE_EUR` в `public/assets/js/config.js`.

**ДЕЙСТВИЕ 3.** **Интеграции → API → Создать ключ.** Скопируйте ключ.

**ДЕЙСТВИЕ 4.** Узнайте `offerId`: на своём компьютере (нужен Node.js 20+):
```bash
git clone https://github.com/saidovahliddin97-oss/Project-of-Money-.git && cd Project-of-Money-
npm install
LAVA_API_KEY=ваш_ключ npm run lava:products
```
Скопируйте `offer id` у продукта LocalLedger Pro. (Без Node: откройте https://gate.lava.top/docs → Authorize → `GET /api/v2/products` → Try it out.)

**ДЕЙСТВИЕ 5.** В Cloudflare (Settings → Variables and Secrets) добавьте секреты:

| Имя | Значение |
|---|---|
| `LAVA_API_KEY` | ключ из шага 3 |
| `LAVA_OFFER_ID` | offer id из шага 4 |
| `LAVA_PRODUCT_NAME` | `LocalLedger Pro` (точно как в lava.top) |
| `LAVA_WEBHOOK_SECRET` | любая длинная случайная строка (20+ символов) |

**ДЕЙСТВИЕ 6.** В lava.top: **Интеграции → Вебхуки → Добавить**: URL `https://<ваш-адрес>.pages.dev/api/webhook/lava`, события: успешная оплата, неуспешная оплата, возврат, чарджбэк; авторизация: **API key** со значением `LAVA_WEBHOOK_SECRET` (или Basic Auth с этим паролем).

**ДЕЙСТВИЕ 7.** Retry deployment в Cloudflare. Проверка: `/api/health` → `"checkout": true, "licensing": true, "webhookAuth": true`.

**ДЕЙСТВИЕ 8 — тестовая покупка** (тестового режима у lava.top в документации нет): купите лицензию сами минимальным способом, убедитесь, что после оплаты открылась страница `success.html` с ключом, а в Telegram пришло уведомление. Затем при желании сделайте возврат в кабинете lava.top (комиссия 8% не возвращается). **Это реальная транзакция — делайте её только когда готовы.**

## Часть 4. Уведомления о продажах в Telegram (опционально, ~3 минуты)

1. В Telegram напишите @BotFather → `/newbot` → получите токен.
2. Напишите своему боту любое сообщение, затем откройте `https://api.telegram.org/bot<ТОКЕН>/getUpdates` и найдите `"chat":{"id":...}`.
3. В Cloudflare добавьте секреты `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID`, Retry deployment.

## Часть 5. Статистика воронки

Задайте секрет `ADMIN_TOKEN` (случайная строка). Откройте `https://<адрес>/api/stats?token=<ADMIN_TOKEN>&days=14` — счётчики по дням: `visit_app`, `file_loaded`, `parse_ok`, `parse_empty`, `export_free`, `export_locked`, `checkout_start`, `checkout_created`, `purchase`, `payment_failed`, `refund`, `chargeback`, `license_activated`. Требует KV (Часть 1, действие 6).

## Обновление адреса сайта в SEO-файлах

После получения итогового адреса выполните локально `SITE_URL=https://ваш-адрес npm run guides` и закоммитьте изменения (обновятся canonical-ссылки гайдов и `sitemap.xml`), а также замените адрес в `public/robots.txt`.

## Альтернатива: Vercel

Проект содержит `vercel.json` и `api/router.js`, поэтому разворачивается и на Vercel (Output Directory `public`, те же переменные окружения). Но Hobby-тариф — только некоммерческий; для приёма оплаты нужен Pro ($20/мес) — **не подключайте без необходимости**.

## Локальный запуск

```bash
npm install          # ставит pdf.js и копирует его в public/assets/vendor
npm test             # 24 модульных теста
npm run test:e2e     # 15 сквозных проверок в Chromium (нужен Playwright)
npm run dev          # http://localhost:8787 (секреты читаются из .dev.vars)
```
