# Database — Supabase

Postgres with Row Level Security as the authorization layer. Two projects: **pre-prod**
(`wxbape…`) and **prod** (`hcqnin…`). Every migration header states the order in which it
must be applied and the checks to run afterwards.

> The `20260624131657` baseline that creates the core tables is not part of this
> snapshot; only the incremental migrations are. Tables not created here are documented
> from their usage in the application code and the policies that reference them.

## Migrations in this snapshot

`supabase/migrations/` (root, canonical) and `app-v2/frontend/supabase/migrations/`
(three files kept next to the front end). `app-v2/frontend/_migrations/001_user_profiles.sql`
is an older, superseded file.

| Migration | What it does |
|---|---|
| `20260419_profiles_resend` | Resend fields on profiles |
| `20260419_sent_emails` | `sent_emails` table |
| `20260421_chat_tables` | `chat_channels`, `chat_messages`, realtime, default channels |
| `20260508_fix_chat_rls` | Replaces the `USING (true)` chat policies with auth + ownership |
| `20260704190000_protect_billing_fields` | Trigger: `authenticated` can no longer write billing columns on `profiles` |
| `20260705230000_secrets_and_org_rls` | Removes the `resend_api_key` leak from an RPC, moves email/integration secrets to server-only custody, org-scopes chat, backfills `clients.organization_id` |
| `20260706180000_realtime_chat_publication` | Publishes `chat_messages` to `supabase_realtime` |
| `20260706220000_copils_client_id` | Links a COPIL deck to a portfolio client |
| `20260707230000_chat_org_member_names` | `get_org_member_names` RPC, `search_path` hardening, author-name backfill |
| `20260708220000_org_plan_source` | `organizations.plan` becomes the single source of the effective plan + a protection trigger |
| `20260708230000_email_templates_org_rls` | Adds the missing `SELECT` policy — custom templates were dead end to end |
| `20260711210000_fix_client_limit_org_source` | `check_client_limit` reads the org plan and counts per organization, prospects excluded |
| `20260712143516_notifications_payload` | `notifications.payload` — locale-agnostic notifications |
| `20260713160000_chat_dm` | `chat_channel_members`, `open_dm` RPC, DM RLS, automatic `general` channel |
| `20260718200000_clients_csm_id` | `clients.csm_id` — the CSM assignment was never persisted |
| `20260720230000_clients_org_read` | Org-wide read of clients, write restricted to creator or assigned CSM |
| `20260720233000_client_notes_and_org_write` | `client_notes` + org-wide client **write** |
| `20260720240000_quotes_table` | `quotes` moved out of `localStorage` into the database, org-wide |
| `20260722200000_client_metrics` | Monthly manual KPI measurements per client |
| `20260729250000_oxygen_team` | `oxygen_team_enabled` legal gate + the `oxygen_team_aggregate` function |
| `20260903100000_copil_media_bucket` | Private `copil-media` Storage bucket with per-user prefix policies |
| `20260909120000_chat_reactions_rpc` | `can_read_chat_message`, `toggle_chat_reaction`, `set_chat_message_pinned` RPCs — reacting to or pinning **another member's** message; publishes `chat_channels` to `supabase_realtime` |
| `20260920100000_core_v2_schema` | The `core_v2` tables, enums, RLS and RLS helpers — created **alongside** the current schema, touching none of it. See [core_v2](#core_v2--the-new-core-schema-additive) below |
| `20260920110000_core_v2_sync_triggers` | Bridge column `organizations.core_organization_id` + fail-open triggers that mirror `organizations`, `profiles`, `organization_members`, `clients` (contacts, health, ARR → profit, churn included) into `core_v2` |
| `20260920120000_core_v2_backfill` | One-time, idempotent mirror of the rows that already exist (re-uses the triggers) |
| `20260924100000_core_v2_stage1_user_profiles` | Stage 1 of [retiring the old core tables](#retiring-the-old-core-tables): `organization_worker.onboarding_completed`, the `consent` log, the RPCs the front end now calls instead of `user_profiles`, a transitional `user_profiles` mirror and its backfill. **Apply before the stage-1 front end** |
| `20260721000000_copils_client_id` (front) | Idempotent guarantee that `copils.client_id` exists |
| `20260721010000_notify_client_note` (front) | Trigger notifying a client's owner when a colleague adds a note |
| `20260801120000_planning_recurrence` (front) | `planning_events.recurrence` + `series_id` |

## Tables

### Identity and organization

| Table | Notes |
|---|---|
| `profiles` | The auth profile: plan, trial fields, `organization_id`, `org_role`, locale, Stripe ids. Billing columns are trigger-protected against `authenticated`. `resend_api_key` is a dead column, blocked from rewriting. |
| `user_profiles` | The old questionnaire (role, seniority, company size, sector, …) and the old per-person currency. **Being retired (stage 1):** since 24/09/2026 no application code reads it — the currency is the organization's (core_v2 `company.currency_code`) and the answers live on `organization_worker`. Mirrored into core_v2 until its drop migration |
| `organizations` | `plan` (single source of the effective plan), `seats_paid`, `trial_ends_at` (beta access), `oxygen_team_enabled`. Billing columns are trigger-protected. |
| `organization_members` | Membership rows, unique on `(organization_id, user_id)`; a seat-limit trigger fires on insert |
| `invitations` | Pending / accepted / expired / revoked, with a token and `expires_at` |

Note: the database allows multiple memberships (`uq_org_member` is on the *pair*).
Single-organization membership only exists as `profiles.organization_id`.

### Customer Success core

| Table | Notes |
|---|---|
| `clients` | Portfolio. `health` (0–10), `status`, `lifecycle` (prospect / client), `arr`, `renewal_date`, `csm_id`, `contacts` (jsonb array, exactly one `is_primary`), `organization_id` |
| `client_notes` | Timestamped notes (call / email / meeting / note), readable and writable by any org member |
| `client_metrics` | One row per `(client, kpi, month)`; re-entering a month is an upsert. Only `source: 'manual'` catalog KPIs. |
| `snapshots` | Daily KPI snapshots feeding the dashboard variation badges |
| `quotes` | Quotes with their own billing country, currency and tax rate; org-wide |
| `tasks`, `projects` | Tasks and projects; playbook activation materializes tasks here |
| `planning_events` | Calendar events. Self-only RLS. `recurrence` + `series_id` materialize a series. |
| `playbooks` | Activated retention playbooks; `steps` is jsonb `{id, title(i18n key), done, due?, task_id?}` |
| `roadmaps` | Roadmaps and milestones |
| `copils` | COPIL decks: `blocks` (jsonb), `lang` (deck language), `client_id`, `date` |

### Oxygen (self-only)

| Table | Notes |
|---|---|
| `oxygen_checkins` | One row per user per day: energy, mood, felt load, one word |
| `oxygen_daily` | Per-day `load_score` and computed `index` |
| `oxygen_recoveries` | `kind = 'cloture'` (one per day, written once at the end) or `'micro'` (max 2/day) |

All three are **self-only**: a user can only read and write their own rows. The manager
aggregate is only reachable through the `oxygen_team_aggregate` function.

### Communication and AI

| Table | Notes |
|---|---|
| `chat_channels` | `type` classic or `dm`; `dm_key` is a deterministic sorted-uuid pair key |
| `chat_channel_members` | Participants; writes only happen through the `open_dm` RPC |
| `chat_messages` | Published to `supabase_realtime` (so is `chat_channels`). `UPDATE` stays `user_id = auth.uid()` — **reactions and pins on someone else's message go through the RPCs**, never a direct `UPDATE`, which would silently match zero rows |
| `notifications` | `type` + `payload` (a snapshot of the values at alert time); title/body are rendered in the **reader's** locale by `src/lib/notifText.js` |
| `ai_conversations`, `ai_messages` | Persisted AI history |
| `ai_usage` | One row per quota-consuming AI call (`coach`, `nova` only) |
| `email_templates` | Custom templates, org-scoped |
| `sent_emails` | Send log, with open tracking |
| `org_email_config` | Resend key (AES-256-GCM), sender domain and name — **no client access at all** |
| `org_integrations` | Integration rows; `access_token` / `refresh_token` / `config` are revoked from the client |
| `alpha_feedback` | In-product feedback widget |
| `promo_codes` | Alpha / founding codes |

## core_v2 — the new core schema (additive)

Drawn in [DATABASE_DIAGRAM_CORE_V2.md](DATABASE_DIAGRAM_CORE_V2.md) (ER diagrams per group, the mirror flow,
enums, decision tags, and the 30 old tables that stay with where their references land) — update it in the same change as any core_v2 migration.

`docs/new_database_code.txt` is a ground-up redesign of the core model, derived from the C++
class model in `docs/Database Plan.txt`. It is built **next to** the current schema, not in
place of it. `organizations`, `profiles`, `clients`, `organization_members` and `invitations`
remain the source of truth for every screen, plan check, seat count and invitation. The only
application code that reads or writes core_v2 is [stage 1](#retiring-the-old-core-tables) (the
questionnaire, the currency and the profile), which replaced `user_profiles`.

**Direction (decided 20/09/2026).** The old core tables are to be **deleted**, in stages: the front
end first reads, then writes the new schema; every table that references the old ids is repointed;
then the old tables are dropped by a *new* migration (applied migration files are never deleted).
So every column the product still needs must end up in the new schema — see `CORE-V2-COLUMNS`
below. Decided to be **dropped, never migrated**: `is_founding`, every `user_profiles` column
except `role` and `seniority`, and the `profiles` plan / trial / Stripe / onboarding / region /
alpha columns. `health`, `nps`, `churn_risk`, `renewal_date` and `contacts` were decided dropped
on 20/09 and **kept** on 24/09/2026; `arr` / `mrr` become `profit` rows (ARR = last 12 months).
**Still to design:** the subscription-information table (seats, plan tiers, `TRIAL` as a type,
the Stripe ids) and the Oxygen module (which will reference `member`). The plan tier goes in that
table, **never** in a column of `organization` or `organization_worker` (`CORE-V2-PLAN-HOME`,
decided 24/09/2026): a second copy drifts, which is what `profiles.plan` vs `organizations.plan` already does.

| New table | Is a projection of | Notes |
|---|---|---|
| `company` (+ `organization`, `client_group`) | `organizations` / **every** `clients` row, prospects included | `public_id` (uuid, unique) **is the old `clients.id`** for a mirrored client (`CORE-V2-PUBLIC-ID`, 24/09/2026): the company is the identity a prospect and its client group share, and the 7 tables holding a client uuid, the `/app/clients/<id>` URLs and the MCP links keep their value. `country_code` and `currency_code` are **nullable** (`CORE-V2-COUNTRY`). `photo_path` ← `clients.logo` (an empty logo becomes `NULL`). |
| `client_group` (columns beyond the DDL) | `clients` | `industry`, `notes` (`CORE-V2-COLUMNS`); `health`, `nps`, `churn_risk`, `health_status` (the manual flag `clients.status` — `critical` / `watch` / `todo`, which can raise the colour), `renewal_date`, `created_at` (`CORE-V2-CLIENT-HEALTH`, kept 24/09/2026). Copied as stored, never defaulted — `health ?? 5` is a display fallback of the old store, not data. No `arr` / `mrr` column: see `profit` |
| `prospect` | `clients` with `lifecycle = 'prospect'` | **Independent** of `client_group`, like `issue`: an organization, a **company** (name and logo live there — `CORE-V2-PUBLIC-ID`), `industry`, `notes`, a `pipeline_stage` (`NEW` · `CONTACTED` · `QUALIFIED` · `WON` · `LOST`) and an owner `member_id` (the old `csm_id`). A prospect has no health and never enters portfolio counters — true by construction. When it is won, its client group is created on the **same** company, so notes and contacts follow and the prospect row stays as funnel history (`WON`). |
| `personage` + `viewer` + `client_group_viewer` (contacts) | `clients.contacts` | `CORE-V2-CONTACTS` (24/09/2026): one login-less viewer per contact, linked to the **company** (so a prospect's contacts are kept and carry over when won), with `role` and `is_primary` (exactly one per company, a unique index). The name is kept whole in `first_name` — never split into a guessed first / last. The list has no ids, so an edit **replaces** the company's login-less contacts and deletes their personages |
| `organization_role` + `organization_worker.role_id` | the questionnaire (`core_v2_complete_onboarding`; `user_profiles.role` while the old front end is live) | A per-organization role list shaped like `organization_position` (unique by name) but **not** reached through `organization_worker.position_id`. `name` is the persisted key (`csm`, `head_cs`, …), rendered through i18n. `role_custom` is dropped. The composite foreign key `(role_id, organization_id)` makes the database refuse another organization's role, the same way `position_id` is checked (moved off `member` on 24/09/2026 for that reason). A viewer's answer is recorded too, and a member ↔ viewer change keeps it. Only a **completed** questionnaire counts: the `user_profiles` column defaults (`csm`, `mid`) are never mirrored as answers |
| `organization_worker.seniority` | the questionnaire (as above) | A plain integer rank: junior 1 · mid 2 · senior 3 · lead 4 · director 5 · vp 6 · c_level 7; anything else is refused by the RPC (and `NULL` from the old mirror) |
| `organization_worker.onboarding_completed` | the questionnaire (`user_profiles.onboarding_completed` while the old front end is live) | Whether the personal questionnaire (`OnboardingWizard`) was answered **in this organization**: joining another one asks again. A boolean, not a time — the backfilled rows have no true completion time. Not the organization-setup onboarding, which is `profiles.onboarding_completed` (stage 4) |
| `consent` | the questionnaire's two consents (`user_profiles.ai_consent` / `analytics_consent` / `consent_date` while the old front end is live) | **Append-only** log linked to the organization (`CORE-V2-CONSENT`): one row per consent given or withdrawn (`kind` `AI` / `ANALYTICS`, `granted`, `recorded_at`); the current state is the latest row per person and kind. Read: your own rows. Write: `core_v2_complete_onboarding` only. Deleted with the person |
| `organization_client_group` | `clients.organization_id` | Unique on `client_group_id`: a client group belongs to one organization |
| `personage` + `member` / `viewer` (+ `manager`) | `profiles` + `organization_members` | Linked to the login by `member.auth_user_id` / `viewer.auth_user_id` (nullable, unique, **no foreign key** to `auth.users` — `SET NULL` would null the link before the erasure trigger could use it; orphans are found with check 12.6) |
| `organization_worker` | `profiles.organization_id` | `ACTIVE` while in the organization, `ENDED` (kept) after removal; one organization per personage. `joined_at` ← `organization_members.joined_at` (`NULL` when unknown, never invented). Also carries `role_id` / `seniority` (above); an `ENDED` row keeps them as history |
| `member_authority` | the role + `organization_members.can_send_email` | The `authority` enum is the source's four verbs **plus** `INVITE`, `SEND_EMAIL`, `ASSIGN_CLIENT_GROUP` (`CORE-V2-AUTHORITY`). owner + admin → manager (VIEW, CREATE, UPDATE, DELETE, INVITE, ASSIGN_CLIENT_GROUP) · member → VIEW, CREATE, UPDATE · viewer → none. `SEND_EMAIL` mirrors `can_send_email` for any member/manager and is implicit for the billing owner (`api/email.js` sends as the owner's own config). `ASSIGN_CLIENT_GROUP` gates changing a client group's assignee (`member_client_group`); nothing enforces it yet — today any org member can reassign a CSM |
| `organization.owner_personage_id` | `organizations.owner_id` | The new model has no owner/admin distinction, so the billing owner is recorded here |
| `subscription` | `organizations.plan` changes | A **history log**, one row per change, lossy tiers (starter → BASIC, growth/elite → PRO, enterprise → ENTERPRISE, none → FREE). `issue_date` is when it was *recorded*. Read by nothing. |
| `profit` | `clients.arr` (else `mrr × 12`) | **ARR = the client group's profit rows dated in the last 12 months, MRR = ARR / 12** (`CORE-V2-ARR-PROFIT`, decided 24/09/2026). The mirror keeps ONE opening row per client group, marked `description.source = 'clients.arr'`, dated when first recorded, in the organization's currency (EUR when it has none); an arr edit changes its amount, never adds a row. After 12 months without new entries the ARR falls to 0 (accepted 24/09/2026) |
| `churn` | `clients.churned_at` | ONE row per churned client, marked `source = 'clients.churned_at'`, dated when the churn happened; it follows the date and goes if `churned_at` is cleared, while the old table is the source |
| `issue`, `profit`, `churn` (user rows) | — | No UI yet; the only `core_v2` tables a user can write, gated on their own `member_authority`. A user-written row is `RESTRICT` and blocks the mirror delete of its client (warning, the old delete still goes through) |
| `country`, `currency`, `language_region` | — | Foreign-key targets seeded from `config/currencies.js`, `countryLaws.js` and the three locales. **Never rendered** — display names still come from `Intl` + i18n |
| `member_client_group` | `clients.csm_id` | The client's CSM. `csm_id` is a single assignee, so the mirror **replaces** the assignment. Only a **member who works in the client's own organization** is assigned — a viewer, a member of another organization, or a login that is not (yet) a member leaves it empty, and `core_v2_sync_user` assigns it later if that login joins |
| `company_link`, `personage_link`, `organization_position`, `manager_team` | — | Created, **left empty**: no current data maps to them |

**How it stays in sync.** `SECURITY DEFINER` triggers on the four old tables (part 2) mirror
every write; part 3 backfills what already exists by re-using those triggers.
`core_v2_sync_user(user_id)` is the single place that turns a login + organization + role into
`personage` / `member` / `manager` / `organization_worker` / `member_authority` /
CSM-assignment rows. It never touches role / seniority / `onboarding_completed`: those are the
person's own answers, written by the stage-1 RPC (or its transitional `user_profiles` mirror), and
re-reading them from `user_profiles` on every profile write would overwrite a new answer with the
stale old copy.

- **Fail-open (`CORE-V2-FAILOPEN`).** Every trigger body catches its own errors and emits a
  `WARNING`; the original write always succeeds. A projection bug is silent drift, not a failed
  signup — re-running part 3 heals it, and its closing report counts what is unmirrored.
- **Bridge columns are not trusted (`CORE-V2-NO-TRUST`).** A user can `UPDATE` their own
  `organizations` row, so a supplied `core_organization_id` could point at another tenant's
  company; the BEFORE trigger discards it and restores the stored one. Clients and profiles have
  **no** bridge column: a client's mirror is found by `company.public_id = clients.id`, a person's
  by `member/viewer.auth_user_id` — links held in tables users cannot write (the 20/09 draft's
  `clients.core_client_group_id` / `core_prospect_id` were removed on 24/09/2026).
- **Deletes cascade the mirror.** Deleting a profile deletes its `personage` (name + email are
  personal data); deleting a client deletes its mirrored profit / churn rows, its contacts'
  personages, then its company; deleting an organization does the same for all its client groups
  and prospects. A `profit` / `churn` / `issue` row a **user** wrote is `ON DELETE RESTRICT`, so the
  mirror delete then fails with a warning and the old delete still goes through.
- **Prospects are not client groups, but share the company.** A `clients` row with
  `lifecycle = 'prospect'` gets a company and a `prospect` row; a client gets a company and a
  `client_group`. Won = the client group appears on the prospect's company. A row that goes client
  → prospect gets a prospect row and **leaves its client group untouched** (pipeline moves forward;
  deleting a group could hit `RESTRICT`-ed issues). A client with no `organization_id` has nothing.

**Deviations from the literal DDL in `docs/new_database_code.txt`** (each tagged in the SQL):
`CORE-V2-COUNTRY` (nullable country/currency — R21); `CORE-V2-CG-ORG` (the source DDL indexes and
validates against `client_group.organization_id`, a column that does not exist — the link is
`organization_client_group`, and run as written the index fails and the scope trigger raises on
every write); `CORE-V2-AUTH-LINK`; `CORE-V2-AUTHORITY`; `CORE-V2-COLUMNS` (`organization_role`,
`organization_worker.role_id` / `seniority` / `joined_at`, `client_group.industry` / `notes`,
`prospect`, the `pipeline_stage` enum); `CORE-V2-OWNER`; `CORE-V2-PUBLIC-ID` (`company.public_id`,
`prospect.company_id`); `CORE-V2-CONTACTS` (`client_group_viewer` references `company`, carries
`role` / `is_primary`); `CORE-V2-CLIENT-HEALTH`.

**RLS (`CORE-V2-RLS`).** Read: an `ACTIVE` `organization_worker` reads their organization's rows
(a removed teammate reads nothing), including the companies of its prospects
(`core_v2_my_company_ids`) and the contacts of every company it can see (`core_v2_my_contact_ids`);
a viewer also reads client groups attached through `client_group_viewer`; `subscription` is
manager-only. Write: the mirror tables have **no**
user write policy and the privilege is revoked — a user write would be overwritten by the next
sync. An MCP/AI token cannot write `issue` / `profit` / `churn` (restrictive `mcp_no_*`
policies, created only if `is_mcp_session()` exists).

**Known limits.** The per-entity read/write matrix in `plans.config.js` `ROLES` has no equivalent
in the new schema (`member_authority` is one flat grant set per member) and is not reconstructed.
ARR from profit sums amounts in whatever currency each row carries; with zero conversion that is
only meaningful while an organization records its revenue in one currency (the organization's).
About 30 other tables store
`organization_id` / `client_id` / `user_id` as UUIDs and their RLS reads `profiles.organization_id`
(`copils` and `client_notes` even have foreign keys to `clients`), so the old tables cannot be
dropped until those are repointed to the new ids. Company currency is filled once from the owner's old
`user_profiles.currency`; after that only a manager changes it (`core_v2_set_organization_currency`). The account-erasure flow (`account/delete.js`) does not
know about `core_v2`; it is covered only through the `profiles` DELETE trigger.

**Not applied to Supabase yet.** Pre-prod first, checks in each file's header, then prod on an
explicit go. The three files **were** run (20/09/2026) on a local PostgreSQL 16.4 with stand-ins
for Supabase's `auth` schema and roles and for the six old tables (columns from
`SCHEMA_FROM_CODE.sql`): apply, re-apply (idempotent), backfill of seeded legacy data, live
trigger behaviour (join / role change / can_send_email / removal / re-join / plan change / client
lifecycle), forged bridge values, fail-open with a deliberately broken projection, erasure, and
RLS from a member, an admin, a viewer, an ended worker, `anon` and an `ai_agent` token — 196
assertions, all passing (32 added 24/09/2026 with stage 1: the RPCs as member / admin / viewer /
AI session / `anon`, the consent log, the transitional mirror, idempotent re-runs; then stage 3a:
public ids, prospect companies, contacts, health, the opening profit row, churn, and the RLS of
prospect companies and contacts — which found a fourth bug, contacts never mirrored by the backfill) (re-run after `CORE-V2-COLUMNS`: role / seniority / `joined_at`, the CSM
mirror and prospects, including a client moved between organizations; re-run again 24/09/2026 after
role / seniority moved to `organization_worker`: the composite foreign key refusing another
organization's role, a demotion to viewer keeping both, an `ENDED` row keeping them, and deleting
an organization whose workers hold roles). The runs found three bugs,
all fixed: the `auth.users` foreign key defeating the erasure trigger, the backfill report calling
a deliberate skip a failure, and a CSM being assigned across organizations. What
it **cannot** show: the real Supabase role grants, the real column sets and any existing
`updated_at` / seat-limit triggers on the dashboard-created tables — hence the pre-prod run.

## Retiring the old core tables

Decided 20/09/2026 (the old tables go), 24/09/2026 (one at a time) and confirmed 26/09/2026: all five —
`user_profiles`, `organization_members`, `clients`, `organizations`, `profiles`. Each old table goes through
the same three steps: the front end **reads** core_v2, then **writes** it, then a **new** migration
drops the table and its sync trigger. Applied migration files are never deleted.

| Stage | Old table | Replaced by | Blocked on |
|---|---|---|---|
| 1 | `user_profiles` | `company.currency_code`, `organization_worker` (role, seniority, `onboarding_completed`), `consent` | **Written 24/09/2026, not deployed** — see below |
| 2 | `organization_members` | `organization_worker`, `member` / `manager`, `member_authority` | Invite / accept / removal / seat counting (13 files incl. the MCP tenant check) rewritten; seats counted from `ACTIVE` workers until the subscription-information table exists |
| 3 | `clients` | `company` (identity, `public_id` = the old uuid) + `client_group` / `prospect`, contacts as viewers, ARR as `profit`, churn as `churn` | **3a written 24/09/2026, not applied** (schema + mirror + backfill, below). Next: 3b the store reads core_v2; 3c writes through RPCs, a per-client revenue (profit) list replacing the ARR / MRR fields, and the 7 tables' `client_id` foreign keys moved from `clients(id)` to `company(public_id)` — plus `notifications.target_id` and its `/app/clients/<id>` route, which hold a client id with no foreign key and keep working as they are; 3d the drop |
| 4 | `organizations` + `profiles` | `company` / `organization`, `personage` / `organization_worker` | The subscription-information table (plan tier — undecided —, seats, `TRIAL`, Stripe ids; never a column of `organization` / `organization_worker`); the organization-setup onboarding flag; the RLS of ~13 migration files that finds the organization through `profiles`; the kept tables' references (decided 26/09/2026, see below) |

**Stage 1 — `user_profiles`** (`20260924100000_core_v2_stage1_user_profiles.sql`)

- **Currency** belongs to the organization (`company.currency_code`) and to each profit amount
  (`profit.currency_code`), never to a person (`CURRENCY-ORG`). Only a manager (owner / admin)
  changes it; the Settings picker is disabled for everyone else.
- **Questionnaire** (`OnboardingWizard`) is now role → seniority → consents, saved in one call.
  Industry, company size, portfolio size and goals were dropped (decided 20/09/2026), and so was
  their place in the AI context (`profile.toAIContext` sends role and seniority only).
- **RPCs** (`SECURITY DEFINER`, `mcp_guard()` on the two writes): `core_v2_my_profile()` →
  `{ organization_id, currency, role, seniority, onboarding_completed, is_manager }` or `NULL`;
  `core_v2_set_organization_currency(code)`; `core_v2_complete_onboarding(role, seniority,
  ai_consent, analytics_consent)`. Both writes raise rather than return a silent no-op (D-14).
  They are **not** listed in `mcp_security_check()`; they guard themselves.
- **Deploy order:** apply the migration, then deploy the front end. The old front end keeps
  working in between — it still writes `user_profiles`, and `trg_core_v2_user_profile_mirror`
  copies completed answers and consents into core_v2.
- **The drop migration (not written yet)** runs once the stage-1 front end is live and verified. It
  must re-run the stage-1 backfill (answers given through the old front end by someone with no
  `ACTIVE` worker at the time), drop the mirror trigger and its functions, drop
  `create_user_profile()` on `auth.users`, remove the `user_profiles` read from `core_v2_org_sync`,
  then drop the table.

**Stage 3a — `clients`: schema, mirror, backfill** (in the three core_v2 files, never applied)

- Decided 24/09/2026: health / NPS / churn risk / renewal date **stay** on `client_group`; ARR is
  computed from `profit` (last 12 months, MRR = ARR / 12) and users will record revenue as entries;
  contacts use the model's viewers (`client_group_viewer`); the 7 tables that hold a client uuid
  keep it, pointing at `company.public_id`; the core_v2 `organization` is left unchanged.
- The app does not change in 3a: `clients` stays the source and everything is mirrored.

**The kept tables' references** (the 30 old tables that stay — drawn in
[DATABASE_DIAGRAM_CORE_V2.md](DATABASE_DIAGRAM_CORE_V2.md#8-old-tables-that-stay)):

- **Client ids** (8 tables, `notifications.target_id` included) keep their values and move their foreign keys
  to `company(public_id)` — stage 3c.
- **Person columns** (28 tables) keep their values, the login uuid; a person is found through
  `member.auth_user_id` / `viewer.auth_user_id` (decided 26/09/2026). The foreign key goes to `auth.users`:
  one column cannot reference both `member` and `viewer`, and a member → viewer change deletes the `member`
  row — an FK to it would cascade to, or block on, everything that person wrote.
- **Organization ids** (9 tables), decided per table on 26/09/2026: `chat_channels` / `chat_messages` →
  `company.id`; `invitations` → `organization(company_id)` (the organization's key — there is no
  `organization.id`); `client_notes` and `quotes` on hold; `client_metrics`, `email_templates`, `promo_codes`,
  `activity_log` not decided. Both decided targets are bigint: those columns change type from uuid and every
  row is rewritten; `company.id` also admits a client company, `organization(company_id)` only an organization.

## RLS model

Three patterns are used, in increasing order of openness:

1. **Self-only** — `auth.uid() = user_id`. Oxygen tables, `planning_events`, `snapshots`,
   AI history.
2. **Org-scoped read, restricted write** — the read policy is a `profiles` subquery
   (`organization_id = (select organization_id from profiles where id = auth.uid())`).
3. **Org-wide read *and* write** — `clients`, `client_notes`, `client_metrics`, `quotes`.
   This was a deliberate product decision (FB-05, 20/07): any CSM in the organization
   must be able to complete a record when the assigned CSM is away. Delete usually stays
   with the author or the owner.

Helper functions are `SECURITY DEFINER` to avoid RLS recursion, and they set
`search_path = public` as a hardening measure.

### Server-only columns

Some columns are unreachable from the client by construction. A column-level `REVOKE`
alone would be ineffective while a table-level `GRANT` exists, so the migrations
`REVOKE` the table and then re-`GRANT` only the safe columns:

- `org_email_config` — no client access at all. Status is read through the
  `get_org_email_status` RPC (a boolean plus non-sensitive fields).
- `org_integrations.access_token / refresh_token / config` — `service_role` only. The
  client keeps the list (safe columns) and the disconnect (`DELETE`).
- Billing columns on `profiles` and `organizations` — trigger-protected against
  `authenticated`, so a client-side self-grant of a plan is impossible.

## RPCs

| Function | Purpose |
|---|---|
| `get_my_org_id()` | `SECURITY DEFINER` helper used by the org policies |
| `get_org_member_names()` | Minimal exposure (id, first name, last name) of the caller's org members. A full org RLS policy on `profiles` is **excluded** — that table carries secrets. |
| `get_org_email_status()` | Boolean configuration status, for owner **and** members |
| `open_dm(other_user_id)` | Atomic find-or-create of a 1-to-1 DM |
| `can_read_chat_message(id)` | `SECURITY DEFINER` visibility check that mirrors `chat_messages_select` + the DM clause of `chat_channels_select`. **Parity is mandatory**: change either policy, change this. |
| `toggle_chat_reaction(id, emoji)` | Adds or removes the caller's reaction, under a row lock (concurrent reactors no longer overwrite each other). Returns the confirmed `reactions` array. Only reachable for a message the caller can read. |
| `set_chat_message_pinned(id, pinned)` | Pin/unpin any readable message. Both RPCs exist because `chat_messages_update` is `user_id = auth.uid()`, so a direct `UPDATE` on someone else's message returned 204 with `error = null` — a false success (D-14). |
| `oxygen_team_aggregate()` | The only path to team well-being data. `SECURITY DEFINER`, **owner-only**, literal `n ≥ 5` threshold in the body (not parameterizable), fail-closed when the org flag is off, 14-day window plus trend. Returns team averages only — **no individual data**. |
| `notify_client_note()` | Trigger: notifies a client's owner when a colleague adds a note. `SECURITY DEFINER` because `notifications` enforces `user_id = auth.uid()` on insert. |
| `check_client_limit()` / `enforce_client_limit` | Client quota per organization, prospects excluded |
| `enforce_org_seat_limit` | Seat ceiling on member insert |

## Storage

`copil-media` — **private** bucket, 5 MB limit, `image/png|jpeg|webp`. Object key is
`<user_id>/<copil_id>/<block_id>.<ext>`; the policies allow each user only on their own
prefix. The block stores the **path**; the front end resolves a 1-hour signed URL at read
time and caches it.

## The 1000-row cap

PostgREST caps every response at 1000 rows **without an error**. Any "whole dataset" read
must go through `src/lib/fetchAllRows.js` with `count: 'exact'` and a stable sort. The
same problem applies to writes: an unbounded `.in('id', […])` list blows up the URL past
~1000 ids and fails silently, so bulk updates are done with a server-side **filter** that
covers the same scope.

## Migration protocol

1. Write the migration idempotently.
2. Apply it on **pre-prod** first, run the checks in its header comment.
3. Get an explicit go, then apply it on **prod**.
4. Respect the stated ordering against the front-end deploy. Some migrations must land
   *before* the front end (for example `notifications_payload`: `generateFromData` inserts
   the `payload` column, and without it every insert fails).
