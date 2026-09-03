# Architecture

## Runtime topology

```
                    ┌──────────────────────────────────────────┐
   Browser  ───────►│ Cloudflare Pages                         │
   (Vue SPA)        │  • static SPA (dist/)                    │
        │           │  • Pages Functions  /api/*   (Workers)   │
        │           └───────┬──────────────────────┬───────────┘
        │                   │ service_role         │ user JWT
        │                   ▼                      ▼
        │           ┌───────────────┐      ┌──────────────────┐
        └──────────►│   Supabase    │      │ Mistral (EU)     │
      anon key +    │  Postgres+RLS │      │ DeepSeek (fallb.)│
      user JWT      │  GoTrue       │      └──────────────────┘
                    │  Realtime     │      ┌──────────────────┐
                    │  Storage      │      │ Stripe / Resend  │
                    │  Edge Funcs   │      └──────────────────┘
                    └───────────────┘
```

Two independent Supabase projects exist: **pre-prod** and **prod**. Migrations are
applied pre-prod first, then prod, with an explicit go/no-go per step (see the header
comment of any file in `supabase/migrations/`).

## Three ways the browser reaches data

1. **Direct Supabase, gated by RLS.** Most reads and writes go through
   `@supabase/supabase-js` with the anon key and the user's JWT. Row Level Security is
   the authorization layer — there is no server-side permission check in this path.
   See [DATABASE.md](DATABASE.md).
2. **Pages Functions with the user's JWT.** Endpoints that need to read data *exactly
   as the user sees it* (for example the AI portfolio context) forward the user JWT and
   the anon key to PostgREST, so RLS still decides.
3. **Pages Functions with `service_role`.** Reserved for operations the client must not
   be able to perform: Stripe provisioning, seat accounting, invitation acceptance,
   secret custody (Resend / integration credentials), GDPR export and deletion.

The rule that follows from this: **anything a user must not be able to grant themselves
lives behind a Pages Function**, and the corresponding columns are revoked from the
`authenticated` role in SQL (`supabase/migrations/20260705230000_secrets_and_org_rls.sql`,
`20260704190000_protect_billing_fields.sql`, `20260708220000_org_plan_source.sql`).

## Request flow — an AI question

`functions/api/ai.js` is the single AI entry point and runs nine ordered steps:

1. **Auth** — `verifyJwt` calls `GET /auth/v1/user` on Supabase (handles HS256 and ES256).
2. **Rate limit** — 10 requests / minute / user, in-memory per Worker isolate
   (`_services/rate-limit.service.js`).
3. **API key check** — 503 `ai_not_configured` when `MISTRAL_API_KEY` is absent.
4. **Validation** — module whitelist, message length (4000), history length (10)
   (`_utils/validate.js`).
5. **Plan gating** — `isModuleAllowed(plan, module)` from the shared plan config.
6. **Quota** — only `coach` and `nova` consume quota; usage rows land in `ai_usage`.
7. **Module handler** — `_modules/<name>.module.js` builds the system prompt from
   `_prompts/<name>.prompts.js` plus the portfolio context.
8. **Provider call** — Mistral first; DeepSeek only on a *total* Mistral outage
   (timeout, network error, 5xx — never on 429), and only with an anonymized prompt.
9. **Usage log** — non-blocking via `context.waitUntil`.

The portfolio context (`_services/context.service.js`) is built server-side with the
**user's JWT**, so it can never contain more than the Portfolio screen shows. It applies
GDPR minimization: an explicit column list, no notes and no contact details, and capped
list lengths.

## Request flow — a paid seat

Inviting a member is modeled on GitHub: the seat is granted *and billed* at invitation
time, not at acceptance.

```
POST /api/invite
  → count committed seats (non-viewer members + pending non-viewer invitations)
  → check the plan ceiling
  → INSERT invitations
  → Stripe: subscription item quantity +1, create_prorations
      └─ failure ⇒ roll back the invitation (never an unbilled seat)
  → organizations.seats_paid = committed seats
  → Resend: send the email; `email_sent` is returned so the UI never claims a false success
```

Removal is the mirror image and is **fail-closed**: Stripe is called *before* any
database write, with `proration_behavior: 'none'` (no credit, effect at renewal). If
Stripe fails, nothing is removed — see `functions/api/members/[id].js` and
`functions/api/invitations/[id].js`.

## Request flow — payment

Scalyo uses Stripe **Payment Links** rather than a server-created checkout session.
`src/config/stripeLinks.js` is the single source of the three links; they are injected
at build time per environment and a runtime guard refuses to serve a *live* link from a
non-production host. `client_reference_id` is appended to the link — it is the only key
the webhook has to map a Stripe customer back to a Scalyo user.

`functions/api/stripe-webhook.js` verifies the HMAC signature and, with `service_role`,
writes **both** `profiles` and `organizations` — the organization is the single source of
the effective plan, so writing only the profile would leave the owner's members gated on
`starter`.

## SEO topology

The landing page is a single Vue view served at three URLs (`/`, `/en`, `/ko`). Because
an SPA route only gives crawlers the static `<head>` of `index.html`,
`scripts/build-blog.js` post-processes `dist/` at build time to produce per-language
variants with their own `<title>`, description, canonical, `og:*`, reciprocal `hreflang`
and a `FAQPage` JSON-LD block. The strings come from `src/i18n/landing.js` — the same
source the runtime uses — so the served head and the hydrated body can never disagree.

A substitution that fails to find its target aborts the build on purpose: a silently
unsubstituted tag would ship a French canonical on the Korean page.

`public/_headers` adds `X-Robots-Tag: noindex, follow` to the application and
transactional surfaces; `public/robots.txt` deliberately does **not** `Disallow` them,
because a `Disallow` would stop Googlebot from ever reading the `noindex`.

## Deployment

- Cloudflare Pages builds `app-v2/frontend` with `npm run build`
  (`vite build && node scripts/build-blog.js`).
- Pages Functions in `functions/api/**` are deployed with the same build, so the front
  end and the back end always ship together. This is why internal identifiers shared
  across the boundary (AI module names, plan module keys) can be renamed safely.
- Two GitHub Actions workflows exist upstream (`deploy-preprod.yml`, `deploy.yml`); they
  inject the Stripe links and the Supabase keys as build-time `VITE_*` variables. They
  are not part of this snapshot.
