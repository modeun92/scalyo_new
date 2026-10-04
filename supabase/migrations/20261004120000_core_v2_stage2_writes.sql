-- SCALYO — core_v2, stage 2 (profiles + organization_members), step C: the app's WRITES go through
-- core_v2 (written 04/10/2026).
--
-- Every write the front end and the Pages Functions made straight to profiles / organization_members
-- becomes one call to a function here. The function writes core_v2 — the source of truth from now on —
-- and, in the same transaction, the old row as a SHADOW (STAGE2-SHADOW). The shadow keeps the old
-- tables equal to core_v2 for whatever still reads them that the repository cannot see (dashboard
-- objects), and the profiles -> core_v2 mirror then finds nothing to change. Step E removes the shadow
-- lines, the mirror and the two tables; until then no caller outside this file writes either table.
--
--   for the signed-in person (authenticated; refused for an AI session, and for a read-only account —
--   JOB-STATUS-READ — by the same core_v2_can_write() as the database policies):
--     core_v2_set_my_name(first, last)            personage            (profiles.first_name / last_name)
--     core_v2_set_my_language(locale, region)     personage            (profiles.locale / region)
--     core_v2_complete_tour()                     member.tour_completed (profiles.onboarding_completed)
--     core_v2_rename_organization(name)           organizations.name -> company (owner only)
--     core_v2_start_trial()                       subscription TRIAL    (profiles.trial_started_at)
--     core_v2_set_member_can_send_email(user, on) member_authority      (organization_members.can_send_email)
--   for the server (service role):
--     core_v2_team(org)                           the team list /api/members shows, from core_v2
--     core_v2_seats_held(org) / core_v2_billable_seats(org)   seat counts from core_v2
--     core_v2_remove_member(org, user)            a removal, in ONE transaction (members/[id].js wrote
--                                                 three tables in three round trips)
--     + EXECUTE on core_v2_seats_taken (20261003120000) for invite.js / members.js
--   and the seat-ceiling guard (enforce_seat_ceiling, 20261003110000) stops counting an INACTIVE
--   worker as a seat, as the API counts now do (§3, JOB-STATUS).
--
-- The language code mirrors BASE_REGION (src/i18n/regional.js) by hand: fr -> FR, en -> US, ko -> KR.
--
-- Each answers {"ok": true, ...} or {"ok": false, "code": ...}; the front end treats anything but
-- ok: true as a failure (D-14). Codes: read_only, not_owner, not_found, invalid_name,
-- unsupported_language, unsupported_region, trial_used, has_period, not_member.
--
-- ORDER. After 20261004110000. Before the step-C front end and Pages Functions.
-- PRE-PROD FIRST, PROD on an explicit go. Idempotent.

-- ============================================================
-- §0 — Pre-flight
-- ============================================================
do $$
begin
  if to_regprocedure('public.core_v2_can_write()') is null or to_regprocedure('public.core_v2_my_role()') is null then
    raise exception 'stage 2 writes: apply 20261004110000_core_v2_stage2_policies.sql first';
  end if;
  if to_regprocedure('public.core_v2_seats_taken(bigint)') is null or to_regprocedure('public.plan_seat_ceiling(text)') is null then
    raise exception 'stage 2 writes: apply 20261003110000_seat_ceiling_guard.sql and 20261003120000_core_v2_job_status.sql first';
  end if;
  if to_regprocedure('public.ensure_own_organization(uuid)') is null then
    raise exception 'stage 2 writes: apply 20260927130000_own_organization_per_user.sql first';
  end if;
end $$;

-- ============================================================
-- §1 — The signed-in person's own writes
-- ============================================================
-- The common gate: who is calling, may they write. NULL personage = not in core_v2 yet.
create or replace function public.core_v2_stage2_caller()
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if to_regprocedure('public.mcp_guard()') is not null then
    perform public.mcp_guard();   -- an AI session writes nothing (20260914130000)
  end if;
  return public.core_v2_personage_id();
