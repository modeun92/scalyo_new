# Scalyo documentation

Start here. Each document is self-contained; the reading order below goes from the widest
view to the narrowest.

| # | Document | Read it when you want to know… |
|---|---|---|
| 1 | [ARCHITECTURE.md](ARCHITECTURE.md) | how the pieces fit, which credential reaches which system, how a request actually flows |
| 2 | [FRONTEND.md](FRONTEND.md) | routing and guards, the Pinia stores, i18n, formatting rules, theming |
| 3 | [BACKEND_API.md](BACKEND_API.md) | every `/api/*` endpoint and the shared services behind them |
| 4 | [DATABASE.md](DATABASE.md) | the tables, the RLS model, the RPCs, the migration protocol |
| 5 | [MODULES.md](MODULES.md) | what each product module does and the rules baked into it |
| 6 | [BILLING_AND_PLANS.md](BILLING_AND_PLANS.md) | plans, roles, seats, gating, Stripe |
| 7 | [BUSINESS.md](BUSINESS.md) | the business model reconstructed from executable logic alone: data model, monetization, entitlements, enforced policies |
| 8 | [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md) | secret custody, GDPR, AI data residency, well-being confidentiality |
| 9 | [CODE_STYLE.md](CODE_STYLE.md) | the doctrine you are expected to follow, and why |
| 10 | [DEVELOPMENT.md](DEVELOPMENT.md) | local setup, scripts, env vars, the pre-commit checklist |
| 11 | [DEPLOY_CLOUDFLARE.md](DEPLOY_CLOUDFLARE.md) | **the live deploy** — Pages project settings, the two variable families, the release runbook, rollback, Cloudflare-specific traps |
| 12 | [DEPLOY_FLY.md](DEPLOY_FLY.md) | **proposal, not the live deploy** — plan for moving from Cloudflare Pages to Fly.io + GitHub Actions |
| 13 | [SCHEMA_REVIEW.md](SCHEMA_REVIEW.md) | review of the current schema against the `Database Plan.txt` redesign — what it fixes, what has to change before it is DDL, and the adoption path |
| 14 | [NEW_SCHEMA.sql](NEW_SCHEMA.sql) | the proposed core-domain schema. **A proposal, not a migration** |
| 15 | [MOCK_CODE_AUDIT.md](MOCK_CODE_AUDIT.md) | audit of mock, hard-coded and "pretending to work" code — 24 findings, 4 critical |

Repository scope and known hygiene items: [`../REVIEW_NOTES.md`](../REVIEW_NOTES.md).
Operational environment table: `../app-v2/frontend/functions/api/_config/SECURITY.md`.

## The four rules that explain most of the code

1. **Never invent a value.** No data means `null` and a `—` on screen, not a plausible
   number. (`R21`)
2. **Never a false success.** A `✓` only appears after a confirmed write; failures are
   toasted and the user's input survives. (`D-14` / `D-15`)
3. **One source per concern.** Prices, plans, the health scale, formatters, landing copy —
   each exists exactly once, and the duplicated back-end copy of the plan config is
   flagged as needing manual sync.
4. **Code in English, product content in the user's language.** See the language policy in
   [CODE_STYLE.md](CODE_STYLE.md).
