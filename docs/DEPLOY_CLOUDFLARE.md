# Deploying Scalyo on Cloudflare — plan and runbook

> **Status: this is the live deployment target.** Cloudflare Pages + Pages Functions is
> what runs in production today ([ARCHITECTURE.md §Deployment](ARCHITECTURE.md)).
> [DEPLOY_FLY.md](DEPLOY_FLY.md) is a *proposal* to leave; this document is how the thing
> we actually ship is built, configured, released and rolled back.
>
> Read §1 before touching anything: the front end and the back end ship in a **single
> build**, so a deploy is atomic across the API boundary — and that property is load-bearing
> for how the rest of the code is written.

---

## 0. Executive summary

| | |
|---|---|
| **What is deployed** | One Cloudflare Pages project per environment. Static `dist/` + `functions/api/**` (Workers) in the same artifact. |
| **Build command** | `npm run build` = `vite build && node scripts/build-blog.js` |
| **Build root** | `app-v2/frontend` — the repository root is **not** the project root |
| **Output directory** | `dist` |
| **Functions directory** | `functions` (auto-detected, sibling of `dist` — do not move it) |
| **Environments** | Production (`scalyo.app`), Pre-production (`preprod.scalyo.app`), Preview (`*.scalyo-app.pages.dev`) |
| **Secrets** | Cloudflare Pages env vars, set **per environment**; `VITE_*` are build-time and public |
| **Migrations** | **Never** run by a deploy. Manual, pre-prod first, explicit go — see §7 |
| **Rollback** | Pages "Retry/Rollback to this deployment" — instant, and safe *only* if no migration landed in between (§9) |
| **Cost** | Free tier is sufficient at current scale; the binding limits to watch are in §11 |

---

## 1. Why the single-artifact property matters

Cloudflare Pages builds the SPA and the Pages Functions from the same commit, in the same
build, and publishes them as one deployment. Three consequences the code already relies on:

1. **Internal identifiers crossing the front/back boundary can be renamed safely** — AI
   module names, plan module keys. There is no window where an old front end talks to a new
   API.
2. **There is no "deploy the API first" step.** Any change that needs ordering has to be
   ordered against the *database*, not against the other half of the app (§7).
3. **A build failure ships nothing.** `scripts/build-blog.js` fails the build on purpose
   when an HTML substitution cannot find its target — a silently unsubstituted tag would
   ship a French canonical on the Korean page. Do not "fix" that by making it lenient.

---

## 2. Cloudflare Pages project settings

Create one project per environment. Settings → Builds & deployments:

| Setting | Value | Notes |
|---|---|---|
| Framework preset | None | Vite preset would override the build command |
| Build command | `npm run build` | Includes `build-blog.js`; it is not optional |
| Build output directory | `dist` | |
| Root directory (advanced) | `app-v2/frontend` | The critical one. Left at `/`, the build finds no `package.json` |
| Node version | `20` (or newer) | Vite 8 requires Node 20+. Set `NODE_VERSION=20` as a build env var, or commit `.nvmrc` |
| Functions directory | `functions` | Implicit; Pages picks up `functions/` next to the project root |
| Build system version | v2 or later | |

**Production branch**: `main`. **Preview branches**: all others (or restrict to a
`preprod` branch if pre-prod is branch-driven rather than a separate project — decide once,
§3).

### Routing that Pages resolves for you

- `functions/api/**` → `/api/**`, file-based. `[id].js` becomes `context.params.id`
  (`members/[id].js`, `invitations/[id].js`).
- `functions/api/_middleware.js` runs before **every** `/api/*` handler and owns CORS.
  Folders prefixed with `_` (`_config`, `_services`, `_utils`, `_modules`, `_prompts`,
  `_providers`, `_i18n`) are shared code and are **not** routes.
- `public/_headers` and `public/_redirects` are copied into `dist/` by Vite and applied at
  the edge (§6).
- SPA fallback: any non-asset, non-`/api` path serves `index.html`. Do not add a catch-all
  Function — it would shadow the static site.

---

## 3. The three environments

| Environment | Pages project | Domain | Supabase | Stripe |
|---|---|---|---|---|
| **Production** | `scalyo-app` | `scalyo.app`, `www.scalyo.app` | prod project | live keys, live Payment Links |
| **Pre-production** | separate project (recommended) | `preprod.scalyo.app` | pre-prod project | **test** keys, `VITE_STRIPE_LINK_*_PREPROD` |
| **Preview** | Production project, preview deployments | `<hash>.scalyo-app.pages.dev` | pre-prod project | test keys |

