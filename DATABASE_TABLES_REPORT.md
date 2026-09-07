# Database tables — report derived from source

**Generated** 7 September 2026 · **Scope** every table the Scalyo application reads or writes.

This report is built from two primary sources only:

1. the **25 `.sql` files** in the repository (`supabase/migrations/`, `app-v2/frontend/supabase/migrations/`, `app-v2/frontend/_migrations/`);
2. every **CRUD call site** in the application — 295 `.js` / `.vue` / `.ts` files across `src/`, `functions/api/` and `supabase/functions/`.

No documentation was consulted. Where this report contradicts a file under `docs/` or `CLAUDE.md`, the contradiction is deliberate and the underlying evidence is cited.

---

## 1. Summary

| | Count |
|---|---|
| Tables the code reads or writes | **35** |
| Distinct columns identified | **321** |
| Tables with a `CREATE TABLE` in the repo | **8** |
| Tables with only `ALTER`s in the repo | **7** |
| Tables with **no** SQL in the repo at all | **20** |

Column-level confidence:

| Confidence | Columns | Meaning |
|---|---:|---|
| confirmed | **96** | Name *and* type read verbatim from a `CREATE TABLE` / `ALTER TABLE` |
| inferred | **145** | Name proven by a real query; type inferred from naming convention |
| inferred&sup1; | **80** | As above, and only one call site in the codebase touches it |

> **225 of 321 columns (70%) carry a type that is inferred, not established.** Constraints, defaults, foreign keys, `UNIQUE`, `CHECK`, indexes and RLS cannot be recovered from application code and are absent from every reconstructed table below.

---

## 2. Principal finding

### A checkout of this repository cannot rebuild the database.

Only **8 of the 35 tables** have a `CREATE TABLE` statement anywhere in the repository:

- `chat_channel_members`
- `chat_channels`
- `chat_messages`
- `client_metrics`
- `client_notes`
- `quotes`
- `sent_emails`
- `user_profiles`

The remaining **27** were created outside version control — in the Supabase dashboard — and survive here only as `ALTER TABLE` statements and RLS policies. The clearest demonstration is `20260718200000_clients_csm_id.sql`, which runs `ALTER TABLE clients ADD COLUMN csm_id …` against a table nothing in the repository ever creates.

Consequences:

- A new environment cannot be provisioned from this repository.
- Migrations are not replayable from empty; they assume a hand-built starting state.
- The schema of 27 tables — including `profiles`, `clients`, `organizations` and `tasks` — exists in exactly one place: the live database.

---

## 3. Table inventory

`SQL` = created by a migration · `ALTER only` = modified but never created · `code only` = no SQL in the repository whatsoever.

| Table | Source | Cols | Confirmed | Operations | Layers |
|---|---|---:|---:|---|---|
| `activity_log` | code only | 6 | 0 | insert | api |
| `ai_conversations` | code only | 6 | 0 | delete, insert, select, update | frontend |
| `ai_messages` | code only | 6 | 0 | delete, insert, select | frontend |
| `alpha_feedback` | code only | 3 | 0 | insert | frontend |
| `api_keys` | code only | 6 | 0 | select, update | edge |
| `chat_channel_members` | SQL | 3 | 3 | select | frontend |
| `chat_channels` | SQL | 9 | 9 | delete, insert, select, update | frontend |
| `chat_messages` | SQL | 12 | 12 | delete, insert, select, update | frontend |
| `client_metrics` | SQL | 9 | 9 | delete, select, upsert | frontend |
| `client_notes` | SQL | 8 | 8 | delete, insert, select | frontend |
| `clients` | ALTER only | 21 | 1 | delete, insert, select, update, upsert | api, edge, frontend |
| `copils` | ALTER only | 18 | 1 | delete, insert, select, update | frontend |
| `email_templates` | ALTER only | 7 | 1 | delete, insert, select, update | frontend |
| `invitations` | code only | 8 | 0 | delete, insert, select, update | api |
| `notifications` | ALTER only | 6 | 1 | delete, insert, select, update | frontend |
| `org_email_config` | code only | 6 | 0 | delete, insert, select, update | api |
| `org_integrations` | code only | 7 | 0 | delete, insert, select, update | api, frontend |
| `organization_members` | code only | 6 | 0 | delete, insert, select, update | api, frontend |
| `organizations` | ALTER only | 10 | 1 | insert, select, update | api, frontend |
| `oxygen_checkins` | code only | 6 | 0 | select, upsert | frontend |
| `oxygen_daily` | code only | 4 | 0 | select, upsert | frontend |
| `oxygen_recoveries` | code only | 8 | 0 | insert, select | frontend |
| `planning_events` | ALTER only | 8 | 2 | delete, insert, select, update | frontend |
| `playbooks` | code only | 13 | 0 | delete, insert, select, update | frontend |
| `profiles` | ALTER only | 16 | 1 | select, update | api, edge, frontend |
| `projects` | code only | 6 | 0 | delete, insert, select, update | frontend |
| `promo_codes` | code only | 6 | 0 | select, update | api |
| `quotes` | SQL | 13 | 13 | delete, insert, select, update | frontend |
| `roadmaps` | code only | 9 | 0 | delete, insert, select, update | frontend |
| `sent_emails` | SQL | 13 | 13 | insert, select, update | edge, frontend |
| `snapshots` | code only | 4 | 0 | delete, insert, select, update | frontend |
| `tasks` | code only | 30 | 0 | delete, insert, select, update | api, edge, frontend |
| `team_members` | code only | 2 | 0 | insert, select | edge |
| `user_profiles` | SQL | 21 | 21 | select, upsert | api, frontend |
| `webhooks` | code only | 5 | 0 | select, update | edge |

---

## 4. Tables defined in SQL

These 8 are authoritative — every column is read verbatim from a migration.

### `chat_channel_members`

