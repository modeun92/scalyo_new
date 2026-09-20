-- SCALYO — core_v2, part 1/3: the new core schema, created ALONGSIDE the current one.
--
-- Source: docs/new_database_code.txt (a C++-model-derived redesign — company / organization /
-- client_group / personage / member / manager / viewer / issue / profit / churn /
-- subscription). Applied essentially verbatim; every deviation is tagged CORE-V2-* below and
-- listed once more in docs/DATABASE.md ("core_v2").
--
-- ADDITIVE AND NON-DESTRUCTIVE. This file creates new tables, types and helper functions and
-- touches NO existing table. `organizations`, `profiles`, `user_profiles`, `clients`,
-- `organization_members` and `invitations` keep being the source of truth for every screen.
-- Parts 2 and 3 (20260920110000_core_v2_sync_triggers.sql, 20260920120000_core_v2_backfill.sql)
-- keep the new tables populated from the old ones; run them in order.
--
-- DEVIATIONS FROM THE LITERAL DDL
--   CORE-V2-COUNTRY   company.country_code and company.currency_code are NULLABLE. The current
--                     `organizations` table has no country column at all and no per-organization
--                     currency (currency lives on user_profiles.currency), so a NOT NULL column
--                     could only be filled with an invented value (R21).
--   CORE-V2-CG-ORG    The source DDL declares `idx_client_group_organization ON
--                     client_group(organization_id)` and validate_organization_client_group()
--                     selects `client_group.organization_id` — a column client_group does not
--                     have (its organization link is the organization_client_group table). Run as
--                     written, the index fails and the validation trigger raises on every write.
--                     The index is moved to organization_client_group and the function reads that
--                     table. A UNIQUE index on organization_client_group(client_group_id) makes
--                     "ClientGroup itself belongs to an Organization" (singular) true.
--   CORE-V2-AUTH-LINK member.auth_user_id / viewer.auth_user_id (UUID, UNIQUE, nullable) link a
--                     personage to a Supabase login. Nullable: a teammate exists before they sign up.
--                     NO foreign key to auth.users (a plain unique uuid): SET NULL would null the
--                     link before the profiles DELETE trigger in part 2 can use it to erase the
--                     personage, CASCADE would delete the member row and leave the personage (name
--                     + email) behind. Integrity is kept by the triggers, which are the only writers.
--   CORE-V2-AUTHORITY the authority enum gains INVITE, SEND_EMAIL and ASSIGN_CLIENT_GROUP (see §1).
--   CORE-V2-COLUMNS   columns and tables the product needs that the source DDL has no home for, added
--                     because the old tables are to be deleted (§7b): organization_role +
--                     member.role_id, member.seniority, organization_worker.joined_at,
--                     client_group.industry / notes, and an independent `prospect` table.
--   CORE-V2-OWNER     organization.owner_personage_id — the new model has no owner/admin
--                     distinction, and the billing owner must stay identifiable.
--
-- RLS (CORE-V2-RLS). Every new table has RLS on.
--   * READ  — an ACTIVE organization_worker of an organization reads that organization's rows.
--             A viewer additionally reads the client groups they are attached to through
--             client_group_viewer. `subscription` is billing: managers of the organization only.
--   * WRITE — the structural mirror tables (company … member_authority, subscription,
--             organization_role, prospect) have NO
--             write policy for users. They are a projection of the old tables, maintained by
--             SECURITY DEFINER triggers; a user write would be overwritten by the next sync and
--             is refused instead. issue / profit / churn are the only tables that hold data with
--             no old-table source, so they are the only ones a user can write, gated on the
--             caller's own member_authority (CREATE / UPDATE / DELETE).
--   * An MCP/AI token cannot write issue / profit / churn (RESTRICTIVE mcp_no_* policies, same
--     pattern as 20260914120000) — only if public.is_mcp_session() exists on this project.
--
-- PRE-PROD (wxbape…) FIRST, PROD on an explicit go (R8). Idempotent: safe to re-run.
-- Nothing in the application reads these tables yet, so this file changes no behaviour.

-- ============================================================
-- §0 — Pre-flight
-- ============================================================
-- CREATE TABLE IF NOT EXISTS would silently keep an unrelated pre-existing table of the same
-- name (`subscription`, `currency`, `country`, `issue` … are common names) and every later
-- statement would then run against the wrong shape. On a first run, refuse instead.
do $$
declare
  t text;
begin
  if to_regclass('public.company') is null then
    foreach t in array array[
      'country', 'currency', 'language_region', 'company_link', 'organization', 'client_group',
      'organization_client_group', 'personage', 'personage_link', 'viewer', 'member', 'manager',
      'organization_position', 'organization_worker', 'member_authority', 'member_client_group',
      'manager_team', 'client_group_viewer', 'issue', 'profit', 'churn', 'subscription',
      'organization_role', 'prospect'
    ] loop
      if to_regclass('public.' || t) is not null then
        raise exception 'core_v2: public.% already exists but public.company does not — refusing to build on an unknown table', t;
      end if;
    end loop;
  end if;