All four of these origins are already allow-listed in `functions/api/_middleware.js`:

```
https://scalyo.app · https://www.scalyo.app · https://preprod.scalyo.app
https://scalyo-app.pages.dev  (+ any *.scalyo-app.pages.dev preview host)
```

**If you add or rename a domain, add it to `ALLOWED_ORIGINS` in the same change** — an
un-listed origin does not get a CORS error it can read; it gets the *production* origin
echoed back, which fails opaquely in the browser.

**Recommendation: keep pre-prod as its own Pages project, not a preview branch.** A preview
deployment inherits the "Preview" variable set, and the whole point of pre-prod is that it
has its own database and its own Stripe mode. Two projects make that separation
structural rather than a naming convention.

---

## 4. Environment variables

Two families, and they are not interchangeable.

### 4.1 Build-time, public — `VITE_*`

Compiled into the JavaScript bundle. **Anything here is public.** Set on the Pages project
(Settings → Variables → *Production* and *Preview*), or injected by the GitHub Actions
workflows (§5).

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | **yes** | `src/lib/supabase.js` throws if absent |
| `VITE_SUPABASE_ANON_KEY` | **yes** | Public anon key; throws if absent |
| `VITE_STRIPE_LINK_STARTER` / `_GROWTH` / `_ELITE` | for checkout | Production Payment Links |
| `VITE_STRIPE_LINK_STARTER_PREPROD` / `_GROWTH_PREPROD` / `_ELITE_PREPROD` | pre-prod | Test-mode Payment Links |
| `NODE_VERSION` | recommended | `20` |

A missing Stripe link yields `''` and an inert button — a visible failure, never an
implicit live link. Keep it that way.

### 4.2 Runtime, secret — Pages Functions env

Read through `getConfig(env)` in `functions/api/_config/index.js`, which **throws loudly**
on a missing required value. There is deliberately **no fallback constant pointing at
production** (`ENV-FALLBACK-PROD`, Lot 6): a pre-prod deprived of `SUPABASE_URL` once
silently failed over to the production database.

| Variable | Required | Used for |
|---|---|---|
| `SUPABASE_URL` | **yes** | Throws if absent |
| `SUPABASE_ANON_KEY` | **yes** | Throws if absent |
| `SUPABASE_SERVICE_ROLE_KEY` | admin routes | Provisioning, seats, GDPR export/delete |
| `SUPABASE_JWT_SECRET` | optional | Auth verification |
| `SUPABASE_WEBHOOK_SECRET` | for `notify-feedback` | Shared secret on the Supabase → API hook |
| `ENCRYPTION_KEY` | for integrations / org email | PBKDF2 → AES-256-GCM at rest (`_config/crypto.js`) |
| `MISTRAL_API_KEY` | for AI | Nominal provider (EU) |
| `AI_MODEL` / `AI_MAX_TOKENS` | optional | Defaults `mistral-small-latest` / `2048` |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` | optional | Anonymized emergency fallback; empty = disabled |
| `STRIPE_SECRET_KEY` | for billing | Seat sync, portal, previews |
| `STRIPE_WEBHOOK_SECRET` | for billing | HMAC signature verification |
| `RESEND_API_KEY` | optional | Platform-level email; org email uses the per-org encrypted key |

**Set every one of them on Production *and* Preview.** The error message in
`_config/index.js` says so for a reason: a variable set only on Production makes every
preview deployment 500 on its first API call, and the symptom looks like a code bug.

**`ENCRYPTION_KEY` must be identical to the value that encrypted the stored tokens.**
Rotating it does not re-encrypt anything — `decryptToken` returns `null` on failure, so
every integration token and every per-org Resend key silently becomes "not configured".
Rotation is a data migration, not a variable change.

Locally, the same values go in `app-v2/frontend/.dev.vars` (git-ignored) and are picked up
by `npx wrangler pages dev . --port 8787`.

---

## 5. CI/CD

Two GitHub Actions workflows exist upstream — `deploy-preprod.yml` and `deploy.yml` — and
are **not part of this snapshot**. They inject the Stripe links and the Supabase keys as
build-time `VITE_*` variables and publish with Wrangler. If you are re-creating them, the
shape is:

```yaml
# .github/workflows/deploy.yml — production
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions: { contents: read, deployments: write }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm', cache-dependency-path: app-v2/frontend/package-lock.json }
      - run: npm ci
        working-directory: app-v2/frontend
      - run: node scripts/check-i18n.mjs && node scripts/check-i18n-quality.mjs
        working-directory: app-v2/frontend
      - run: npm run build
        working-directory: app-v2/frontend
        env:
          VITE_SUPABASE_URL:      ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
          VITE_STRIPE_LINK_STARTER: ${{ secrets.VITE_STRIPE_LINK_STARTER }}
          VITE_STRIPE_LINK_GROWTH:  ${{ secrets.VITE_STRIPE_LINK_GROWTH }}
          VITE_STRIPE_LINK_ELITE:   ${{ secrets.VITE_STRIPE_LINK_ELITE }}
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy dist --project-name=scalyo-app --branch=main
          workingDirectory: app-v2/frontend