Touched by `src/stores/chat.js` — select.

| Column | Type / definition | Source |
|---|---|---|
| `added_at` | `timestamptz not null default now()` | confirmed |
| `channel_id` | `uuid not null references public.chat_channels(id) on delete cascade` | confirmed |
| `user_id` | `uuid not null references auth.users(id) on delete cascade` | confirmed |

Indexes: `chat_channel_members_user_idx` (user_id).

RLS: 1 policies — 1 select.

### `chat_channels`

Touched by `src/stores/chat.js` — delete, insert, select, update.

| Column | Type / definition | Source |
|---|---|---|
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | confirmed |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | confirmed |
| `created_by` | `uuid REFERENCES auth.users(id) ON DELETE SET NULL` | confirmed |
| `description` | `text DEFAULT ''` | confirmed |
| `dm_key` | `text` | confirmed |
| `name` | `text NOT NULL` | confirmed |
| `organization_id` | `uuid` | confirmed |
| `team_id` | `uuid` | confirmed |
| `type` | `text NOT NULL DEFAULT 'channel' CHECK (type IN ('channel', 'dm'))` | confirmed |

Indexes: `chat_channels_team_idx` (team_id), `chat_channels_dm_key_idx` (organization_id, dm_key).

RLS: 11 policies — 1 all, 2 delete, 3 insert, 3 select, 2 update.

### `chat_messages`

Touched by `src/stores/chat.js` — delete, insert, select, update.

| Column | Type / definition | Source |
|---|---|---|
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | confirmed |
| `attachments` | `jsonb DEFAULT '[]'` | confirmed |
| `author_name` | `text NOT NULL DEFAULT ''` | confirmed |
| `channel_id` | `uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE` | confirmed |
| `content` | `text NOT NULL` | confirmed |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | confirmed |
| `edited_at` | `timestamptz` | confirmed |
| `organization_id` | `uuid` | confirmed |
| `pinned` | `boolean NOT NULL DEFAULT false` | confirmed |
| `reactions` | `jsonb DEFAULT '[]'` | confirmed |
| `reply_to` | `uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL` | confirmed |
| `user_id` | `uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` | confirmed |

Indexes: `chat_messages_channel_idx` (channel_id, created_at DESC), `chat_messages_user_idx` (user_id).

RLS: 11 policies — 1 all, 2 delete, 3 insert, 3 select, 2 update.

### `client_metrics`

Touched by `src/stores/clientMetrics.js` — delete, select, upsert.

| Column | Type / definition | Source |
|---|---|---|
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | confirmed |
| `client_id` | `uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE` | confirmed |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | confirmed |
| `kpi_id` | `text NOT NULL` | confirmed |
| `organization_id` | `uuid` | confirmed |
| `period` | `date NOT NULL` | confirmed |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | confirmed |
| `user_id` | `uuid REFERENCES public.profiles(id) ON DELETE SET NULL` | confirmed |
| `value` | `numeric NOT NULL` | confirmed |

Indexes: `idx_client_metrics_org` (organization_id), `idx_client_metrics_client` (client_id, kpi_id, period DESC).

RLS: 4 policies — 1 delete, 1 insert, 1 select, 1 update.

### `client_notes`

Touched by `src/stores/clientNotes.js`, `src/stores/oxygenRecoveries.js` — delete, insert, select.

| Column | Type / definition | Source |
|---|---|---|
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | confirmed |
| `author_id` | `uuid REFERENCES public.profiles(id) ON DELETE SET NULL` | confirmed |
| `author_name` | `text NOT NULL DEFAULT ''` | confirmed |
| `client_id` | `uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE` | confirmed |
| `content` | `text NOT NULL` | confirmed |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | confirmed |
| `kind` | `text NOT NULL DEFAULT 'note'` | confirmed |
| `organization_id` | `uuid` | confirmed |

Indexes: `idx_client_notes_client` (client_id, created_at DESC).

RLS: 3 policies — 1 delete, 1 insert, 1 select.

### `quotes`

Touched by `src/stores/quotes.js` — delete, insert, select, update.

| Column | Type / definition | Source |
|---|---|---|
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | confirmed |
| `amount` | `numeric DEFAULT 0` | confirmed |
| `client_id` | `uuid REFERENCES public.clients(id) ON DELETE SET NULL` | confirmed |
| `company` | `text DEFAULT ''` | confirmed |
| `country` | `text DEFAULT 'FR'` | confirmed |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | confirmed |
| `currency` | `text DEFAULT '€'` | confirmed |
| `notes` | `text DEFAULT ''` | confirmed |
| `organization_id` | `uuid` | confirmed |
| `status` | `text NOT NULL DEFAULT 'draft'` | confirmed |
| `tax` | `numeric DEFAULT 0` | confirmed |
| `title` | `text NOT NULL DEFAULT ''` | confirmed |
| `user_id` | `uuid REFERENCES public.profiles(id) ON DELETE SET NULL` | confirmed |

Indexes: `idx_quotes_org` (organization_id, created_at DESC), `idx_quotes_client` (client_id).

RLS: 4 policies — 1 delete, 1 insert, 1 select, 1 update.

### `sent_emails`

Touched by `src/stores/emailStudio.js`, `supabase/functions/send-email/index.ts`, `supabase/functions/track-open/index.ts` — insert, select, update.

| Column | Type / definition | Source |
|---|---|---|
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | confirmed |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | confirmed |
| `from_name` | `text` | confirmed |
| `last_opened_at` | `timestamptz` | confirmed |
| `open_count` | `integer NOT NULL DEFAULT 0` | confirmed |
| `opened_at` | `timestamptz` | confirmed |
| `resend_id` | `text` | confirmed |
| `sent_at` | `timestamptz NOT NULL DEFAULT now()` | confirmed |
| `subject` | `text NOT NULL` | confirmed |
| `template_id` | `integer` | confirmed |
| `to_email` | `text NOT NULL` | confirmed |
| `tracking_id` | `uuid UNIQUE NOT NULL DEFAULT gen_random_uuid()` | confirmed |
| `user_id` | `uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` | confirmed |