end;
$fn$;

create or replace function public.core_v2_set_my_name(p_first text, p_last text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_pid bigint := public.core_v2_stage2_caller();
  v_first text := btrim(coalesce(p_first, ''));
  v_last text := btrim(coalesce(p_last, ''));
begin
  if v_pid is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not public.core_v2_can_write() then return jsonb_build_object('ok', false, 'code', 'read_only'); end if;
  if length(v_first) > 100 or length(v_last) > 100 then return jsonb_build_object('ok', false, 'code', 'invalid_name'); end if;
  update public.personage set first_name = v_first, last_name = v_last where id = v_pid;
  update public.profiles set first_name = v_first, last_name = v_last where id = auth.uid();   -- STAGE2-SHADOW
  return jsonb_build_object('ok', true, 'first_name', v_first, 'last_name', v_last);
end;
$fn$;

-- CORE-V2-REGION: the language and its country in one code ('fr' + 'CA' -> 'fr-CA'; the base country,
-- or none, -> 'fr'). A country the language has no variant for is refused, never stored to be ignored.
create or replace function public.core_v2_set_my_language(p_locale text, p_region text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_pid bigint := public.core_v2_stage2_caller();
  v_lang text := lower(btrim(coalesce(p_locale, '')));
  v_region text := nullif(upper(btrim(coalesce(p_region, ''))), '');
  v_code text;
  v_base constant jsonb := '{"fr": "FR", "en": "US", "ko": "KR"}';
begin
  if v_pid is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not public.core_v2_can_write() then return jsonb_build_object('ok', false, 'code', 'read_only'); end if;
  if not exists (select 1 from public.language_region where code = v_lang) or v_base ->> v_lang is null then
    return jsonb_build_object('ok', false, 'code', 'unsupported_language');
  end if;
  if v_region is null or v_region = v_base ->> v_lang then
    v_code := v_lang;
  elsif exists (select 1 from public.language_region where code = v_lang || '-' || v_region) then
    v_code := v_lang || '-' || v_region;
  else
    return jsonb_build_object('ok', false, 'code', 'unsupported_region');
  end if;
  update public.personage set language_region_code = v_code where id = v_pid;
  -- STAGE2-SHADOW. region is a dashboard column: written where it exists.
  update public.profiles set locale = v_lang where id = auth.uid();
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles' and column_name = 'region') then
    execute 'update public.profiles set region = $1 where id = $2' using coalesce(v_region, v_base ->> v_lang), auth.uid();
  end if;
  return jsonb_build_object('ok', true, 'locale', v_lang, 'region', case when v_code = v_lang then null else v_region end);
end;
$fn$;

create or replace function public.core_v2_complete_tour()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_pid bigint := public.core_v2_stage2_caller();
begin
  if v_pid is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not public.core_v2_can_write() then return jsonb_build_object('ok', false, 'code', 'read_only'); end if;
  update public.member set tour_completed = true where personage_id = v_pid;
  -- STAGE2-SHADOW (dashboard column, written where it exists).
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles' and column_name = 'onboarding_completed') then
    execute 'update public.profiles set onboarding_completed = true where id = $1' using auth.uid();
  end if;
  return jsonb_build_object('ok', true);
end;
$fn$;

-- The company name is the organization's name: its owner renames it. organizations stays until stage 4
-- (the kept tables hold its uuid); its mirror carries the name to company.
create or replace function public.core_v2_rename_organization(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_pid bigint := public.core_v2_stage2_caller();
  v_name text := btrim(coalesce(p_name, ''));
  v_org uuid := public.get_my_org_id();
begin
  if v_pid is null or v_org is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not public.core_v2_can_write() then return jsonb_build_object('ok', false, 'code', 'read_only'); end if;
  if public.core_v2_my_role() is distinct from 'owner' then return jsonb_build_object('ok', false, 'code', 'not_owner'); end if;
  if v_name = '' or length(v_name) > 200 then return jsonb_build_object('ok', false, 'code', 'invalid_name'); end if;
  update public.organizations set name = v_name where id = v_org;
  return jsonb_build_object('ok', true, 'name', v_name);
end;
$fn$;

-- The trial: the organization's TRIAL period, opened by its OWNER (decided 04/10/2026: only the
-- organization grants access — a member's own trial would otherwise open somebody else's company),
-- once per person (a TRIAL row of theirs anywhere, an old organization's included, closes the door),
-- and only when the organization has no current period (an alpha tester's code or a payment needs none).
create or replace function public.core_v2_start_trial()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_pid bigint := public.core_v2_stage2_caller();
  v_org uuid := public.get_my_org_id();
  v_core bigint;
  v_id bigint;
begin
  if v_pid is null or v_org is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not public.core_v2_can_write() then return jsonb_build_object('ok', false, 'code', 'read_only'); end if;
  if public.core_v2_my_role() is distinct from 'owner' then return jsonb_build_object('ok', false, 'code', 'not_owner'); end if;
  if exists (select 1 from public.subscription s where s.kind = 'TRIAL' and s.personage_id = v_pid) then
    return jsonb_build_object('ok', false, 'code', 'trial_used');
  end if;
  select o.core_organization_id into v_core from public.organizations o where o.id = v_org;
  -- The organization row is the one lock for every subscription decision about it.
  perform 1 from public.organization og where og.company_id = v_core for update;
  if (public.core_v2_current_subscription(v_core)).id is not null then
    return jsonb_build_object('ok', false, 'code', 'has_period');
  end if;
  insert into public.subscription (organization_id, issue_date, duration, type, kind, personage_id)
  values (v_core, now(), interval '14 days', 'STARTER', 'TRIAL', v_pid)
  returning id into v_id;
  -- STAGE2-SHADOW. The mirror then finds the organization's TRIAL row and adds none.
  update public.profiles set trial_started_at = now(), trial_used = false where id = auth.uid();
  return jsonb_build_object('ok', true, 'subscription_id', v_id);
end;
$fn$;

-- Who may send e-mail with the organization's Resend key: the owner decides (the key is theirs,
-- api/email.js). The owner always may; a viewer never sends.
create or replace function public.core_v2_set_member_can_send_email(p_user uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_pid bigint := public.core_v2_stage2_caller();
  v_org uuid := public.get_my_org_id();
  v_target bigint;
begin
  if v_pid is null or v_org is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not public.core_v2_can_write() then return jsonb_build_object('ok', false, 'code', 'read_only'); end if;
  if public.core_v2_my_role() is distinct from 'owner' then return jsonb_build_object('ok', false, 'code', 'not_owner'); end if;
  select m.personage_id into v_target
    from public.member m
    join public.organization_worker w on w.personage_id = m.personage_id and w.job_status <> 'ENDED'
    join public.organizations o on o.core_organization_id = w.organization_id and o.id = v_org
   where m.auth_user_id = p_user;
  if v_target is null or v_target = v_pid then return jsonb_build_object('ok', false, 'code', 'not_member'); end if;
  if coalesce(p_on, false) then
    insert into public.member_authority (member_id, authority) values (v_target, 'SEND_EMAIL') on conflict do nothing;
  else
    delete from public.member_authority where member_id = v_target and authority = 'SEND_EMAIL';
  end if;
  update public.organization_members set can_send_email = coalesce(p_on, false)   -- STAGE2-SHADOW
   where organization_id = v_org and user_id = p_user;
  return jsonb_build_object('ok', true, 'can_send_email', coalesce(p_on, false));
end;
$fn$;

revoke all on function public.core_v2_stage2_caller() from public, anon, authenticated;
do $$
declare
  f text;
begin
  foreach f in array array[
    'core_v2_set_my_name(text, text)', 'core_v2_set_my_language(text, text)', 'core_v2_complete_tour()',
    'core_v2_rename_organization(text)', 'core_v2_start_trial()', 'core_v2_set_member_can_send_email(uuid, boolean)'
  ] loop
    execute 'revoke all on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
end $$;

-- ============================================================
-- §2 — For the server (service role)
-- ============================================================
-- The team of an organization (old uuid), everyone included, ENDED excluded: what /api/members lists.
-- `id` is the login (user_id), the key DELETE /api/members/:id now takes — an organization_members
-- row id would not survive that table.
create or replace function public.core_v2_team(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', coalesce(m.auth_user_id, v.auth_user_id),
           'user_id', coalesce(m.auth_user_id, v.auth_user_id),
           'role', public.core_v2_role_of(w.personage_id, w.organization_id),
           'job_status', w.job_status,
           'joined_at', w.joined_at)
           order by w.joined_at nulls last, w.personage_id), '[]'::jsonb)
    from public.organization_worker w
    join public.organizations o on o.core_organization_id = w.organization_id and o.id = p_org
    left join public.member m on m.personage_id = w.personage_id
    left join public.viewer v on v.personage_id = w.personage_id
   where w.job_status <> 'ENDED'
     and coalesce(m.auth_user_id, v.auth_user_id) is not null;
$fn$;

-- Seats held by members (managers included): ACTIVE / ON_LEAVE — the ceiling's count (JOB-STATUS),
-- without pending invitations (core_v2_seats_taken adds those).
create or replace function public.core_v2_seats_held(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $fn$
  select count(*)::integer
    from public.organization_worker w
    join public.member m on m.personage_id = w.personage_id
    join public.organizations o on o.core_organization_id = w.organization_id and o.id = p_org
   where w.job_status not in ('ENDED', 'INACTIVE');
$fn$;

-- Seats billed (the Stripe quantity, SEAT-AT-ACCEPT): every member who has not left. An INACTIVE one
-- is still billed — whether they should be is an open decision (JOB-STATUS), so nothing changes here.
create or replace function public.core_v2_billable_seats(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $fn$
  select count(*)::integer
    from public.organization_worker w
    join public.member m on m.personage_id = w.personage_id
    join public.organizations o on o.core_organization_id = w.organization_id and o.id = p_org
   where w.job_status <> 'ENDED';
$fn$;

-- A removal, after Stripe agreed (members/[id].js keeps Stripe first, fail-closed): the membership
-- goes, the person gets an organization of their own back (OWN-ORG), seats_paid is the new billed
-- count — one transaction, where the route used three round trips and could stop between them. The
-- old rows are written as the shadow (the mirror ends the core_v2 worker: ENDED) until step E.
create or replace function public.core_v2_remove_member(p_org uuid, p_user uuid, p_seats_paid integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_deleted integer;
begin
  delete from public.organization_members where organization_id = p_org and user_id = p_user;   -- STAGE2-SHADOW
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  update public.profiles set organization_id = null, org_role = 'member' where id = p_user;   -- STAGE2-SHADOW
  if p_seats_paid is not null then
    update public.organizations set seats_paid = p_seats_paid where id = p_org;
  end if;
  perform public.ensure_own_organization(p_user);
  return jsonb_build_object('ok', true);
end;
$fn$;

revoke all on function public.core_v2_team(uuid)                          from public, anon, authenticated;
revoke all on function public.core_v2_seats_held(uuid)                    from public, anon, authenticated;
revoke all on function public.core_v2_billable_seats(uuid)                from public, anon, authenticated;
revoke all on function public.core_v2_remove_member(uuid, uuid, integer)   from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.core_v2_team(uuid)                        to service_role;
    grant execute on function public.core_v2_seats_held(uuid)                  to service_role;
    grant execute on function public.core_v2_billable_seats(uuid)              to service_role;
    grant execute on function public.core_v2_remove_member(uuid, uuid, integer) to service_role;
    -- invite.js and members.js read the ceiling count (20261003120000) from now on.
    grant execute on function public.core_v2_seats_taken(bigint)               to service_role;
  end if;
end $$;

-- ============================================================
-- §3 — The seat-ceiling guard counts core_v2 (JOB-STATUS)
-- ============================================================
-- SEAT-CEILING (20261003110000) counted organization_members, where an INACTIVE worker still holds a
-- row: with a starter's 3 seats, one of them INACTIVE, invite.js and accept.js (core_v2 counts) let a
-- third person in and this trigger then refused the insert — after Stripe had billed the seat. A
-- member whose core_v2 worker is INACTIVE (or ENDED) now holds no seat here either, as in
-- core_v2_seats_taken / _held. The rows are still counted from organization_members, where the
-- acceptance writes them until step E: counted from core_v2 alone, a member the fail-open mirror
-- missed would be no seat at all and the ceiling would open wider than the plan (the test with members
-- that have no profile let a fourth person into a starter team). The ceiling still comes from
-- organizations.plan until billing reads subscription (step D).
create or replace function public.enforce_seat_ceiling()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_plan text;
  v_core bigint;
  v_cap integer;
  v_used integer;
begin
  if coalesce(new.role, 'member') = 'viewer' then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.role, 'member') <> 'viewer'
     and old.organization_id is not distinct from new.organization_id then
    return new;   -- already holding a seat here
  end if;

  select o.plan, o.core_organization_id into v_plan, v_core
    from public.organizations o where o.id = new.organization_id for update;
  if not found then
    return new;
  end if;
  v_cap := public.plan_seat_ceiling(v_plan);
  if v_cap is null then
    return new;
  end if;

  select count(*) into v_used
    from public.organization_members m
   where m.organization_id = new.organization_id
     and coalesce(m.role, 'member') <> 'viewer'
     and m.id is distinct from new.id
     and not exists (select 1
                       from public.organization_worker w
                       join public.member mb on mb.personage_id = w.personage_id
                      where mb.auth_user_id = m.user_id
                        and w.organization_id = v_core
                        and w.job_status in ('INACTIVE', 'ENDED'));
  if v_used >= v_cap then
    raise exception 'SEAT_LIMIT_REACHED: % of % seats taken on plan %', v_used, v_cap, v_plan
      using errcode = 'check_violation';
  end if;
  return new;
end;
$fn$;
revoke all on function public.enforce_seat_ceiling() from public, anon, authenticated;

-- ============================================================
-- Verification (run AFTER applying, in pre-prod)
-- ============================================================
-- 1. The functions exist. Expect 10 rows.
--
--   select proname from pg_proc where proname in ('core_v2_set_my_name', 'core_v2_set_my_language',
--     'core_v2_complete_tour', 'core_v2_rename_organization', 'core_v2_start_trial',
--     'core_v2_set_member_can_send_email', 'core_v2_team', 'core_v2_seats_held', 'core_v2_billable_seats',
--     'core_v2_remove_member');
--
-- 2. core_v2 and the shadow agree on names and languages for everyone (expect 0 rows):
--
--   select p.id from public.profiles p join public.member m on m.auth_user_id = p.id
--     join public.personage ps on ps.id = m.personage_id
--    where (ps.first_name, ps.last_name) is distinct from (coalesce(p.first_name, ''), coalesce(p.last_name, ''));
--
-- ============================================================
-- Rollback
-- ============================================================
--   drop function if exists public.core_v2_remove_member(uuid, uuid, integer), public.core_v2_billable_seats(uuid),
--     public.core_v2_seats_held(uuid), public.core_v2_team(uuid), public.core_v2_set_member_can_send_email(uuid, boolean),
--     public.core_v2_start_trial(), public.core_v2_rename_organization(text), public.core_v2_complete_tour(),
--     public.core_v2_set_my_language(text, text), public.core_v2_set_my_name(text, text), public.core_v2_stage2_caller();