end $$;

-- ============================================================
-- §1 — Enums
-- ============================================================
-- CREATE TYPE has no IF NOT EXISTS.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'person_title' and typnamespace = 'public'::regnamespace) then
    create type public.person_title as enum ('MR', 'MS', 'MRS', 'DR', 'MX');
  end if;
  if not exists (select 1 from pg_type where typname = 'issue_status' and typnamespace = 'public'::regnamespace) then
    create type public.issue_status as enum ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
  end if;
  if not exists (select 1 from pg_type where typname = 'authority' and typnamespace = 'public'::regnamespace) then
    -- CORE-V2-AUTHORITY: INVITE, SEND_EMAIL and ASSIGN_CLIENT_GROUP are added to the source enum.
    -- Inviting people (plans.config.js ROLES.canInvite), sending email as the organization
    -- (organization_members.can_send_email) and changing who a client group is assigned to
    -- (member_client_group, the CSM assignment) are permissions the product needs, and the four
    -- generic verbs cannot express them. Created here rather than with ALTER TYPE ADD VALUE
    -- because this file has not been applied anywhere; if it ever has been, add each with
    -- `alter type public.authority add value if not exists '<VALUE>'` before part 2.
    create type public.authority as enum (
      'VIEW', 'CREATE', 'UPDATE', 'DELETE', 'INVITE', 'SEND_EMAIL', 'ASSIGN_CLIENT_GROUP'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'subscription_type' and typnamespace = 'public'::regnamespace) then
    create type public.subscription_type as enum ('FREE', 'BASIC', 'PRO', 'ENTERPRISE');
  end if;
  if not exists (select 1 from pg_type where typname = 'job_status' and typnamespace = 'public'::regnamespace) then
    create type public.job_status as enum ('ACTIVE', 'INACTIVE', 'ON_LEAVE', 'ENDED');
  end if;
  if not exists (select 1 from pg_type where typname = 'client_status' and typnamespace = 'public'::regnamespace) then
    create type public.client_status as enum ('ACTIVE', 'INACTIVE', 'CHURNED');
  end if;
  -- CORE-V2-COLUMNS: the sales funnel of a prospect (stores/clients.js PIPELINE_STAGES:
  -- new · contacted · qualified · won · lost).
  if not exists (select 1 from pg_type where typname = 'pipeline_stage' and typnamespace = 'public'::regnamespace) then
    create type public.pipeline_stage as enum ('NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST');
  end if;
end $$;

-- ============================================================
-- §2 — Lookup tables
-- ============================================================
create table if not exists public.country (
  code text primary key,
  name text not null
);

create table if not exists public.currency (
  code   text primary key,
  name   text not null,
  symbol text
);

create table if not exists public.language_region (
  code text primary key,
  name text not null
);

-- ============================================================
-- §3 — Company (base of Organization and ClientGroup)
-- ============================================================
create table if not exists public.company (
  id bigint generated by default as identity primary key,
  name text not null,
  -- CORE-V2-COUNTRY: nullable, see the header.
  country_code  text references public.country(code),
  currency_code text references public.currency(code),
  photo_path text
);

create table if not exists public.company_link (
  id bigint generated by default as identity primary key,
  company_id bigint not null references public.company(id) on delete cascade,
  url text not null,
  sort_order integer not null default 0,
  unique (company_id, url)
);

-- ============================================================
-- §4 — Organization / ClientGroup
-- ============================================================
create table if not exists public.organization (
  company_id bigint primary key references public.company(id) on delete cascade
);

create table if not exists public.client_group (
  company_id bigint primary key references public.company(id) on delete cascade,
  status public.client_status not null
);

create table if not exists public.organization_client_group (
  organization_id bigint not null references public.organization(company_id) on delete cascade,
  client_group_id bigint not null references public.client_group(company_id) on delete cascade,
  primary key (organization_id, client_group_id)
);

-- CORE-V2-CG-ORG: replaces idx_client_group_organization (client_group has no organization_id).
-- The primary key already serves lookups by organization; this serves "which organization owns
-- this client group" and makes that answer unique.
create unique index if not exists uq_organization_client_group_client
  on public.organization_client_group (client_group_id);

-- ============================================================
-- §5 — Personage / Viewer / Member / Manager
-- ============================================================
create table if not exists public.personage (
  id bigint generated by default as identity primary key,
  first_name text not null,
  last_name  text not null,
  title public.person_title,
  language_region_code text references public.language_region(code),
  phone_number  text,
  email_address text,
  photo_path text
);

create index if not exists idx_personage_email on public.personage (email_address);
create index if not exists idx_personage_name  on public.personage (last_name, first_name);

