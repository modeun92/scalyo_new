# The business, reconstructed from the code

## Method

This document is derived **only from executable logic and data structures**: schema and
RLS policies, Pinia store computeds, plan and price configuration, the Stripe webhook,
seat accounting, gating checks, quota services, and the catalogs that shape the data model.

Deliberately **not used as evidence**: the landing page copy (`src/i18n/landing.js`), the
Terms / Privacy / DPA texts (`src/i18n/legal.js`, `src/i18n/dpa.js`), the press kit
(`public/presse/`), blog articles, AI system prompts, and any other prose that describes
the business rather than implementing it.

The consequence is worth stating plainly: what follows is what the software **does**, not
what the company **says**. Where the two would differ, only the first is recorded here.

---

## 1. What the software is, from the data model

The schema defines one root tenant and one root business object.

**Tenant** — `organizations`, with `organization_members` (unique on the
`(organization_id, user_id)` pair) and `profiles.organization_id`. Every non-personal
table is scoped to it. The tenant, not the user, carries `plan`, `seats_paid`,
`stripe_subscription_id` and `trial_ends_at`. **The buying unit is a company, not an
individual.**

**Root object** — `clients`, whose columns are the whole thesis:

```
name · industry · arr · mrr · health (0–10) · nps · status · churn_risk
renewal_date · csm_id · lifecycle('prospect'|'client') · pipeline_stage · churned_at
contacts (jsonb) · organization_id
```

Nothing here describes a sale being *made*. `arr`, `mrr`, `renewal_date`, `churn_risk`
and `churned_at` describe a contract already signed and the question of whether it will
survive. The object is a **revenue relationship under management**, and every derived
computed in `stores/clients.js` measures its survival: `arrAtRisk`, `criticalCount`,
`watchCount`, `healthyCount`, `renewalsNext30`, `avgHealth`, `avgNps`.

Seven satellite tables hang off that root, and they say what the work consists of:

| Table | What it implies the job is |
|---|---|
| `client_notes` | Logging calls, emails and meetings against an account |
| `client_metrics` | Entering one manual measurement per (client, KPI, month) |
| `playbooks` | Running a dated, multi-step intervention on an account |
| `planning_events`, `tasks`, `projects` | Scheduling and executing the follow-up work |
| `copils` | Building a deck to present results **to** that account |
| `quotes` | Pricing a renewal or an expansion |
| `oxygen_*` | Measuring the load on the person doing all of the above |

**Derived conclusion:** this is post-sale revenue retention software. The unit of work is
an existing account; the unit of value is that account not churning.

### The prospect branch is subordinate, by construction

`lifecycle` admits `'prospect'`, and `PIPELINE_STAGES = ['new','contacted','qualified','won','lost']`
exists. But the code systematically excludes prospects from everything that matters:

- `clientsOnly` (prospects filtered out) is the base for `totalArr`, `totalMrr`,
  `avgHealth`, `avgNps`, every status counter and `arrAtRisk`.
- The alert generator hard-returns on `lifecycle === 'prospect'` — "churn/nps/renewal make
  no sense before signing."
- The database client quota (`check_client_limit`) does not count prospects at all.
- `clientToDb` auto-converts: a prospect whose stage becomes `won` is rewritten as a
  `client`, and a client can hold no pipeline stage.

So the pipeline is a **pre-registration funnel that terminates at the first contract**, not
a sales CRM. The software's economics start where the pipeline ends.

---

## 2. Who the buyer is, from the taxonomies and the permission matrix

`src/config/kpis.js` carries 53 KPIs in 11 categories, each tagged with the roles and
sectors it serves. (An earlier count of "64" here summed the 53 KPIs and the 11 category
rows.) Their labels live in i18n under `kpi_library_<id>` / `kpi_library_category_<id>`.
Counting the tags is the cleanest available description of the target user:

| Role tag | KPIs |
|---|---|
| `manager` | 41 |
| `csm` | 32 |
| `commercial` | 20 |
| `kam` | 14 |
| `support` | 6 |

| Sector tag | KPIs |
|---|---|
| `b2b` | 45 |
| `b2c` | 27 |
| `saas` | 25 |
| `ecommerce` | 4 |
| `retail` | 3 |
| `marketplace` | 2 |

The KPI categories are weighted the same way: `revenue` 9, `retention` 7, `acquisition` 6,
`satisfaction` 5, `activation` 5, `team` 5, `expansion` 4, `support` 3, `engagement` 3,
`ecommerce` 3, `projects` 3. Ten of the 53 are marked `inverse: true` — lower is better —
and every one of those is a churn, risk or cost metric.