```

Notes that are not boilerplate:

- **`npm ci`, not `npm install`.** `package.json` pins `xlsx` to a CDN tarball
  (`https://cdn.sheetjs.com/...`) rather than the npm registry; the lockfile is what makes
  that resolution reproducible.
- **The i18n gates belong in CI, not in a reviewer's memory.** `check-i18n.mjs` reports one
  expected pre-existing gap (`wellbeing_fri`); either allow-list it in the workflow or fix
  it, but do not make the step non-blocking — that is how the check dies.
  `check-i18n-quality.mjs` is the one that catches a key existing in three files while
  saying three different things.
- Add `node scripts/proof-paywall-member.mjs` to the workflow if you want the paywall
  regression proof enforced rather than remembered (§10).
- `wrangler pages deploy dist` uploads `functions/` from `workingDirectory` automatically.
  It must run with `working-directory: app-v2/frontend`, or the Functions are silently
  omitted and every `/api/*` route 404s on a site that otherwise looks fine.
- The Cloudflare API token needs **Account → Cloudflare Pages → Edit** only.

**The dashboard Git integration and the Actions workflow are alternatives, not layers.**
Running both on `main` produces two deployments per push, one of which has no `VITE_*`
values. Pick one and disable the other.

`app-v2/frontend/.build-trigger` is a one-line file whose only purpose is to give a
no-op commit something to change when a rebuild is needed without a code change. Keep it.

---

## 6. Edge behaviour that ships with the build

### `public/_headers`

- `X-Robots-Tag: noindex, follow` on `/login`, `/register`, `/join`, `/join/*`,
  `/paywall`, `/payment-success`, `/reset-password`, `/reset-password-confirm`, `/app/*`.
  **`follow` is deliberate** — Googlebot keeps reading the internal linking.
- `public/robots.txt` deliberately does **not** `Disallow` those paths: a `Disallow` would
  stop Googlebot from ever reading the `noindex`. Do not "tidy" this.
- Long `Cache-Control` on the brand assets only (`favicon*`, `apple-touch-icon`,
  `scalyo-logo.png`, `og-default.png`). Vite's hashed bundle filenames get Pages' own
  immutable caching; `index.html` must stay uncached.

### `public/_redirects`

Two 302s off the legacy landing paths (`/index-landing`, `/index-landing.html` → `/`).

### Cache rules (Cloudflare dashboard, if you add any)

**Never cache `/api/*`.** Every endpoint is authenticated or side-effecting; a cached
`/api/users/me` serves one tenant's data to another. If a cache rule is added for the
static site, exclude `/api/*` explicitly rather than relying on the default heuristics.

---

## 7. Database migrations are not part of the deploy

This is the one ordering constraint that survives the single-artifact property.

Migrations live in `supabase/migrations/` (canonical for RLS and changes) and, for three
files, in `app-v2/frontend/supabase/migrations/`. The protocol, documented in every
migration header:

1. Write it **idempotently** (`if not exists`, `create or replace`, guarded `alter`).
2. Apply on **pre-prod**, run the verification queries in the header.
3. Get an **explicit go**, then apply on **prod**.
4. Respect the stated ordering **against the front-end deploy**.

Step 4 is the trap. `notifications_payload` is the canonical example: the front end inserts
the `payload` column, so the migration must land **before** the Pages deploy or every insert
fails. The reverse ordering also exists (a migration that drops something the current front
end still reads must land **after**).

