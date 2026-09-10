# CLAUDE.md — orientation for Claude working in this repository

> **Maintenance rule — read this first.**
> This file is the map Claude uses to navigate the code base. **Whenever you change
> something this file describes, update this file in the same change.** That includes:
> adding, removing or renaming a module, store, view or `/api/*` endpoint; changing a
> plan, price, quota, seat or role; adding a table, RPC, RLS policy or migration; changing
> a formatter, a threshold or a shared contract; changing the language policy; or
> retiring one of the rules below.
> If you touch business or policy content (pricing, Terms, Privacy, DPA, the AI or
> well-being commitments), update [`docs/BUSINESS.md`](docs/BUSINESS.md) too.
> Do not let this file drift — a stale map is worse than none. If you notice it is already
> stale, say so and fix it.

## What this is

**Scalyo** — a B2B SaaS Customer Success platform, sold per seat per month, natively
trilingual (FR / EN / KO). Client portfolio with health scores, AI assistants, retention
playbooks, tasks and OKRs, a steering-committee deck builder (COPIL), an email studio,
quotes, team chat, and **Oxygen** — a private CSM well-being and workload loop that is the
product's stated differentiator.

This repository is an application-code snapshot for review: no `node_modules`, no build
output, no `.env`. See [`REVIEW_NOTES.md`](REVIEW_NOTES.md).

## Stack and layout

| Layer | Technology |
|---|---|
| Front end | Vue 3 `<script setup>`, Pinia, vue-router, vue-i18n, Vite 8 |
| Serverless back end | Cloudflare Pages Functions (`functions/api/**`) |
| Data / auth / realtime | Supabase (Postgres + RLS, GoTrue, Realtime, Storage) |
| AI | Mistral (EU); DeepSeek only as an anonymized emergency fallback |
| Payments | Stripe (Payment Links, Billing Portal, webhooks) |
| Email | Resend, with a per-organization key encrypted at rest |

```
app-v2/frontend/
  src/            views/ stores/ components/ lib/ utils/ config/ i18n/ router/ layouts/
  functions/api/  routes at the top level; _-prefixed folders are shared code
  scripts/        build-blog.js · check-i18n.mjs · proof-paywall-member.mjs
  public/         static assets, _headers, robots.txt, press kits
supabase/
  migrations/     schema + RLS (canonical)
  functions/      Deno Edge Functions
docs/             the documentation set — see below
```

Three migrations also live under `app-v2/frontend/supabase/migrations/`.

**`supabase/migrations/` is canonical for RLS and for changes — NOT for schema** (verified
07/09/2026). Only **8 of the 35 tables** the code touches have a `CREATE TABLE` anywhere in
the repo (`chat_channels`, `chat_messages`, `chat_channel_members`, `client_notes`,
`client_metrics`, `quotes`, `sent_emails`, `user_profiles`); the other 27 — `profiles`,
`clients`, `organizations`, `tasks`, `copils` among them — were created in the Supabase
dashboard and exist here only as `ALTER`s and RLS policies. A checkout cannot rebuild the
database. `docs/SCHEMA_FROM_CODE.sql` reconstructs the rest from the CRUD call sites, with
every inferred column marked as such.

`app-v2/frontend/_migrations/001_user_profiles.sql` is described as superseded but is **not
dead**: it is the only definition of `user_profiles`, which `stores/profile.setCurrency`,
`functions/api/billing.js` and `_services/context.service.js` all still query, and which
carries the `currency` column rule 9 depends on. `profiles` and `user_profiles` are two
different live tables — identity/plan/trial vs AI-context/currency.

## Documentation map — read the right one before you edit