`ROLES` in `plans.config.js` defines four levels with a full read/write matrix over eleven
entities:

| Role | Level | Consumes a seat | Invite | Revoke | Change roles | Billing |
|---|---|---|---|---|---|---|
| `owner` | 100 | yes | yes | yes | yes | manage |
| `admin` | 50 | yes | yes | yes | no | view only |
| `member` | 10 | yes | no | no | no | none |
| `viewer` | 1 | **no** | no | no | no | none |

`member` writes `own` and reads `all` on client data; `viewer` reads `all` and writes
nothing. A dedicated non-billable read-only role exists — which only makes economic sense
if someone outside the CS team (an executive, a stakeholder) needs to look at the data
without operating it.

**Derived conclusion:** the buyer is a **managed B2B/SaaS Customer Success team**, bought
by a manager or owner, staffed by CSMs and KAMs, with commercial and support roles as
secondary audiences and free spectator access for stakeholders.

### The differentiator is visible in the schema, not just in the feature list

Three tables — `oxygen_checkins`, `oxygen_daily`, `oxygen_recoveries` — measure the
**operator**, not the account. They are self-only under RLS, and the single aggregation
path is a `SECURITY DEFINER` function with a hard-coded `n ≥ 5` floor, an owner-only
caller guard, and a fail-closed organization flag defaulting to `false`.

No competitor feature parity claim is needed to see the intent: the product treats CSM
workload as a first-class measured object, and it spent schema, RLS, a definer function
and a legal gate on protecting it. `oxygenLoad.js` even derives the load *from the
portfolio itself* — critical accounts × 20 (cap 40), renewals ≤ 30 d × 10 (cap 30),
overdue tasks × 5 (cap 15), churn/NPS alerts ≤ 7 d × 5 (cap 10), active playbooks × 2.5
(cap 5) — so the two halves of the product are wired to each other.

---

## 3. The monetization machine

Only three code paths move money, and together they fully specify the revenue model.

### The price table

`functions/api/_config/prices.js`, in Stripe's smallest unit:

| Plan | `eur` | `usd` | `krw` |
|---|---|---|---|
| starter | 7900 | 8900 | 139000 |
| growth | 11900 | 13900 | 209000 |
| elite | 15900 | 18900 | 279000 |

`MINOR_UNITS = { eur: 100, usd: 100, krw: 1 }`, so the major-unit grid is 79/119/159 EUR,
89/139/189 USD, 139,000/209,000/279,000 KRW. `BILLING_INTERVAL = 'month'`.
`DEFAULT_CURRENCY = 'eur'`.

`enterprise` **has no row in the table**. `tableBilling()` returns `unit_amount: null` and
`total: null` for it, and `PLANS.enterprise.maxSeats` is `null`. Enterprise is therefore
not a price — it is a code path that declines to compute one. Structurally, it is
quote-based.

### The billing formula

`functions/api/billing.js` is the only place an amount is produced:

```
seats  = organizations.seats_paid ?? 1
amount = pricesFor(account_currency).prices[plan] × seats     (no Stripe subscription)
       | Stripe subscription item unit_amount × quantity      (subscription present)
```

Three properties fall out of that code:

1. **The currency is a property of the account**, resolved by `normalizeCurrency` from
   the account record, not from the display locale. `lib/formatters.js` enforces the same
   rule on the client with zero conversion.
2. **`can_view_amounts = canPerform(role, 'canViewBilling')`.** A `member` or `viewer`
   receives `source: 'none'` and no amount at all. Price visibility is a role permission.
3. **Stripe is authoritative when present.** The endpoint returns
   `plan_mismatch: stripe.plan !== orgPlan` rather than silently trusting the local record.

### Seat accounting — billed at invitation, not at acceptance

`functions/api/invite.js` and `functions/api/members.js` compute the same quantity:

```
seatsCommitted = organization_members.filter(role !== 'viewer').length
               + invitations.filter(status='pending' && role !== 'viewer').length
```

`invite.js` then, in order: checks `canAddSeat(plan, seatsCommitted)`, inserts the
invitation, calls Stripe with `quantity = seatsCommitted + 1` and
`create_prorations`, and — if Stripe fails — **deletes the invitation it just created**.
`organizations.seats_paid` is only written after Stripe agrees.

The inverse operations (`members/[id].js`, `invitations/[id].js`) call Stripe **before**
any database write, with `proration_behavior: 'none'`.

**Derived conclusion:** revenue recognizes on *reserved capacity*, not on usage or on
activation. Upgrades are charged instantly and prorated; downgrades take effect at
renewal with no credit. A `viewer` is free by design and is the only role that is.

