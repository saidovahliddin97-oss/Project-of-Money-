# IIF Kit — marketing kit (English)

**Positioning:** For bookkeepers and businesses still on QuickBooks Desktop, IIF Kit turns a bank CSV export or PDF statement into an IIF file with account rules — in the browser, nothing uploaded, $29 once.

**Headline:** Bank transactions into QuickBooks Desktop — as an IIF file
**Subheadline:** QuickBooks Desktop can't import a bank CSV. Drop the CSV or PDF, map accounts with simple rules, download the IIF.
**CTA:** Try it with your bank CSV — free preview

**Benefits:** no retyping · no desktop installer · no upload of client data · rules map payees to accounts · one-time price.
**Features (real):** CSV/TSV auto column detection (debit/credit or signed amount, day/month order); text-based PDF statements; checks/deposits for bank accounts, journal entries for card accounts; `keyword => Account` rules; per-row account editing; free export up to 15 rows.
**Not supported (say it):** scanned PDFs; invoices/bills/list imports; QuickBooks Online (use LocalLedger CSV instead).

**FAQ:** see the page `/iif` (files that work, QBO vs Desktop, privacy). Add: "Does IIF import create missing accounts?" → "Make sure account names match your chart of accounts; test with a small file and back up first."

## Demo script (45 s)
1. Bank CSV in Excel → "QuickBooks Desktop won't take this."
2. Drop it into IIF Kit → table appears.
3. Type rule `shell => Automobile:Fuel` → accounts update.
4. Download .IIF → QuickBooks: File → Utilities → Import → IIF Files → register shows checks/deposits (record only with your own test company file).

## Five posts
1. "QuickBooks Desktop still can't import a bank CSV in 2026. I built a free-to-try browser tool that converts it to IIF with account rules — feedback welcome."
2. "IIF tip: every TRNS line needs SPL lines that sum to the negative amount — here's a converter that does it for you."
3. "Moving a client off a broken bank feed in QB Desktop? CSV → IIF in a minute, nothing uploaded."
4. "Rules beat retyping: `amazon => Office Supplies`, `shell => Fuel`. One line each."
5. "Honest limits: no scanned PDFs, no invoices — just bank and card transactions into QB Desktop."

## Ten short-video ideas
CSV won't import → fix · rules in 10 s · card statement as journal entries · back up before IIF (tip) · PDF statement → IIF · "Ask My Accountant" clean-up · catch-up month in QB Desktop · IIF anatomy in 15 s · privacy: DevTools shows no upload · QBO vs Desktop: which file you need.

## Three offers
1. Free preview + $29 lifetime (default).
2. Bookkeeper bundle (both LocalLedger + IIF Kit) — only after first organic sales confirm demand.
3. "Done-for-you rules file" for a bookkeeper's typical clients — manual service, only on request.

## B2B first contact
Subject: Bank CSVs into QuickBooks Desktop
Hi {name}, I noticed {firm} supports QuickBooks Desktop clients. Desktop can't import a bank CSV directly, so I built IIF Kit: drop the CSV or PDF, map accounts with simple rules, download an IIF — in the browser, nothing uploaded. Free preview: https://localledger-40f.pages.dev/iif. If it breaks on a bank format you see often, I'd like to know. — Ahliddin
(+ one-time promo note, opt-out "reply no", postal address — same footer as LocalLedger outreach.)

**Follow-up (once, after 5 working days):** "Just checking whether QB Desktop imports come up for you; if not, I won't write again."

## 14-day experiment plan
| Days | Experiment | Metric |
|---|---|---|
| 1–3 | Page live, IndexNow, two SEO guides ("import bank transactions into QuickBooks Desktop", "CSV to IIF") via the growth routine | visits to /iif |
| 4–7 | 5 B2B drafts/day to QB Desktop ProAdvisors (drafts, owner sends) | replies, /iif visits |
| 8–10 | 2 short videos from the ideas list | referrers youtube/tiktok |
| 11–14 | Compare file_loaded → export_locked → checkout_start for /iif; adjust free limit or price only if ≥30 uploads | conversion per step |