create table if not exists public.personage_link (
  id bigint generated by default as identity primary key,
  personage_id bigint not null references public.personage(id) on delete cascade,
  url text not null,
  sort_order integer not null default 0,
  unique (personage_id, url)
);

-- CORE-V2-AUTH-LINK
-- NO foreign key to auth.users, deliberately: with ON DELETE SET NULL the cascade that nulls this
-- column runs BEFORE the profiles DELETE trigger (part 2) looks the personage up by it, so the
-- trigger finds nothing and the person's name + email survive their own erasure (found by the
-- local test run: deleting an auth user left a member row with auth_user_id NULL). Left as a
-- plain unique uuid, the profile trigger still finds the personage, and an orphan (a login
-- deleted without its profile) stays discoverable — see §12.6.
create table if not exists public.viewer (
  personage_id bigint primary key references public.personage(id) on delete cascade,
  auth_user_id uuid unique
);

create table if not exists public.member (
  personage_id bigint primary key references public.personage(id) on delete cascade,
  auth_user_id uuid unique
);

create table if not exists public.manager (
  personage_id bigint primary key references public.member(personage_id) on delete cascade
);

-- CORE-V2-OWNER
alter table public.organization
  add column if not exists owner_personage_id bigint
  references public.manager(personage_id) on delete set null;

-- ============================================================
-- §6 — Positions, workers, authorities, assignments
-- ============================================================
create table if not exists public.organization_position (
  id bigint generated by default as identity primary key,
  organization_id bigint not null references public.organization(company_id) on delete cascade,
  name text not null,
  unique (organization_id, name),
  unique (id, organization_id)
);

-- Personage::p_Company / p_Position / p_JobStatus.
create table if not exists public.organization_worker (
  organization_id bigint not null,
  personage_id    bigint not null,
  position_id     bigint,
  job_status public.job_status not null,
  primary key (organization_id, personage_id),
  foreign key (organization_id) references public.organization(company_id) on delete cascade,
  foreign key (personage_id)    references public.personage(id) on delete cascade,
  foreign key (position_id, organization_id)
    references public.organization_position (id, organization_id)
);

-- The C++ model has one Company per Personage: one organization per worker.
create unique index if not exists uq_organization_worker_person
  on public.organization_worker (personage_id);

create table if not exists public.member_authority (
  member_id bigint not null references public.member(personage_id) on delete cascade,
  authority public.authority not null,
  primary key (member_id, authority)
);

-- Member::p_Clients
create table if not exists public.member_client_group (
  member_id bigint not null references public.member(personage_id) on delete cascade,
  client_group_id bigint not null references public.client_group(company_id) on delete cascade,
  primary key (member_id, client_group_id)
);

-- Manager::p_Team
create table if not exists public.manager_team (
  manager_id bigint not null references public.manager(personage_id) on delete cascade,
  member_id  bigint not null references public.member(personage_id) on delete cascade,
  primary key (manager_id, member_id),
  check (manager_id <> member_id)
);

-- ClientGroup::p_Viewers
create table if not exists public.client_group_viewer (
  client_group_id bigint not null references public.client_group(company_id) on delete cascade,
  viewer_id bigint not null references public.viewer(personage_id) on delete cascade,
  primary key (client_group_id, viewer_id)
);

-- ============================================================
-- §7 — Issue / Profit / Churn / Subscription
-- ============================================================
-- Independent of ClientGroup: each may reference an Organization only, a ClientGroup only, or both.
create table if not exists public.issue (
  id bigint generated by default as identity primary key,
  organization_id bigint references public.organization(company_id) on delete restrict,
  client_group_id bigint references public.client_group(company_id) on delete restrict,
  member_id bigint references public.member(personage_id) on delete set null,
  viewer_id bigint references public.viewer(personage_id) on delete set null,
  status public.issue_status not null,
  start_date timestamptz not null,
  end_date   timestamptz,
  description jsonb,
  parent_issue_id bigint references public.issue(id) on delete set null,
  check (organization_id is not null or client_group_id is not null),
  check (end_date is null or end_date >= start_date)
);

create index if not exists idx_issue_organization on public.issue (organization_id);
create index if not exists idx_issue_client_group on public.issue (client_group_id);
create index if not exists idx_issue_member       on public.issue (member_id);
create index if not exists idx_issue_viewer       on public.issue (viewer_id);
create index if not exists idx_issue_status       on public.issue (status);
create index if not exists idx_issue_parent       on public.issue (parent_issue_id);

create table if not exists public.profit (
  id bigint generated by default as identity primary key,
  organization_id bigint references public.organization(company_id) on delete restrict,
  client_group_id bigint references public.client_group(company_id) on delete restrict,
  amount numeric(19, 4) not null,
  currency_code text not null references public.currency(code),
  issue_date timestamptz not null,
  description jsonb,
  check (organization_id is not null or client_group_id is not null)
);

