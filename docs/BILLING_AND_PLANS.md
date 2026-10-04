# Plans, seats, roles and billing

## Plans

Four plans, declared once in `src/config/plans.config.js` and mirrored in
`functions/api/_config/plans.config.js` (manual sync — a change must be made in **both**).

| Plan | Seats | Clients | Modules |
|---|---|---|---|
| `starter` | 3 | 50 | coach, nova, wellbeing, dashboard, copil, matrix |
| `growth` | 7 | unlimited | + import, playbook, resources, oxygen_team |
| `elite` | 24 | unlimited | + email, notif, okr, roadmap |
| `enterprise` | unlimited | unlimited | same modules as elite, plus SSO/SAML, dedicated API, priority support, tailored onboarding, compliance audit, unlimited viewers |

`PLANS[plan].modules` is the **single source of runtime gating**. `planGating.js`,
the back-end `plans.js` and `AiInsightPanel` all derive from it; there is no duplicated
list anywhere. An unknown plan falls back to `starter` — the most restrictive — never to
something more permissive.

`PLANS[plan].features` is a flag map used for UI affordances
(`advancedDashboardKpis`, `aiEmailStudio`, `unlimitedViewers`, …), read through
`hasFeature(plan, flag)`.

## The effective plan

**The front end** (`stores/auth.js`, since stage 2 step B — `CORE-V2-ME`, 04/10/2026) reads the
organization's **current subscription period** from `core_v2_me()`: TRIAL, PROMO, PAID or CONTRACT,
or none. **The server** (`/api/ai`, `/api/email`, `/api/usage`, `/api/billing`, `check_client_limit`)
still reads `organizations.plan` until step 3; the core_v2 mirror builds the periods from that same
column, so the two agree. `profiles.plan` is no longer read by the front end.

This matters because billing is **per seat at the organization level**: an org that pays,
or that has beta access, covers *all* its members — including those whose personal trial
is used up. **And only the organization grants access** (decided 04/10/2026): a person's own trial
no longer opens an organization that has no current period. `auth.js` exposes:

- `period` — the current period, or `null`.
- `isOnTrial` (a TRIAL period), `isOnBetaAccess` (a PROMO period with an end), `isAlphaTester` (a
  PROMO period with no end, `ALPHA-FOREVER`), `trialExpired` (no period and the person's own trial
  over).
- `orgGrantsAccess` — there is a current period.
- `hasActiveSubscription` — deliberately **personal**: a PAID period *and* the caller is its billing
  owner. Settings and the payment success screen use it to show the *personal* subscription status.
  Widening it would surface a misleading subscription-management block to a member who does not
  manage their org's subscription.
- `needsPayment` — no current period (and not before `core_v2_me` has answered); the router guard
  uses it.
- `readOnly` — an `INACTIVE` / `ON_LEAVE` worker (`JOB-STATUS-READ`): told once in a popup, then the
  product greyed with its inputs disabled, and every write refused in `lib/supabase` before it leaves
  the browser.

`scripts/proof-paywall-member.mjs` is a regression proof for exactly this: it extracts the
`computed` declarations *literally* from `src/stores/auth.js` and evaluates them with
Vue's real reactivity across eleven scenarios. If the store changes, the proof changes with
it. Run it before committing anything that touches those computeds.

## Roles

| Role | Level | Seat | Invite | Revoke | Change roles | Manage billing |
|---|---|---|---|---|---|---|
| `owner` | 100 | yes | yes | yes | yes | yes |
| `admin` | 50 | yes | yes | yes | no | no (can view) |
| `member` | 10 | yes | no | no | no | no |
| `viewer` | 1 | **no** | no | no | no | no |

Per-entity read/write permissions are declared in the same file
(`clients`, `tasks`, `projects`, `playbooks`, `kpis`, `okrs`, `emails`, `roadmap`,
`team`, `settingsPersonal`, `settingsOrg`) with `all` / `own` / `none`.

Note that RLS is the real enforcement layer for data (see [DATABASE.md](DATABASE.md));
the role map drives the UI and the Pages Functions.

## Seats — billed at acceptance

