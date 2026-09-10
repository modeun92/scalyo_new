-- Scalyo — PROPOSED core-domain schema.
-- Written 2026-09-10 from docs/Database Plan.txt, reviewed in docs/SCHEMA_REVIEW.md.
--
-- *** NOT A MIGRATION. Do not move this file into supabase/migrations/. ***
--
-- This is a proposal to argue with. It differs from SCHEMA_FROM_CODE.sql in kind:
-- that file is a RECONSTRUCTION of what exists (and cannot recover constraints);
-- this one is a DESIGN, and states the constraints on purpose, because the constraints
-- are most of the argument.
--
-- Scope: the CORE DOMAIN only — company, person, worker, client engagement, revenue,
-- interactions, chat. The ~20 feature tables (tasks, copils, playbooks, roadmaps,
-- planning, quotes, email, notifications, oxygen, AI) are RETAINED AS THEY ARE and are
-- listed in §9 with the single column that has to change. See SCHEMA_REVIEW.md §5 —
-- reading Database Plan.txt as a whole-schema replacement would silently delete two
-- thirds of the product.
--
-- Markers used below:
--   DECISION:  a choice from SCHEMA_REVIEW.md §6 — the rejected alternative is named.
--              These are the lines to change if you disagree.
--   KEEP:      deliberately carried over from the current schema; the reason is given.
--   SEAM:      a known future extension, left explicitly unbuilt.
--
-- ORDERING: sections are grouped by DOMAIN, not by dependency — §3.visitor references
-- §4.client, which is declared later. That is fine for a reference document and is another
-- reason this file is not runnable as-is. A real migration reorders, or splits the FK out
-- into a later ALTER.
--
-- Adoption is in three tranches (SCHEMA_REVIEW.md §7), never big-bang. Section headers
-- say which tranche they belong to.
--
-- Naming: singular table names, snake_case, `id uuid primary key default gen_random_uuid()`,
-- `created_at`/`updated_at timestamptz not null default now()` on every table.
-- This differs from the current schema's plural names (`clients`, `profiles`). Mixed
-- conventions are worse than either one — if plural is preferred, change it here, once,
-- before anything is built.


-- ##########################################################################
-- §0 — Shared helpers
-- ##########################################################################

-- KEEP: get_my_org_id() already exists and every current RLS policy is built on it.
-- Reproduced here only so the policies below are readable; do not redefine it.
--
--   create or replace function public.get_my_org_id() returns uuid
--   language sql stable security definer set search_path = public
--   as $$ select organization_id from public.profiles where id = auth.uid() $$;
--
-- After tranche 3 its body reads from `worker` instead of `profiles`. That rewrite is the
-- single riskiest statement in the whole redesign: EVERY policy in the database depends on
-- it. Change it in its own migration, with nothing else in the deploy.

-- ORG-DENORM: `organization_id` is repeated on almost every table below, even where it is
-- reachable by a join. This is deliberate and it is not sloppiness.
-- An RLS policy that joins three tables to find the org is evaluated PER ROW, on every
-- query, and is easy to get subtly wrong. The current schema already denormalizes it onto
-- chat_channels, chat_messages, client_notes, client_metrics, quotes and email_templates
-- for exactly this reason. Keep it, and keep it honest with the trigger in §8.
-- Do not "normalize this away" later — that is the same mistake with a tidier name.


-- ##########################################################################
-- §1 — Company                                              [TRANCHE 1]
-- ##########################################################################
-- Database Plan.txt: `Company`.
--
-- WHY THIS IS THE KEYSTONE: today `organizations` and `clients` each carry their own copy
-- of the same company attributes and can never be the same row. Unifying them is what makes
-- the plan's own line — "the client of the organization has clients and the organization
-- manages" — expressible at all. A company that is a client of org A can itself be org B.

create table if not exists public.company (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) > 0),
  country         text check (country ~ '^[A-Z]{2}$'),   -- ISO 3166-1 alpha-2
  main_currency   char(3) check (main_currency ~ '^[A-Z]{3}$'),  -- ISO 4217; see §4 CURRENCY
  logo_url        text,
  website_url     text,
  -- Plan says "info links (SNS, web, youtube etc.)". Marketing links are a genuine open
  -- set with no query, constraint or authorization need of their own, so jsonb is the RIGHT
  -- call here — unlike contacts (SCHEMA_REVIEW.md §2.2). Shape: [{kind, url}].
  social_links    jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_company_name on public.company (lower(name));

