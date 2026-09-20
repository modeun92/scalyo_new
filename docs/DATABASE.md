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
| `20260920110000_core_v2_sync_triggers` | Bridge columns `organizations.core_organization_id` / `clients.core_client_group_id` + fail-open triggers that mirror `organizations`, `profiles`, `organization_members`, `clients` into `core_v2` |
| `20260920120000_core_v2_backfill` | One-time, idempotent mirror of the rows that already exist (re-uses the triggers) |
| `20260721000000_copils_client_id` (front) | Idempotent guarantee that `copils.client_id` exists |
| `20260721010000_notify_client_note` (front) | Trigger notifying a client's owner when a colleague adds a note |
| `20260801120000_planning_recurrence` (front) | `planning_events.recurrence` + `series_id` |

## Tables

### Identity and organization

| Table | Notes |
|---|---|
| `profiles` | The auth profile: plan, trial fields, `organization_id`, `org_role`, locale, Stripe ids. Billing columns are trigger-protected against `authenticated`. `resend_api_key` is a dead column, blocked from rewriting. |
| `user_profiles` | Extended profile: role, seniority, company size, sector, **currency** (the account currency used by every money formatter) |
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

`docs/new_database_code.txt` is a ground-up redesign of the core model, derived from the C++
class model in `docs/Database Plan.txt`. It is built **next to** the current schema, not in
place of it. **Nothing in the application reads or writes it yet**: `organizations`,
`profiles`, `user_profiles`, `clients`, `organization_members` and `invitations` remain the
source of truth for every screen, plan check, seat count and invitation.

**Direction (decided 20/09/2026).** The old core tables are to be **deleted**, in stages: the front
end first reads, then writes the new schema; every table that references the old ids is repointed;
then the old tables are dropped by a *new* migration (applied migration files are never deleted).
So every column the product still needs must end up in the new schema — see `CORE-V2-COLUMNS`
below. Decided to be **dropped, never migrated**: `arr`, `mrr`, `health`, `nps`, `churn_risk`,
`renewal_date` and `contacts` (clients), `is_founding`, every `user_profiles` column except `role`
and `seniority`, and the `profiles` plan / trial / Stripe / onboarding / region / alpha columns.
**Still to design:** the subscription-information table (seats, plan tiers, `TRIAL` as a type,
the Stripe ids) and the Oxygen module (which will reference `member`).

| New table | Is a projection of | Notes |
|---|---|---|
| `company` (+ `organization`, `client_group`) | `organizations` / non-prospect `clients` | `country_code` and `currency_code` are **nullable** (`CORE-V2-COUNTRY`): `organizations` has no country and no per-org currency. `photo_path` ← `clients.logo` (an empty logo becomes `NULL`). `client_group` also carries `industry` and `notes` (`CORE-V2-COLUMNS`). |
| `prospect` | `clients` with `lifecycle = 'prospect'` | **Independent** of `company` / `client_group`, like `issue`: an organization, a name, `industry`, `photo_path`, `notes`, a `pipeline_stage` (`NEW` · `CONTACTED` · `QUALIFIED` · `WON` · `LOST`) and an owner `member_id` (the old `csm_id`). A prospect has no health and never enters portfolio counters — true by construction now. When it is won and becomes a client, `client_group_id` points at the new client group and the row stays as funnel history. |
| `organization_role` + `member.role_id` | `user_profiles.role` | A per-organization role list shaped like `organization_position` (unique by name) but **not** reached through `organization_worker.position_id`. `name` is the persisted key (`csm`, `head_cs`, …), rendered through i18n. `role_custom` is dropped. The sync resolves the role inside the member's own organization; `member` carries no organization, so no constraint can prove it. |
| `member.seniority` | `user_profiles.seniority` | A plain integer rank: junior 1 · mid 2 · senior 3 · lead 4 · director 5 · vp 6 · c_level 7; anything else `NULL` |
| `organization_client_group` | `clients.organization_id` | Unique on `client_group_id`: a client group belongs to one organization |
| `personage` + `member` / `viewer` (+ `manager`) | `profiles` + `organization_members` | Linked to the login by `member.auth_user_id` / `viewer.auth_user_id` (nullable, unique, **no foreign key** to `auth.users` — `SET NULL` would null the link before the erasure trigger could use it; orphans are found with check 12.6) |
| `organization_worker` | `profiles.organization_id` | `ACTIVE` while in the organization, `ENDED` (kept) after removal; one organization per personage. `joined_at` ← `organization_members.joined_at` (`NULL` when unknown, never invented) |
| `member_authority` | the role + `organization_members.can_send_email` | The `authority` enum is the source's four verbs **plus** `INVITE`, `SEND_EMAIL`, `ASSIGN_CLIENT_GROUP` (`CORE-V2-AUTHORITY`). owner + admin → manager (VIEW, CREATE, UPDATE, DELETE, INVITE, ASSIGN_CLIENT_GROUP) · member → VIEW, CREATE, UPDATE · viewer → none. `SEND_EMAIL` mirrors `can_send_email` for any member/manager and is implicit for the billing owner (`api/email.js` sends as the owner's own config). `ASSIGN_CLIENT_GROUP` gates changing a client group's assignee (`member_client_group`); nothing enforces it yet — today any org member can reassign a CSM |
| `organization.owner_personage_id` | `organizations.owner_id` | The new model has no owner/admin distinction, so the billing owner is recorded here |
| `subscription` | `organizations.plan` changes | A **history log**, one row per change, lossy tiers (starter → BASIC, growth/elite → PRO, enterprise → ENTERPRISE, none → FREE). `issue_date` is when it was *recorded*. Read by nothing. |
| `issue`, `profit`, `churn` | — | No source and no UI yet; the only `core_v2` tables a user can write, gated on their own `member_authority` |
| `country`, `currency`, `language_region` | — | Foreign-key targets seeded from `config/currencies.js`, `countryLaws.js` and the three locales. **Never rendered** — display names still come from `Intl` + i18n |
| `member_client_group` | `clients.csm_id` | The client's CSM. `csm_id` is a single assignee, so the mirror **replaces** the assignment. Only a **member who works in the client's own organization** is assigned — a viewer, a member of another organization, or a login that is not (yet) a member leaves it empty, and `core_v2_sync_user` assigns it later if that login joins |
| `company_link`, `personage_link`, `organization_position`, `manager_team`, `client_group_viewer` | — | Created, **left empty**: no current data maps to them |

