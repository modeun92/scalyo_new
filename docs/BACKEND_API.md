# Serverless back end — Cloudflare Pages Functions

Root: `app-v2/frontend/functions/api/`. Every file that is not prefixed with `_` is an
HTTP route; `_`-prefixed folders are shared code and are not routable.

```
functions/api/
├── _middleware.js        CORS + error envelope for every /api/*
├── _config/              env config, plans, prices, crypto, integrations catalog
├── _i18n/                server-side message catalog (FR/EN/KO)
├── _modules/             one AI module handler per product surface
├── _prompts/             the system prompt of each AI module
├── _providers/           Mistral / DeepSeek transport
├── _services/            auth, ai, context, anonymize, quota, rate-limit
├── _utils/               response envelope, validation, Supabase + Stripe helpers
└── *.js, */*.js          the routes below
```

## Middleware

`_middleware.js` answers CORS preflight and adds CORS headers to every response. The
allow-list is `scalyo.app`, `www.scalyo.app`, `preprod.scalyo.app`,
`scalyo-app.pages.dev` and its preview subdomains.

## Endpoints

### AI

| Route | Method | Notes |
|---|---|---|
| `/api/ai` | POST | The single AI entry point (9-step pipeline, see [ARCHITECTURE.md](ARCHITECTURE.md)) |
| `/api/coach` | POST | Coach-specific entry kept for compatibility |
| `/api/usage` | GET | Current AI usage / quota |

Modules registered in `_modules/index.js`: `coach`, `nova`, `wellbeing`, `import`,
`matrix`, `copil`, `playbook`, `email`, `dashboard`, `notif`. The `wellbeing` handler is
inlined in `index.js` — Cloudflare Pages does not reliably resolve newly added module
files, so a fallback also exists inside `ai.js`.

### Billing and plans

| Route | Method | Notes |
|---|---|---|
| `/api/billing` | GET | The **only** source of subscription amounts. The server decides role, source (real Stripe data if subscribed, otherwise price table × seats), currency, and returns amounts in the major unit. Members/viewers get plan and seats but **no amount**. |
| `/api/stripe/portal` | POST | Creates a Stripe Billing Portal session |
| `/api/stripe-webhook` | POST | Verifies the HMAC signature, provisions plan + seats on `profiles` **and** `organizations` |
| `/api/subscribe` | POST | Subscription entry point |
| `/api/founding-status` | GET | Remaining "founding" seats (out of 10) |

`_config/prices.js` is the single declaration of prices, in Stripe's smallest unit
(cents for EUR/USD, whole won for KRW, which is zero-decimal). `PRICE_TO_PLAN` used by
the webhook is derived from it. **No price exists on the front end.**

Webhook payloads never include `line_items`, so a checkout with a trial
(`amount_total = 0`) resolves no plan without an expanded re-fetch — hence the API call
inside the handler. `customer` and `subscription` are always written even when the plan
stays unresolved, so `customer.subscription.updated` can catch up later.

### Team, seats and invitations

| Route | Method | Notes |
|---|---|---|
| `/api/members` | GET | Members + pending invitations. Invitation **tokens are only exposed to owner/admin** — a member must not be able to copy a pending invitation link. |
| `/api/members/[id]` | DELETE | Remove a member. Stripe **before** any write, fail-closed, `proration_behavior: 'none'`. |
| `/api/invite` | POST | Send an invitation; grants and bills the seat immediately; rolls back on Stripe failure; returns `email_sent`. |
| `/api/invitations/[id]` | DELETE | Revoke a pending invitation and free the seat, same fail-closed doctrine. |
| `/api/invite/verify` | GET | Public: validate an invitation token |
| `/api/invite/accept` | POST | Hard refusal if the target email is not the logged-in account (D1①) or if the account already belongs to another org (D2①). Idempotent when already a member. Never an implicit overwrite of `profiles.organization_id`. |
| `/api/alpha/verify` | POST | Validate a promo/alpha code |
| `/api/alpha/activate` | POST | Create the org from a promo code; the first 10 companies are flagged `is_founding` |

### Email (Resend)

| Route | Method | Notes |
|---|---|---|
| `/api/email` | POST | Send through the organization's Resend key (Elite plan) |
| `/api/email/config` | GET / POST / DELETE | Server-side custody. The key is encrypted with AES-256-GCM and is **never returned to the client, in any form**. |
| `/api/email/test` | POST | Tests the key server-side; the browser never calls `api.resend.com`. |
| `/api/notify-feedback` | POST | Called by a Supabase Database Webhook on insert into `alpha_feedback` |

