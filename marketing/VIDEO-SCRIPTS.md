# Short videos — series 1 (YouTube Shorts / Reels / TikTok)

**Audience:** US/UK bookkeepers, small-business owners and Quicken/YNAB users who have bank statements only as PDFs.
**Problem:** retyping PDF statements, or uploading private statements to unknown websites.
**Format:** 9:16, 15–30 s, real screen recording of the product (no stock footage, no AI-generated "results").
**Ready footage:** `marketing/videos/demo-statement-to-quickbooks.mp4` (1080×1920, 20 s, real product, recorded automatically by `node scripts/record-demo.mjs`). Re-run the script to refresh after UI changes.
**Common CTA:** "Free preview — link in bio" · URL `localledger-40f.pages.dev`
**Rules:** no fake reviews, no invented numbers, never claim OCR/scanned-PDF support.

Tools: CapCut (free tier: trim, auto-captions, text, music from its licensed library; check the current CapCut terms before commercial use) or ffmpeg. AI video generators (Runway etc.) are **not needed** — real screen footage is more credible and free. Image prompts are only for thumbnails/covers.

---

## 1. "Stop retyping bank statements"
- **Goal:** first awareness; show the core result in <10 s.
- **Hook (0–2 s):** on-screen "Still retyping bank statements into QuickBooks?" over a PDF statement.
- **Script / shots:** 0–2 s PDF statement close-up → 2–6 s drag PDF into LocalLedger → 6–10 s table appears, "✓ balances reconcile" → 10–14 s choose "QuickBooks Online (CSV)" → Download → 14–18 s CTA.
- **Voice-over:** "Still retyping bank statements? Drop the PDF here. Every transaction, dated and signed, checked against the statement balance. Export a QuickBooks file. Free preview — link in bio."
- **On-screen text:** "PDF → QuickBooks in 10 s" · "Nothing uploaded" · "Free preview".
- **Visual:** use the ready demo footage; zoom 120% on the table at 6–10 s.
- **Thumbnail prompt:** "Flat illustration, a PDF bank statement turning into a clean spreadsheet, teal and white, bold text 'PDF → QuickBooks', no logos of real banks."
- **CTA:** "Try your own statement free — link in bio."
- **Caption:** "Turn PDF bank statements into a QuickBooks import file in seconds — the file never leaves your computer. #bookkeeping #quickbooks #smallbusiness"
- **Keywords:** bank statement to quickbooks, pdf to csv, bookkeeping tips
- **Alt hook:** "Your client sent 12 PDF statements. Here's the 10-second fix."

## 2. "Is it safe to upload bank statements online?"
- **Goal:** differentiate on privacy.
- **Hook:** "Where does your bank statement go when you 'convert' it online?"
- **Shots:** browser DevTools Network tab open → drop PDF → no upload request appears → highlight "processed on this device".
- **Voice-over:** "Most converters upload your statement to their server. This one reads it inside your browser — watch the network tab: nothing leaves. You can even go offline after the page loads."
- **On-screen text:** "0 uploads" (only show what the Network tab really shows).
- **Visual:** record with DevTools docked at the bottom; arrow overlay on the empty Network list.
- **CTA:** "Convert privately — link in bio."
- **Caption:** "Your bank statement has your account number and every purchase. Convert it without uploading it. #privacy #bookkeeping"
- **Keywords:** bank statement converter safe, private pdf converter
- **Alt hook:** "I opened DevTools to see where my bank statement goes."

## 3. "The reconciliation trick"
- **Goal:** teach a useful check (shareable tip), product as the tool.
- **Hook:** "If your import is off by exactly twice one amount…"
- **Shots:** formula on screen: opening + transactions = closing → LocalLedger file summary showing a mismatch (use a demo file with one flipped sign) → click ± → "✓ balances reconcile".
- **Voice-over:** "Opening balance plus every transaction must equal the closing balance. Off by exactly twice one amount? A sign is flipped. Fix it before it hits your books."
- **On-screen text:** "Off by 2×? Flipped sign."
- **CTA:** "Free checker — link in bio."
- **Caption:** "A 5-second sanity check for imported bank transactions. #accounting #reconciliation"
- **Keywords:** reconcile bank statement, bookkeeping tip
- **Alt hook:** "Accountants: one check that catches most import errors."

