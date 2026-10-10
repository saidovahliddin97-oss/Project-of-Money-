# Маркетинг и первые клиенты

Цель первых 14 дней — **не охват, а проверка готовности платить**: 30–50 целевых людей попробовали продукт на своих выписках, 1–3 покупки или конкретные причины отказа.

Ограничения: никаких фальшивых отзывов, аккаунтов, выдуманной статистики, массовых рассылок. Во всех публикациях честно указывать, что вы автор продукта.

## Выбранные каналы (3 из многих)

1. **Ответы в сообществах там, где люди уже спрашивают «как перевести PDF-выписку в Excel/QuickBooks»**: r/Bookkeeping, r/QuickBooks, r/Accounting, r/smallbusiness, r/GnuCash, r/ynab, форум Quicken Community. Сначала полезный ответ по существу, ссылка — только если уместна и разрешена правилами. Почему: высокое намерение, бесплатно, обратная связь от целевой аудитории.
2. **SEO + каталоги софта**: 8 гайдов уже на сайте; добавить сайт в Google Search Console и Bing Webmaster Tools; бесплатные карточки на AlternativeTo (как альтернатива DocuClipper, ProperSoft), SaaSHub, Product Hunt. Почему: накопительный эффект, нулевая стоимость.
3. **Точечные письма небольшим бухгалтерским фирмам** (10 в день, вручную, персонально, с возможностью отписки). Почему: B2B-клиент с регулярной болью «клиент прислал 12 PDF-выписок».

---

## Материалы (на английском)

### Позиционирование
For bookkeepers and small-business owners who need transactions out of PDF bank statements, LocalLedger is a statement converter that runs entirely in the browser. Unlike cloud converters, it never uploads your clients' financial data, checks every file against the statement balances, and costs $29 once instead of a monthly subscription.

### Короткое описание (до 160 символов)
Convert PDF & CSV bank statements to Excel, QuickBooks, Xero, QIF or OFX — in your browser. Files never leave your computer. $29 once.

### Полное описание
LocalLedger turns bank and credit card statements into clean, importable transactions. Drop a text-based PDF or a bank CSV export, review the detected dates, descriptions and signed amounts in an editable table, and export to Excel, CSV, QuickBooks Online CSV, Xero CSV, QIF or OFX.

Everything happens inside your browser: the statement is read on your device with the open-source pdf.js library and is never uploaded. When the statement prints an opening and closing balance, LocalLedger reconciles every row against them and tells you exactly how much is off if something was missed.

The free version previews every file and exports up to 15 transactions per download. Pro removes the limit for a one-time $29.

Not supported yet: scanned or photographed statements (no OCR).

### Посадочная страница
- **Заголовок:** Bank statements to Excel, QuickBooks & Xero — without uploading them anywhere
- **Подзаголовок:** Drop a PDF or CSV statement and get clean, reviewable transactions in seconds. LocalLedger runs entirely in your browser, so account numbers and balances never touch a server.
- **CTA:** Convert a statement — free

### Три рекламных сообщения
1. *Your client sent 12 PDF bank statements. Don't retype them.* LocalLedger converts them to QuickBooks or Xero CSV in your browser — nothing uploaded, balances checked. Free preview.
2. *Stop uploading bank statements to random websites.* LocalLedger converts PDFs to Excel on your own computer. $29 once, no subscription.
3. *Quicken / GnuCash / YNAB user with years of PDF statements?* Turn them into QIF or OFX in minutes, privately, in your browser.

### Пять публикаций для соцсетей
1. I built a bank statement converter that never uploads your file. It reads the PDF in your browser (pdf.js), finds dates/amounts/balances, and checks the totals against the statement's opening and closing balance. Free preview, feedback welcome: <link>
2. Most "PDF to Excel" converters upload your bank statement to their server. For accountants, that's client data. Here's how to check where your files go (and a local alternative): <link to guide "is-it-safe-to-upload…">
3. Small trick when extracted transactions don't reconcile: if the difference equals exactly 2× one transaction, a sign was flipped. LocalLedger highlights rows with no +/− in the statement for that reason.
4. Credit card statements print purchases as positive numbers — accounting software wants them negative. Short explainer and a converter that handles it automatically: <link to card guide>
5. Need to get a missing month into Xero when the bank feed failed? Step-by-step guide (CSV layout, import, reconcile): <link to Xero guide>

### Сценарий демонстрации (60–90 секунд, запись экрана)
1. (0–10 с) «This is a PDF bank statement. I need it in QuickBooks.» Показать PDF.
2. (10–25 с) Открыть localledger…/app.html, перетащить файл. Показать «8 transactions · ✓ balances reconcile».
3. (25–40 с) Прокрутить таблицу, исправить описание, нажать ± на одной строке — итоги пересчитались.
4. (40–55 с) Открыть DevTools → Network: «No upload. The file never leaves this computer.»
5. (55–75 с) Export → QuickBooks Online (CSV) → показать файл: Date, Description, Amount.
6. (75–90 с) «Free preview for any file. $29 once for unlimited exports.»

