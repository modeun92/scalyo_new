# The business

Everything below is derived from the code in this repository — the landing copy
(`src/i18n/landing.js`), the plan configuration (`src/config/plans.config.js`), the price
table (`functions/api/_config/prices.js`), the legal texts (`src/i18n/legal.js`,
`src/i18n/dpa.js`) and the press kit (`public/presse/index.html`). Where the code
contradicts the published copy, it is flagged in
[Discrepancies to resolve](#discrepancies-to-resolve).

## What Scalyo sells

**Scalyo is a B2B SaaS Customer Success platform**, sold per seat, per month, to
Customer Success teams — CSMs, KAMs, CS managers — in B2B SaaS and adjacent industries.

The official self-description from the press kit:

> Scalyo is a B2B Customer Success platform that helps CS teams steer their accounts and
> their team: client portfolio and health scores, KPIs, retention playbooks, planning and
> tasks, AI agents, and monitoring of Customer Success Managers' well-being. The platform
> is natively multilingual — French, English and Korean.

### Company

| | |
|---|---|
| Name | Scalyo (operated by Stratima Agency; the legal texts also refer to "Scalyo SAS") |
| Founder / CEO | Lidia Chikhoune, a former Customer Success Manager |
| Category | B2B SaaS — Customer Success platform |
| Site / app | `scalyo.app` / `app.scalyo.app` |
| Languages | French, English, Korean (native, not an afterthought) |
| Markets | Francophone (FR, BE, CH, QC), Anglophone, Korean |
| Hosting | European Union |
| Contact | `contact@scalyo.app` · support `support@scalyo.app` · DPO `dpo@scalyo.app` |

### The positioning

Two claims carry the whole go-to-market:

1. **Churn prevention, 30 days ahead.** Health scores, predictive alerts and playbooks
   tell a CSM which account to act on and when.
2. **The only CS platform that also measures the CSM.** The founding conviction, stated
   in the press kit, is *"an exhausted CSM saves no client."* Where competing tools
   measure account performance, Scalyo also measures the load on the people handling
   those accounts. This is the Oxygen module, and it is the explicit differentiator.

Scalyo positions itself as **complementary to a CRM**, not a replacement: the CRM owns the
sales pipeline, Scalyo owns retention and the post-sale relationship (FAQ 7).

### Claimed outcomes — stated as targets, not averages

The landing page advertises −34 % churn, +18 % NRR, 6 hours saved per CSM per week, and a
30-day head start on churn. The copy is careful and the wording is worth preserving:

> Product targets, not observed averages. Scalyo measures these four indicators in your
> dashboard — your figures replace ours from the first month.

That disclaimer (`stats_note`) is a compliance-relevant piece of copy. It should not be
removed or softened without a deliberate decision.

## Pricing

Four plans, billed **per seat per month**, no commitment, cancellable at any time.
Payment is by Stripe Payment Link; Scalyo never sees card details.

| Plan | EUR | USD | KRW | Seats | Clients |
|---|---|---|---|---|---|
| Starter | 79 | 89 | 139,000 | 3 | 50 |
| Growth | 119 | 139 | 209,000 | 7 | unlimited |
| Elite | 159 | 189 | 279,000 | 24 | unlimited |
| Enterprise | quote-based | quote-based | quote-based | unlimited | unlimited |

Prices are declared once, in Stripe's smallest unit, in
`functions/api/_config/prices.js`. KRW is a zero-decimal currency, so 279000 KRW is
279,000 won, not 2,790. **The currency is a property of the account**
(`user_profiles.currency`), never of the display language: a French-speaking user with a
KRW account sees won.

### What each plan unlocks

| | Starter | Growth | Elite | Enterprise |
|---|---|---|---|---|
| Dashboard, Tasks, Smart Matrix | ✓ | ✓ | ✓ | ✓ |
| CS Coach AI + Health Chat (Nova) | ✓ | ✓ | ✓ | ✓ |
| Email & COPIL templates | ✓ | ✓ | ✓ | ✓ |
| Oxygen well-being (private data) | ✓ | ✓ | ✓ | ✓ |
| CS resource library | | ✓ | ✓ | ✓ |
| CSV / Excel import | | ✓ | ✓ | ✓ |
| Guided manual playbooks | | ✓ | ✓ | ✓ |
| Advanced dashboard & KPIs | | ✓ | ✓ | ✓ |
| Team Oxygen loop (manager view) | | ✓ | ✓ | ✓ |
| AI-automated playbooks | | | ✓ | ✓ |
| AI Email Studio (send via Resend) | | | ✓ | ✓ |
| OKR Tracker | | | ✓ | ✓ |
| Product roadmap | | | ✓ | ✓ |
| Notifications module | | | ✓ | ✓ |
| SSO / SAML, dedicated API | | | | ✓ |
| Priority support, tailored onboarding, compliance audit | | | | ✓ |
| Unlimited viewers | | | | ✓ |

The authoritative list is `PLANS[plan].modules` in `src/config/plans.config.js`, mirrored
in `functions/api/_config/plans.config.js`. See
[BILLING_AND_PLANS.md](BILLING_AND_PLANS.md) for the gating mechanics.

### Usage limits inside a plan

| Limit | Starter | Growth | Elite | Enterprise |
|---|---|---|---|---|
| AI calls / day / user (per module) | 35 | 100 | 200 | unlimited |
| Client accounts | 50 | unlimited | unlimited | unlimited |
| Seats | 3 | 7 | 24 | unlimited |

Only the `coach` and `nova` chat modules actually consume quota; the other AI modules run
unmetered (`_services/quota.service.js`). Emails: 3,000/month included, then €1.50 per
1,000 (`EMAIL_FREE_QUOTA`, `EMAIL_OVERAGE_RATE`).

### Seat model

A **viewer never consumes a seat**. Every other role does, and the seat is committed and
billed at **invitation** time, not at acceptance — the GitHub model. Adding a seat is
prorated immediately; removing one takes effect at the next renewal with no credit.

## Revenue model in one line

`monthly revenue = Σ (plan unit price in the account currency × non-viewer seats)`, with a
14-day full-access trial in front of it and no commitment behind it.

## Commercial policies

### Trial

14 days with **full access to Elite features**. A Stripe sign-up is required up front.
At the end of the trial, access is adjusted to the chosen plan. The trial also applies to
upgrades, not only to first subscriptions.

The trial is a property of the account, but paid access is a property of the
**organization**: an org that pays — or that has beta access — covers all its members,
including those whose personal trial is already used up.

### Founders offer

Published in the Terms (`cgu_s6_founders`): the **first three** companies to sign up get
the product free for life, and the **next twenty** get 50 % off for life. The benefit
holds only while the subscription stays active and continuous; on cancellation it ends
permanently and any new subscription is billed at the public rate.

Implemented in the code as a single `is_founding` flag capped at **10** organizations
(`functions/api/founding-status.js`, `functions/api/alpha/activate.js`), granted through a
promo code. See [Discrepancies](#discrepancies-to-resolve).

### Alpha / promo codes

`POST /api/alpha/verify` validates a code against `promo_codes`; `POST /api/alpha/activate`
creates the organization, applies the plan and the validity window from the code, and sets
the founding flag when fewer than ten founding orgs exist. Beta access is carried by
`organizations.trial_ends_at` and grants the full plan without a Stripe subscription.

### Billing, renewal and cancellation

- Monthly, automatic renewal, **no commitment**.
- Cancellation at any time from the customer area (Stripe Billing Portal), effective at
  the end of the current period.
- Plan changes (upgrade or downgrade) are immediate, with no fee.
- Prices are quoted excluding tax (HT) in the Terms.
- Scalyo stores no card details — Stripe is the sole payment processor.

### Support

- Channel: email, `contact@scalyo.app` (the landing footer also advertises
  `support@scalyo.app`).
- Languages: French, English, Korean.
- Press and partner requests: answered within 48 working hours.
- Elite adds a multi-team executive view; Enterprise adds priority support and tailored
  onboarding.
- There is **no contractual uptime SLA** anywhere in the legal texts. The Terms state
  24/7 availability *subject to maintenance*, and reserve the right to interrupt the
  service for maintenance **without prior notice**.

## Legal and privacy policies

Governing law: **French law and EU law**. Disputes go to amicable resolution first, then
to the French courts. Regulation of reference: **GDPR (EU) 2016/679**.

### Terms of Service — key clauses

| Clause | Substance |
|---|---|
| Object | SaaS Customer Success Management platform at `scalyo.app` |
| Access | 24/7 subject to maintenance; maintenance interruptions without notice; a valid email is required |
| Trial | 14 days, full Elite access, Stripe sign-up required |
| Renewal | Automatic monthly; cancel any time, effective at period end |
| Data ownership | **The user owns their data.** Scalyo does not exploit user data commercially. |
| Liability | Provided as-is. No liability for indirect damages, data loss, lost revenue or lost opportunity. **Capped at the amounts paid in the preceding 12 months.** |
| Force majeure | Standard exclusion under the French Civil Code |
| Changes to the Terms | Users notified by email **30 days** before a change takes effect; continued use is acceptance |
| Contact | `contact@scalyo.app` |

Note that clause 8 (an earlier section) caps liability at **3 months** of fees while
clause 11 caps it at **12 months**. Both are present in the shipped text — see
[Discrepancies](#discrepancies-to-resolve).

### Privacy policy — key clauses

**Data collected**

- Account data: first name, last name, email, hashed password.
- Usage data: clients, tasks, team, KPIs entered in the application.
- Technical data: IP address, browser, access logs.
- Payment data: handled exclusively by Stripe — **Scalyo stores no card details**.

**Purposes** — service delivery and account management, billing and subscription
management, customer support and product improvement, security and fraud prevention.

**Legal basis** — performance of the contract (the Terms), the user's consent at sign-up,
and applicable GDPR obligations.

**Retention** — for the duration of the subscription plus **3 years** after termination for
legal obligations. Data can be deleted on request at any time.

**Hosting** — Supabase (EU, Frankfurt) and Cloudflare. No transfer outside the EEA without
adequate safeguards.

**Sharing** — Scalyo does **not** sell or rent data. It is shared only with the technical
sub-processors needed to run the service.

**Cookies** — strictly necessary cookies only (authentication, session). **No advertising
and no tracking cookies.** There is consequently no cookie banner in the product, which is
consistent with this policy.

**Rights** — access, rectification, erasure, portability (CSV export), objection.
Exercised at `dpo@scalyo.app`, or directly in the product:

| Right | Endpoint |
|---|---|
| Portability (Art. 20) | `GET /api/export`, `GET /api/account/export` |
| Erasure (Art. 17) | `DELETE /api/users/me`, `POST /api/account/delete` |

**Breach notification** — CNIL notified within **72 hours** (GDPR Art. 33); affected users
informed as soon as possible when the breach presents a high risk.

### Data Processing Agreement (GDPR Art. 28)

Served publicly at `/dpa`. Scalyo is the **processor**; the customer is the
**controller**.

- **Duration** — for the term of the service agreement; deletion within **30 days** of
  termination, with a deletion certificate on request.
- **Data categories** — identification data, connection data, business data entered by the
  customer, well-being data (*strictly confidential and anonymized*), billing data
  (Stripe; no card numbers stored).
- **Data subjects** — the customer's employees, and the professional contacts of the
  customer's own end clients.
- **Sub-processor changes** — 30 days' notice to the customer.
- **Breach notification** — Scalyo notifies the controller within **48 hours**; the
  controller notifies the CNIL within 72 hours.
- **Audit right** — the controller may audit with 30 days' notice, at its own cost.
- **Security measures declared** — TLS 1.3 in transit and at rest, ES256 JWTs, Row Level
  Security on every table, role- and plan-based access control, DOMPurify sanitization,
  HMAC webhook verification, access logging.

### Declared sub-processors

| Sub-processor | Role | Location |
|---|---|---|
| Supabase Inc. | Database hosting — user and business data | EU (Frankfurt) |
| Cloudflare Inc. | CDN, front end and serverless back end | EU network |
| Stripe Inc. | Payments (PCI-DSS Level 1) | US, EU-US DPF / SCC |
| Resend Inc. | Transactional email | US, EU-US DPF / SCC |
| Mistral AI | AI inference only, no data stored, anonymized context | see note below |

### AI policy

- **Mistral is the nominal provider** and the code comments place it in Paris, in the EU.
- **DeepSeek is an emergency fallback only.** It is called solely on a *total* Mistral
  outage (timeout, network error, 5xx — never on a 429 or any other 4xx), and only after
  `_services/anonymize.js` has stripped the portfolio context block and scrubbed emails,
  amounts, dates and phone numbers from what remains, including the user's own question.
  DeepSeek is never named in the front end.
- The AI context is built server-side with the **user's own JWT**, so the model can never
  be shown more than the user can see, and it applies GDPR minimization: an explicit
  column list, never notes, never emails or phone numbers, and capped list lengths.
- The Privacy policy states that AI consent is required before processing.

### Well-being confidentiality — a product promise with teeth

The pricing page carries the commitment explicitly:

> Well-being & chat: strictly personal data, secured and not transmitted to management.

This is enforced in the database, not just in the UI:

- The Oxygen tables are **self-only** under RLS. No manager and no owner can read another
  user's rows.
- The single aggregation path is the `oxygen_team_aggregate` function: `SECURITY DEFINER`,
  **owner-only**, with a **literal `n ≥ 5`** threshold that is deliberately not
  parameterizable, fail-closed behind an organization flag that defaults to `false` and
  can only be enabled by an SQL update after a legal (DPIA) review.
- It returns team averages over a 14-day window plus a trend — **no individual data, no
  ranking, no time-spent metric**.
- The manager panel displays the privacy contract on screen in every state.

Any change to this area is a legal change, not a product change.

## Discrepancies to resolve

These are inconsistencies between the shipped code and the shipped copy. None is a bug in
the running software; each is a commitment that does not match its implementation, so each
needs a decision from the business rather than a patch from an engineer.

| # | Where | Issue |
|---|---|---|
| 1 | `legal.js` `cgu_s6_founders` vs `founding-status.js` / `alpha/activate.js` | The Terms promise **3 lifetime-free + 20 at 50 %**. The code implements a single `is_founding` flag capped at **10** organizations, with no distinction between the two tiers and no discount logic. |
| 2 | `legal.js` `cgu_s8` vs `cgu_s11` | Liability is capped at **3 months** of fees in clause 8 and at **12 months** in clause 11. Both ship. |
| 3 | `legal.js` — the `fr` object | `cgu_s11`–`cgu_s14` and `priv_s11`–`priv_s13` are each **declared three times** (Korean, English, then French). Last-one-wins means the French text is the one rendered, so the visible behaviour is correct, but the Korean and English copies inside the `fr` object are dead weight and a trap for the next editor. The `en` and `ko` objects have no duplicates. |
| 4 | `privacy` §14 vs the code | The Privacy policy lists **Mistral AI as US-based**, covered by the EU-US Data Privacy Framework. The code and `SECURITY.md` describe Mistral as **Paris, EU** and state that "data never leaves the EU". One of the two statements needs correcting. |
| 5 | DPA §7 and Privacy §14 vs `_providers/deepseek.js` | **DeepSeek is not listed as a sub-processor** in either document, even though the emergency fallback can send an anonymized prompt to it. Either list it, or document the fallback as disabled in production (`DEEPSEEK_API_KEY` empty disables it). |
| 6 | `landing.js` `faq_a1` vs `plans.config.js` | The FAQ says Growth covers "up to 10 CSMs" and describes teams of 1–50. The configuration sets Growth at **7 seats** and Elite at **24**. |
| 7 | `landing.js` `plan_1csm` / `plan_10csm` / `plan_unlim_csm` vs `plans.config.js` | The pricing cards describe seats as "1 Manager + 2 CSMs", "3 Managers + unlimited CSMs", "5 Managers + unlimited CSMs". The product has no manager/CSM seat distinction — it has one flat non-viewer seat count (3 / 7 / 24) and four roles (owner, admin, member, viewer). |
| 8 | `ORG_SETTINGS.invitationExpiryDays` = 180 vs the database default | `functions/api/invite.js` sets `expires_at` explicitly because the database default was 7 days. The two only agree because the Function writes the value — a direct insert would expire in 7 days. |
| 9 | Terms §5 vs the landing CTA | The Terms say the trial requires a prior Stripe sign-up; the landing end-CTA says "secure Stripe payment, **without a bank card**". |
| 10 | `landing.js` `demo_updated` / mock dates | The demo mockups are dated "March 2025" / "February 2025" while the rest of the copy is dated 2026. Cosmetic, but visible on the landing page. |

## Where the copy lives

| Surface | File |
|---|---|
| Landing page, pricing cards, FAQ, SEO metadata | `src/i18n/landing.js` (`fr` / `en` / `kr`) |
| Terms of Service and Privacy policy | `src/i18n/legal.js` → `views/legal/CguView.vue`, `views/legal/PrivacyView.vue` |
| DPA | `src/i18n/dpa.js` → `views/DpaView.vue` |
| Support page | `src/views/SupportView.vue` (keys in `src/i18n/{fr,en,ko}.js`) |
| Press kit | `public/presse/` (FR), `public/press/` (EN), `public/press-ko/` (KO) |
| Blog articles | `src/blog/articles/*.md`, rendered by `scripts/build-blog.js` |

All of this is **product content in the user's language** and must not be translated into
English — see the language policy in [CODE_STYLE.md](CODE_STYLE.md).
