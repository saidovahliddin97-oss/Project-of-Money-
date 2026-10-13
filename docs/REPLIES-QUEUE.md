# Очередь ответов на форумах (13.10.2026)

Публикует **владелец со своего аккаунта, вручную**. Каждый ответ сначала решает проблему автора и только потом упоминает продукт с пометкой «I built it». Ссылки содержат `utm_source`, поэтому переход виден в боте («метка …») и в `/admin` → Источники.
Правила: один ответ на ветку, без повторов одного и того же текста, никаких фейковых аккаунтов. Если модератор удалит ответ, повторно не постить.

| # | Ветка | Почему она | Статус |
|---|---|---|---|
| 1 | [Adobe Community: bank statement pdf to excel](https://community.adobe.com/questions-9/bank-statement-pdf-to-excel-1289652) | 4 292 просмотра, ветка открыта | не опубликовано |
| 2 | [QuickBooks Community: PDF statements → QuickBooks Online](https://quickbooks.intuit.com/learn-support/en-us/reports-and-accounting/i-am-trying-to-import-my-bank-statements-to-quickbooks-online-i/00/1209704) | точный запрос, официальный ответ: «PDF не поддерживается» | не опубликовано |
| 3 | [QuickBooks Community: Desktop can't import bank CSV](https://quickbooks.intuit.com/learn-support/en-us/banking/why-why-why-can-t-quickbooks-desktop-import-bank-csv-files-soo/00/764835) | ровно задача IIF Kit | не опубликовано |
| 4 | [Manager.io forum: bank sends statement in PDF](https://forum.manager.io/t/facing-problem-importing-bank-statement/19336) | Manager импортирует CSV/QIF/OFX; ветка 2018 г., может быть закрыта — если нет кнопки Reply, пропустить | не опубликовано |

Не подходят: Quicken Community (правила запрещают советовать сторонние программы), Reddit (новые аккаунты со ссылками фильтруются).

---

## 1. Adobe Community

As the replies say, the cleanest source is the bank's own CSV export — try that first. When the bank only gives you PDFs (closed accounts, old months), a statement-specific converter works better than a generic PDF-to-Excel one: it knows which column is the date, which is the amount, and that a description can wrap onto a second line.

A tip whatever tool you use: check the result against the statement. Opening balance + sum of all rows should equal the closing balance; if it's off by exactly twice one amount, a sign got flipped.

Disclosure: I built a free-to-try converter for this, LocalLedger. It runs entirely in the browser (the PDF isn't uploaded) and does that balance check for you: https://localledger-40f.pages.dev/?utm_source=adobe-community — it only handles text-based PDFs, not scans.

## 2. QuickBooks Community (QBO, PDF)

QuickBooks Online still won't take the PDF itself, so the PDF has to become a file QBO accepts. The simplest one is a 3-column CSV: Date, Description, Amount (money out negative), one transaction per row, no balance column. Then Banking → Upload transactions → pick the account.

Two things that usually break the upload: dates in a format QBO doesn't expect (use MM/DD/YYYY) and thousands separators inside the amount ("1,234.56" → "1234.56").

Disclosure: I made a browser tool that produces exactly that QBO CSV from a PDF statement and checks the rows against the statement's opening/closing balance before you import. Nothing is uploaded: https://localledger-40f.pages.dev/?utm_source=qb-community — free preview, works with text-based PDFs (not scans).

## 3. QuickBooks Community (Desktop, CSV)

Still true in Desktop: there's no CSV import for bank transactions. Besides Web Connect (.qbo, which you can't edit first), the other route that lets you clean descriptions in Excel first is an IIF file: File → Utilities → Import → IIF Files. Things to know before trying it:
- the bank account and every expense/income account named in the file must already exist in QuickBooks with exactly the same name;
- IIF goes straight into the register with no review screen, so back up the company file first;
- money out becomes a CHECK, money in a DEPOSIT, each with a split line to the category account.

Disclosure: I built IIF Kit for this — drop the bank CSV in the browser, set the account names (with simple rules like "SHELL → Automobile:Fuel"), download the .IIF. Files stay on your computer: https://localledger-40f.pages.dev/iif?utm_source=qb-community

## 4. Manager.io forum

Manager imports bank statements as CSV, QIF or OFX, so the PDF needs converting first. If your bank's online banking has a CSV/OFX download, that's the most reliable. If you only have PDFs, convert them to CSV with Date, Description, Amount (or QIF), then Bank accounts → Import bank statement.

Disclosure: I made a free-to-try browser converter for PDF statements that exports CSV, QIF and OFX and checks the totals against the statement's balances; the file isn't uploaded anywhere: https://localledger-40f.pages.dev/?utm_source=manager-forum