Indexes: `sent_emails_user_id_idx` (user_id), `sent_emails_tracking_id_idx` (tracking_id).

RLS: 3 policies — 1 insert, 1 select, 1 update.

### `user_profiles`

Touched by `functions/api/_services/context.service.js`, `functions/api/billing.js`, `src/stores/profile.js` — select, upsert.

| Column | Type / definition | Source |
|---|---|---|
| `id` | `UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE` | confirmed |
| `ai_tone` | `TEXT DEFAULT 'professional'` | confirmed |
| `avg_contract_value` | `INTEGER DEFAULT 0` | confirmed |
| `challenges` | `JSONB DEFAULT '[]'::jsonb` | confirmed |
| `company_size` | `TEXT DEFAULT 'smb'` | confirmed |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | confirmed |
| `currency` | `TEXT DEFAULT 'EUR'` | confirmed |
| `custom_data` | `JSONB DEFAULT '{}'::jsonb` | confirmed |
| `goals` | `JSONB DEFAULT '[]'::jsonb` | confirmed |
| `industry` | `TEXT` | confirmed |
| `industry_custom` | `TEXT` | confirmed |
| `market` | `TEXT DEFAULT 'b2b_saas'` | confirmed |
| `onboarding_completed` | `BOOLEAN DEFAULT false` | confirmed |
| `portfolio_size` | `INTEGER DEFAULT 0` | confirmed |
| `preferred_language` | `TEXT DEFAULT 'fr'` | confirmed |
| `processes` | `JSONB DEFAULT '{}'::jsonb` | confirmed |
| `role` | `TEXT DEFAULT 'csm'` | confirmed |
| `role_custom` | `TEXT` | confirmed |
| `seniority` | `TEXT DEFAULT 'mid'` | confirmed |
| `tools` | `JSONB DEFAULT '[]'::jsonb` | confirmed |
| `updated_at` | `TIMESTAMPTZ DEFAULT now()` | confirmed |

RLS: 3 policies — 1 insert, 1 select, 1 update.

---

## 5. Tables reconstructed from code

For these 27 the repository holds no `CREATE TABLE`. Column **names** are proven — each appears in a real query, mapper or insert payload, with the evidence cited. Column **types** are inferred from naming convention and marked accordingly.

### `activity_log`

Operations: insert · Layer: api.

Call sites: `functions/api/alpha/activate.js`, `functions/api/invitations/[id].js`, `functions/api/invite/accept.js`, `functions/api/members/[id].js`

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `action` | `text` | inferred&sup1; | `.insert()` |
| `changes` | `text` | inferred&sup1; | `.insert()` |
| `entity_id` | `uuid` | inferred&sup1; | `.insert()` |
| `entity_type` | `text` | inferred&sup1; | `.insert()` |
| `organization_id` | `uuid` | inferred&sup1; | `.insert()` |
| `user_id` | `uuid` | inferred&sup1; | `.insert()` |

### `ai_conversations`

Operations: delete, insert, select, update · Layer: frontend.

Call sites: `src/stores/aiHistory.js`

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `id` | `uuid` | inferred | `.eq()` / `.in()` |
| `messages` | `jsonb` | inferred | `.insert()`, `.update()` |
| `module` | `text` | inferred | `.eq()` / `.in()` |
| `title` | `text` | inferred&sup1; | `.insert()` |
| `updated_at` | `timestamptz` | inferred | `.eq()` / `.in()`, `.order()`, `.update()` |
| `user_id` | `uuid` | inferred | `.eq()` / `.in()`, `.insert()` |

### `ai_messages`

Operations: delete, insert, select · Layer: frontend.

Call sites: `src/stores/wellbeing.js`, `src/views/CoachView.vue`

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `id` | `uuid` | inferred | `.select()` |
| `content` | `text` | inferred | `.insert()`, `.select()` |
| `created_at` | `timestamptz` | inferred | `.eq()` / `.in()`, `.order()`, `.select()` |
| `module` | `text` | inferred | `.eq()` / `.in()`, `.insert()` |
| `role` | `text` | inferred | `.insert()`, `.select()` |
| `user_id` | `uuid` | inferred | `.eq()` / `.in()`, `.insert()` |

### `alpha_feedback`

Operations: insert · Layer: frontend.

Call sites: `src/components/FeedbackWidget.vue`

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `category` | `text` | inferred&sup1; | `.insert()` |
| `message` | `text` | inferred&sup1; | `.insert()` |
| `page_route` | `text` | inferred&sup1; | `.insert()` |

### `api_keys`

Operations: select, update · Layer: edge.

Call sites: `supabase/functions/scalyo-api/index.ts`

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `expires_at` | `timestamptz` | inferred | `.select()` |
| `is_active` | `boolean` | inferred | `.select()` |
| `key_hash` | `text` | inferred | `.eq()` / `.in()` |
| `last_used_at` | `timestamptz` | inferred&sup1; | `.update()` |
| `scopes` | `text` | inferred | `.select()` |
| `user_id` | `uuid` | inferred | `.select()` |

### `clients`

Operations: delete, insert, select, update, upsert · Layer: api, edge, frontend · 1 column(s) confirmed by an `ALTER`.