| You are touching… | Read |
|---|---|
| anything, for the first time | [docs/README.md](docs/README.md) |
| system shape, request flows, credentials | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| routing, stores, components, i18n, formatting | [docs/FRONTEND.md](docs/FRONTEND.md) |
| any `/api/*` endpoint or shared service | [docs/BACKEND_API.md](docs/BACKEND_API.md) |
| tables, RLS, RPCs, migrations | [docs/DATABASE.md](docs/DATABASE.md) |
| what the columns actually are | [docs/SCHEMA_FROM_CODE.sql](docs/SCHEMA_FROM_CODE.sql) — reference, **not** a migration |
| a product feature | [docs/MODULES.md](docs/MODULES.md) |
| plans, seats, roles, gating, Stripe | [docs/BILLING_AND_PLANS.md](docs/BILLING_AND_PLANS.md) |
| secrets, GDPR, AI residency, Oxygen privacy | [docs/SECURITY_AND_PRIVACY.md](docs/SECURITY_AND_PRIVACY.md) |
| the business model, entitlements, monetization logic | [docs/BUSINESS.md](docs/BUSINESS.md) |
| known mock / false-signal code | [docs/MOCK_CODE_AUDIT.md](docs/MOCK_CODE_AUDIT.md) |
| conventions and doctrine | [docs/CODE_STYLE.md](docs/CODE_STYLE.md) |
| setup, scripts, env vars, deploy | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) |
| moving the deploy to Fly.io (**proposal — the live deploy is still Cloudflare Pages**) | [docs/DEPLOY_FLY.md](docs/DEPLOY_FLY.md) |

## Non-negotiable rules

These are enforced throughout the code. Each exists because the opposite shipped once and
broke something visible. Do not relax one without saying so explicitly.

1. **Never invent a value (`R21`).** No data means `null` and `—` on screen, never a
   plausible number. `0` is a real value — never write `value || fallback` on a numeric
   field.
2. **Never a false success (`D-14` / `D-15`).** A `✓` only after a confirmed write. Every
   mutation goes through `withWrite` and returns `{ success }` / `{ error }`; every
   destructured `error` is tested; panels close only on real success. Structural
   optimistic updates are reverted on failure, field edits are not (the user's typing
   survives).
3. **One source per concern.** Prices, plans, the health scale, formatters, Stripe links,
   landing copy — each exists exactly once. The back-end copy of `plans.config.js` is
   synced **by hand**: change both.