So:

```
MRR = Σ over organizations: price[plan][account_currency] × (non-viewer members + pending non-viewer invitations)
```

### Subscription lifecycle

`functions/api/stripe-webhook.js` handles exactly three events —
`checkout.session.completed`, `customer.subscription.updated`,
`customer.subscription.deleted` — and each writes **both** `profiles` and
`organizations` (`updateOrgForOwner`).

On `canceled`, `unpaid` or `deleted`, the profile is reset to `plan: null, seats_paid: 0`
while the organization is set to `plan: 'starter', seats_paid: 1`. **Cancellation
downgrades to Starter rather than terminating access.** The comment records the reason:
`organizations.plan` is `NOT NULL`, so `'starter'` is the floor, and a still-valid promo
window carried by `trial_ends_at` is deliberately not touched.

Checkout uses Stripe **Payment Links**, not a server-created session:
`src/config/stripeLinks.js` holds three links injected per environment, appends
`client_reference_id` (the only user-mapping key the webhook has), and refuses to serve a
`live` link from a non-production host. A missing link yields `''` and an inert button.

---

## 4. Entitlement, as three separate enforcement points

`PLANS[plan].modules` is the declared source of gating:

| Plan | Modules |
|---|---|
| starter | coach, nova, wellbeing, dashboard, copil, matrix |
| growth | + import, playbook, resources, **oxygen_team*** |
| elite | + email, notif, okr, roadmap |
| enterprise | same set as elite |

\* see the drift finding in §7.

Alongside it, `functions/api/_config/plans.js` carries the metered limits:

| | starter | growth | elite | enterprise |
|---|---|---|---|---|
| AI calls / day / user / module | 35 | 100 | 200 | −1 (unlimited) |
| `maxUsers` | 3 | 7 | 24 | −1 |
| `maxClients` | 50 | −1 | −1 | −1 |

Only `coach` and `nova` are in `QUOTA_MODULES` — every other AI module is declared with a
quota that is never checked and never logged. Rate limiting is separate and flat:
**10 requests/minute/user**, in-memory per Worker isolate.

Feature flags (`PLANS[plan].features`) are a 22-key map, but only four keys are ever read:
`advancedDashboardKpis` (three views), `aiEmailStudio` (one view), and
`unlimitedViewers` (inside `canAddViewer` / `getAvailableRolesForInvite`). The other
eighteen — SSO, dedicated API, priority support, compliance audit, tailored onboarding,
manual playbooks, OKR tracker, product roadmap and so on — are **declared but never
consulted by any code path**. Whatever they represent, it is delivered by humans or not at
all.

### Client quota is the one limit enforced in the database

`check_client_limit()` (trigger `enforce_client_limit`, `SECURITY DEFINER`) reads
`organizations.plan`, falls back to `profiles.plan`, counts by `organization_id`, and
skips prospects. Everything else — seats, modules, AI quota — is enforced in application
code only.

---

## 5. Operating policies the code actually enforces

These are policies in the strict sense: rules the machine applies without asking anyone.