Call sites: `functions/api/_services/context.service.js`, `src/stores/clients.js`, `supabase/functions/scalyo-api/index.ts`, `supabase/functions/scalyo-webhook/index.ts`

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `id` | `uuid` | inferred | `.eq()` / `.in()`, `.order()`, row mapper (read) |
| `arr` | `numeric` | inferred | row mapper (read), row mapper (write) |
| `churn_risk` | `numeric` | inferred | row mapper (read), row mapper (write) |
| `churned_at` | `timestamptz` | inferred | row mapper (read), row mapper (write) |
| `contacts` | `jsonb` | inferred | row mapper (read), row mapper (write) |
| `created_at` | `timestamptz` | inferred | `.eq()` / `.in()`, `.order()`, row mapper (read) |
| `csm` | `text` | inferred | row mapper (read), row mapper (write) |
| `csm_id` | `uuid REFERENCES public.profiles(id) ON DELETE SET NULL` | confirmed | `ALTER 20260718200000_clients_csm_id.sql`, row mapper (read), row mapper (write) |
| `health` | `numeric` | inferred | row mapper (read), row mapper (write) |
| `industry` | `text` | inferred | row mapper (read), row mapper (write) |
| `lifecycle` | `text` | inferred&sup1; | row mapper (read) |
| `logo` | `text` | inferred | row mapper (read), row mapper (write) |
| `mrr` | `numeric` | inferred | row mapper (read), row mapper (write) |
| `name` | `text` | inferred | `onConflict`, row mapper (read), row mapper (write) |
| `notes` | `text` | inferred | row mapper (read), row mapper (write) |
| `nps` | `numeric` | inferred | row mapper (read), row mapper (write) |
| `pipeline_stage` | `text` | inferred&sup1; | row mapper (read) |
| `renewal_date` | `date` | inferred | row mapper (read), row mapper (write) |
| `status` | `text` | inferred | row mapper (read), row mapper (write) |
| `updated_at` | `timestamptz` | inferred | `.update()`, row mapper (write) |
| `user_id` | `uuid` | inferred | `.eq()` / `.in()`, `.insert()`, `onConflict` |

### `copils`

Operations: delete, insert, select, update · Layer: frontend · 1 column(s) confirmed by an `ALTER`.

Call sites: `src/stores/kpis.js`

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `id` | `uuid` | inferred | `.eq()` / `.in()`, row mapper (read) |
| `blocks` | `jsonb` | inferred | insert payload, row mapper (read) |
| `client_id` | `uuid REFERENCES public.clients(id) ON DELETE SET NULL` | confirmed | `ALTER 20260706220000_copils_client_id.sql`, `ALTER 20260721000000_copils_client_id.sql`, insert payload, row mapper (read) |
| `client_logo` | `text` | inferred | insert payload, row mapper (read) |
| `client_name` | `text` | inferred | insert payload, row mapper (read) |
| `color` | `text` | inferred | insert payload, row mapper (read) |
| `created_at` | `timestamptz` | inferred | `.eq()` / `.in()`, `.order()`, insert payload, row mapper (read) |
| `date` | `date` | inferred | insert payload, row mapper (read) |
| `error` | `text` | inferred&sup1; | insert payload |
| `lang` | `text` | inferred | insert payload, row mapper (read) |
| `period` | `date` | inferred | insert payload, row mapper (read) |
| `presenter` | `text` | inferred | insert payload, row mapper (read) |
| `reverted` | `boolean` | inferred&sup1; | insert payload |
| `share_token` | `text` | inferred | insert payload, row mapper (read) |
| `subtitle` | `text` | inferred | insert payload, row mapper (read) |
| `title` | `text` | inferred | insert payload, row mapper (read) |
| `updated_at` | `timestamptz` | inferred | insert payload, row mapper (read) |
| `user_id` | `uuid` | inferred&sup1; | insert payload |

### `email_templates`

Operations: delete, insert, select, update · Layer: frontend · 1 column(s) confirmed by an `ALTER`.

Call sites: `src/stores/emailStudio.js`

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `id` | `uuid` | inferred | `.eq()` / `.in()` |
| `created_at` | `timestamptz` | inferred | `.eq()` / `.in()`, `.order()` |
| `created_by` | `text` | inferred&sup1; | insert payload |
| `failed` | `boolean` | inferred&sup1; | insert payload |
| `organization_id` | `uuid` | confirmed | `ALTER 20260708230000_email_templates_org_rls.sql`, insert payload |
| `owner_id` | `uuid` | inferred&sup1; | insert payload |
| `updated_at` | `timestamptz` | inferred&sup1; | `.update()` |

### `invitations`

Operations: delete, insert, select, update · Layer: api.

Call sites: `functions/api/invitations/[id].js`, `functions/api/invite.js`, `functions/api/invite/accept.js`, `functions/api/invite/verify.js`, `functions/api/members.js` + 1 more

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `id` | `uuid` | inferred&sup1; | REST filter |
| `email` | `text` | inferred&sup1; | `.insert()` |
| `expires_at` | `timestamptz` | inferred&sup1; | `.insert()` |
| `invited_by` | `text` | inferred&sup1; | `.insert()` |
| `organization_id` | `uuid` | inferred | REST filter, `.insert()` |
| `role` | `text` | inferred&sup1; | `.insert()` |
| `status` | `text` | inferred&sup1; | `.update()` |
| `token` | `text` | inferred&sup1; | REST filter |

### `notifications`

Operations: delete, insert, select, update · Layer: frontend · 1 column(s) confirmed by an `ALTER`.

Call sites: `src/stores/notifications.js`

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `id` | `uuid` | inferred | `.eq()` / `.in()`, `.order()`, `.select()` |
| `created_at` | `timestamptz` | inferred | `.eq()` / `.in()`, `.order()` |
| `payload` | `jsonb not null default '{}'::jsonb` | confirmed | `ALTER 20260712143516_notifications_payload.sql` |
| `read` | `boolean` | inferred | `.eq()` / `.in()`, `.update()` |
| `target_id` | `uuid` | inferred | `.select()` |
| `type` | `text` | inferred | `.eq()` / `.in()`, `.select()` |

### `org_email_config`

Operations: delete, insert, select, update · Layer: api.

