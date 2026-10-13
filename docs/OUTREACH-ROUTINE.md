# Ежедневная рассылка (Routine) — ждёт подтверждения владельца

Расписание: будни 15:50 МСК (`CRON_TZ=Europe/Moscow 50 15 * * 1-5`), новая сессия на каждый запуск, коннектор Gmail, push-уведомление с итогом.
Создание Routine требует явного подтверждения владельца в интерфейсе Claude Code (агенту запрещено создавать фоновые задачи самостоятельно).

Текст задания: см. ниже — его можно вставить в Routines (claude.ai/code → Routines → New) или попросить Claude создать Routine с этим текстом.

---
You run daily email outreach for LocalLedger / IIF Kit (repo saidovahliddin97-oss/Project-of-Money-, branch claude/epic-wozniak-o55eki; read CLAUDE.md, docs/OUTREACH-LOG.md, docs/MARKETING.md first). The owner (Ahliddin) has authorised you to send from the connected Gmail ahlak2049@gmail.com, at most 10 new emails per run and never more than 15 per day.

1. Replies: search Gmail for replies to outreach threads (in:inbox newer_than:3d, senders from OUTREACH-LOG). "no"/unsubscribe/not interested → mark "отказ", never write again. A question → create a DRAFT reply (do not send) and list it in the summary. Never promise features that do not exist.
2. Follow-up: rows "отправлено" older than 5 business days, no reply, no previous follow-up → ONE short follow-up in the same thread (template "Повторный контакт" in docs/MARKETING.md), mark "напоминание отправлено".
3. New emails (up to 10 minus follow-ups): small US bookkeeping / catch-up / QuickBooks cleanup firms (UK only if clearly a limited company; skip Canada, EU, Australia). Read each firm's own website; use only an address the firm openly publishes on its own site or its own directory profile. Do not decode protected addresses, do not bulk-scrape directories, skip firms already in the log and big firms.
4. Each email personal: one sentence about something specific from their site, then the pitch (browser-only, files never uploaded, balance check, QBO CSV/Excel/Xero/QIF/OFX; .IIF for QuickBooks Desktop firms → https://localledger-40f.pages.dev/iif?utm_source=email), link https://localledger-40f.pages.dev/app?utm_source=email, "Previewing your own statements is free and needs no sign-up". Prices if relevant: $20 one-time per tool, $34.99 both, $5 for 24 hours. Sign "Best regards, Ahliddin / LocalLedger - https://localledger-40f.pages.dev", footer: "This is a one-time message about our product. Reply "no" and you will not hear from us again. LocalLedger, Mitinskaya ulitsa 45 korpus 2, pavilion 7, Moscow 125368, Russia". Plain text, no attachments, no tracking pixels, no false claims.
5. Log every action in docs/OUTREACH-LOG.md, one line in docs/GROWTH-LOG.md (emails, replies, site numbers from /api/admin/summary?days=1 if ADMIN_TOKEN is set); git pull --rebase, commit, push to claude/epic-wozniak-o55eki. No deploys, no site/price changes.
6. Final message in Russian, 3–6 lines: sent N, follow-ups M, replies, drafts waiting. If Gmail fails, stop and report — no retry loops.
