# Security and privacy

See also `app-v2/frontend/functions/api/_config/SECURITY.md` for the operational
environment-variable table.

## Trust model

| Actor | Credential | What it can reach |
|---|---|---|
| Browser | Supabase anon key + user JWT | Only what RLS allows |
| Pages Function (user path) | anon key + the caller's JWT | Same as the browser, by construction |
| Pages Function (admin path) | `service_role` | Everything — used only for provisioning, seat accounting, invitation acceptance, secret custody, GDPR export/erasure |
| Edge Function | `service_role` | Webhooks, scheduled jobs, email sending |

The rule: **anything a user must not be able to grant themselves is behind a Pages
Function**, and the matching columns are revoked from `authenticated` in SQL.

## Secret custody

No real secret is hard-coded anywhere in the tracked source. The only key present in the
front-end bundle is the Supabase **anon** key, which is public by design and constrained
by RLS.

| Secret | Where it lives | Client access |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Cloudflare env | none |
| `SUPABASE_JWT_SECRET` | Cloudflare env | none |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Cloudflare env | none |
| `MISTRAL_API_KEY`, `DEEPSEEK_API_KEY` | Cloudflare env | none |
| Resend key (per organization) | `org_email_config`, AES-256-GCM | **never returned, in any form** |
| Integration credentials | `org_integrations`, AES-256-GCM | revoked at the column level |

`_config/crypto.js` provides the AES-256-GCM helpers. A column-level `REVOKE` alone would
be ineffective while a table-level `GRANT` exists, so the migrations `REVOKE` the table
and re-`GRANT` only the safe columns.

Two closed leaks worth remembering (`20260705230000_secrets_and_org_rls.sql`):

- an RPC returned `resend_api_key` straight to the browser (it was granted to `anon` and
  `authenticated`);
- `org_integrations.access_token / refresh_token / config` travelled down to the DOM.

The browser also never calls `api.resend.com` directly any more — testing a key is a
server-side `POST /api/email/test`.

## No hard-coded environment fallback

`functions/api/_config/index.js` and `src/lib/supabase.js` **throw** when `SUPABASE_URL`
or `SUPABASE_ANON_KEY` is missing. There used to be a constant fallback pointing at the
production project, so a pre-prod deployment missing its variables silently wrote to the
**production** database. Failing loudly is the intended behaviour (ENV-FALLBACK-PROD).

## Self-grant protection

Triggers block the `authenticated` role from writing billing columns:

- `protect_billing_fields` on `profiles` — provisioning goes exclusively through the
  Stripe webhook (`service_role`, unaffected).
- `protect_org_billing_fields` on `organizations` — before it existed, the owner-scoped
  `org_manage` policy covered *all* columns, which allowed a client-side self-grant of
  `organizations.plan`.
- The same trigger also protects `oxygen_team_enabled`, so the team well-being gate can
  never be turned on from the client.

`profiles.trial_used` and `trial_started_at` stay client-writable: they are legitimately
written by `auth.js` (`startTrial`, `fetchProfile`). Trial-extension abuse is a known,
separately tracked finding.

## Authentication

- Supabase GoTrue. JWTs are validated server-side through `GET /auth/v1/user`, which
  handles both HS256 and ES256 without the Function holding a signing secret.
- The Supabase client is created **without any `lock` option** — see
  [FRONTEND.md](FRONTEND.md) for why a custom lock reintroduces a total per-tab freeze.
- `onAuthStateChange` callbacks are synchronous; no awaited Supabase call may happen
  inside one.
- Password change verifies the current password truthfully by re-running
  `signInWithPassword` for the same user (GoTrue v2 exposes no dedicated reauth), then
  calls `updateUser`. Errors are mapped by their real cause.
- `LoginView` honours `?redirect=` for the invitation flow, but only for **internal
  paths** — a `//` or an absolute URL would be an open redirect.

## Invitations

The invitation token is a capability, and it is handled as one:

- `/api/members` only exposes tokens to `owner` and `admin`. A member must not be able to
  copy a pending invitation link (seat hijacking).
- Acceptance is **an explicit click**, never a side effect of the next login. The token no
  longer sleeps in the browser waiting to be replayed.
- The server refuses hard when the invitation targets a different email than the logged-in
  account, and refuses explicitly when the account already belongs to another
  organization. `profiles.organization_id` is never implicitly overwritten — a token left
  behind by a failed sign-up used to silently switch the *next* user's organization.
- Both checks exist client-side (to display the refusal before any call) and server-side
  (the authority).

## AI and data residency

- **Mistral (Paris, EU)** is the nominal provider. Data does not leave the EU on this
  path.
- **DeepSeek** is an emergency fallback only, called on a *total* Mistral outage
  (timeout, network error, 5xx — never on 429 or any other 4xx), and only with an
  anonymized prompt.
- `_services/anonymize.js` removes the structured portfolio block (account names, ARR,
  renewal dates, tasks) and scrubs universal PII from what remains, including the user's
  free-typed question. **Every block header introduced in `context.service.js` must be
  registered there.**
- The AI context is built with the **user's JWT**, so it can never see more than the user
  does, and it applies GDPR minimization: explicit columns, never notes, never emails or
  phone numbers, capped list lengths.
- DeepSeek is never named in the front end.

## Well-being data

The Oxygen tables are **self-only** at the RLS level: no one — not a manager, not an
owner — can read another user's rows directly.

The single aggregation path is `oxygen_team_aggregate()`:

- `SECURITY DEFINER`, because the underlying tables are self-only;
- **owner-only** caller guard;
- a **literal** `n ≥ 5` threshold in the body, deliberately not parameterizable;
- fail-closed behind `organizations.oxygen_team_enabled`, which defaults to `false` and
  can only be enabled by an SQL update after a legal (DPIA) review;
- returns team averages over a 14-day window plus a trend — **no individual data**.

The manager panel displays the privacy contract on screen at all times, in every state.
There is no ranking, nothing individual, and no time-spent metric.

## GDPR endpoints

| Right | Endpoint |
|---|---|
| Portability (Art. 20) | `GET /api/export`, `GET /api/account/export` — full JSON export |
| Erasure (Art. 17) | `DELETE /api/users/me`, `POST /api/account/delete` |

The chat store also implements an Art. 17 path for a user's messages. The DPA is served
publicly at `/dpa` (`src/i18n/dpa.js`).

## XSS

Any `v-html` that renders user- or AI-generated content goes through
`src/utils/sanitize.js`: a small markdown renderer (headings capped at the tags DOMPurify
allows, separators, lists, bold, inline code) followed by DOMPurify. Static i18n
translations do not need it.

Values interpolated into transactional email bodies are HTML-escaped — organization names
are user input.

## Transport and headers

CORS is allow-listed in `_middleware.js` to the Scalyo domains and the Pages preview
subdomains. HTTPS is enforced by Cloudflare. `public/_headers` adds
`X-Robots-Tag: noindex, follow` to `/app/*` and the transactional surfaces.