| Policy | Mechanism |
|---|---|
| **The organization grants access, not the profile** | `auth.js: orgGrantsAccess = org.stripe_subscription_id \|\| isOnBetaAccess`. `isOnTrial` and `trialExpired` both consult it, so a member of a paying org never hits the paywall even with a personal trial burned. |
| **Trial is 14 days, once per profile** | `ORG_SETTINGS.trialDays = 14`; `trialDaysLeft = 14 − floor(elapsed days)`; `trialUsed` is a one-way flag set by the webhook on first checkout. |
| **Promo access is time-boxed at the org** | `isOnBetaAccess = !org.stripe_subscription_id && org.trial_ends_at > now`. It is a distinct, org-level entitlement that survives a used personal trial. |
| **Alpha testers bypass the paywall entirely** | `needsPayment = trialExpired && !hasActiveSubscription && !isAlphaTester`. |
| **Unknown plan resolves to the most restrictive** | `effectivePlan = currentPlan \|\| 'starter'`; `modulesFor()` falls back to `PLANS.starter.modules`; `getUserPlan()` returns `'starter'` on any read failure. Gating fails closed. |
| **Invitations expire in 180 days** | `ORG_SETTINGS.invitationExpiryDays = 180`, written explicitly by `invite.js` because the database default is 7. |
| **Invitation tokens are a privileged capability** | `members.js` strips `token` from the payload unless `canPerform(role, 'canInvite')`. |
| **An invitation binds to one email and one org** | `invite/accept.js` refuses when the target email ≠ the logged-in account, and refuses when the account already belongs to another org. `profiles.organization_id` is never implicitly overwritten. |
| **Client data is shared across the whole team** | RLS on `clients`, `client_notes`, `client_metrics` and `quotes` is org-wide for both read **and** write. Deletion stays with the author or the owner. Continuity of service is enforced at the database layer, not by convention. |
| **Well-being data is unreadable by management** | Oxygen tables are self-only. `oxygen_team_aggregate` is owner-only, `SECURITY DEFINER`, fail-closed on an org flag that defaults to `false`, with a **literal** `n ≥ 5` threshold that cannot be parameterized, returning 14-day averages and a trend only. |
| **Payment data never lands in Scalyo** | No card column exists anywhere in the schema. Stripe Payment Links + Billing Portal are the only payment surfaces. |
| **AI context can never exceed the caller's own visibility** | `context.service.js` queries PostgREST with the **user's JWT** and the anon key, so RLS decides; the column list is explicit and excludes notes and contact details; list lengths are capped. |
| **Non-EU AI is a scrubbed emergency path** | `ai.service.js` falls back to DeepSeek only on timeout / network error / 5xx — never on 429 or any other 4xx — and only after `anonymize.js` strips the portfolio block and scrubs emails, amounts, dates and phone numbers, including the user's own question. An empty `DEEPSEEK_API_KEY` disables the path entirely. |
| **Erasure and portability are wired, not promised** | `DELETE /api/users/me`, `POST /api/account/delete`, `GET /api/export`, `GET /api/account/export`. |
| **Secrets are never returned to the browser** | `org_email_config` has no client grant at all; `org_integrations` secret columns are revoked; both are AES-256-GCM encrypted; `/api/email/test` exists so the browser never calls Resend directly. |
| **Plans cannot be self-granted** | Triggers `protect_billing_fields` (profiles) and `protect_org_billing_fields` (organizations) block the `authenticated` role from writing billing columns — and the same trigger protects `oxygen_team_enabled`. |

---

## 6. Geographic and regulatory reach, from the code

`countryLaws.js` is the only place the product encodes jurisdiction, and it encodes six:

| Code | Currency | Tax | Statutory hours/week | Privacy regime |
|---|---|---|---|---|
| FR | EUR | 20 % | 35 | GDPR / CNIL |
| BE | EUR | 21 % | 38 | GDPR / APD |
| CH | CHF | 8.1 % | 42 | nLPD 2023 / PFPDT |
| CA | CAD | 5 % | 40 | PIPEDA + Québec Law 25 |
| US | USD | — | — | CCPA/CPRA |
| KR | KRW | — | — | — |

Two things are notable in that table. First, it carries **labour law** — weekly hours,
daily hours, vacation days, public holidays — which no billing feature needs. It exists
because the workload half of the product has to know what a normal working week is.
Second, every entry carries an `emergencyNumber` (`3114` in France, `143` in Switzerland,
`1-866-APPELLE` in Canada): the product routes a user in distress to a national crisis
line. That is a duty-of-care decision expressed in a config file.

Billing currency support is narrower than jurisdiction support: `PRICES` covers only
`eur`, `usd`, `krw`. A Swiss or Canadian buyer is billed in EUR or USD even though quotes
they issue can be denominated in CHF or CAD.

Interface and server-side messages exist in exactly three locales (`fr`, `en`, `ko`), with
`fr` as the fallback everywhere — `i18n/index.js`, `extractLang()` in the API, and the
deck language selector in COPIL. Korea is a first-class market in the code: it has its own
price row, its own locale, its own font handling in the PPTX export, and Korean-specific
number formatting rules in `fmtCurrency`.

---

## 7. What the code proves is *not* built

Reading only mechanisms makes the gaps visible too.

- **Email metering does not exist.** `EMAIL_FREE_QUOTA = 3000` and
  `EMAIL_OVERAGE_RATE = 1.5` are exported from `emailTemplates.js` and **imported by
  nothing**. `/api/email` checks the plan module and then sends. There is no counter, no
  cap and no overage billing anywhere in the repository.
- **Eighteen of the 22 plan feature flags are inert** (see §4). SSO/SAML, dedicated API,
  priority support, compliance audit and tailored onboarding have no code behind them.
- **AI quotas are declared for ten modules and enforced for two.** `QUOTA_MODULES` is
  `['coach', 'nova']`; `logUsage` returns early for everything else, so the `matrix`,
  `copil`, `playbook`, `dashboard`, `notif`, `import`, `email` and `wellbeing` quota
  numbers in `plans.js` are decorative.