create index if not exists idx_profit_organization_date on public.profit (organization_id, issue_date);
create index if not exists idx_profit_client_group_date on public.profit (client_group_id, issue_date);

create table if not exists public.churn (
  id bigint generated by default as identity primary key,
  organization_id bigint references public.organization(company_id) on delete restrict,
  client_group_id bigint references public.client_group(company_id) on delete restrict,
  issue_date timestamptz not null,
  description jsonb,
  check (organization_id is not null or client_group_id is not null)
);

create index if not exists idx_churn_organization_date on public.churn (organization_id, issue_date);
create index if not exists idx_churn_client_group_date on public.churn (client_group_id, issue_date);

-- A history log, one row per plan change (part 2). NOT read as a source of truth by anything:
-- organizations.plan stays the single source of the effective plan (D1/D2, 8 July).
create table if not exists public.subscription (
  id bigint generated by default as identity primary key,
  organization_id bigint not null references public.organization(company_id) on delete restrict,
  issue_date timestamptz not null,
  type public.subscription_type not null
);

create index if not exists idx_subscription_organization_date
  on public.subscription (organization_id, issue_date);

-- ============================================================
-- §7b — Beyond the source DDL (CORE-V2-COLUMNS)
-- ============================================================
-- The old tables are to be DELETED, so every column the product still needs must have a home here.
-- These are the ones docs/new_database_code.txt has no place for. Written as ALTER … ADD COLUMN IF
-- NOT EXISTS (not folded into the CREATE TABLEs above) so a project where §1–§7 already ran picks
-- them up on a re-run.
--
-- NOT here yet, on purpose: seats, plan tiers, trial, the Stripe ids (a subscription-information
-- table, awaiting the tier / trial-length decisions) and Oxygen (a separate module that will
-- reference member). Dropped by decision, so never migrated: arr, mrr, health, nps, churn_risk,
-- renewal_date, contacts, is_founding, and the user_profiles columns other than role / seniority.

-- A person's role in the organization ('csm', 'kam', 'sales', 'pm', 'head_cs', 'cro', 'founder',
-- 'other' today). Shaped like organization_position — a per-organization list, unique by name —
-- but a separate thing: a member points at it directly (member.role_id), NOT through
-- organization_worker.position_id. `name` stores the persisted key, never a label: the screen
-- renders it through i18n (profile_role_<key>), like every persisted enum value.
create table if not exists public.organization_role (
  id bigint generated by default as identity primary key,
  organization_id bigint not null references public.organization(company_id) on delete cascade,
  name text not null,
  unique (organization_id, name)
);

-- member carries no organization (that is organization_worker), so no constraint can prove that
-- role_id belongs to the member's own organization. The sync in part 2 is the only writer and
-- always resolves the role inside the member's organization; there is no user write policy.
alter table public.member
  add column if not exists role_id bigint references public.organization_role(id) on delete set null;

-- A plain integer rank, higher = more senior. The old text scale maps junior 1 · mid 2 · senior 3
-- · lead 4 · director 5 · vp 6 · c_level 7 (core_v2_seniority_rank, part 2); anything else is NULL.
alter table public.member
  add column if not exists seniority integer;

create index if not exists idx_member_role on public.member (role_id);

-- organization_members.joined_at. NULL when unknown — never a substitute date (R21).
alter table public.organization_worker
  add column if not exists joined_at timestamptz;

-- clients.industry / clients.notes (client_notes, the timestamped notes table, is a separate
-- module and not part of this).
alter table public.client_group
  add column if not exists industry text;
alter table public.client_group
  add column if not exists notes text;

-- A PROSPECT: a company still being sold to. Independent of company / client_group, the way issue
-- is: it references an organization and has its own life, and is not a kind of ClientGroup.
-- Prospects have no measured health and never enter the portfolio counters (clientsOnly), which
-- is now true by construction. When a prospect is won and becomes a client, client_group_id
-- points at the client group created for it and the prospect row stays as the funnel history.
-- member_id is the CSM who owns the opportunity (clients.csm_id in the old table).
create table if not exists public.prospect (
  id bigint generated by default as identity primary key,
  organization_id bigint not null references public.organization(company_id) on delete cascade,
  name text not null,
  industry text,
  photo_path text,
  notes text,
  pipeline_stage public.pipeline_stage not null default 'NEW',
  member_id bigint references public.member(personage_id) on delete set null,
  client_group_id bigint references public.client_group(company_id) on delete set null
);

create index if not exists idx_prospect_organization_stage on public.prospect (organization_id, pipeline_stage);
create index if not exists idx_prospect_member on public.prospect (member_id);
create index if not exists idx_prospect_client_group on public.prospect (client_group_id);