## 4. "Credit card statements are backwards"
- **Hook:** "Your credit card statement lists purchases as positive. Your books don't."
- **Shots:** card PDF → LocalLedger detects "credit card" → amounts shown negative for purchases → export Xero CSV.
- **Voice-over:** "Card issuers print purchases as positive and payments as negative. Accounting software wants the opposite. LocalLedger detects card statements and flips the signs for you."
- **On-screen text:** "Purchases → money out".
- **CTA / caption:** "Convert card statements correctly — link in bio. #xero #quickbooks #creditcard"
- **Keywords:** credit card statement to csv, xero import
- **Alt hook:** "Why your credit card import looks wrong."

## 5. "Quicken / GnuCash users: QIF and OFX"
- **Hook:** "Years of PDF statements and Quicken won't read them?"
- **Shots:** drop 3 PDFs at once → combined table → export QIF → export OFX.
- **Voice-over:** "Drop several statements at once, review, and export QIF or OFX for Quicken, GnuCash, Moneydance or YNAB."
- **On-screen text:** "QIF · OFX · CSV · Excel".
- **CTA / caption:** "Link in bio. #quicken #gnucash #ynab #personalfinance"
- **Keywords:** csv to qif, pdf to ofx
- **Alt hook:** "Moving to GnuCash with only PDF statements?"

## 6. "Xero: import a missing month"
- **Hook:** "Bank feed in Xero missed a month?"
- **Shots:** LocalLedger export "Xero (CSV)" → (if you have a Xero account) Xero → Bank account → Manage account → Import a statement; otherwise show the guide page.
- **Voice-over:** "Convert the PDF to Xero's statement CSV, then Manage account, Import a statement. Done."
- **CTA / caption:** "Step-by-step guide — link in bio. #xero #bookkeeping"
- **Keywords:** import bank statement into xero
- **Alt hook:** "Xero bank feed broke? Do this."

## 7. "Before / after" (no voice-over, trending-audio friendly)
- **Hook:** split screen: messy copy-paste in Excel vs clean LocalLedger table.
- **Shots:** left: pasted PDF text in one column; right: clean Date/Description/Amount → Excel opens with real dates and numbers.
- **On-screen text:** "Copy-paste" vs "LocalLedger".
- **Music:** only from CapCut/YouTube's licensed library.
- **CTA / caption:** "PDF bank statement → clean Excel. Link in bio. #excel #exceltips"
- **Keywords:** bank statement pdf to excel
- **Alt hook:** "Copy-pasting a PDF statement into Excel be like…"

## 8. "What it can't do" (trust builder)
- **Hook:** "Honest limits of my bank statement converter."
- **Shots:** scanned PDF → clear "no text layer" message; text PDF → works.
- **Voice-over:** "It doesn't read scans or photos. If you can select text in your PDF, it works — and you can test any file free before paying."
- **CTA / caption:** "Try your file free — link in bio. #buildinpublic #bookkeeping"
- **Keywords:** text pdf vs scanned pdf
- **Alt hook:** "Will it work with my bank? Here's how to check in 5 seconds."

## 9. "Pay once vs subscription"
- **Hook:** "$79 a month to convert PDFs?"
- **Shots:** pricing card "$29 one-time" → free preview → export.
- **Voice-over:** "Many converters charge monthly. LocalLedger is free to preview and $29 once for unlimited exports."
- **Note:** don't name or show competitors' prices on screen unless you verified them the same day.
- **CTA / caption:** "Link in bio. #smallbusiness #bookkeeping"
- **Keywords:** bank statement converter one time price
- **Alt hook:** "I refused to pay another subscription, so…"

## 10. "Bookkeeper catch-up in 60 seconds"
- **Hook:** "New client, 12 months of PDF statements, due Friday."
- **Shots:** drop 12 PDFs (generated demo statements) → Remove duplicates → Sort by date → export QuickBooks CSV.
- **Voice-over:** "Drop the year, remove duplicates, sort, export. Review every row before it touches the books."
- **CTA / caption:** "For bookkeepers — link in bio. #bookkeeper #catchupbookkeeping #quickbooks"
- **Keywords:** catch up bookkeeping, bulk bank statement conversion
- **Alt hook:** "Catch-up bookkeeping speedrun."

---

### Publishing checklist (manual — no account access from automation)
1. Upload the mp4 natively to each platform (YouTube Shorts, Instagram Reels, TikTok). Add auto-captions.
2. Put the site URL in the profile link; "link in bio" in captions.
3. Track: views → profile clicks → site visits (admin dashboard "Источники трафика" shows youtube.com / instagram.com / tiktok.com referrers) → uploads → purchases.
4. Post 3 per week for 3 weeks, then keep only the formats that bring site visits.