### Integrations

| Route | Method | Notes |
|---|---|---|
| `/api/integrations/connect` | GET | Start an OAuth flow |
| `/api/integrations/callback` | GET | OAuth callback |
| `/api/integrations/config` | POST | Manual configuration; secret fields (`api_key`, `webhook_url`) are encrypted before storage. A webhook URL is treated as a credential — it is a write capability. |

The Integrations module is currently **hidden** in the product (the route redirects to
the dashboard); the code is kept dormant.

### Account and GDPR

| Route | Method | Notes |
|---|---|---|
| `/api/export` · `/api/account/export` | GET | Right to portability (Art. 20) — full JSON export |
| `/api/users/me` · `/api/account/delete` | DELETE / POST | Right to erasure (Art. 17) |
| `/api/health` | GET | Health probe |

## Shared services

### `_services/auth.service.js`

`extractLang` reads `Accept-Language` (fr / en / ko). `extractAuth` pulls the bearer
token. `verifyJwt` validates it against `GET /auth/v1/user`, which handles both HS256 and
ES256 without the Function having to hold a signing secret.

### `_services/rate-limit.service.js`

10 requests / minute / user, stored in a `Map` inside the Worker isolate. It resets on a
cold start, which is acceptable for this purpose, and self-cleans stale windows.

### `_services/quota.service.js`

Only `coach` and `nova` have quotas; every other AI module is unlimited. Usage rows are
written to `ai_usage` with the user's JWT, and the daily count is read back the same way.

### `_services/context.service.js` — LYO-CONTEXT

Builds the portfolio context injected into all AI modules.

- **Scope = the real RLS of `clients`** (org-wide `SELECT`). There is no `user_id` filter
  in this service; RLS decides, so the context is exactly what the Portfolio screen shows.
- **GDPR minimization**: an explicit column list (never `select=*`), never notes, never
  emails or phone numbers, and capped list lengths so the prompt stays readable on a
  portfolio of 350+ accounts.
- Health thresholds **mirror** `src/lib/health.js`. Parity is mandatory: a change must be
  made in both files.
- A failed read produces an **empty** context ("no data loaded"), never `"0 clients"`.
- Portfolio statistics exclude prospects; a past renewal date is reported as *overdue*,
  not as an upcoming renewal.
- If an account name from the portfolio (≥ 3 characters) appears in the question, that
  account's real data is injected and is authoritative against figures the user asserts.

### `_services/anonymize.js`

The GDPR link of the non-EU fallback. Two layers: it strips the structured portfolio
context block (headers and their `- …` lines), then scrubs universal PII (emails,
amounts, dates, phone numbers) from what remains, including the user's own question.

**Any block header added to `context.service.js` must be added to `DATA_HEADER` here.**

### `_services/ai.service.js`

Switches to DeepSeek **only on a total Mistral outage** — timeout, network error, or a
server 5xx. Never on 429 (quota) and never on any other 4xx. Anonymization is mandatory
before any send outside the EU.

### `_utils/response.js`

`jsonOk` / `jsonError`. Errors carry a **stable machine code** plus the details the front
end needs to compose a message (organization name, targeted address, …); translation
happens on the client, which knows the user's language. `error` is still filled with the
code so existing callers keep working.

Exception messages are never forwarded to the client.

### `_utils/stripe.js`

Seat quantity synchronization. `create_prorations` when adding (billed immediately),
`none` when removing (no credit, new quantity applies at the next renewal).

### `_config/index.js`

`getConfig(env)` reads everything from the environment. `SUPABASE_URL` and
`SUPABASE_ANON_KEY` are **required** — the function throws when they are missing. There
is no hard-coded fallback any more: a pre-prod deployment missing `SUPABASE_URL` used to
silently fail over to the **production** database (ENV-FALLBACK-PROD).

## A recurring trap: Cloudflare and 5xx

Cloudflare replaces the body of a Pages Function's 5xx with its own HTML page, so an
application message never reaches the client. Endpoints therefore return a **typed 409**
where a 502 would be natural — see the `CF-502-MASQUE` comments in `invite.js`,
`invitations/[id].js` and `members/[id].js`.
