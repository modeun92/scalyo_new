-- SCALYO — core_v2, part 2/3: keep the new core schema in sync with the old tables.
--
-- Requires 20260920100000_core_v2_schema.sql. Run part 3 (backfill) after this one.
--
-- WHY TRIGGERS. The application keeps reading and writing `organizations`, `profiles`,
-- `clients` and `organization_members` exactly as before — no store, view or /api route changes
-- in this pass. These triggers make the database mirror those writes into the core_v2 tables
-- underneath. The old tables stay the source of truth for every screen, plan check, seat count
-- and invitation; core_v2 is a projection of them.
--
-- WHAT IS MIRRORED
--   organizations        -> company + organization                 (+ subscription history rows)
--   profiles +           -> personage + member | viewer (+ manager) + organization_worker
--   organization_members    + member_authority + organization.owner_personage_id
--   clients (not         -> company + client_group + organization_client_group
--   prospects)
-- NOT mirrored, on purpose (decided with the owner of this change): arr, mrr, health, nps,
-- churn_risk, renewal_date, lifecycle, pipeline_stage, notes (clients); csm_id — so
-- member_client_group stays EMPTY; plan / seats / invitations (they stay on the old tables).
--
-- ROLE MAPPING (coarse — see docs/DATABASE.md). owner + admin -> manager (VIEW, CREATE, UPDATE,
-- DELETE, INVITE, ASSIGN_CLIENT_GROUP — canInvite is true for both in plans.config.js ROLES, and
-- reassigning a client group is a manager decision). member -> member (VIEW, CREATE, UPDATE — no
-- DELETE, approximating today's "write:own"; no INVITE, no ASSIGN_CLIENT_GROUP). viewer -> viewer
-- (no member_authority row: a viewer is not a member). SEND_EMAIL mirrors
-- organization_members.can_send_email for any member/manager, and is implicit for the billing
-- owner (api/email.js sends as the owner's own config without consulting the flag). The
-- per-entity read/write matrix in plans.config.js ROLES has no equivalent in the new schema and
-- is NOT reconstructed.
--
-- CORE-V2-FAILOPEN — these triggers can never break an existing flow. Every function body is
-- wrapped so an error becomes a WARNING and the original write proceeds. The alternative — an
-- unguarded trigger — turns any bug in this projection into a failed signup, a failed invite
-- acceptance or a failed client import, in a change whose stated promise is "nothing existing
-- changes behaviour". The price is that a failure is silent drift, not an outage: part 3 is
-- idempotent and re-running it heals the drift; §Verification below counts it.
--
-- CORE-V2-NO-TRUST — the bridge columns added below (organizations.core_organization_id,
-- clients.core_client_group_id) are writable by whoever can UPDATE the row, which for
-- organizations is the owner (org_manage) and for clients any teammate. If the sync believed
-- the value on NEW it would let a user point their own row at ANOTHER tenant's company and have
-- the next sync rename it. So the BEFORE triggers discard whatever value the statement supplied
-- and restore the stored one (NULL on INSERT); only this file's own code assigns it.
-- (profiles gets no bridge column: the link to the personage is member/viewer.auth_user_id, a
-- table users cannot write. The plan's `profiles.core_personage_id` was dropped for that reason —
-- it would be a second, forgeable copy of a link that already exists.)
--
-- PRE-PROD (wxbape…) FIRST, PROD on an explicit go (R8). Idempotent: safe to re-run.

-- ============================================================
-- §1 — Bridge columns
-- ============================================================
alter table public.organizations
  add column if not exists core_organization_id bigint
  references public.organization(company_id) on delete set null;

alter table public.clients
  add column if not exists core_client_group_id bigint
  references public.client_group(company_id) on delete set null;

create index if not exists idx_organizations_core_organization on public.organizations (core_organization_id);
create index if not exists idx_clients_core_client_group       on public.clients (core_client_group_id);

-- ============================================================
-- §2 — Pure mappings
-- ============================================================
-- Owner and admin are both "manager": the new schema has no owner/admin distinction.
create or replace function public.core_v2_role_kind(p_role text)
returns text
language sql
immutable
as $fn$
  select case lower(btrim(coalesce(p_role, '')))
    when 'owner'  then 'manager'
    when 'admin'  then 'manager'
    when 'member' then 'member'
    when 'viewer' then 'viewer'
    else null            -- unknown role: mirror nothing rather than guess a permission level
  end;
$fn$;

-- LOSSY, best-effort. The new schema has four tiers, the product has starter / growth / elite /
-- enterprise; growth and elite both land on PRO. Harmless: organizations.plan is the real source
-- of truth and nothing reads this. An unrecognised non-empty plan returns NULL (no row logged)
-- rather than a plausible-looking tier.
create or replace function public.core_v2_subscription_type(p_plan text)
returns public.subscription_type
language sql
immutable
as $fn$
  select case lower(btrim(coalesce(p_plan, '')))
    when ''           then 'FREE'::public.subscription_type
    when 'none'       then 'FREE'::public.subscription_type
    when 'starter'    then 'BASIC'::public.subscription_type
    when 'growth'     then 'PRO'::public.subscription_type
    when 'elite'      then 'PRO'::public.subscription_type
    when 'enterprise' then 'ENTERPRISE'::public.subscription_type
    else null
  end;
$fn$;

-- ============================================================
-- §3 — People: profiles + organization_members -> personage / member / manager / worker
-- ============================================================
-- A person whose organization is gone (removed from the team, or never joined one).
-- The worker row is kept as ENDED history rather than deleted; core_v2_has_authority and every
-- RLS helper require job_status = 'ACTIVE', so an ended worker reads nothing.
create or replace function public.core_v2_end_membership(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.organization_worker w
     set job_status = 'ENDED'
   where w.job_status <> 'ENDED'
     and w.personage_id in (
       select m.personage_id from public.member m where m.auth_user_id = p_user
       union
       select v.personage_id from public.viewer v where v.auth_user_id = p_user
     );
end;
$fn$;

-- The one place that turns "this user, in this organization, with this role" into core_v2 rows.
-- Reads the current truth from the OLD tables and is idempotent, so the triggers and the
-- backfill both simply call it.
--
-- Truth order: profiles.organization_id says WHICH organization (the canonical source stores/
-- auth.js uses); organization_members.role says the role for it, falling back to
-- profiles.org_role. Both are written by invite/accept.js and alpha/activate.js.
create or replace function public.core_v2_sync_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_first text;
  v_last text;
  v_locale text;
  v_org uuid;
  v_profile_role text;
  v_role text;
  v_kind text;
  v_core_org bigint;
  v_pid bigint;
  v_email text;
  v_lang text;
  v_wanted public.authority[];
  v_can_email boolean;
  v_is_owner boolean;
begin
  select p.first_name, p.last_name, p.locale, p.organization_id, p.org_role
    into v_first, v_last, v_locale, v_org, v_profile_role
    from public.profiles p
   where p.id = p_user;
  if not found then
    return;
  end if;

  if v_org is null then
    perform public.core_v2_end_membership(p_user);
    return;
  end if;

  select om.role, coalesce(om.can_send_email, false) into v_role, v_can_email
    from public.organization_members om
   where om.organization_id = v_org and om.user_id = p_user
   limit 1;
  v_role := coalesce(nullif(v_role, ''), v_profile_role);
  v_kind := public.core_v2_role_kind(v_role);
  if v_kind is null then
    return;
  end if;

  select o.core_organization_id, coalesce(o.owner_id = p_user, false) into v_core_org, v_is_owner
    from public.organizations o
   where o.id = v_org;
  if v_core_org is null then
    return;   -- the organization is not mirrored yet (before the backfill) — nothing to attach to
  end if;

  select u.email into v_email from auth.users u where u.id = p_user;

  -- 'fr-FR' -> 'fr'. A locale outside language_region becomes NULL, never a guess.
  v_lang := lower(split_part(coalesce(v_locale, ''), '-', 1));
  if not exists (select 1 from public.language_region lr where lr.code = v_lang) then
    v_lang := null;
  end if;

  select x.personage_id into v_pid
    from (
      select m.personage_id from public.member m where m.auth_user_id = p_user
      union all
      select v.personage_id from public.viewer v where v.auth_user_id = p_user
    ) x
   limit 1;

  -- personage.first_name / last_name are NOT NULL: a profile with no name yet becomes '' —
  -- an honest empty, not a placeholder that would render as somebody's name.
  if v_pid is null then
    insert into public.personage (first_name, last_name, language_region_code, email_address)
    values (coalesce(v_first, ''), coalesce(v_last, ''), v_lang, v_email)
    returning id into v_pid;
  else
    update public.personage ps
       set first_name = coalesce(v_first, ''),
           last_name = coalesce(v_last, ''),
           language_region_code = v_lang,
           email_address = v_email
     where ps.id = v_pid
       and (ps.first_name, ps.last_name, ps.language_region_code, ps.email_address)
           is distinct from (coalesce(v_first, ''), coalesce(v_last, ''), v_lang, v_email);
  end if;

  if v_kind = 'viewer' then
    -- A personage is a member OR a viewer, never both: a role change moves it across.
    delete from public.member where personage_id = v_pid;
    insert into public.viewer (personage_id, auth_user_id)
    values (v_pid, p_user)
    on conflict (personage_id) do update set auth_user_id = excluded.auth_user_id;
  else
    delete from public.viewer where personage_id = v_pid;
    insert into public.member (personage_id, auth_user_id)
    values (v_pid, p_user)
    on conflict (personage_id) do update set auth_user_id = excluded.auth_user_id;

    if v_kind = 'manager' then
      insert into public.manager (personage_id) values (v_pid) on conflict do nothing;
      v_wanted := array['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'INVITE', 'ASSIGN_CLIENT_GROUP']::public.authority[];
    else
      delete from public.manager where personage_id = v_pid;
      v_wanted := array['VIEW', 'CREATE', 'UPDATE']::public.authority[];
    end if;

    -- SEND_EMAIL: the per-member flag, plus the billing owner who sends with their own config.
    if coalesce(v_can_email, false) or v_is_owner then
      v_wanted := v_wanted || 'SEND_EMAIL'::public.authority;
    end if;

    delete from public.member_authority
     where member_id = v_pid and not (authority = any (v_wanted));
    insert into public.member_authority (member_id, authority)
    select v_pid, a from unnest(v_wanted) a
    on conflict do nothing;
  end if;

  -- uq_organization_worker_person: one organization per personage. Joining another organization
  -- replaces the previous (ENDED) row; the same organization just reactivates it.
  delete from public.organization_worker
   where personage_id = v_pid and organization_id <> v_core_org;
  insert into public.organization_worker (organization_id, personage_id, job_status)
  values (v_core_org, v_pid, 'ACTIVE')
  on conflict (organization_id, personage_id) do update set job_status = 'ACTIVE';

  -- Billing owner: organizations.owner_id wins; a role of 'owner' fills the gap only when no
  -- owner is recorded yet (two profiles claiming 'owner' must not flip it back and forth).
  if v_kind = 'manager' then
    if v_is_owner then
      update public.organization
         set owner_personage_id = v_pid
       where company_id = v_core_org and owner_personage_id is distinct from v_pid;
    elsif lower(btrim(coalesce(v_role, ''))) = 'owner' then
      update public.organization
         set owner_personage_id = v_pid
       where company_id = v_core_org and owner_personage_id is null;
    end if;
  end if;
end;
$fn$;

-- profiles -> core_v2. Fires only on the columns that feed the projection: the frequent
-- profile writes (onboarding flags, Stripe ids, plan) do not run it.
create or replace function public.core_v2_profile_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  begin
    perform public.core_v2_sync_user(new.id);
  exception when others then
    raise warning 'core_v2 profile sync failed for %: % (%)', new.id, sqlerrm, sqlstate;
  end;
  return new;
end;
$fn$;

drop trigger if exists trg_core_v2_profile_sync on public.profiles;
create trigger trg_core_v2_profile_sync
  after insert or update of first_name, last_name, locale, organization_id, org_role
  on public.profiles
  for each row execute function public.core_v2_profile_sync();

-- organization_members -> core_v2. The seat table: a role written here (invite/accept.js,
-- alpha/activate.js) is re-read by core_v2_sync_user next to the profile's organization.
create or replace function public.core_v2_member_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  begin
    if tg_op in ('INSERT', 'UPDATE') then
      perform public.core_v2_sync_user(new.user_id);
    end if;
    if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.user_id is distinct from new.user_id) then
      perform public.core_v2_sync_user(old.user_id);
    end if;
  exception when others then
    raise warning 'core_v2 organization_members sync failed: % (%)', sqlerrm, sqlstate;
  end;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_core_v2_member_sync on public.organization_members;
create trigger trg_core_v2_member_sync
  after insert or update or delete on public.organization_members
  for each row execute function public.core_v2_member_sync();

-- GDPR: a personage holds a name and an email. Deleting the login's profile deletes the person
-- (member / viewer / manager / authority / worker rows follow by cascade). Without this the
-- projection would keep personal data the old tables had erased.
create or replace function public.core_v2_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  begin
    delete from public.personage ps
     where ps.id in (
       select m.personage_id from public.member m where m.auth_user_id = old.id
       union
       select v.personage_id from public.viewer v where v.auth_user_id = old.id
     );
  exception when others then
    raise warning 'core_v2 profile delete failed for %: % (%)', old.id, sqlerrm, sqlstate;
  end;
  return old;
end;
$fn$;

drop trigger if exists trg_core_v2_profile_delete on public.profiles;
create trigger trg_core_v2_profile_delete
  after delete on public.profiles
  for each row execute function public.core_v2_profile_delete();

-- ============================================================
-- §4 — Organizations -> company + organization (+ subscription history)
-- ============================================================
-- BEFORE, so the bridge column is assigned on the row being written (an AFTER trigger would need
-- a second UPDATE, which re-fires every trigger on the table and, for an authenticated writer,
-- would run into protect_org_billing_fields). Named zz_ so it fires LAST among the BEFORE
-- triggers and sees the final NEW.
create or replace function public.core_v2_org_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cid bigint;
  v_currency text;
begin
  -- CORE-V2-NO-TRUST: never believe the bridge value the statement supplied.
  if tg_op = 'UPDATE' then
    new.core_organization_id := old.core_organization_id;
  else
    new.core_organization_id := null;
  end if;

  begin
    v_cid := new.core_organization_id;

    -- The organization's currency is the account currency of its owner (user_profiles.currency,
    -- DEFAULT 'EUR'); a code the currency table does not know stays NULL rather than failing.
    select up.currency into v_currency
      from public.user_profiles up
     where up.id = new.owner_id;
    if v_currency is not null
       and not exists (select 1 from public.currency c where c.code = upper(v_currency)) then
      v_currency := null;
    end if;
    v_currency := upper(v_currency);

    if v_cid is null then
      -- country_code stays NULL: organizations has no country column (CORE-V2-COUNTRY, R21).
      insert into public.company (name, currency_code)
      values (coalesce(new.name, ''), v_currency)
      returning id into v_cid;
      insert into public.organization (company_id) values (v_cid);
    else
      update public.company
         set name = coalesce(new.name, '')
       where id = v_cid and name is distinct from coalesce(new.name, '');
      -- Fill the currency in, never overwrite it: it is not edited through this table.
      if v_currency is not null then
        update public.company
           set currency_code = v_currency
         where id = v_cid and currency_code is null;
      end if;
    end if;

    new.core_organization_id := v_cid;
  exception when others then
    raise warning 'core_v2 organization sync failed for %: % (%)', new.id, sqlerrm, sqlstate;
  end;

  return new;
end;
$fn$;

drop trigger if exists trg_zz_core_v2_org_sync on public.organizations;
create trigger trg_zz_core_v2_org_sync
  before insert or update on public.organizations
  for each row execute function public.core_v2_org_sync();

-- One subscription row per plan change, appended, never updated. issue_date is the moment the
-- change was RECORDED here (now()) — the old tables carry no plan-change timestamp, and
-- inventing one would be a plausible-looking date that is not true (R21).
create or replace function public.core_v2_org_subscription_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_type public.subscription_type;
begin
  begin
    if new.core_organization_id is null then
      return new;
    end if;
    if tg_op = 'UPDATE' and new.plan is not distinct from old.plan then
      return new;
    end if;
    v_type := public.core_v2_subscription_type(new.plan);
    if v_type is null then
      raise notice 'core_v2: plan % of organization % has no subscription_type; not logged', new.plan, new.id;
      return new;
    end if;
    insert into public.subscription (organization_id, issue_date, type)
    values (new.core_organization_id, now(), v_type);
  exception when others then
    raise warning 'core_v2 subscription log failed for %: % (%)', new.id, sqlerrm, sqlstate;
  end;
  return new;
end;
$fn$;

drop trigger if exists trg_core_v2_org_subscription_log on public.organizations;
create trigger trg_core_v2_org_subscription_log
  after insert or update of plan on public.organizations
  for each row execute function public.core_v2_org_subscription_log();

-- Deleting an organization deletes its mirror. subscription and the client-group companies go
-- first (subscription is ON DELETE RESTRICT). issue / profit / churn are RESTRICT too and are
-- user data with no old-table source: if any exist the delete fails, is reported as a WARNING,
-- and the mirror is left for a person to decide about — the old delete is never blocked.
create or replace function public.core_v2_org_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if old.core_organization_id is null then
    return old;
  end if;
  begin
    delete from public.subscription where organization_id = old.core_organization_id;
    delete from public.company
     where id in (
       select ocg.client_group_id
         from public.organization_client_group ocg
        where ocg.organization_id = old.core_organization_id
     );
    delete from public.company where id = old.core_organization_id;
  exception when others then
    raise warning 'core_v2 organization delete failed for %: % (%)', old.id, sqlerrm, sqlstate;
  end;
  return old;
end;
$fn$;

drop trigger if exists trg_core_v2_org_delete on public.organizations;
create trigger trg_core_v2_org_delete
  after delete on public.organizations
  for each row execute function public.core_v2_org_delete();

-- ============================================================
-- §5 — Clients -> company + client_group + organization_client_group
-- ============================================================
-- Prospects are not clients in the new model (the same rule as clientsOnly in stores/clients.js).
-- A prospect is skipped; a row that becomes a client later is picked up by the UPDATE. A row that
-- BECOMES a prospect after being mirrored is left as it is — pipeline moves forward, and deleting
-- a client group could hit RESTRICT-ed issues.
--
-- A client with no organization_id has nothing to attach to: no organization, no client group.
create or replace function public.core_v2_client_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cid bigint;
  v_org bigint;
  v_status public.client_status;
begin
  -- CORE-V2-NO-TRUST: never believe the bridge value the statement supplied.
  if tg_op = 'UPDATE' then
    new.core_client_group_id := old.core_client_group_id;
  else
    new.core_client_group_id := null;
  end if;

  begin
    if new.lifecycle is not distinct from 'prospect' or new.organization_id is null then
      return new;
    end if;

    select o.core_organization_id into v_org
      from public.organizations o
     where o.id = new.organization_id;
    if v_org is null then
      return new;
    end if;

    v_cid := new.core_client_group_id;
    v_status := case
      when new.churned_at is not null then 'CHURNED'::public.client_status
      else 'ACTIVE'::public.client_status
    end;

    if v_cid is null then
      -- country_code / currency_code stay NULL: clients carries neither (CORE-V2-COUNTRY, R21).
      insert into public.company (name, photo_path)
      values (coalesce(new.name, ''), new.logo)
      returning id into v_cid;
      insert into public.client_group (company_id, status) values (v_cid, v_status);
    else
      update public.company
         set name = coalesce(new.name, ''), photo_path = new.logo
       where id = v_cid
         and (name, photo_path) is distinct from (coalesce(new.name, ''), new.logo);
      update public.client_group
         set status = v_status
       where company_id = v_cid and status is distinct from v_status;
    end if;

    -- A client group belongs to exactly one organization (uq_organization_client_group_client).
    delete from public.organization_client_group
     where client_group_id = v_cid and organization_id <> v_org;
    insert into public.organization_client_group (organization_id, client_group_id)
    values (v_org, v_cid)
    on conflict do nothing;

    new.core_client_group_id := v_cid;
  exception when others then
    raise warning 'core_v2 client sync failed for %: % (%)', new.id, sqlerrm, sqlstate;
  end;

  return new;
end;
$fn$;

drop trigger if exists trg_zz_core_v2_client_sync on public.clients;
create trigger trg_zz_core_v2_client_sync
  before insert or update on public.clients
  for each row execute function public.core_v2_client_sync();

create or replace function public.core_v2_client_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if old.core_client_group_id is null then
    return old;
  end if;
  begin
    delete from public.company where id = old.core_client_group_id;
  exception when others then
    raise warning 'core_v2 client delete failed for %: % (%)', old.id, sqlerrm, sqlstate;
  end;
  return old;
end;
$fn$;

drop trigger if exists trg_core_v2_client_delete on public.clients;
create trigger trg_core_v2_client_delete
  after delete on public.clients
  for each row execute function public.core_v2_client_delete();

-- ============================================================
-- §6 — Nobody calls these but the triggers
-- ============================================================
-- Functions are executable by PUBLIC by default, and Supabase also grants anon/authenticated:
-- left as is, /rest/v1/rpc/core_v2_sync_user would let any signed-in user drive the projection
-- for any user id. Firing a trigger does not need EXECUTE on its function, so revoking is free.
revoke all on function public.core_v2_role_kind(text)                 from public, anon, authenticated;
revoke all on function public.core_v2_subscription_type(text)         from public, anon, authenticated;
revoke all on function public.core_v2_end_membership(uuid)            from public, anon, authenticated;
revoke all on function public.core_v2_sync_user(uuid)                 from public, anon, authenticated;
revoke all on function public.core_v2_profile_sync()                  from public, anon, authenticated;
revoke all on function public.core_v2_member_sync()                   from public, anon, authenticated;
revoke all on function public.core_v2_profile_delete()                from public, anon, authenticated;
revoke all on function public.core_v2_org_sync()                      from public, anon, authenticated;
revoke all on function public.core_v2_org_subscription_log()          from public, anon, authenticated;
revoke all on function public.core_v2_org_delete()                    from public, anon, authenticated;
revoke all on function public.core_v2_client_sync()                   from public, anon, authenticated;
revoke all on function public.core_v2_client_delete()                 from public, anon, authenticated;

-- ============================================================
-- §7 — Verification (run AFTER applying, in pre-prod)
-- ============================================================
-- 7.1 — The eight triggers exist. Expect 8 rows.
--
--   select event_object_table as tbl, trigger_name
--   from information_schema.triggers
--   where trigger_schema = 'public' and trigger_name like '%core_v2%'
--   group by 1, 2 order by 1, 2;
--
-- 7.2 — Helpers are not callable by users. Expect: permission denied for function.
--
--   set role authenticated;
--   select public.core_v2_sync_user('00000000-0000-0000-0000-000000000000');
--   reset role;
--
-- 7.3 — New organization creates its mirror (in a transaction you roll back):
--
--   begin;
--   insert into public.organizations (name, plan) values ('core_v2 smoke', 'starter') returning id, core_organization_id;
--   -- expect core_organization_id NOT NULL; then:
--   select c.name, c.country_code, c.currency_code from public.company c
--    where c.id = (select core_organization_id from public.organizations where name = 'core_v2 smoke');
--   -- expect country_code NULL. And one BASIC row:
--   select type from public.subscription
--    where organization_id = (select core_organization_id from public.organizations where name = 'core_v2 smoke');
--   rollback;
--
-- 7.4 — A forged bridge value is discarded (CORE-V2-NO-TRUST). As an org owner:
--
--   update public.organizations set core_organization_id = <ANOTHER tenant's company id> where id = '<mine>';
--   select core_organization_id from public.organizations where id = '<mine>';
--   -- expect: still MY value, not the one written.
--
-- 7.5 — The old flow never breaks. Force a failure in the projection (e.g. temporarily revoke the
--       function's table access or rename `personage`) and confirm a signup / invite accept /
--       client insert still SUCCEEDS with a WARNING "core_v2 … failed" in the Postgres log.
--
-- 7.6 — Drift check (run any time; expect 0 rows after part 3 and normal use):
--
--   select 'organizations' as tbl, id::text from public.organizations where core_organization_id is null
--   union all
--   select 'clients', id::text from public.clients
--    where core_client_group_id is null and organization_id is not null
--      and lifecycle is distinct from 'prospect';

-- ============================================================
-- §8 — Rollback
-- ============================================================
--   drop trigger if exists trg_core_v2_profile_sync         on public.profiles;
--   drop trigger if exists trg_core_v2_profile_delete       on public.profiles;
--   drop trigger if exists trg_core_v2_member_sync          on public.organization_members;
--   drop trigger if exists trg_zz_core_v2_org_sync          on public.organizations;
--   drop trigger if exists trg_core_v2_org_subscription_log on public.organizations;
--   drop trigger if exists trg_core_v2_org_delete           on public.organizations;
--   drop trigger if exists trg_zz_core_v2_client_sync       on public.clients;
--   drop trigger if exists trg_core_v2_client_delete        on public.clients;
--   drop function if exists public.core_v2_profile_sync(), public.core_v2_member_sync(),
--     public.core_v2_profile_delete(), public.core_v2_org_sync(), public.core_v2_org_subscription_log(),
--     public.core_v2_org_delete(), public.core_v2_client_sync(), public.core_v2_client_delete(),
--     public.core_v2_sync_user(uuid), public.core_v2_end_membership(uuid),
--     public.core_v2_role_kind(text), public.core_v2_subscription_type(text);
--   -- Optional, once nothing reads them:
--   alter table public.organizations drop column if exists core_organization_id;
--   alter table public.clients       drop column if exists core_client_group_id;
