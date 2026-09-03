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
| `chat_messages` | Published to `supabase_realtime` |
| `notifications` | `type` + `payload` (a snapshot of the values at alert time); title/body are rendered in the **reader's** locale by `src/lib/notifText.js` |
| `ai_conversations`, `ai_messages` | Persisted AI history |
| `ai_usage` | One row per quota-consuming AI call (`coach`, `nova` only) |
| `email_templates` | Custom templates, org-scoped |
| `sent_emails` | Send log, with open tracking |
| `org_email_config` | Resend key (AES-256-GCM), sender domain and name — **no client access at all** |
| `org_integrations` | Integration rows; `access_token` / `refresh_token` / `config` are revoked from the client |
| `alpha_feedback` | In-product feedback widget |
| `promo_codes` | Alpha / founding codes |

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