### Первое письмо B2B-клиенту (бухгалтерская фирма)
**Subject:** Turning client PDF statements into QuickBooks imports

Hi {first name},

I saw that {firm} does catch-up bookkeeping for small businesses. When a client sends months of PDF bank statements instead of a bank feed, someone usually retypes them or uploads them to an online converter.

I built LocalLedger, a converter that runs entirely in the browser — the statements never leave your computer — and checks every file against the opening and closing balances before you export to QuickBooks Online, Xero or Excel.

Would you be open to trying it on one of your real statements? The preview is free and needs no sign-up: {link}. If it fails on a layout you see often, I'd genuinely like to know.

Best,
{Your name}
{One-line footer: You're receiving this one-time note because your firm lists bookkeeping services publicly. Reply "no" and I won't write again.}

### Повторный контакт (через 4–5 рабочих дней, один раз)
**Subject:** Re: Turning client PDF statements into QuickBooks imports

Hi {first name}, just checking whether this is relevant for {firm}. If you have a statement layout that converters usually get wrong, send me the bank name and I'll tell you honestly whether LocalLedger handles it. Otherwise I won't follow up again. — {Your name}

### Ответы на возражения
| Возражение | Ответ |
|---|---|
| «Мы уже используем DocuClipper / банковский фид» | Great for the bulk. LocalLedger is for the gaps: missing months, closed accounts, clients who only have PDFs — at $29 once instead of another subscription. |
| «Как я узнаю, что данные правильные?» | Every file is reconciled against the statement's opening and closing balances, and you review/edit every row before export. |
| «Безопасно ли это?» | The conversion runs in your browser. You can open DevTools → Network and see that the file is not uploaded, or disconnect from the internet after loading the page. |
| «Не работает со сканами» | Correct — no OCR yet. Statements downloaded from online banking are text-based and work. |
| «А если не подойдёт?» | Test every file free before buying; 14-day refund if Pro doesn't work for you. |
| «Кто вы, компания надёжная?» | Small independent product; payments go through lava.top; the license is a key, no account or stored data on our side. |

---

## План первых 14 дней

| День | Действие | Результат |
|---|---|---|
| 1 | Деплой на Cloudflare, проверка `/api/health`, Search Console + Bing, отправить sitemap | Сайт индексируется |
| 1 | Консультация по юридическому статусу дохода (см. PAYMENTS.md); вопрос в поддержку lava.top | Понятно, можно ли продавать |
| 2 | Карточки на AlternativeTo, SaaSHub | 2 бесплатные ссылки |
| 2–3 | Найти 15 свежих вопросов на Reddit/Quicken Community про PDF→Excel/QuickBooks; ответить по существу | 15 полезных ответов |
| 3 | Записать демо 90 сек (сценарий выше), загрузить на YouTube | Видео для ссылок |
| 4–8 | 10 персональных писем бухгалтерским фирмам в день (найти через Google Maps/каталоги по запросу «catch-up bookkeeping») | 50 писем |
| 5 | Product Hunt (если готовы отвечать на комментарии в день запуска) | Всплеск трафика |
| 6–10 | Отвечать каждому, кто попробовал; собирать примеры выписок, которые не распознались (без самих файлов — название банка и проблема) | Список улучшений |
| 9–10 | Повторные письма (один раз) | +ответы |
| 11–13 | Исправить топ-1 причину отказа (например, конкретный формат банка) | Улучшение конверсии |
| 14 | Подвести итоги по метрикам: `/api/stats` + lava.top | Решение: цена, аудитория, канал |

## Метрики проверки спроса

| Метрика | Источник | Сигнал «спрос есть» за 14 дней (гипотеза) |
|---|---|---|
| Уникальные посетители | Cloudflare Web Analytics | ≥300 |
| Загрузили файл (`file_loaded`) | `/api/stats` | ≥60 |
| Успешно распознали (`parse_ok` / `file_loaded`) | `/api/stats` | ≥70% |
| Упёрлись в лимит (`export_locked`) | `/api/stats` | ≥15 |
| Начали оплату (`checkout_start`) | `/api/stats` | ≥5 |
| Оплатили (`purchase`) | вебхук + lava.top | ≥1 |
| Ответы на письма | почта | ≥5 из 50 |

Спрос считается подтверждённым **только при реальных оплатах**. Посещения, загрузки и положительные комментарии — промежуточные сигналы.