Call sites: `functions/api/email.js`, `functions/api/email/config.js`, `functions/api/email/test.js`

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `id` | `uuid` | inferred | REST `select=` |
| `owner_id` | `uuid` | inferred | REST filter, `.insert()` |
| `resend_api_key` | `text` | inferred | REST `select=` |
| `sender_domain` | `text` | inferred | REST `select=`, `.insert()` |
| `sender_name` | `text` | inferred | REST `select=`, `.insert()` |
| `updated_at` | `timestamptz` | inferred&sup1; | `.update()` |

### `org_integrations`

Operations: delete, insert, select, update · Layer: api, frontend.

Call sites: `functions/api/integrations/config.js`, `src/stores/integrations.js`

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `id` | `uuid` | inferred | REST `select=`, REST filter, `.eq()` / `.in()`, `.select()` |
| `config` | `jsonb` | inferred | `.insert()`, `.update()` |
| `connected_at` | `timestamptz` | inferred | `.eq()` / `.in()`, `.insert()`, `.order()`, `.select()` |
| `integration_id` | `text` | inferred | `.insert()`, `.select()` |
| `status` | `text` | inferred | `.insert()`, `.select()`, `.update()` |
| `updated_at` | `timestamptz` | inferred | `.select()`, `.update()` |
| `user_id` | `uuid` | inferred | REST filter, `.insert()` |

### `organization_members`

Operations: delete, insert, select, update · Layer: api, frontend.

Call sites: `functions/api/_utils/supabase.js`, `functions/api/alpha/activate.js`, `functions/api/email.js`, `functions/api/invitations/[id].js`, `functions/api/invite.js` + 5 more

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `id` | `uuid` | inferred&sup1; | REST filter |
| `can_send_email` | `boolean` | inferred | REST `select=`, `.insert()`, `.select()`, `.update()` |
| `joined_at` | `timestamptz` | inferred | `.eq()` / `.in()`, `.order()`, `.select()` |
| `organization_id` | `uuid` | inferred | REST filter, `.eq()` / `.in()`, `.insert()` |
| `role` | `text` | inferred | `.insert()`, `.select()`, `.update()` |
| `user_id` | `uuid` | inferred | REST filter, `.eq()` / `.in()`, `.insert()`, `.select()` |

### `organizations`

Operations: insert, select, update · Layer: api, frontend · 1 column(s) confirmed by an `ALTER`.

Call sites: `functions/api/alpha/activate.js`, `functions/api/billing.js`, `functions/api/email.js`, `functions/api/email/config.js`, `functions/api/founding-status.js` + 8 more

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `id` | `uuid` | inferred | REST filter, `.eq()` / `.in()`, `.select()` |
| `is_founding` | `boolean` | inferred | REST filter, `.insert()`, `.select()` |
| `max_clients` | `integer` | inferred | `.insert()`, `.select()` |
| `name` | `text` | inferred | `.insert()`, `.select()`, `.update()` |
| `owner_id` | `uuid` | inferred | REST `select=`, `.insert()` |
| `oxygen_team_enabled` | `boolean not null default false` | confirmed | `ALTER 20260729250000_oxygen_team.sql` |
| `plan` | `text` | inferred | `.insert()`, `.select()` |
| `seats_paid` | `integer` | inferred | `.insert()`, `.select()`, `.update()` |
| `stripe_subscription_id` | `text` | inferred | `.select()` |
| `trial_ends_at` | `timestamptz` | inferred | `.insert()`, `.select()` |

### `oxygen_checkins`

Operations: select, upsert · Layer: frontend.

Call sites: `src/stores/oxygenCheckins.js`, `src/stores/oxygenRecoveries.js`

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `date` | `date` | inferred | `.eq()` / `.in()`, `.order()`, `.select()`, `onConflict` |
| `energy` | `text` | inferred | `.select()` |
| `felt_load` | `text` | inferred | `.select()` |
| `mood` | `text` | inferred | `.select()` |
| `user_id` | `uuid` | inferred | `.eq()` / `.in()`, `onConflict` |
| `word` | `text` | inferred | `.select()` |

### `oxygen_daily`

Operations: select, upsert · Layer: frontend.

Call sites: `src/stores/oxygenDaily.js`, `src/stores/oxygenRecoveries.js`

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `date` | `date` | inferred | `.eq()` / `.in()`, `.order()`, `.select()`, `onConflict` |
| `index` | `text` | inferred | `.select()` |
| `load_score` | `numeric` | inferred | `.select()` |
| `user_id` | `uuid` | inferred | `.eq()` / `.in()`, `onConflict` |

### `oxygen_recoveries`

Operations: insert, select · Layer: frontend.

Call sites: `src/stores/oxygenRecoveries.js`

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `id` | `uuid` | inferred | `.select()` |
| `completed` | `boolean` | inferred | `.eq()` / `.in()`, `.select()` |
| `created_at` | `timestamptz` | inferred | `.select()` |
| `date` | `date` | inferred | `.eq()` / `.in()`, `.order()`, `.select()` |
| `duration_s` | `text` | inferred | `.select()` |
| `kind` | `text` | inferred | `.eq()` / `.in()`, `.select()` |
| `progress_count` | `integer` | inferred | `.select()` |
| `user_id` | `uuid` | inferred | `.eq()` / `.in()` |

### `planning_events`

Operations: delete, insert, select, update · Layer: frontend · 2 column(s) confirmed by an `ALTER`.

Call sites: `src/components/clients/ClientModal.vue`, `src/views/tasks/PlanningView.vue`

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `id` | `uuid` | inferred | `.eq()` / `.in()`, `.select()` |
| `client_id` | `uuid` | inferred | `.eq()` / `.in()` |
| `color` | `text` | inferred&sup1; | `.update()` |
| `end_at` | `timestamptz` | inferred&sup1; | `.update()` |
| `recurrence` | `text NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly'))` | confirmed | `ALTER 20260801120000_planning_recurrence.sql` |
| `series_id` | `uuid` | confirmed | `.eq()` / `.in()`, `ALTER 20260801120000_planning_recurrence.sql` |
| `start_at` | `timestamptz` | inferred | `.eq()` / `.in()`, `.order()`, `.select()`, `.update()` |
| `title` | `text` | inferred | `.select()`, `.update()` |