A seat is **billed when the invitation is accepted**, not when it is sent
(`SEAT-AT-ACCEPT`, 03/10/2026). Until then it was billed at invitation, and an invitation
nobody opened was charged for its whole life — after it expired too, because the lazy
`expired` flip in `invite/accept.js` / `invite/verify.js` never touched Stripe.

```
billed   = non-viewer members                              → Stripe quantity, seats_paid
reserved = non-viewer members + pending non-viewer invitations → plan ceiling, /api/members `used`
           that have not expired
```

**The ceiling** (`SEAT-CEILING`, decided 03/10/2026) is the plan's: **starter 3 seats, growth 7,
elite 24, enterprise no limit** — `maxSeats` in both `plans.config.js` copies, and a third copy in
SQL, `plan_seat_ceiling()` (`20261003110000`): change all three together. An alpha code's
`max_seats` caps nothing; the plan does. At the ceiling no invitation can be sent and none can be
accepted. It is checked three times: by `invite.js` (reserved seats), by `invite/accept.js` before
billing (members), and by the database — `trg_seat_ceiling` on `organization_members` locks the
organization row and counts again inside the insert, which is what holds when two acceptances race
(both counted N in `accept.js`). A team above its ceiling after a downgrade keeps everyone; it just
cannot grow. An **expired** invitation reserves nothing: its status stays `pending` until somebody
opens it, and counting it left a team "full" of dead invitations.

In core_v2 (`JOB-STATUS`, decided 03/10/2026) a seat is held by a member whose `job_status` is
`ACTIVE` or `ON_LEAVE` — an `INACTIVE` worker or one who left (`ENDED`) holds none. A manager changes
`job_status` only through `core_v2_set_job_status`: never their own or the billing owner's, never to
or from `ENDED` (leaving is the removal, which takes the Stripe seat back), and a reactivation
(`INACTIVE` → `ACTIVE` / `ON_LEAVE`) only within the ceiling. Since stage 2 step C (04/10/2026) the
three checks count this way: `invite.js` and `/api/members` read `core_v2_seats_taken`, `accept.js`
`core_v2_seats_held`, and `trg_seat_ceiling` skips a member whose worker is `INACTIVE` / `ENDED`.
**Open:** whether an `INACTIVE` worker stops being billed — today the invoice counts every member who
has not left (`core_v2_billable_seats`), so an `INACTIVE` one holds no seat against the ceiling but is
still paid for.

A pending invitation still **reserves** its seat against the plan ceiling, or a full team
could hand out invitations that then fail at acceptance. Viewers never consume a seat.
`/api/members` computes `used` (reserved) server-side, and it is the **single source** for
the seat counter; the plan ceiling comes from `getMaxSeats(plan)`. `used` may exceed `paid`
while invitations are pending. (Reading `seats_paid` from a *member's* profile used to
display "5 / 1" on the Manager screen against "5 / 24" on the Team screen.)

### Inviting

`POST /api/invite` → count reserved seats → check the ceiling (`403 seat_limit_reached` with
`seats_used` / `seats_cap`, translated by the Team screen) → insert the invitation → send the
email. No Stripe call, no `seats_paid` write. `email_sent` is returned to the client so the UI
never shows a false success. At the ceiling the Team screen's invite form says so and does not
send (`team_invite_full`).

### Adding a seat — acceptance

`POST /api/invite/accept`, for a non-viewer role, before the membership is made:
check the plan ceiling against the members → Stripe quantity = members + 1 with
`create_prorations` → `seats_paid` = the same. If Stripe fails, nothing is written, the
invitation stays pending and the invitee sees `409 billing_failed`. Then
`switch_to_invited_organization` makes the membership. **Every exit after the charge
re-syncs from a recount** (Stripe and `seats_paid` = members as they are now): a refused or
failed switch gives the seat back (a `create_prorations` credit that nets out the charge),
and a successful one bills any acceptance that overlapped it — two acceptances in the same
second both read N members and both bill N+1. `setSubscriptionQuantity` skips an
unchanged quantity, so the re-sync is usually free.

`seats_paid` is written before the insert on purpose: `enforce_org_seat_limit` fires on
that insert and its body lives only in the dashboard, so it may be reading `seats_paid`.
**Verify its body in pre-prod.**