> **A checkout cannot rebuild the database.** Only 8 of the 35 tables the code touches have
> a `CREATE TABLE` anywhere in the repository; the other 27 were created in the Supabase
> dashboard. Provisioning a brand-new environment is a manual exercise with
> [SCHEMA_FROM_CODE.sql](SCHEMA_FROM_CODE.sql) as the reference — it is documentation, not
> a migration. Budget for it; do not discover it during a cutover.

Supabase Edge Functions (`supabase/functions/`: `run-playbooks`, `scalyo-api`,
`scalyo-webhook`, `send-email`, `stripe-webhook`, `test-resend-key`, `track-open`) deploy
via `supabase functions deploy`, on their own cadence. They are **not** touched by a Pages
deploy — which means a contract shared between a Pages Function and an Edge Function has
two independent release trains. Version those contracts additively.

---

## 8. External wiring per environment

| System | What to point where | Gotcha |
|---|---|---|
| **Stripe webhook** | Endpoint → `https://<env-domain>/api/stripe-webhook`; secret → `STRIPE_WEBHOOK_SECRET` | Prod and pre-prod need **separate** endpoints with **separate** signing secrets. Signature verification rejects a timestamp skew > 300 s. |
| **Stripe Payment Links** | Live links → prod `VITE_STRIPE_LINK_*`; test links → `*_PREPROD` | Prices live once in `_config/prices.js`; `PRICE_TO_PLAN` is derived from it |
| **Supabase Auth** | Site URL + redirect allow-list must include every domain in §3, **including preview hosts** | A preview host missing from the allow-list breaks magic-link and password-reset on previews only |
| **Supabase Auth → Sessions** | **Inactivity timeout** must be paired with `lib/sessionIdle.js` (5 h) | The 5 h idle logout is client-side only; the server-side setting is the other half. Change both or neither |
| **Supabase DB webhook** | → `/api/notify-feedback` with the shared `SUPABASE_WEBHOOK_SECRET` | |
| **Resend** | Domain verified (SPF/DKIM) for the sending domain | Per-organization keys are encrypted at rest with `ENCRYPTION_KEY` — see §4.2 |
| **DNS** | `scalyo.app`, `www`, `preprod` as Pages custom domains | Keep the orange cloud on; TLS is Cloudflare-terminated |

---

## 9. Release runbook

**Before the deploy**

1. `npm ci` in `app-v2/frontend`.
2. `node scripts/check-i18n.mjs` — one expected gap (`wellbeing_fri`).
3. `node scripts/check-i18n-quality.mjs`.
4. `node scripts/proof-paywall-member.mjs` if `src/stores/auth.js` computeds changed.
5. If the change touches `functions/api/_config/plans.config.js`, **diff it against
   `src/config/plans.config.js` by hand.** They are synced manually and have already
   drifted (`oxygen_team` is front-end only).
6. If there is a migration: apply it on pre-prod, run the header's verification queries,
   and decide the ordering against this deploy (§7).

**Deploy to pre-prod**, then smoke-test on `preprod.scalyo.app`:

- Landing `/`, `/en`, `/ko` render, each with its own canonical and head tags.
- Log in; the app shell loads; a client detail page shows health scores.
- One authenticated `GET` (`/api/users/me`) and one `POST` that writes.
- One AI call (`/api/ai`) — proves `MISTRAL_API_KEY` and the module resolution.
- Stripe: open the billing portal (`/api/stripe/portal`), and fire a test webhook from the
  Stripe dashboard; confirm it wrote **both** `profiles` and `organizations`.
- A member (non-owner) of a paying org does **not** hit the paywall.

**Deploy to production**, then repeat the same list against `scalyo.app`, plus:

- `curl -sI https://scalyo.app/app/ | grep -i x-robots-tag` returns `noindex, follow`.
- `curl -s -o /dev/null -w '%{http_code}' https://scalyo.app/api/users/me` returns 401, not
  500 — a 500 here means a missing runtime variable, not an auth failure.

**Rollback**