### `playbooks`

Operations: delete, insert, select, update · Layer: frontend.

Call sites: `src/stores/playbooks.js`

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `id` | `uuid` | inferred | `.eq()` / `.in()`, row mapper (read) |
| `client_id` | `uuid` | inferred | insert payload, row mapper (read) |
| `color` | `text` | inferred | insert payload, row mapper (read) |
| `completed_at` | `timestamptz` | inferred | `.update()`, insert payload, row mapper (read) |
| `created_at` | `timestamptz` | inferred | `.eq()` / `.in()`, `.order()` |
| `csm_id` | `uuid` | inferred | insert payload, row mapper (read) |
| `icon` | `text` | inferred | insert payload, row mapper (read) |
| `started_at` | `timestamptz` | inferred | insert payload, row mapper (read) |
| `status` | `text` | inferred | `.update()`, insert payload, row mapper (read) |
| `steps` | `text` | inferred | `.update()`, row mapper (read) |
| `template_id` | `text` | inferred | insert payload, row mapper (read) |
| `template_key` | `text` | inferred | insert payload, row mapper (read) |
| `user_id` | `uuid` | inferred&sup1; | insert payload |

### `profiles`

Operations: select, update · Layer: api, edge, frontend · 1 column(s) confirmed by an `ALTER`.

Call sites: `functions/api/alpha/activate.js`, `functions/api/billing.js`, `functions/api/email.js`, `functions/api/email/config.js`, `functions/api/invite.js` + 7 more

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `id` | `uuid` | inferred | REST filter, `.eq()` / `.in()`, `.select()` |
| `company_name` | `text` | inferred | `.update()`, insert payload |
| `first_name` | `text` | inferred | `.select()`, insert payload |
| `is_alpha_tester` | `boolean` | inferred&sup1; | `.update()` |
| `last_name` | `text` | inferred | `.select()`, insert payload |
| `locale` | `text` | inferred | `.select()` |
| `onboarding_completed` | `boolean` | inferred&sup1; | `.update()` |
| `org_role` | `text` | inferred&sup1; | `.update()` |
| `organization_id` | `uuid` | inferred | REST `select=`, `.update()` |
| `plan` | `text` | inferred | `.select()` |
| `region` | `text` | inferred&sup1; | `.update()` |
| `resend_api_key` | `text` | confirmed | `ALTER 20260419_profiles_resend.sql` |
| `stripe_customer_id` | `text` | inferred&sup1; | `.update()` |
| `stripe_subscription_id` | `text` | inferred | `.eq()` / `.in()`, `.update()` |
| `trial_started_at` | `timestamptz` | inferred&sup1; | `.update()` |
| `trial_used` | `boolean` | inferred&sup1; | `.update()` |

### `projects`

Operations: delete, insert, select, update · Layer: frontend.

Call sites: `src/stores/tasks.js`

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `id` | `uuid` | inferred | `.eq()` / `.in()`, row mapper (read) |
| `color` | `text` | inferred&sup1; | row mapper (read) |
| `created_at` | `timestamptz` | inferred | `.eq()` / `.in()`, `.order()` |
| `name` | `text` | inferred&sup1; | row mapper (read) |
| `status` | `text` | inferred&sup1; | row mapper (read) |
| `user_id` | `uuid` | inferred | `.eq()` / `.in()` |

### `promo_codes`

Operations: select, update · Layer: api.

Call sites: `functions/api/alpha/activate.js`

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `id` | `uuid` | inferred&sup1; | REST filter |
| `activated_at` | `timestamptz` | inferred&sup1; | `.update()` |
| `code` | `text` | inferred&sup1; | REST filter |
| `expires_at` | `timestamptz` | inferred&sup1; | `.update()` |
| `organization_id` | `uuid` | inferred&sup1; | `.update()` |
| `status` | `text` | inferred&sup1; | `.update()` |

### `roadmaps`

Operations: delete, insert, select, update · Layer: frontend.

Call sites: `src/stores/roadmap.js`

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `id` | `uuid` | inferred | `.eq()` / `.in()` |
| `color` | `text` | inferred&sup1; | insert payload |
| `created_at` | `timestamptz` | inferred | `.eq()` / `.in()`, `.order()` |
| `icon` | `text` | inferred&sup1; | insert payload |
| `milestones` | `jsonb` | inferred | `.update()`, insert payload |
| `name` | `text` | inferred&sup1; | insert payload |
| `status` | `text` | inferred&sup1; | insert payload |
| `template_id` | `text` | inferred&sup1; | insert payload |
| `user_id` | `uuid` | inferred&sup1; | insert payload |

### `snapshots`

Operations: delete, insert, select, update · Layer: frontend.

Call sites: `src/stores/snapshots.js`

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `id` | `uuid` | inferred | `.eq()` / `.in()` |
| `date` | `date` | inferred | `.eq()` / `.in()`, `.insert()`, `.order()` |
| `kpis` | `jsonb` | inferred | `.insert()`, `.update()` |
| `user_id` | `uuid` | inferred&sup1; | `.insert()` |

### `tasks`

Operations: delete, insert, select, update · Layer: api, edge, frontend.

