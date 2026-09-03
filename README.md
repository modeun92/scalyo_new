# Scalyo

Scalyo is a **Customer Success platform** for CSM / KAM teams: a client portfolio with
health scores, an AI assistant suite, retention playbooks, task and OKR management,
a steering-committee deck builder (COPIL), an email studio, quotes, team chat, and
"Oxygen" — a private well-being and workload loop for the CSM.

This repository is an **application-code snapshot** taken for review (see
[`REVIEW_NOTES.md`](REVIEW_NOTES.md)). It contains the front end, the serverless
back end, and the database migrations — no `node_modules`, no build output, no `.env`.

## Stack at a glance

| Layer | Technology |
|---|---|
| Front end | Vue 3 (`<script setup>`), Pinia, vue-router, vue-i18n, Vite 8 |
| Serverless back end | Cloudflare Pages Functions (`functions/api/**`) |
| Database / auth / realtime | Supabase (Postgres + RLS, GoTrue, Realtime, Storage) |
| Batch / webhooks | Supabase Edge Functions (Deno) |
| AI | Mistral (Paris, EU) — DeepSeek only as an anonymized emergency fallback |
| Payments | Stripe (Payment Links + Billing Portal + webhooks) |
| Transactional email | Resend (per-organization API key, encrypted at rest) |
| Hosting | Cloudflare Pages, two Supabase environments (pre-prod / prod) |

## Repository layout

```
.
├── README.md                     this file
├── REVIEW_NOTES.md               scope and hygiene notes of this snapshot
├── docs/                         project documentation (start here)
├── app-v2/frontend/
│   ├── src/                      Vue application (views, stores, components, i18n)
│   ├── functions/api/            Cloudflare Pages Functions (serverless back end)
│   ├── scripts/                  build-blog, check-i18n, proof-paywall-member
│   ├── public/                   static assets, landing SEO files, press kits
│   ├── supabase/migrations/      migrations kept alongside the front end
│   └── _future/                  designed-but-unwired agent configs
└── supabase/
    ├── migrations/               schema + RLS policies
    └── functions/                Edge Functions (Deno)
```

## Documentation

| Document | What it covers |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Runtime topology, request flows, trust boundaries |
| [docs/FRONTEND.md](docs/FRONTEND.md) | Routing, stores, components, i18n, formatting, theming |
| [docs/BACKEND_API.md](docs/BACKEND_API.md) | Every `/api/*` endpoint, the AI pipeline, shared services |
| [docs/DATABASE.md](docs/DATABASE.md) | Tables, RLS model, RPCs, Storage, migration history |
| [docs/MODULES.md](docs/MODULES.md) | Product modules, feature by feature |
| [docs/BILLING_AND_PLANS.md](docs/BILLING_AND_PLANS.md) | Plans, seats, roles, gating, Stripe flows |
| [docs/BUSINESS.md](docs/BUSINESS.md) | The business model derived from code: data model, revenue equation, entitlements |
| [docs/SECURITY_AND_PRIVACY.md](docs/SECURITY_AND_PRIVACY.md) | Secret custody, GDPR, AI data residency |
| [docs/CODE_STYLE.md](docs/CODE_STYLE.md) | Engineering doctrine and the code-language policy |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local setup, scripts, environment variables, deployment |

`CLAUDE.md` at the repository root is the orientation file for AI agents working here; it
must be kept in sync with the code.

## Quick start

```bash
cd app-v2/frontend
npm install
npm run dev          # Vite dev server on http://localhost:5174
```

`/api/*` is proxied to `http://localhost:8787` (see `vite.config.js`), so run the
Pages Functions locally with `npx wrangler pages dev` if you need the back end.
See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the required environment variables.