-- ============================================================
-- §8 — Scope validation
-- ============================================================
-- If an Issue / Profit / Churn names BOTH an organization and a client group, the client group
-- must belong to that organization. CORE-V2-CG-ORG: read from organization_client_group.
create or replace function public.validate_organization_client_group()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.client_group_id is null or new.organization_id is null then
    return new;
  end if;

  if not exists (
    select 1
      from public.organization_client_group ocg
     where ocg.client_group_id = new.client_group_id
       and ocg.organization_id = new.organization_id
  ) then
    raise exception 'ClientGroup % does not belong to Organization %',
      new.client_group_id, new.organization_id;
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_issue_validate_scope on public.issue;
create trigger trg_issue_validate_scope
  before insert or update on public.issue
  for each row execute function public.validate_organization_client_group();

drop trigger if exists trg_profit_validate_scope on public.profit;
create trigger trg_profit_validate_scope
  before insert or update on public.profit
  for each row execute function public.validate_organization_client_group();

drop trigger if exists trg_churn_validate_scope on public.churn;
create trigger trg_churn_validate_scope
  before insert or update on public.churn
  for each row execute function public.validate_organization_client_group();

-- ============================================================
-- §9 — Reference data
-- ============================================================
-- Seeded from what the repository already uses: the 20 currencies of
-- src/config/currencies.js, the six billing countries of src/stores/countryLaws.js, the three
-- locales of src/i18n. Plain English ISO reference names — NOT rendered anywhere: the screen's
-- country / currency names keep coming from Intl + i18n (language policy, rule 4), so this is a
-- foreign-key target and nothing else. `symbol` is left NULL for the same reason
-- (lib/formatters.currencySymbol is the one source; a second copy here would drift).
insert into public.currency (code, name) values
  ('EUR', 'Euro'),                ('USD', 'US Dollar'),           ('GBP', 'Pound Sterling'),
  ('CHF', 'Swiss Franc'),         ('KRW', 'South Korean Won'),    ('JPY', 'Japanese Yen'),
  ('CNY', 'Chinese Yuan'),        ('CAD', 'Canadian Dollar'),     ('AUD', 'Australian Dollar'),
  ('NZD', 'New Zealand Dollar'),  ('SGD', 'Singapore Dollar'),    ('HKD', 'Hong Kong Dollar'),
  ('INR', 'Indian Rupee'),        ('BRL', 'Brazilian Real'),      ('MXN', 'Mexican Peso'),
  ('AED', 'UAE Dirham'),          ('SEK', 'Swedish Krona'),       ('NOK', 'Norwegian Krone'),
  ('DKK', 'Danish Krone'),        ('PLN', 'Polish Zloty')
on conflict (code) do nothing;

insert into public.country (code, name) values
  ('FR', 'France'), ('BE', 'Belgium'), ('CH', 'Switzerland'),
  ('CA', 'Canada'), ('US', 'United States'), ('KR', 'South Korea')
on conflict (code) do nothing;

-- Codes are the app's locale keys (profiles.locale = 'fr' | 'en' | 'ko'), so a profile's locale
-- is a valid foreign key as it stands.
insert into public.language_region (code, name) values
  ('fr', 'French'), ('en', 'English'), ('ko', 'Korean')
on conflict (code) do nothing;

-- ============================================================
-- §10 — RLS helpers
-- ============================================================
-- SECURITY DEFINER so a policy on one table can ask about another without re-entering that
-- table's own policy (which is how RLS policies end up recursing). They read only rows keyed to
-- auth.uid() / to organizations that auth.uid() is an ACTIVE worker of, and return ids only.
-- search_path is pinned: a definer function with a mutable search_path is a privilege-escalation
-- primitive.

-- The caller's personage, through whichever of member / viewer carries their login.
create or replace function public.core_v2_personage_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $fn$
  select x.personage_id
    from (
      select m.personage_id from public.member m where m.auth_user_id = auth.uid()
      union all
      select v.personage_id from public.viewer v where v.auth_user_id = auth.uid()
    ) x
   limit 1;
$fn$;

-- Organizations the caller currently works in. ENDED / INACTIVE / ON_LEAVE grant nothing:
-- a removed teammate keeps their (ENDED) worker row as history and must not keep read access.
create or replace function public.core_v2_my_org_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $fn$
  select w.organization_id
    from public.organization_worker w
   where w.personage_id = public.core_v2_personage_id()
     and w.job_status = 'ACTIVE';
$fn$;

-- Client groups the caller can see: every group of their organizations, plus the groups a viewer
-- is attached to through client_group_viewer.
create or replace function public.core_v2_my_client_group_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $fn$
  select ocg.client_group_id
    from public.organization_client_group ocg
   where ocg.organization_id in (select public.core_v2_my_org_ids())
  union
  select cgv.client_group_id
    from public.client_group_viewer cgv
   where cgv.viewer_id = public.core_v2_personage_id();
$fn$;

-- The caller and everyone working in the caller's organizations (the team list).
create or replace function public.core_v2_my_colleague_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $fn$
  select w.personage_id
    from public.organization_worker w
   where w.organization_id in (select public.core_v2_my_org_ids())
  union
  select public.core_v2_personage_id()
   where public.core_v2_personage_id() is not null;
