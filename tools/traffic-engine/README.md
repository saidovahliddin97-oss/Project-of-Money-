# Traffic engine

Finds public discussions where people try to get bank-statement data into Excel/QuickBooks/Xero/Quicken, scores them, drafts a helpful English reply and saves a **review queue**. It never posts.

## Sources (checked 2026-10-12)
| Source | Method | Status |
|---|---|---|
| Stack Exchange (money, superuser, webapps) | official API v2.3, 300 req/day without key | ✅ in code; blocked by this cloud container's egress policy, works on a normal network |
| Hacker News | public Algolia API | ✅ |
| Medium tags | public RSS | ✅ read-only |
| Reddit | Data API needs manual approval since Nov 2025; commercial use needs an agreement | ❌ not automated |
| Quora | no public API | ❌ |
| Product Hunt | API needs a token; listing is a manual launch | ❌ manual |

Posting is manual on purpose: these sites forbid automated promotional posting, and several Stack Exchange sites ban AI-generated answers — every draft must be rewritten/checked by a human before posting.

## Run
```bash
npm run traffic:dry      # dry run, prints the top results, writes nothing
npm run traffic          # live: appends to data/opportunities.csv, remembers seen ids
```
Output columns: `source, source_url, keyword, title, discovered_at, created_at, relevance_score, generated_reply, reply_engine, publication_status, last_error`.
`publication_status` is `needs_human_review` or `competitor_intel` (product launches).

## Replies
* Default: deterministic template (no AI cost).
* Optional LLM via any OpenAI-compatible endpoint (`.env.example`): Groq or OpenRouter free tiers. Limits: ≤3 attempts per reply (generation + 2 corrective retries), `LLM_MAX_CALLS` per run, cache of identical prompts, stop on 429/402, fallback to template. Validator checks length, forbidden claims, link/disclosure policy per site.

## Schedule
Runs inside the "LocalLedger growth" routine (Mon/Thu); the routine commits `data/opportunities.csv`.