-- RLS: a company row is visible to any org that has an engagement with it, plus the org it
-- IS. Written as EXISTS against the two owning tables rather than a denormalized column,
-- because a company genuinely has no single owning org — that is the point of the table.
alter table public.company enable row level security;
--   company_select: exists (select 1 from organization o
--                            where o.company_id = company.id and o.id = get_my_org_id())
--                or exists (select 1 from client c
--                            where c.company_id = company.id and c.organization_id = get_my_org_id())


-- ##########################################################################
-- §2 — Organization                                         [TRANCHE 1 / 3]
-- ##########################################################################
-- Database Plan.txt: `Organization : Company`.
-- Class-table inheritance: the company half lives in §1, the tenant half lives here.
-- (SCHEMA_REVIEW.md §4.2 — Postgres INHERITS is rejected: it does not propagate FK or
-- UNIQUE constraints, so `auth.users` references silently stop being enforced.)

create table if not exists public.organization (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null unique references public.company(id) on delete restrict,

  -- DECISION (§6.4): `plan` lives HERE and ONLY here.
  -- This closes the documented live bug: /api/ai, /api/email and /api/usage read
  -- profiles.plan while the front end and the SQL client-limit trigger read
  -- organizations.plan, so a member of a paying org is entitled in the UI and 403'd by the
  -- API. Rule 3, one source per concern. Dropping profiles.plan is the CONTRACT step of
  -- tranche 3 and must come after every reader is switched — not with it.
  plan                    text not null default 'starter',
  seats_paid              integer not null default 0 check (seats_paid >= 0),
  max_clients             integer check (max_clients is null or max_clients >= 0),
  trial_ends_at           timestamptz,
  is_founding             boolean not null default false,
  stripe_customer_id      text,
  stripe_subscription_id  text,

  -- KEEP: Oxygen team aggregation is fail-closed behind this flag, owner-only, literal n>=5.
  -- Changing that is a LEGAL change, not a technical one. See §7.
  oxygen_team_enabled     boolean not null default false,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create unique index if not exists idx_organization_stripe_sub
  on public.organization (stripe_subscription_id) where stripe_subscription_id is not null;

alter table public.organization enable row level security;
--   organization_select: id = get_my_org_id()
--   organization_update: id = get_my_org_id() and current worker role = 'administrator'
-- NOTE: plan, seats_paid and stripe_* must be revoked from `authenticated` and written only
-- by the Stripe webhook with service_role. A client-writable `plan` column is a free upgrade.


-- ##########################################################################
-- §3 — Person, Worker, Visitor                              [TRANCHE 1]
-- ##########################################################################
-- Database Plan.txt: `Person`, `Worker : Person`, `Visitor : Person`,
-- and `Administrator / Manager / Employee : Worker`.
--
-- This section replaces `clients.contacts jsonb`, which is the single worst structure in
-- the current schema: a contact has no id, no FK, no RLS and no index, so "which clients is
-- alice@acme.com at?" is a full scan and a JSON walk, and nothing can be attached to a
-- person — only to a client.

create table if not exists public.person (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.company(id) on delete cascade,

  -- IDENTITY-SPLIT (SCHEMA_REVIEW.md §4.6): Supabase GoTrue owns identity; `person` does
  -- not. NULL = a contact we merely email (no login). NOT NULL = a real user.
  -- Making this `not null` would make it impossible to store a contact at all; leaving it
  -- unconstrained would let two person rows share one login, which silently DOUBLES that
  -- user's RLS visibility. Hence nullable + the partial unique index below.
  auth_user_id    uuid unique references auth.users(id) on delete set null,

  first_name      text not null default '',
  last_name       text not null default '',

  -- I18N (rule 4): an honorific reaches the screen, so it is stored as a STABLE KEY and
  -- rendered through t() — never as the display string. Keys: person_title_dr / _mr / _ms /
  -- _mrs / _mx. NULL means "none", which is not the same as unknown.
  title_key       text check (title_key in ('dr','mr','ms','mrs','mx')),

  -- BCP-47 tag for the PERSON (fr-FR, ko-KR) — how to address them.
  -- Distinct from the UI locale, which is one of exactly three values and lives on `worker`.
  language_tag    text check (language_tag ~ '^[a-z]{2}(-[A-Z]{2})?$'),

  position_title  text,          -- job title. `position` is a reserved word in SQL.
  phone           text,
  email           text check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  photo_url       text,

  -- Plan: `IsValid // absent or present`.
  is_valid        boolean not null default true,
  invalidated_at  timestamptz,
  invalidated_by  uuid references public.person(id) on delete set null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- R21: a person with neither an email nor a phone cannot be contacted and is almost
  -- always an import artifact. Reject it at the boundary rather than showing a row that
  -- does nothing.
  constraint person_reachable check (email is not null or phone is not null),
  constraint person_invalid_audited check (
    is_valid or (invalidated_at is not null)
  )
);

create index if not exists idx_person_company on public.person (company_id);
create index if not exists idx_person_email on public.person (lower(email)) where email is not null;

alter table public.person enable row level security;
--   person_select: company visible to my org (mirrors company_select) — or self.


-- ---- Worker ------------------------------------------------------------
-- Class-table inheritance. Administrator / Manager / Employee carry NO columns of their
-- own in the plan — only capability lists — so they are an ENUM, not three tables.
-- Three tables would buy nothing and cost every query a union (SCHEMA_REVIEW.md §4.2).

create table if not exists public.worker (
  person_id           uuid primary key references public.person(id) on delete cascade,

  -- DECISION (§6.2): exactly one organization per worker. Matches today's
  -- profiles.organization_id, and seat billing assumes it. Sharing contractors across orgs
  -- would make this a join table AND change what a seat means — a billing change, not a
  -- schema change.
  organization_id     uuid not null references public.organization(id) on delete cascade,

  -- DECISION (§6.4 / rule 3): the role lives HERE and only here.
  -- Today it is in BOTH profiles.org_role AND organization_members.role — two sources for
  -- one authorization decision. Capability lists are in Database Plan.txt; enforcement stays
  -- in RLS + the API, not in this column.
  role                text not null default 'employee'
                      check (role in ('administrator','manager','employee')),

  -- Plan: `Working Status // quit, vacation, available`. Split, because those are two
  -- different facts: `quit` is durable employment state, `vacation` is a date range that is
  -- DERIVABLE from §3.vacation. Storing a derived value is how it goes stale.
  employment_status   text not null default 'active'
                      check (employment_status in ('active','left')),
  left_at             timestamptz,

  -- UI locale — exactly the three the app ships. Distinct from person.language_tag.
  ui_locale           text not null default 'fr' check (ui_locale in ('fr','en','ko')),

  -- MONEY (rule 9): currency is a property of the ACCOUNT, not the language, with zero
  -- conversion. Today this is user_profiles.currency. Offered codes live once in
  -- src/config/currencies.js.
  currency            char(3) not null default 'EUR',

  -- SEAT-BILLING: seats are billed at INVITATION, not acceptance, and removal is
  -- fail-closed (Stripe before any database write). This column is what an invited-but-not-
  -- accepted worker looks like; it is NOT the same as employment_status.
  seat_status         text not null default 'active'
                      check (seat_status in ('invited','active','removed')),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint worker_left_audited check (employment_status = 'active' or left_at is not null)
);

create index if not exists idx_worker_org on public.worker (organization_id)
  where employment_status = 'active';

alter table public.worker enable row level security;
--   worker_select: organization_id = get_my_org_id()
--   worker_update_role: administrator only, and never on oneself (no self-promotion).


-- ---- Visitor (client-side portal user) ---------------------------------
-- DECISION (§6.3): DEFINED BUT DORMANT — table created, NO RLS POLICIES WRITTEN.
--
-- This is the one item with a real security cost: it puts non-employees inside the auth
-- tenant, and every existing policy is written assuming auth.uid() belongs to an org
-- member. Shipping the table now is cheap; shipping the policies before the feature is a
-- standing hole. Dormant-with-a-comment is the pattern the Integrations module already
-- uses (rule: what is dormant on purpose says so).
--
-- Do not write these policies until the feature is actually on the roadmap.

create table if not exists public.visitor (
  person_id     uuid primary key references public.person(id) on delete cascade,
  client_id     uuid not null references public.client(id) on delete cascade,
  can_update_profit    boolean not null default false,
  can_decline_contract boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.visitor enable row level security;
-- INTENTIONALLY NO POLICIES: RLS enabled with no policy = deny all. Fail closed.


-- ---- Vacation ----------------------------------------------------------
create table if not exists public.vacation (
  id              uuid primary key default gen_random_uuid(),
  worker_id       uuid not null references public.worker(person_id) on delete cascade,
  organization_id uuid not null references public.organization(id) on delete cascade,  -- ORG-DENORM
  starts_on       date not null,
  ends_on         date not null,
  kind            text not null default 'vacation' check (kind in ('vacation','sick','other')),
  created_at      timestamptz not null default now(),
  constraint vacation_range check (ends_on >= starts_on)
);

-- TZ-PLANNING (rule 7): `date`, not `timestamptz`. A vacation is a LOCAL CALENDAR DAY —
-- it does not start at an instant. Storing it as timestamptz reintroduces the
-- toISOString().slice(0,10) bug class, where a Korean user's Monday is a French Sunday.
create index if not exists idx_vacation_worker on public.vacation (worker_id, starts_on desc);


-- ##########################################################################
-- §4 — Client engagement, revenue, churn                    [TRANCHE 1 / 2]
-- ##########################################################################

-- ---- Client = an ENGAGEMENT, not a company ------------------------------
-- DECISION (§6.1) — the highest-stakes call in this file.
-- Database Plan.txt says: `Client.Organization (by id) // maybe it could be multiple`.
-- Answer: YES, allow multiple, by making `client` the RELATIONSHIP between an organization
-- and a company rather than a kind of company.
--
-- Costs nothing if you only ever have one org per company. Retrofitting it later is a
-- rewrite of every client query in the app. And it is what makes the agency case work:
-- a company that is a client of org A can itself be org B, with its own clients.

create table if not exists public.client (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id) on delete cascade,
  company_id      uuid not null references public.company(id) on delete restrict,

  -- CLIENTS-ONLY (KEEP): prospects are EXCLUDED from portfolio counters, health aggregates
  -- and alerts. That filter is load-bearing and currently rides on clients.status, which
  -- also carries health and validity — three jobs, one text column (SCHEMA_REVIEW.md §2.4).
  -- Split into three columns that mean one thing each.
  lifecycle       text not null default 'prospect'
                  check (lifecycle in ('prospect','onboarding','active','at_risk','churned')),

  -- Plan: `IsValid (it can stop the contract)`. Distinct from lifecycle: a churned client
  -- is still a valid record; an invalid one is a mistake or a terminated relationship.
  is_valid        boolean not null default true,

  -- CURRENCY (SCHEMA_REVIEW.md §4.7): one currency per ENGAGEMENT, denormalized onto every
  -- ledger row below and enforced by the §8 trigger. Rule 9 forbids conversion, and a
  -- mixed-currency SUM() is silently wrong rather than loudly broken — the worst failure
  -- mode this codebase recognizes (R21 / D-14).
  currency        char(3) not null default 'EUR',

  -- HEALTH-SCALE (rule 8): /10, through lib/health, never a local threshold and never a
  -- raw status used for colour. NULL is a real state and renders as "—", never as 0 (R21).
  health          numeric(4,1) check (health is null or (health >= 0 and health <= 10)),
  churn_risk      numeric(4,1) check (churn_risk is null or (churn_risk >= 0 and churn_risk <= 10)),
  nps             integer check (nps is null or (nps >= -100 and nps <= 100)),

  renewal_date    date,          -- TZ-PLANNING: calendar day.
  industry        text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- One engagement per (org, company). This is the constraint that makes the "multiple
  -- organizations" answer safe rather than ambiguous.
  constraint client_unique_engagement unique (organization_id, company_id)
);

create index if not exists idx_client_org_active on public.client (organization_id)
  where lifecycle <> 'prospect' and is_valid;
create index if not exists idx_client_renewal on public.client (organization_id, renewal_date)
  where renewal_date is not null;

alter table public.client enable row level security;
--   client_select / insert / update: organization_id = get_my_org_id()


-- ---- Who manages this client -------------------------------------------
-- Database Plan.txt lists this TWICE — `Client.Workers (by id)` and `Worker.Clients (by id)`
-- — which is the tell that the document describes object graphs, not tables. It is ONE
-- many-to-many relationship (SCHEMA_REVIEW.md §4.1).
--
-- Replaces clients.csm (text) + clients.csm_id (uuid), a display string that drifts from
-- its own foreign key.

create table if not exists public.client_assignment (
  client_id       uuid not null references public.client(id) on delete cascade,
  worker_id       uuid not null references public.worker(person_id) on delete cascade,
  organization_id uuid not null references public.organization(id) on delete cascade,  -- ORG-DENORM
  is_primary      boolean not null default false,
  assigned_at     timestamptz not null default now(),
  primary key (client_id, worker_id)
);

-- At most one primary CSM per client. Without this, two "primary" rows make every
-- "who owns this account" read non-deterministic.
create unique index if not exists idx_client_one_primary
  on public.client_assignment (client_id) where is_primary;


-- ---- Profit = an append-only ledger ------------------------------------
-- Database Plan.txt: `Profit`. The highest-value idea in the document.
--
-- Replaces clients.mrr / clients.arr — single mutable numbers, overwritten in place, with
-- no history, no timestamps and no attribution. It also removes the reason
-- `snapshots.kpis jsonb` exists, which is to fake the history a ledger gives you free.
--
-- APPEND-ONLY: corrections are a new negative row, never an UPDATE. Enforce with a
-- revoke on UPDATE/DELETE for `authenticated`, not merely by convention.

create table if not exists public.profit_entry (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.client(id) on delete cascade,
  organization_id uuid not null references public.organization(id) on delete cascade,  -- ORG-DENORM

  -- Plan: `from company-id`. Who paid — normally the client's company, but an engagement
  -- can be paid by a parent entity, and that is exactly the agency case §1 enables.
  payer_company_id uuid references public.company(id) on delete set null,

  amount          numeric(14,2) not null,   -- numeric, NEVER float. Negative = correction/refund.
  currency        char(3) not null,          -- must equal client.currency — §8 trigger.

  -- The date the revenue is RECOGNIZED, not the row's creation date. They differ, and
  -- reporting wants the former. Calendar day (TZ-PLANNING).
  issued_on       date not null,

  kind            text not null default 'recurring'
                  check (kind in ('recurring','one_off','expansion','refund')),
  description     text,

  -- Only genuinely open-ended metadata (invoice refs, external ids). NOT a place to put
  -- fields you will later want to query — that is how clients.contacts happened.
  metadata        jsonb not null default '{}'::jsonb,

  created_at      timestamptz not null default now(),
  created_by      uuid references public.worker(person_id) on delete set null
);

create index if not exists idx_profit_client_period
  on public.profit_entry (client_id, issued_on desc);
create index if not exists idx_profit_org_period
  on public.profit_entry (organization_id, issued_on desc);

-- SEAM (§4.7 option 2): if cross-currency org totals are ever needed, ADD
-- `amount_normalized numeric(14,2)`, `normalization_rate numeric(18,8)` and `rate_on date`.
-- Do NOT convert on read and do NOT store a rate without the date it applied — an
-- undated rate is an invented value (R21).


-- ---- Churn --------------------------------------------------------------
-- Replaces clients.churned_at: one nullable timestamp = one churn event ever, no reason,
-- and no way to express a downgrade.

create table if not exists public.churn_event (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.client(id) on delete cascade,
  organization_id uuid not null references public.organization(id) on delete cascade,  -- ORG-DENORM
  occurred_on     date not null,

  -- PERSISTED ENUM (rule 4): if these values are ever surfaced to a French user by their
  -- stored value rather than through t(), they become untranslatable — the same trap as
  -- kind = 'cloture' and category = 'renouvellement'. Store English keys, render via i18n:
  -- churn_reason_price / _product / _competitor / _contact_left / _other.
  reason_key      text check (reason_key in ('price','product','competitor','contact_left','other')),

  -- Partial churn: what was lost, in the engagement's currency. NULL = total churn, which
  -- is NOT the same as 0 (R21 — 0 would mean "they churned and it cost nothing").
  amount_lost     numeric(14,2),
  currency        char(3),
  description     text,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.worker(person_id) on delete set null,

  constraint churn_amount_has_currency check (
    (amount_lost is null and currency is null) or
    (amount_lost is not null and currency is not null)
  )
);

create index if not exists idx_churn_client on public.churn_event (client_id, occurred_on desc);


-- ##########################################################################
-- §5 — Interaction                                          [TRANCHE 2]
-- ##########################################################################
-- Database Plan.txt: `Interaction`. Today the record of "what happened with this client" is
-- scattered across client_notes, planning_events, sent_emails and chat_messages, with no
-- unified timeline. Those tables STAY (§9); this one is the timeline over them.

create table if not exists public.interaction (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.client(id) on delete cascade,
  organization_id uuid not null references public.organization(id) on delete cascade,  -- ORG-DENORM

  -- Plan: `From (person-id) // who approached first?`. Inbound vs outbound is a real CS
  -- signal that nothing in the current schema captures. Kept as a person FK rather than a
  -- boolean, because "who" is more useful than "which direction" and the direction is
  -- derivable from whether that person is a worker.
  initiated_by    uuid references public.person(id) on delete set null,

  channel         text not null default 'other'
                  check (channel in ('meeting','call','email','chat','other')),
  occurred_at     timestamptz not null default now(),   -- an instant, unlike vacation/renewal

  -- Plan says `Description json // issue, conclusion`. That names TWO fields, so they are
  -- two columns (SCHEMA_REVIEW.md §4.4). A jsonb blob here would be unqueryable for exactly
  -- the reports this table exists to produce.
  issue           text,
  conclusion      text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_interaction_client
  on public.interaction (client_id, occurred_at desc);

-- Plan: `Interaction.worker (by id)` + `visitor (by id)`. An interaction can involve several
-- people on both sides, so it is a join table, not two columns.
create table if not exists public.interaction_participant (
  interaction_id  uuid not null references public.interaction(id) on delete cascade,
  person_id       uuid not null references public.person(id) on delete cascade,
  side            text not null check (side in ('organization','client')),
  primary key (interaction_id, person_id)
);


-- ##########################################################################
-- §6 — Chat                                                 [NOT IN SCOPE]
-- ##########################################################################
-- Chat is the HEALTHIEST part of the current schema: the only subsystem with real
-- CREATE TABLEs, real RLS and a recent, well-reasoned migration
-- (20260909120000_chat_reactions_rpc.sql). It is NOT part of this redesign.
--
-- Database Plan.txt would make it worse in two places, and better in one.
--
-- WORSE 1 — `Message.To person-id`. Contradicts `Chat Room`: if a message belongs to a
--   room, `To` is redundant and wrong for group chat. The existing model (channel_id plus a
--   type='dm' channel, unique per pair via dm_key) is already correct. Do not add `To`.
--
-- WORSE 2 — `Chat Room.ChatInfos json // joining (by whom of whom), deleting (by whom),
--   pinned (by whom)`. That is membership and audit — both already real tables/columns.
--   Moving them into a JSON blob would undo the migration written BECAUSE read-modify-write
--   on a JSON column let two simultaneous reactions overwrite each other. Do not do this.
--
-- BETTER — normalizing reactions. This is worth doing, as a small standalone migration:

create table if not exists public.message_reaction (
  message_id      uuid not null references public.chat_messages(id) on delete cascade,
  person_id       uuid not null references public.person(id) on delete cascade,
  emoji           text not null,
  organization_id uuid not null,                                        -- ORG-DENORM
  created_at      timestamptz not null default now(),
  -- THE POINT: this unique key turns toggling into a single INSERT ... ON CONFLICT DO
  -- NOTHING / DELETE. No read-modify-write, therefore no row lock and no race — the
  -- concurrency half of the chat_reactions bug disappears structurally rather than being
  -- defended against.
  primary key (message_id, person_id, emoji)
);

alter table public.message_reaction enable row level security;
-- KEEP: the SECURITY DEFINER RPC is still needed for the AUTHORIZATION half — RLS on
-- chat_messages is `user_id = auth.uid()`, so you cannot react to someone else's message.
-- But the policy here can call the EXISTING can_read_chat_message() directly, so
-- toggle_chat_reaction() gets simpler and loses its row lock.
--   message_reaction_all: public.can_read_chat_message(message_id)
--                         and person_id = (select id from person where auth_user_id = auth.uid())

-- Unread badge without a per-message read table: a watermark per member.
-- Database Plan.txt puts `read-at` on Message, but "read" is per-RECIPIENT — in a room of
-- five that is five facts, not one (SCHEMA_REVIEW.md §4.8).
--   alter table public.chat_channel_members add column if not exists last_read_at timestamptz;


-- ##########################################################################
-- §7 — Oxygen                                               [DO NOT TOUCH]
-- ##########################################################################
-- oxygen_checkins, oxygen_daily, oxygen_recoveries stay EXACTLY as they are.
--
-- Oxygen data is legally self-only. The only aggregation path is oxygen_team_aggregate:
-- owner-only, literal n >= 5, fail-closed behind organization.oxygen_team_enabled.
--
-- Giving these tables an organization_id with an org-readable policy would be a LEGAL
-- change, not a technical one — which is why they are the one part of the domain that gets
-- no ORG-DENORM column. That inconsistency is deliberate. Do not "fix" it for symmetry.


-- ##########################################################################
-- §8 — Integrity the application must not be trusted with
-- ##########################################################################

-- ORG-DENORM honesty. The denormalized organization_id is only worth having if it cannot
-- disagree with the parent. A mismatch is not a data-quality issue — it is a TENANT LEAK,
-- because RLS reads the denormalized column.
--
--   create or replace function public.assert_org_matches_client()
--   returns trigger language plpgsql as $$
--   begin
--     if new.organization_id is distinct from
--        (select organization_id from public.client where id = new.client_id) then
--       raise exception 'organization_id does not match client %', new.client_id;
--     end if;
--     return new;
--   end $$;
--
-- Attach BEFORE INSERT OR UPDATE on: profit_entry, churn_event, interaction,
-- client_assignment.

-- CURRENCY honesty (§4.7 option 1). Same shape, comparing currency against client.currency
-- on profit_entry and churn_event. Without it, one mistyped row makes every SUM() for that
-- client silently wrong — and it will be believed, because it looks like a number.

-- APPEND-ONLY ledger. Convention is not enforcement:
--   revoke update, delete on public.profit_entry from authenticated;
-- Corrections are a new negative row.

-- PLAN and SEAT columns are service_role only:
--   revoke update (plan, seats_paid, stripe_customer_id, stripe_subscription_id)
--     on public.organization from authenticated;
-- A client-writable `plan` column is a free upgrade for anyone who reads the network tab.

-- updated_at: one trigger function, attached to every table that has the column. Doing it
-- in the application means it is right until the one code path that forgets.


-- ##########################################################################
-- §9 — Retained unchanged (NOT re-specified here)
-- ##########################################################################
-- These keep their current definitions. The ONLY change is that where they reference
-- clients.id they now reference client.id — the engagement (§4), not the company.
--
--   Feature:  tasks, projects, copils, playbooks, roadmaps, planning_events,
--             client_notes, client_metrics, snapshots, quotes
--   Email:    email_templates, sent_emails, org_email_config
--   Platform: notifications, invitations, activity_log, api_keys, webhooks,
--             org_integrations, promo_codes, alpha_feedback
--   AI:       ai_conversations, ai_messages, user_profiles
--   Oxygen:   oxygen_checkins, oxygen_daily, oxygen_recoveries   (§7)
--   Chat:     chat_channels, chat_messages, chat_channel_members (§6)
--
-- Superseded by this file, and dropped only at the CONTRACT step of their tranche —
-- never in the same deploy that introduces the replacement:
--
--   organizations            -> company + organization        (§1, §2)
--   clients                  -> company + client              (§1, §4)
--   clients.contacts jsonb   -> person                        (§3) — the real ETL
--   clients.csm/csm_id       -> client_assignment             (§4)
--   clients.mrr/arr          -> profit_entry                  (§4)
--   clients.churned_at       -> churn_event                   (§4)
--   profiles                 -> person + worker + organization(§2, §3)
--   organization_members     -> worker                        (§3)
--   team_members             -> worker   (verify it is not already dead)
--
-- BEFORE ANY OF THIS BECOMES REAL DDL: dump the actual schema from pre-prod
-- (pg_dump --schema-only) and reconcile against SCHEMA_FROM_CODE.sql. Only 8 of 35 tables
-- have a real CREATE TABLE in the repo; the other 27 are inferred, and several inferred
-- types are visibly wrong (SCHEMA_REVIEW.md §1). Porting a guess into a new schema is how a
-- guess becomes a fact nobody questions.