Pages → Deployments → *Rollback to this deployment*. Instant, and it restores the static
site and the Functions together. **It does not roll back the database.** If a migration
landed with the deploy, rolling back the code re-exposes the old schema expectations — so
either the migration was additive and idempotent (the protocol's whole point) or the
rollback needs a matching down-migration prepared in advance. Decide this *before* shipping,
not during the incident.

---

## 10. Cloudflare-specific traps already burned into this code

These are not hypothetical; each one shipped and broke something visible.

- **Cloudflare eats 5xx bodies** from Pages Functions and replaces them with its own HTML
  error page. Endpoints therefore return a typed **409** where a 502 would be natural —
  grep `CF-502-MASQUE` (`invite.js`, `members/[id].js`, `invitations/[id].js`). Do not
  "correct" those status codes.
- **Pages does not reliably resolve newly added module files.** That is why the `wellbeing`
  AI handler is inlined twice (`_modules/index.js` and a fallback in `ai.js`). When adding a
  new module file, deploy it and *verify the route at runtime* before assuming it resolved;
  a `.build-trigger` bump forces a clean rebuild.
- **The rate limiter is per-isolate, in memory** (`_services/rate-limit.service.js`, 10
  req/min/user). Cloudflare runs many isolates, and they cold-start independently — the
  effective limit is therefore higher than 10 and non-deterministic. It is a courtesy brake,
  not an enforcement boundary. If it ever needs to be real, it needs KV or Durable Objects,
  and that is a new binding to provision in §2.
- **`context.waitUntil()`** keeps the isolate alive for the usage log (`ai.js:83`,
  `email.js:123`). Anything moved out of `waitUntil` into a bare promise is silently
  cancelled when the response returns.
- **`/api/ai`, `/api/email` and `/api/usage` read `profiles.plan`**, while the front end and
  the SQL client-limit trigger read `organizations.plan`. A member of a paying org can be
  entitled in the UI and 403'd by the API. Use the **org** plan when you touch these.
- **The Stripe webhook must write both** `profiles` and `organizations`, or a paying owner's
  members stay gated on `starter`. Verify both rows after any webhook change.
- **`/api/coach` bypasses rate limit, gating and quota**, and `account/delete.js` /
  `account/export.js` carry a hard-coded **production** Supabase URL fallback — which means
  a pre-prod deploy of those two files can reach the production database. See
  [MOCK_CODE_AUDIT.md](MOCK_CODE_AUDIT.md); treat this as a deploy-safety item, not just a
  code-quality one.
- **`_middleware.js` catches and returns a bare 500** on a thrown handler with no logging.
  Failures are visible in Pages → Functions → Real-time logs; wire an alert there rather
  than relying on the response body, which Cloudflare may replace anyway.

---

## 11. Limits worth knowing before they bite

| Limit | Value | Relevance here |
|---|---|---|
| Files per Pages deployment | 20 000 | The blog generator emits per-article HTML; watch it as the blog grows |
| Single file size | 25 MB | Press kits and `.webp` assets in `public/` |
| Functions bundle | 1 MB compressed (free) | 28 endpoints + shared services; PDF/PPTX generation is **client-side**, keep it there |
| Worker CPU | 10 ms free / 30 s paid per request | AI calls are I/O-bound (waiting on Mistral), not CPU — that is why they fit |
| Builds | 500/month (free), 20 min each | A busy day of preview branches can exhaust this |
| Concurrent builds | 1 (free) | Pre-prod and prod as separate projects still queue on one account |

---

## 12. Open items for this deployment

Tracked, not fixed:

1. **No parity test between the two `plans.config.js` copies.** They have already drifted.
   A CI step comparing the exported objects would remove the class of drift entirely, and it
   is ~20 lines.
2. **`dpa.js`, `legal.js` and `landing.js` have no i18n parity check** — `check-i18n.mjs`
   loads only `fr/en/ko.js`. Legal copy can land in one language and nothing fails.
3. **The i18n gates are not enforced in CI** in this snapshot; they are a pre-commit
   convention. Convention loses.
4. **No smoke test runs after a deploy.** The §9 checklist is manual. Even a three-request
   post-deploy curl (landing 200, `/api/users/me` 401, `X-Robots-Tag` present) as a workflow
   step would catch the missing-variable class of failure before a user does.
5. **A brand-new environment cannot be provisioned from this repository** (§7). If pre-prod
   ever needs rebuilding, that is a project, not a task.
6. **The in-memory rate limiter** (§10) is not an enforcement boundary and is documented as
   if it were 10 req/min. Either add a KV binding or restate the guarantee.

---

*Last updated: 2026-09-10. Companion documents: [ARCHITECTURE.md](ARCHITECTURE.md) for the
request flow, [DEVELOPMENT.md](DEVELOPMENT.md) for local setup and the variable list,
[DEPLOY_FLY.md](DEPLOY_FLY.md) for the proposal to leave Cloudflare.*