4. **Code in English, product content in the user's language.** See the table in
   [docs/CODE_STYLE.md](docs/CODE_STYLE.md#language-policy). Never translate i18n values,
   AI prompts, email bodies, public FR pages, **persisted French enum
   values** (`kind = 'cloture'`, `category = 'renouvellement'`, CSV import aliases) or
   public SEO slugs. A label that reaches the screen belongs in i18n — including the KPI
   library's (`kpi_library_<id>` / `kpi_library_category_<id>`), which `config/kpis.js` references by key.
   **Prefixes are words, not initials** (07/09/2026): `setting_`, `planning_`, `workload_`,
   `email_studio_`, `smart_matrix_`, `smart_import_`, `playbook_`, `roadmap_`, `oxygen_`,
   `portfolio_`, `client_detail_`, `manager_`, `resources_`, `quote_`, `satisfaction_`,
   `dashboard_`, `wellbeing_`, `notification_`, `client_metric_`, `route_title_`,
   `kpi_dashboard_`, `onboarding_` / `onboarding_wizard_`. `copil_`, `ai_` and `kpi_` stay —
   they are names and acronyms, not abbreviations. Watch for keys built at run time
   (`t('playbook_template_' + k)`): the fragment lives in the view, so a prefix rename must
   chase it there too, and `roadmap_ms_*` is **persisted** — `stores/roadmap.fixLegacyKey`
   migrates the old spellings.
   **No hard-coded translation**: `src/i18n/` is the ONLY home for a translation, server strings
   included — `functions/api/_i18n/translate.js` is a resolver holding no data, and
   `_i18n/messages.js` is deleted. A config stores the key, the view calls `t()`. A table outside
   i18n is invisible to `check-i18n.mjs`, and a component that resolves its own locale drifts from
   the app's. Key names are spelled out (`integration_*`, `country_law_*`, `*_description`).
   See [docs/CODE_STYLE.md](docs/CODE_STYLE.md#no-hard-coded-translation-0409).
5. **No `t()` in a store.** Stores return i18n keys plus params; views render them.
   Outside a component, use `i18n.global`, never `useI18n()`.
6. **`fetchAllRows` for any complete read.** PostgREST truncates at 1000 rows with no
   error. Requires `count: 'exact'` and a stable sort (`created_at desc, id desc`).
   Never an unbounded `.in('id', [...])` on writes — use a server-side filter.
7. **Local calendar day, UTC instant.** `localDateKey()` for calendar dates; never
   `toISOString().slice(0,10)`. `datetime-local` strings are local time and are converted
   on write; an invalid string writes nothing.
8. **Health scores are /10 through `lib/health`.** No local threshold, no ×10, never a raw
   `client.status` for a colour. The thresholds are mirrored in
   `_services/context.service.js` — parity is mandatory.
9. **Money through `lib/formatters.fmtCurrency`.** Currency is a property of the account
   (`user_profiles.currency`), not of the language. Zero conversion. The offered codes live
   once in `src/config/currencies.js`; the account picks one in Settings → Preferences
   (`stores/profile.setCurrency`). A KPI's unit suffix comes from `formatters.kpiUnit`,
   never from a literal in `config/kpis.js`.
10. **No native `confirm()`.** Use the shared `ConfirmDialog`.
11. **Partial updates must be partial-safe.** A field absent from the input is not sent.
    Insert defaults live in the `add*` functions, not in the mapper.
12. **The login session dies 5 h after the last interaction.** `lib/sessionIdle.js` owns the
    window, the `scalyo_last_activity` stamp and the definition of "interaction"
    (`pointerdown`/`keydown`/`scroll`/`wheel`/`touchstart` — not mouse movement). It fails
    **closed**: no stamp means expired. `stores/auth.init()` judges the stored session
    *before* `getSession()` (which would refresh the token first); `App.vue` runs the live
    sweep, gated on `auth.isAuthenticated` — ungated, it expels anonymous visitors and lets
    landing-page scrolling revive a stale session. Client-side only: pair any change with
    Supabase **Auth → Sessions → Inactivity timeout**.
13. **Never `await` a Supabase call inside `onAuthStateChange`,** and never pass a `lock`
    option to `createClient` — both reintroduce a total per-tab freeze.

## Traps that have bitten before

- **Cloudflare eats 5xx bodies** from Pages Functions and replaces them with its own HTML.
  Endpoints return a typed **409** where a 502 would be natural (`CF-502-MASQUE`).
- **The organization, not the profile, owns paid access.** A member of a paying org must
  not hit the paywall. `hasActiveSubscription` is deliberately profile-only.
- **The Stripe webhook must write both** `profiles` and `organizations`, or a paying
  owner's members stay gated on `starter`.
- **Seats are billed at invitation, not acceptance.** Removal is fail-closed: Stripe
  before any database write.
- **Prospects are excluded** from portfolio counters, health aggregates and alerts. Use
  `clientsOnly`.
- **Cloudflare Pages does not reliably resolve newly added module files** — that is why
  the `wellbeing` AI handler is inlined twice.
- **`check-i18n.mjs` loads only `fr/en/ko.js`** — `landing.js`, `legal.js` and `dpa.js`
  have **no parity check at all**. That blind spot is how `legal.js` accumulated 28
  duplicate `fr` keys (last-one-wins, so editing the wrong copy did nothing). The
  duplicates are gone as of 07/09/2026 and every i18n file is now sorted A→Z, which makes
  a duplicate adjacent and obvious — but nothing *enforces* either property yet.
- **`/api/ai`, `/api/email` and `/api/usage` read `profiles.plan`**, while the front end
  and the SQL client-limit trigger read `organizations.plan`. A member of a paying org
  can be entitled in the UI and 403'd by the API. Use the org plan when you touch these.
- **`chat_messages` UPDATE is `user_id = auth.uid()`.** A PostgREST `UPDATE` that matches
  zero rows returns **204 with `error = null`** — a false success no `error` test can catch.
  That is why reacting to or pinning someone else's message did nothing at all. Both now go
  through `toggle_chat_reaction` / `set_chat_message_pinned`
  (`20260909120000_chat_reactions_rpc.sql`); `can_read_chat_message` mirrors
  `chat_messages_select` **by hand** — keep them in parity.
- **Chat realtime can report `SUBSCRIBED` and deliver nothing.** The client cannot tell that
  apart from a healthy socket, so the safety-net sweep in `stores/chat.js` runs *even when
  `connected` is true*. Do not turn it back into a fallback armed only on error.
- **Oxygen data is legally self-only.** The only aggregation path is
  `oxygen_team_aggregate` (owner-only, literal `n ≥ 5`, fail-closed behind an org flag).
  Changing this is a legal change.

## Working agreements

- **Comment style**: `// TAG (date): the rule.` then *why the obvious alternative is
  wrong, with the symptom it produced*. Keep the tag — it is the grep handle for the whole
  rule family (`R21`, `D-14`, `CAP-1000`, `TZ-PLANNING`, `HEALTH-SCALE`, `COPIL-RACE`,
  `SEO-I18N`, `PAYWALL-MEMBER`, …). Keep the symptom.
- **Migrations**: idempotent, pre-prod first with the checks in the header, then prod on an
  explicit go. Respect the stated ordering against the front-end deploy.
- **Zero dead code**: a removed feature takes its CSS, i18n keys and imports with it.
  What is dormant on purpose (Integrations, `_future/*`) says so in a comment.
- **Before finishing**: run `node scripts/check-i18n.mjs` (one pre-existing gap,
  `wellbeing_fri`, is expected; the three `chat_ch_*` keys that used to be missing were
  unused and have been deleted) **and `node scripts/check-i18n-quality.mjs`**, which
  checks that the three values of a key still MEAN the same thing — missing `{n}`, Korean prose
  in the French file, an untranslated or English-left-in-place Korean value, a procedure that
  lost a step. `check-i18n.mjs` only proves a key exists; a wrong value fails nothing there. Also
  `node scripts/proof-paywall-member.mjs` if you touched the computeds in
  `src/stores/auth.js`. Both need `npm install` first — `node_modules` is not in this
  snapshot.

## Things that are intentionally the way they are

Do not "fix" these without asking:

- Dense, symptom-carrying comments. They are the institutional memory of this code base.
- French persisted enum values and French public URL slugs.
- The Integrations module being hidden behind a redirect with its code kept dormant.
- `wellbeing` being inlined in two places.
- Route transitions being synchronous, with no fade.
- The `stats_note` disclaimer on the landing page ("product targets, not observed
  averages") — it is compliance copy.

## Known open items

Tracked, not fixed in this snapshot:

- The two `plans.config.js` copies are synced by hand and **have already drifted**
  (`oxygen_team` is front-end only). A parity test would remove a class of drift.
- Eight code-vs-code contradictions, derived and listed in
  [docs/BUSINESS.md](docs/BUSINESS.md#8-contradictions-inside-the-machine) — notably the
  split plan source above.
- **24 mock / false-signal findings in [docs/MOCK_CODE_AUDIT.md](docs/MOCK_CODE_AUDIT.md),
  4 of them critical**: GDPR erasure misses 18 real tables and reports success without
  checking anything; `account/delete.js` and `account/export.js` still carry a hard-coded
  **production** Supabase URL fallback; `/api/coach` bypasses rate limit, gating and quota.
  Read it before touching account deletion, alerts, or the plan config.
- Upstream hygiene: macOS duplicate files, a committed `.env.production`, session notes at
  the repository root (see [`REVIEW_NOTES.md`](REVIEW_NOTES.md)).

---

*Last updated: 2026-09-09. If you changed something described above and did not update
this file, you are not done.*