$fn$;

-- Does the caller hold this authority in this organization? Only a member can: a viewer has no
-- member_authority row by construction.
create or replace function public.core_v2_has_authority(p_org bigint, p_authority public.authority)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
      from public.organization_worker w
      join public.member_authority a on a.member_id = w.personage_id
     where w.personage_id = public.core_v2_personage_id()
       and w.organization_id = p_org
       and w.job_status = 'ACTIVE'
       and a.authority = p_authority
  );
$fn$;

-- Is the caller a manager of this organization? (billing history is manager-only)
create or replace function public.core_v2_is_manager(p_org bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
      from public.organization_worker w
      join public.manager mg on mg.personage_id = w.personage_id
     where w.personage_id = public.core_v2_personage_id()
       and w.organization_id = p_org
       and w.job_status = 'ACTIVE'
  );
$fn$;

-- The organization an Issue / Profit / Churn row belongs to for permission purposes: the one it
-- names, else the one that owns the client group it names.
create or replace function public.core_v2_scope_org(p_org bigint, p_client_group bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    p_org,
    (select ocg.organization_id
       from public.organization_client_group ocg
      where ocg.client_group_id = p_client_group)
  );
$fn$;

revoke all on function public.core_v2_personage_id()                                   from public, anon;
revoke all on function public.core_v2_my_org_ids()                                     from public, anon;
revoke all on function public.core_v2_my_client_group_ids()                            from public, anon;
revoke all on function public.core_v2_my_colleague_ids()                               from public, anon;
revoke all on function public.core_v2_has_authority(bigint, public.authority)          from public, anon;
revoke all on function public.core_v2_is_manager(bigint)                               from public, anon;
revoke all on function public.core_v2_scope_org(bigint, bigint)                        from public, anon;
grant execute on function public.core_v2_personage_id()                                to authenticated;
grant execute on function public.core_v2_my_org_ids()                                  to authenticated;
grant execute on function public.core_v2_my_client_group_ids()                         to authenticated;
grant execute on function public.core_v2_my_colleague_ids()                            to authenticated;
grant execute on function public.core_v2_has_authority(bigint, public.authority)       to authenticated;
grant execute on function public.core_v2_is_manager(bigint)                            to authenticated;
grant execute on function public.core_v2_scope_org(bigint, bigint)                     to authenticated;

-- ============================================================
-- §11 — RLS
-- ============================================================
do $$
declare
  t text;
  all_tables text[] := array[
    'country', 'currency', 'language_region', 'company', 'company_link', 'organization',
    'client_group', 'organization_client_group', 'personage', 'personage_link', 'viewer',
    'member', 'manager', 'organization_position', 'organization_worker', 'member_authority',
    'member_client_group', 'manager_team', 'client_group_viewer', 'issue', 'profit', 'churn',
    'subscription', 'organization_role', 'prospect'
  ];
  -- No user write policy exists on these, so take the privilege away too: a policy that is
  -- missing today and added by mistake tomorrow should not be the only thing between a user and
  -- a write. issue / profit / churn keep INSERT/UPDATE/DELETE because they have write policies.
  mirror_tables text[] := array[
    'country', 'currency', 'language_region', 'company', 'company_link', 'organization',
    'client_group', 'organization_client_group', 'personage', 'personage_link', 'viewer',
    'member', 'manager', 'organization_position', 'organization_worker', 'member_authority',
    'member_client_group', 'manager_team', 'client_group_viewer', 'subscription',
    'organization_role', 'prospect'
  ];
begin
  foreach t in array all_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
  foreach t in array mirror_tables loop
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
  end loop;
end $$;

-- ── Reference data: any signed-in user may read it (foreign-key targets, no tenant data) ──────
drop policy if exists core_v2_country_select on public.country;
create policy core_v2_country_select on public.country for select to authenticated using (true);

drop policy if exists core_v2_currency_select on public.currency;
create policy core_v2_currency_select on public.currency for select to authenticated using (true);

drop policy if exists core_v2_language_region_select on public.language_region;
create policy core_v2_language_region_select on public.language_region for select to authenticated using (true);

-- ── Organization-scoped and client-group-scoped reads ─────────────────────────────────────────
drop policy if exists core_v2_company_select on public.company;
create policy core_v2_company_select on public.company for select to authenticated
  using (
    id in (select public.core_v2_my_org_ids())
    or id in (select public.core_v2_my_client_group_ids())
  );

drop policy if exists core_v2_company_link_select on public.company_link;
create policy core_v2_company_link_select on public.company_link for select to authenticated
  using (
    company_id in (select public.core_v2_my_org_ids())
    or company_id in (select public.core_v2_my_client_group_ids())
  );