Call sites: `functions/api/_services/context.service.js`, `src/stores/tasks.js`, `supabase/functions/scalyo-api/index.ts`, `supabase/functions/scalyo-webhook/index.ts`

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `id` | `uuid` | inferred | `.eq()` / `.in()`, row mapper (read), row mapper (write) |
| `actual_hours` | `numeric` | inferred&sup1; | row mapper (read) |
| `assignee` | `text` | inferred&sup1; | row mapper (read) |
| `client_id` | `uuid` | inferred&sup1; | row mapper (read) |
| `color` | `text` | inferred&sup1; | row mapper (write) |
| `created_at` | `timestamptz` | inferred | `.eq()` / `.in()`, `.order()`, row mapper (read) |
| `description` | `text` | inferred&sup1; | row mapper (read) |
| `difficulty` | `text` | inferred&sup1; | row mapper (read) |
| `due_date` | `date` | inferred&sup1; | row mapper (read) |
| `end_date` | `date` | inferred&sup1; | row mapper (read) |
| `expected_hours` | `numeric` | inferred&sup1; | row mapper (read) |
| `finished` | `boolean` | inferred&sup1; | row mapper (read) |
| `importance` | `text` | inferred&sup1; | row mapper (read) |
| `level` | `text` | inferred&sup1; | row mapper (read) |
| `max_hours` | `numeric` | inferred&sup1; | row mapper (read) |
| `min_hours` | `numeric` | inferred&sup1; | row mapper (read) |
| `name` | `text` | inferred&sup1; | row mapper (write) |
| `parent_id` | `uuid` | inferred | `.eq()` / `.in()`, row mapper (read) |
| `pended` | `text` | inferred&sup1; | row mapper (read) |
| `priority` | `text` | inferred&sup1; | row mapper (read) |
| `project_id` | `uuid` | inferred | `.eq()` / `.in()`, row mapper (read) |
| `start_date` | `date` | inferred&sup1; | row mapper (read) |
| `status` | `text` | inferred | row mapper (read), row mapper (write) |
| `subtasks` | `text` | inferred&sup1; | row mapper (read) |
| `tags` | `jsonb` | inferred&sup1; | row mapper (read) |
| `task_type` | `text` | inferred&sup1; | row mapper (read) |
| `title` | `text` | inferred | row mapper (read), row mapper (write) |
| `updated_at` | `timestamptz` | inferred&sup1; | row mapper (read) |
| `urgency` | `text` | inferred&sup1; | row mapper (read) |
| `user_id` | `uuid` | inferred | `.eq()` / `.in()`, `.insert()` |

### `team_members`

Operations: insert, select · Layer: edge.

Call sites: `supabase/functions/scalyo-api/index.ts`

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `created_at` | `timestamptz` | inferred | `.eq()` / `.in()`, `.order()` |
| `user_id` | `uuid` | inferred | `.eq()` / `.in()`, `.insert()` |

### `webhooks`

Operations: select, update · Layer: edge.

Call sites: `supabase/functions/scalyo-webhook/index.ts`

| Column | Type | Confidence | Evidence |
|---|---|---|---|
| `is_active` | `boolean` | inferred | `.eq()` / `.in()`, `.select()` |
| `last_triggered_at` | `timestamptz` | inferred&sup1; | `.update()` |
| `secret` | `text` | inferred | `.select()` |
| `trigger_count` | `integer` | inferred&sup1; | `.update()` |
| `user_id` | `uuid` | inferred | `.eq()` / `.in()` |

---

## 6. Objects that exist only in SQL

RLS, functions, triggers and indexes are invisible to application code. This section comes from the `.sql` files alone.

### 6.1 Row Level Security

`ENABLE ROW LEVEL SECURITY` appears for **8 tables**: `chat_channel_members`, `chat_channels`, `chat_messages`, `client_metrics`, `client_notes`, `quotes`, `sent_emails`, `user_profiles`.

> The other 27 tables may still have RLS enabled — it would simply have been switched on in the dashboard, leaving no trace here. **Absence from this list is not evidence that a table is unprotected.**

49 policies are defined in total:

| Table | Policies | Commands |
|---|---:|---|
| `chat_channel_members` | 1 | select×1 |
| `chat_channels` | 11 | all×1, delete×2, insert×3, select×3, update×2 |
| `chat_messages` | 11 | all×1, delete×2, insert×3, select×3, update×2 |
| `client_metrics` | 4 | delete×1, insert×1, select×1, update×1 |
| `client_notes` | 3 | delete×1, insert×1, select×1 |
| `clients` | 5 | delete×1, insert×1, select×1, update×2 |
| `email_templates` | 4 | delete×1, insert×1, select×1, update×1 |
| `quotes` | 4 | delete×1, insert×1, select×1, update×1 |
| `sent_emails` | 3 | insert×1, select×1, update×1 |
| `user_profiles` | 3 | insert×1, select×1, update×1 |

### 6.2 Functions and RPCs

| Function | Arguments | Defined in |
|---|---|---|
| `check_client_limit` | `—` | `20260711210000_fix_client_limit_org_source.sql` |
| `create_default_channel` | `—` | `20260713160000_chat_dm.sql` |
| `create_user_profile` | `—` | `001_user_profiles.sql` |
| `get_org_email_status` | `—` | `20260705230000_secrets_and_org_rls.sql` |
| `get_org_member_names` | `—` | `20260707230000_chat_org_member_names.sql` |
| `is_chat_member` | `ch uuid` | `20260713160000_chat_dm.sql` |
| `notify_client_note` | `—` | `20260721010000_notify_client_note.sql` |
| `open_dm` | `other_user uuid` | `20260713160000_chat_dm.sql` |
| `oxygen_team_aggregate` | `p_org uuid` | `20260729250000_oxygen_team.sql` |
| `protect_org_billing_fields` | `—` | `20260729250000_oxygen_team.sql` |
| `protect_org_fields` | `—` | `20260704190000_protect_billing_fields.sql` |
| `protect_secret_fields` | `—` | `20260705230000_secrets_and_org_rls.sql` |
| `update_profile_timestamp` | `—` | `001_user_profiles.sql` |