**How it stays in sync.** `SECURITY DEFINER` triggers on the four old tables (part 2) mirror
every write; part 3 backfills what already exists by re-using those triggers.
`core_v2_sync_user(user_id)` is the single place that turns a login + organization + role into
`personage` / `member` / `manager` / `organization_worker` / `member_authority` / role / seniority /
CSM-assignment rows. It also runs when `user_profiles.role` or `.seniority` changes.

- **Fail-open (`CORE-V2-FAILOPEN`).** Every trigger body catches its own errors and emits a
  `WARNING`; the original write always succeeds. A projection bug is silent drift, not a failed
  signup — re-running part 3 heals it, and its closing report counts what is unmirrored.
- **Bridge columns are not trusted (`CORE-V2-NO-TRUST`).** A user can `UPDATE` their own
  `organizations` row and any teammate can update a `clients` row, so a supplied
  `core_organization_id` / `core_client_group_id` / `core_prospect_id` could point at another
  tenant's company or prospect. The
  BEFORE triggers discard the supplied value and restore the stored one. There is deliberately
  no `profiles.core_personage_id`: the link is `member/viewer.auth_user_id`, which users cannot write.
- **Deletes cascade the mirror.** Deleting a profile deletes its `personage` (name + email are
  personal data); deleting an organization or client deletes its company. `issue` / `profit` /
  `churn` are `ON DELETE RESTRICT`, so if any exist the mirror delete fails with a warning and
  the old delete still goes through.
- **Prospects are not client groups.** A `clients` row with `lifecycle = 'prospect'` mirrors into
  `prospect`; a client into `client_group`. A row that goes client → prospect gets a prospect row
  and **leaves its client group untouched** (pipeline moves forward; deleting a group could hit
  `RESTRICT`-ed issues). A client with no `organization_id` has neither.

**Deviations from the literal DDL in `docs/new_database_code.txt`** (each tagged in the SQL):
`CORE-V2-COUNTRY` (nullable country/currency — R21); `CORE-V2-CG-ORG` (the source DDL indexes and
validates against `client_group.organization_id`, a column that does not exist — the link is
`organization_client_group`, and run as written the index fails and the scope trigger raises on
every write); `CORE-V2-AUTH-LINK`; `CORE-V2-AUTHORITY`; `CORE-V2-COLUMNS` (`organization_role`,
`member.role_id` / `seniority`, `organization_worker.joined_at`, `client_group.industry` / `notes`,
`prospect`, the `pipeline_stage` enum); `CORE-V2-OWNER`.

**RLS (`CORE-V2-RLS`).** Read: an `ACTIVE` `organization_worker` reads their organization's rows
(a removed teammate reads nothing); a viewer also reads client groups attached through
`client_group_viewer`; `subscription` is manager-only. Write: the mirror tables have **no**
user write policy and the privilege is revoked — a user write would be overwritten by the next
sync. An MCP/AI token cannot write `issue` / `profit` / `churn` (restrictive `mcp_no_*`
policies, created only if `is_mcp_session()` exists).

**Known limits.** The per-entity read/write matrix in `plans.config.js` `ROLES` has no equivalent
in the new schema (`member_authority` is one flat grant set per member) and is not reconstructed.
Dropping `health` / `nps` / `churn_risk` / `renewal_date` also drops the data behind the health
colours, the Satisfaction view, the renewal alerts and the MCP risk / renewal tools: those screens
keep working only while the old `clients` table exists. About 30 other tables store
`organization_id` / `client_id` / `user_id` as UUIDs and their RLS reads `profiles.organization_id`
(`copils` and `client_notes` even have foreign keys to `clients`), so the old tables cannot be
dropped until those are repointed to the new ids. Company currency is filled from the owner's `user_profiles.currency` once
and not re-synced when they change it. The account-erasure flow (`account/delete.js`) does not
know about `core_v2`; it is covered only through the `profiles` DELETE trigger.

**Not applied to Supabase yet.** Pre-prod first, checks in each file's header, then prod on an
explicit go. The three files **were** run (20/09/2026) on a local PostgreSQL 16.4 with stand-ins
for Supabase's `auth` schema and roles and for the six old tables (columns from
`SCHEMA_FROM_CODE.sql`): apply, re-apply (idempotent), backfill of seeded legacy data, live
trigger behaviour (join / role change / can_send_email / removal / re-join / plan change / client
lifecycle), forged bridge values, fail-open with a deliberately broken projection, erasure, and
RLS from a member, an admin, a viewer, an ended worker, `anon` and an `ai_agent` token — about
140 assertions, all passing (re-run after `CORE-V2-COLUMNS`: role / seniority / `joined_at`, the CSM
mirror and prospects, including a client moved between organizations). The runs found three bugs,
all fixed: the `auth.users` foreign key defeating the erasure trigger, the backfill report calling
a deliberate skip a failure, and a CSM being assigned across organizations. What
it **cannot** show: the real Supabase role grants, the real column sets and any existing
`updated_at` / seat-limit triggers on the dashboard-created tables — hence the pre-prod run.

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