drop policy if exists core_v2_organization_select on public.organization;
create policy core_v2_organization_select on public.organization for select to authenticated
  using (company_id in (select public.core_v2_my_org_ids()));

drop policy if exists core_v2_client_group_select on public.client_group;
create policy core_v2_client_group_select on public.client_group for select to authenticated
  using (company_id in (select public.core_v2_my_client_group_ids()));

drop policy if exists core_v2_organization_client_group_select on public.organization_client_group;
create policy core_v2_organization_client_group_select on public.organization_client_group for select to authenticated
  using (organization_id in (select public.core_v2_my_org_ids()));

drop policy if exists core_v2_organization_position_select on public.organization_position;
create policy core_v2_organization_position_select on public.organization_position for select to authenticated
  using (organization_id in (select public.core_v2_my_org_ids()));

drop policy if exists core_v2_organization_role_select on public.organization_role;
create policy core_v2_organization_role_select on public.organization_role for select to authenticated
  using (organization_id in (select public.core_v2_my_org_ids()));

-- Prospects: read by the organization's workers, viewers included (a viewer reads every client
-- today). No user write policy — until the front end moves its writes here, prospects are a
-- projection of clients.lifecycle = 'prospect'.
drop policy if exists core_v2_prospect_select on public.prospect;
create policy core_v2_prospect_select on public.prospect for select to authenticated
  using (organization_id in (select public.core_v2_my_org_ids()));

drop policy if exists core_v2_organization_worker_select on public.organization_worker;
create policy core_v2_organization_worker_select on public.organization_worker for select to authenticated
  using (organization_id in (select public.core_v2_my_org_ids()));

drop policy if exists core_v2_client_group_viewer_select on public.client_group_viewer;
create policy core_v2_client_group_viewer_select on public.client_group_viewer for select to authenticated
  using (client_group_id in (select public.core_v2_my_client_group_ids()));

drop policy if exists core_v2_member_client_group_select on public.member_client_group;
create policy core_v2_member_client_group_select on public.member_client_group for select to authenticated
  using (client_group_id in (select public.core_v2_my_client_group_ids()));

-- ── People: the caller and their colleagues ───────────────────────────────────────────────────
drop policy if exists core_v2_personage_select on public.personage;
create policy core_v2_personage_select on public.personage for select to authenticated
  using (id in (select public.core_v2_my_colleague_ids()));

drop policy if exists core_v2_personage_link_select on public.personage_link;
create policy core_v2_personage_link_select on public.personage_link for select to authenticated
  using (personage_id in (select public.core_v2_my_colleague_ids()));

drop policy if exists core_v2_viewer_select on public.viewer;
create policy core_v2_viewer_select on public.viewer for select to authenticated
  using (personage_id in (select public.core_v2_my_colleague_ids()));

drop policy if exists core_v2_member_select on public.member;
create policy core_v2_member_select on public.member for select to authenticated
  using (personage_id in (select public.core_v2_my_colleague_ids()));

drop policy if exists core_v2_manager_select on public.manager;
create policy core_v2_manager_select on public.manager for select to authenticated
  using (personage_id in (select public.core_v2_my_colleague_ids()));

drop policy if exists core_v2_member_authority_select on public.member_authority;
create policy core_v2_member_authority_select on public.member_authority for select to authenticated
  using (member_id in (select public.core_v2_my_colleague_ids()));

drop policy if exists core_v2_manager_team_select on public.manager_team;
create policy core_v2_manager_team_select on public.manager_team for select to authenticated
  using (manager_id in (select public.core_v2_my_colleague_ids()));

-- ── Billing history: managers only (canViewBilling is owner + admin in plans.config.js) ───────
drop policy if exists core_v2_subscription_select on public.subscription;
create policy core_v2_subscription_select on public.subscription for select to authenticated
  using (public.core_v2_is_manager(organization_id));

-- ── Issue / Profit / Churn: read by scope, write by the caller's own authority ────────────────
do $$
declare
  t text;