The frontend calls **4 RPCs**: `get_org_email_status`, `get_org_member_names`, `open_dm`, `oxygen_team_aggregate`.

### 6.3 Triggers

| Trigger | Table | Defined in |
|---|---|---|
| `trg_protect_secret_fields` | `profiles` | `20260705230000_secrets_and_org_rls.sql` |
| `trg_protect_org_billing_fields` | `organizations` | `20260708220000_org_plan_source.sql` |
| `org_default_channel` | `organizations` | `20260713160000_chat_dm.sql` |
| `trg_notify_client_note` | `client_notes` | `20260721010000_notify_client_note.sql` |
| `on_auth_user_created_profile` | `auth` | `001_user_profiles.sql` |
| `on_profile_update` | `user_profiles` | `001_user_profiles.sql` |

### 6.4 Realtime publication

Added to `supabase_realtime`: `chat_channel_members`, `chat_channels`, `chat_messages`.

---

## 7. Observations

### 7.1 `profiles` and `user_profiles` are two different live tables

Both are queried by current code. They are not duplicates, and neither is a leftover:

- **`profiles`** — identity, plan, trial, organization membership. Read and written by `stores/auth.js` and several `functions/api/*` endpoints. Has no `CREATE TABLE` in the repo; one `ALTER` adds `resend_api_key`.
- **`user_profiles`** — AI-context and account currency. Created by `app-v2/frontend/_migrations/001_user_profiles.sql`, which carries `currency TEXT DEFAULT 'EUR'`.

`user_profiles` is queried at `stores/profile.js` (including the `setCurrency` upsert), `functions/api/billing.js` and `functions/api/_services/context.service.js`. Its defining file sits outside `supabase/migrations/`, in a directory whose own header says *"Run this in Supabase SQL Editor"* — so the sole definition of a live, actively-queried table is stored where the migration tooling will never see it.

### 7.2 Three tables belong to code that is switched off

`api_keys`, `webhooks` and `team_members` are reached only from the Integrations module, which the router redirects away from. They have no SQL and no other caller. Their presence here reflects dormant code, not live usage.

### 7.3 `plan` exists on two tables, and three endpoints read the wrong one

Both `profiles.plan` and `organizations.plan` are live columns. The SQL is unambiguous about which is authoritative — `20260711210000_fix_client_limit_org_source.sql` redefines `check_client_limit()` to read `organizations.plan`, falling back to `profiles.plan` only when the row has no `organization_id`, and counts quota by `organization_id`:

```sql
if new.organization_id is not null then
  select plan into eff_plan from organizations where id = new.organization_id;
end if;
if eff_plan is null then
  select plan into eff_plan from profiles where id = new.user_id;
end if;
```

Three API endpoints do not follow that order. Each reads `profiles.plan` directly, with no organization lookup and no fallback:

| Endpoint | Line | Query |
|---|---|---|
| `functions/api/ai.js` | 13 | `/rest/v1/profiles?id=eq.<user>&select=plan` |
| `functions/api/usage.js` | 14 | `/rest/v1/profiles?id=eq.<user>&select=plan` |
| `functions/api/email.js` | 31 | `profiles[0]?.plan \|\| 'starter'` |

A member of a paying organization whose own `profiles.plan` is `starter` or `NULL` therefore passes the SQL quota trigger but is gated by these three endpoints. `20260708220000_org_plan_source.sql` guards against the inverse problem — its `protect_org_billing_fields()` trigger blocks an authenticated client from writing `organizations.plan` directly — so aligning the endpoints means reading the organization, not copying the plan onto the profile.

### 7.4 Two migrations define the same column twice

`copils.client_id` is added by both `supabase/migrations/20260706220000_copils_client_id.sql` and `app-v2/frontend/supabase/migrations/20260721000000_copils_client_id.sql`, with identical definitions. Harmless while both use `IF NOT EXISTS`, but it means the two migration directories overlap rather than being disjoint sets.

---

## 8. Method and limits

**Extraction.** Four passes over the code, because each recovers columns the others miss:

| Pass | Recovers | Example |
|---|---|---|
| PostgREST chains | `.select()`, `.eq()`, `.order()` and inline `.insert({…})` literals | `clients.csm_id` |
| Row mappers | `xToDb()` return keys and `dbToX(r)` property reads | `clients` 5 → 21 columns |
| Named payloads | `const row = {…}` passed to `.insert([row])` | `roadmaps` 3 → 7 columns |
| Backend REST | `db.select('t', 'col=eq.…')` and raw `?select=` paths | `invitations`, `promo_codes` |

**Type inference**, applied only where SQL is silent: `*_at` → `timestamptz`, `*_id` → `uuid`, `is_*` / `has_*` → `boolean`, known JSON columns → `jsonb`, monetary and score fields → `numeric`. External identifiers (`stripe_customer_id`, `template_id`, `kpi_id`, `resend_id`) are forced to `text`: Stripe IDs are `cus_…` strings and template IDs are slugs, so the `*_id` → `uuid` rule is wrong for them and would break an insert.

**What this report cannot tell you:**

- The true type of the 225 inferred columns — only that the column exists.
- `NOT NULL`, `DEFAULT`, foreign keys, `UNIQUE` or `CHECK` on any reconstructed table.
- Indexes and RLS beyond the 8 tables whose SQL is in the repository.
- Columns that exist in the database but that no code path touches. **Every table below is a lower bound on its real shape.**
- Whether a reconstructed table still exists at all, or was renamed or dropped in the dashboard.

**To make this exact.** Run `supabase db dump --schema public`, or query `information_schema.columns` from the SQL Editor. Diffing that output against this report would collapse all 225 inferred columns to confirmed and surface any genuine drift.

---

&sup1; *inferred, single call site* — the column name is proven, but only one place in the codebase references it, so a typo there would propagate into this report undetected.