### Removing a seat

`DELETE /api/members/[id]` is fail-closed: Stripe is called **before** any database
write, with `proration_behavior: 'none'` (no credit, the new quantity applies at the next
renewal), and the new quantity is the remaining billable members — pending invitations
are not billed, so they are not counted. If Stripe fails, nothing is removed — a seat must
never be free in the database and still billed, or vice versa. The database side is one
transaction (`core_v2_remove_member`, 04/10/2026); if it refuses after Stripe agreed, the
route sets Stripe back to the count that is really there.

`DELETE /api/invitations/[id]` touches no billing: the invitation was never billed.

**Before SEAT-AT-ACCEPT** an organization's quantity included its pending invitations. Such
an over-billed quantity is corrected at the next acceptance (a credit) or removal (no
credit) — nothing reconciles it in between.

Removing a member is confirmed with the in-product `ConfirmDialog`, never with a native
`confirm()`.

## Prices

`functions/api/_config/prices.js` is the only declaration of prices, in Stripe's smallest
unit (cents for EUR/USD, whole won for KRW, a zero-decimal currency). `PRICE_TO_PLAN`,
used by the webhook, is derived from it.

**There is no price on the front end.** `GET /api/billing` returns the amounts:

- If the org has a real Stripe subscription, amounts come from Stripe (proration and
  discounts included, via `create_preview` with a fallback to `invoices/upcoming` for
  older API versions).
- Otherwise, the price table × the number of seats, in the **organization's** currency
  (core_v2 `company.currency_code`, reached through `organizations.core_organization_id`;
  `CURRENCY-ORG`, 24/09/2026 — it was the person's own `user_profiles.currency`). An account with
  no organization has none and is quoted in EUR.
- For a `member` or `viewer`, the API returns plan and seats but **no amount at all**
  (`can_view_amounts: false`).

If the API is silent, the UI shows no amount and keeps the CTAs active — the real price is
on the Stripe page. It never guesses.

Displaying a price derived from the interface language is explicitly forbidden: a
French-speaking user with a KRW account must see won.

## Checkout

Scalyo uses **Stripe Payment Links**, not a server-created session.
`src/config/stripeLinks.js` holds the three links, injected at build time per environment
(`VITE_STRIPE_LINK_*` for prod, `VITE_STRIPE_LINK_*_PREPROD` for pre-prod). A missing
variable yields `''` and an inert button — a visible failure, never an implicit live link.

A runtime guard refuses to serve a **live** link from a non-production host, so no
`cs_live` session is reachable from pre-prod, `localhost` or a `pages.dev` preview.

`client_reference_id` is appended to every link. It is the only key the webhook has to map
the Stripe customer back to a Scalyo user.

The 14-day trial applies to upgrades as well as first subscriptions.

## Webhook

`POST /api/stripe-webhook` verifies the HMAC signature and, with `service_role`, writes:

- `profiles` — plan, Stripe customer and subscription ids, trial fields;
- `organizations` — plan and `seats_paid`, because the org is the source of the effective
  plan. Writing only the profile leaves the paying owner's members gated on `starter`.

Cancellation returns `organizations.plan` to the `starter` floor; a still-valid promo
access is carried by `trial_ends_at` and is not touched.

## The paywall

`PaywallView` serves two contexts, distinguished by the query string:

- `reason=upgrade&module=…` — the user hit a gated module. The view names the plan that
  unlocks it (resources → Growth; okr / roadmap / email / notif → Elite).
- no reason — the trial has expired.

A `member` or `viewer` sees an explicit message with no amounts and no CTA: they do not
manage their organization's subscription.

## Client quota

Enforced on both sides:

- Front end — `getMaxClients(effectivePlan)`, counted on **active clients only**
  (prospects are not limited).
- Database — the `enforce_client_limit` trigger calls `check_client_limit`, which reads
  `organizations.plan` (profile fallback for accounts without an org), counts per
  `organization_id` and excludes prospects. The two are aligned 1:1 on purpose: before
  the fix, a non-owner member of a paying org was blocked at 50 clients.