begin
  foreach t in array array['issue', 'profit', 'churn'] loop
    execute format('drop policy if exists %I on public.%I', 'core_v2_' || t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (
         organization_id in (select public.core_v2_my_org_ids())
         or client_group_id in (select public.core_v2_my_client_group_ids())
       )', 'core_v2_' || t || '_select', t);

    execute format('drop policy if exists %I on public.%I', 'core_v2_' || t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (
         public.core_v2_has_authority(public.core_v2_scope_org(organization_id, client_group_id), ''CREATE'')
       )', 'core_v2_' || t || '_insert', t);

    execute format('drop policy if exists %I on public.%I', 'core_v2_' || t || '_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (public.core_v2_has_authority(public.core_v2_scope_org(organization_id, client_group_id), ''UPDATE''))
         with check (public.core_v2_has_authority(public.core_v2_scope_org(organization_id, client_group_id), ''UPDATE''))',
      'core_v2_' || t || '_update', t);

    execute format('drop policy if exists %I on public.%I', 'core_v2_' || t || '_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (
         public.core_v2_has_authority(public.core_v2_scope_org(organization_id, client_group_id), ''DELETE'')
       )', 'core_v2_' || t || '_delete', t);
  end loop;
end $$;

-- ── An MCP/AI token cannot write issue / profit / churn ───────────────────────────────────────
-- Same RESTRICTIVE pattern as 20260914120000 (ANDed with the permissive set, so nothing above is
-- rewritten). Guarded: is_mcp_session() is created by that migration and this file must not fail
-- on a project where it has not been applied — it warns instead, and the tables are then writable
-- by an AI session holding an ordinary user token until it is.
do $$
declare
  t text;
  verb text;
begin
  if to_regprocedure('public.is_mcp_session()') is null then
    raise warning 'core_v2: public.is_mcp_session() not found — apply 20260914120000_mcp_ai_session_restrictions.sql, then re-run this file, or an AI session can write issue/profit/churn';
    return;
  end if;

  foreach t in array array['issue', 'profit', 'churn'] loop
    foreach verb in array array['insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', 'mcp_no_' || verb || '_' || t, t);
      if verb = 'insert' then
        execute format(
          'create policy %I on public.%I as restrictive for insert to authenticated with check (not public.is_mcp_session())',
          'mcp_no_insert_' || t, t);
      else
        execute format(
          'create policy %I on public.%I as restrictive for %s to authenticated using (not public.is_mcp_session())',
          'mcp_no_' || verb || '_' || t, t, verb);
      end if;
    end loop;
  end loop;
end $$;

-- ============================================================
-- §12 — Verification (run AFTER applying, in pre-prod)
-- ============================================================
-- 12.1 — Every new table exists with RLS on. Expect 25 rows, rls = true on all.
--
--   select c.relname, c.relrowsecurity as rls
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relkind = 'r' and c.relname in (
--     'country','currency','language_region','company','company_link','organization',
--     'client_group','organization_client_group','personage','personage_link','viewer','member',
--     'manager','organization_position','organization_worker','member_authority',
--     'member_client_group','manager_team','client_group_viewer','issue','profit','churn',
--     'subscription','organization_role','prospect')
--   order by 1;
--
-- 12.2 — Seeds. Expect 20 / 6 / 3.
--
--   select (select count(*) from public.currency)        as currencies,
--          (select count(*) from public.country)         as countries,
--          (select count(*) from public.language_region) as language_regions;
--
-- 12.3 — The scope validator works (CORE-V2-CG-ORG). In a transaction you roll back: insert two
--        companies + an organization + a client_group NOT linked to it, then an issue naming both.
--        Expect: "ClientGroup … does not belong to Organization …".
--
-- 12.4 — Nothing existing changed. This file touches no existing table, so this is a sanity check:
--
--   select count(*) from public.organizations;   -- same as before
--
-- 12.5 — The MCP write restriction is present (only if is_mcp_session() existed). Expect 9 rows.
--
--   select tablename, policyname from pg_policies
--   where schemaname = 'public' and tablename in ('issue','profit','churn') and policyname like 'mcp_no_%';

-- 12.6 — No orphaned people: a member / viewer whose login no longer exists. Expect 0. A non-zero
--        result is personal data the erasure flow missed (a login deleted without its profile).
--
--   select 'member' as kind, m.personage_id from public.member m
--    where m.auth_user_id is not null and not exists (select 1 from auth.users u where u.id = m.auth_user_id)
--   union all
--   select 'viewer', v.personage_id from public.viewer v
--    where v.auth_user_id is not null and not exists (select 1 from auth.users u where u.id = v.auth_user_id);

-- ============================================================
-- §13 — Rollback
-- ============================================================
-- Nothing else depends on these objects until part 2 is applied. If part 2 is applied, roll it
-- back first (its own §Rollback). Then:
--
--   drop table if exists public.prospect, public.organization_role, public.subscription, public.churn, public.profit, public.issue,
--     public.client_group_viewer, public.manager_team, public.member_client_group,
--     public.member_authority, public.organization_worker, public.organization_position,
--     public.manager, public.member, public.viewer, public.personage_link, public.personage,
--     public.organization_client_group, public.client_group, public.organization,
--     public.company_link, public.company, public.language_region, public.currency,
--     public.country cascade;
--   drop function if exists public.validate_organization_client_group() cascade;
--   drop function if exists public.core_v2_personage_id(), public.core_v2_my_org_ids(),
--     public.core_v2_my_client_group_ids(), public.core_v2_my_colleague_ids(),
--     public.core_v2_has_authority(bigint, public.authority), public.core_v2_is_manager(bigint),
--     public.core_v2_scope_org(bigint, bigint);
--   drop type if exists public.pipeline_stage, public.person_title, public.issue_status, public.authority,
--     public.subscription_type, public.job_status, public.client_status;
