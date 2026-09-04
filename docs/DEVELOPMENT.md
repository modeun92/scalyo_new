# Development

## Requirements

- Node 20+ (Vite 8)
- npm
- Optional: `wrangler` for the Pages Functions, the Supabase CLI for migrations

## Install and run

```bash
cd app-v2/frontend
npm install
npm run dev            # Vite on http://localhost:5174
```

`vite.config.js` proxies `/api` to `http://localhost:8787`. To exercise the back end
locally, run the Pages Functions in a second terminal:

```bash
cd app-v2/frontend
npx wrangler pages dev . --port 8787
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | `vite build` then `node scripts/build-blog.js` |
| `npm run preview` | Serve the production build |
| `node scripts/check-i18n.mjs` | Compare the FR / EN / KO key sets |
| `node scripts/check-i18n-quality.mjs` | Compare the FR / EN / KO **values**: missing `{n}`, wrong script for the file, untranslated or English-left-in-place Korean, a procedure that lost a step, and values written as `\uXXXX` escapes instead of the characters |
| `node scripts/proof-paywall-member.mjs` | Regression proof of the paywall computeds in `stores/auth.js` |

`scripts/build-blog.js` is part of the build, not an optional step. It renders the blog
articles, generates the static blog index, builds `sitemap.xml`, injects the `FAQPage`
JSON-LD, and produces the `/en` and `/ko` landing variants with their own head tags. A
substitution that cannot find its target **fails the build on purpose**.

## Environment variables

### Front end (build time, `VITE_*`)

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Public anon key |
| `VITE_STRIPE_LINK_STARTER` / `_GROWTH` / `_ELITE` | Production Payment Links |
| `VITE_STRIPE_LINK_*_PREPROD` | Pre-prod (test-mode) Payment Links |

A missing Stripe link yields `''` and an inert button — a visible failure, never an
implicit live link. Missing Supabase values make `src/lib/supabase.js` throw.

### Pages Functions (Cloudflare env — Production **and** Preview)

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | **yes** | Throws if absent |
| `SUPABASE_ANON_KEY` | **yes** | Throws if absent |
| `SUPABASE_SERVICE_ROLE_KEY` | for admin routes | Provisioning, seats, GDPR |
| `SUPABASE_JWT_SECRET` | optional | Auth verification |
| `MISTRAL_API_KEY` | for AI | Nominal provider |
| `AI_MODEL` | optional | Default `mistral-small-latest` |
| `AI_MAX_TOKENS` | optional | Default 2048 |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` | optional | Emergency fallback; empty = disabled |
| `STRIPE_SECRET_KEY` | for billing | Seat sync, portal, previews |
| `STRIPE_WEBHOOK_SECRET` | for billing | Webhook signature |
| `RESEND_API_KEY` | optional | Platform-level email; org email uses the per-org key |

Locally, put these in `.dev.vars` (git-ignored).

## Database work

Migrations live in `supabase/migrations/` (canonical) and, for three files, in
`app-v2/frontend/supabase/migrations/`.

The protocol every migration header documents:

1. Write it **idempotently** (`if not exists`, `create or replace`, guarded `alter`).
2. Apply on **pre-prod** first and run the verification queries listed in the header.
3. Get an explicit go, then apply on **prod**.
4. Respect the ordering against the front-end deploy. Some migrations must land *before*
   the front end — `notifications_payload` is the canonical example: the front end inserts
   the `payload` column, and without it every insert fails.

## Before you commit

1. `node scripts/check-i18n.mjs` — if you added a key, add it to all three locales.
1. `node scripts/check-i18n-quality.mjs` — a key can exist in all three files and still say
   three different things. This catches that; `check-i18n.mjs` cannot.
   (A small pre-existing gap is currently reported: `wb_fri` and three `chat_ch_*` keys.)
2. `node scripts/proof-paywall-member.mjs` if you touched the computeds in
   `src/stores/auth.js`.
3. Re-read [CODE_STYLE.md](CODE_STYLE.md) if you touched money, dates, health scores,
   plans, seats, a bulk read, or anything that writes to the database.
4. Check that you did not introduce a hard-coded user-facing string outside the i18n
   files, and that no store calls `t()`.

## Known hygiene items

These are documented in [`REVIEW_NOTES.md`](../REVIEW_NOTES.md) and are not fixed in this
snapshot:

- macOS duplicate files (`App 2.vue`, `main 2.js`, …) still exist in the upstream
  repository and should be `git rm`-ed.
- `app-v2/frontend/.env.production` is committed upstream (only the Supabase URL and anon
  key, both public — but a `.env` file should not be versioned).
- The upstream repository root holds session notes (`_session/`, `_to_delete/`, many
  `.md` files) that are not application material.

Two smaller ones visible in the code:

- `functions/api/_config/plans.config.js` and `src/config/plans.config.js` are synced by
  hand. A test asserting they match would remove a whole class of drift.
- The `wellbeing` AI handler is inlined twice (in `_modules/index.js` and as a fallback in
  `ai.js`) because Cloudflare Pages does not reliably resolve newly added module files.
