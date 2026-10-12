# Аудит (Фаза 0, 12.10.2026)

## Репозитории и хостинг
| Продукт | Код | Прод | Статус |
|---|---|---|---|
| LocalLedger | этот репозиторий (`saidovahliddin97-oss/Project-of-Money-`) | Cloudflare Pages `localledger-40f.pages.dev` | работает, оплата Lava включена |
| IIF Kit (CSV → QuickBooks Desktop .IIF) | этот же репозиторий, `public/iif.html` | `localledger-40f.pages.dev/iif` | работает, отдельный оффер Lava |
| Старое превью | Vercel `localledger-preview` | — | не прод, можно удалить/редиректить |

## Стек LocalLedger + IIF Kit
- Без сборки: чистый HTML/CSS/ES-модули в `public/`, вендорный pdf.js 6.3.289. Единственная npm-зависимость рантайма — `pdfjs-dist` (копируется `scripts/vendor.mjs`).
- API: один обработчик `server/handlers.js`; адаптер Cloudflare `functions/api/[[path]].js`, адаптер Vercel `api/router.js`.
- Хранилище: Cloudflare KV `LL_KV` (идемпотентность вебхуков, оплаченные счета, дневные агрегаты `day:YYYY-MM-DD`). D1 нет.
- Парсинг (`public/assets/js/core/`): pdf-layout → pdf-extract → statement-parser (сверка остатков), csv-import, exporters (CSV/XLSX/QBO/Xero/QIF/OFX), iif.js. **Не переписывать.**
- Тесты: `npm test` (unit, node:test), `npm run test:e2e` (Chromium, 16 проверок).

## Лицензия Pro
- Формат `LL1.<b64url payload>.<b64url sig>`, payload `{v,e,p,r,t}`: e — email, p — план (`pro` | `iif`), t — время выпуска.
- Подпись **ECDSA P-256** (WebCrypto) на сервере, приватный JWK в секрете `LICENSE_PRIVATE_JWK`; публичный ключ отдаёт `/api/pubkey`, проверка офлайн в браузере (`core/license.js`).
- Хранение у клиента: localStorage `ll_license` / `ll_license_iif`.
- При переходе на Ed25519 старые `LL1.` нужно продолжать принимать (продаж пока 0, но формат уже в проде).

## Чек-аут Lava Top
1. Браузер: `pro.js startCheckout()` → `POST /api/checkout {email, currency, method, product, utm}`.
2. Сервер: `POST https://gate.lava.top/api/v3/invoice` (X-Api-Key, offerId из `LAVA_OFFER_ID`/`LAVA_OFFER_ID_IIF`) → редирект на оплату; id счёта в localStorage.
3. Вебхук `POST /api/webhook/lava` (ключ в X-Api-Key или Basic) → `paid:<id>`, учёт продажи, уведомление в Telegram (если задан бот).
4. `success.html` опрашивает `POST /api/claim {invoiceId}` до 10 мин → лицензия. Неоплаченный счёт lava отдаёт 404 → ответ 202 pending.
- `clientUtm` в счёте передаётся — сюда можно класть `visitor_id` для атрибуции.

## Аналитика сейчас
- Свой счётчик без cookies: `pv.js` (просмотры), `track.js` (события), агрегаты по дням в KV; боты отсекаются по UA. Политика конфиденциальности обещает «без cookies и идентификаторов».
- Кабинет владельца `/admin` (RU, вход по `ADMIN_TOKEN`): KPI, воронка, деньги, источники, страны, устройства, продажи.
- Cloudflare Web Analytics разрешён в CSP (`static.cloudflareinsights.com`).

## Деплой
- `npm run ship`: гайды → тесты → e2e (если менялся код приложения) → `scripts/deploy-cloudflare.mjs` (wrangler pages deploy, синхронизация секретов) → IndexNow → health.
- Нужен `CLOUDFLARE_API_TOKEN` в окружении сессии; GitHub Actions нет. Токен: Pages Edit + Workers KV Edit (D1/Workers Scripts/Access — не проверены, см. отчёт).

## Расхождения с мастер-промптом
- Прод LocalLedger — Cloudflare, не `localledger-preview.vercel.app`.
- «Вселенная» = LocalLedger + IIF Kit (решение владельца 12.10). Snaky.io исключён.
- Расширенный трекинг (visitor_id на год, город, ASN, Clarity) противоречит текущей политике → политика переписывается до включения.
- Холодные письма через Resend требуют своего домена; адрес для CAN-SPAM уже есть (Москва, Митинская 45к2, пав. 7).
