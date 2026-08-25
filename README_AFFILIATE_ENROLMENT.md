# Affiliate Enrolment Dashboard — MVP (feat/affiliate-enrolment)

## Status
WIP. Branch is ISOLATED — NOT merged to main. Nothing on this branch touches the live site.

## What this MVP is
The **enrolment / lead-capture half** of an affiliate program:
1. Public page `/affiliates` where interested creators/educators apply.
2. `POST /api/affiliates/enrol` Worker endpoint that validates + stores applications in Cloudflare KV (`affiliates:list`).
3. Token-gated admin view listing enrolled applicants (inside the existing `/admin` dashboard).

## What this MVP is NOT (explicitly out of scope until there is a paid commerce engine)
There is **no paid checkout today** — both shipped plugins (ZTame, ZScorch) are free/beta. A real affiliate program
(commission percentage on sales, conversion tracking links, payout ledger) CANNOT function without a commerce/order
system. Committing to commissions now would risk D-012 cash priorities and could be perceived as misleading applicants.
The affiliate **enrolment** side is reversible and zero-cost, so we capture demand now and wire commission tracking
once paid products exist.

## Files
- `src/index.ts` — adds `handleAffiliateEnrol`, `AFFILIATES_KV_KEY`, `/affiliates` in SITE_PAGES, affiliates list in `handleAdminStats`, and `/api/affiliates/enrol` routing.
- `src/pages/affiliates.astro` — public application page.
- `src/components/AffiliateEnrolForm.tsx` — the application form (mirrors FeedbackForm).
- `src/components/AdminDashboard.tsx` — adds "Affiliate applicants" section + stat.

## KV schema
Key: `affiliates:list` → JSON array of `{ id, name, email, platform, audience, notes, createdAt }`.

## Deploy path (do NOT run until Founder approves)
1. PR `feat/affiliate-enrolment` -> `main` (deploys via existing Cloudflare Actions workflow).
2. Confirm KV namespace is bound (`ZARLINO_KV`) — required for enrol + admin list.
3. Smoke test `/affiliates` page and `/api/affiliates/enrol`.

## Known related hazard
The pre-existing `feat/affiliate-program` branch has a commit that REPLACES the whole `src/index.ts` with the literal
string `placeholder` (it would take the live site down if merged). Do NOT merge that branch. It should be deleted or
rebuilt. This branch (`feat/affiliate-enrolment`) is the clean replacement.