- **Rate limiting is not durable.** It lives in a `Map` inside a Worker isolate and resets
  on every cold start; it is a courtesy limit, not an enforcement mechanism.
- **The Integrations module is disabled.** The route redirects to the dashboard; the OAuth
  and credential-custody code is complete and dormant. No third-party data actually flows
  in, which means every account figure in the product is manually entered or imported.
- **`_future/proactive-agent.config.js` and `_future/autonomous-actions.config.js`** are
  fully specified rule engines that nothing imports.

---

## 8. Contradictions inside the machine

These are inconsistencies between code and code — no marketing text involved. Each is
derivable by reading two files.

| # | Where | What the code says |
|---|---|---|
| 1 | `src/config/plans.config.js:6` vs `functions/api/_config/plans.config.js:5` | The two copies of the "single source" have **already drifted**: `oxygen_team` is in the front-end `MODULES_GROWTH` and absent from the back-end one. Currently harmless (only `ManagerView` reads it, client-side), but the manual-sync invariant is broken. |
| 2 | `functions/api/ai.js:14`, `functions/api/email.js:22`, `functions/api/usage.js:14` vs `src/stores/auth.js` and `check_client_limit()` | **Three enforcement points, two different plan sources.** The front end and the SQL trigger read `organizations.plan` with a profile fallback; `/api/ai`, `/api/email` and `/api/usage` read `profiles.plan` only, defaulting to `'starter'`. A member of a paying Elite org whose own `profiles.plan` is null sees every module unlocked in the UI, can create clients past the Starter cap, and is **403'd by the AI and email endpoints**. This is the exact bug class that migration `20260711210000` fixed for the client limit and that `PAYWALL-MEMBER` fixed for the paywall — the API endpoints were never brought in line. |
| 3 | `src/stores/notifications.js:191` vs `src/stores/team.js:77` | The burnout rule is `if (member.wellbeingScore < 55 \|\| member.workload > 85)`. `team.members` always carries `wellbeingScore: null, workload: null` (B-09: no real source exists). `null < 55` coerces to `0 < 55` → **true**, so a burnout alert is generated for **every team member**, with the body rendering `bien-être null/100`. This directly violates the `R21` "never invent a value" doctrine the rest of the code enforces. |
| 4 | `functions/api/_config/plans.js` `QUOTAS` vs `_services/quota.service.js` `QUOTA_MODULES` | Eight of the ten quota entries per plan are never read (see §7). |
| 5 | `src/components/email-studio/emailTemplates.js:5-6` | Two exported pricing constants with zero importers (see §7). |
| 6 | `functions/api/invite.js:56` vs the `invitations` table default | `ORG_SETTINGS.invitationExpiryDays = 180`, but the column default is 7 days. The two only agree because the Function writes `expires_at` explicitly; any other insert path expires in a week. |
| 7 | `handleSubscriptionUpdated` in `stripe-webhook.js` | On cancellation the profile is set to `plan: null, seats_paid: 0` while the organization is set to `plan: 'starter', seats_paid: 1`. The same account then reports different plans depending on which record is read — and `auth.js currentPlan` prefers the organization, so the user lands on Starter, not on nothing. Intentional, but the two records are permanently inconsistent after a cancellation. |
| 8 | `src/i18n/legal.js`, `fr` object | `cgu_s11`–`cgu_s14` and `priv_s11`–`priv_s13` are each declared **three times**. Last-one-wins makes the rendered output correct; the first two copies are unreachable, and editing one has no effect. |

---

## 9. Summary

Reading only the executable parts, Scalyo is:

- a **multi-tenant B2B SaaS**, sold to a company (`organizations`), not to an individual;
- a **post-sale revenue-retention system** whose root object is a signed account and
  whose every aggregate measures that account's survival;
- **billed per reserved non-viewer seat, per month**, in one of three currencies attached
  to the account, through Stripe Payment Links, with capacity charged at invitation and
  released at renewal;
- **gated by a per-plan module list** with a 14-day trial, an org-level promo window, an
  alpha bypass, and a cancellation path that lands on Starter rather than on lockout;
- **operated by a CS team** of owner / admin / member roles with a free read-only viewer
  seat for stakeholders;
- and distinguished, in schema and in RLS rather than in prose, by **measuring the
  operator alongside the account** — with the operator's data made structurally
  unreadable by their own management.

The revenue equation the code implements, in full:

```
MRR = Σ organizations [ PRICES[account_currency][organizations.plan]
                        × (non-viewer members + pending non-viewer invitations) ]
```

Everything else in the repository exists to make that sum stop shrinking.
