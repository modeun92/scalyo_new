-- SCALYO — core_v2, stage 2 (profiles + organization_members), step B: what the app reads instead.
--
-- Retiring profiles and organization_members (decided 27/09/2026) goes A (own organization per
-- account, 20260927130000) → B the app READS core_v2 → C it WRITES core_v2 → D billing on subscription
-- → E the drop. This file is B's database half: two read functions that answer, from core_v2 alone,
-- what the app asks profiles / organization_members / organizations today.
--
--   core_v2_me()               — for the signed-in person (stores/auth.js): who they are, the
--                                organization they work in, their role there, the tour flag, and the
--                                organization's current subscription period. One call instead of
--                                profiles + organizations.
--   core_v2_membership(uuid)   — for the Pages Functions (service role): the person's organization and
--                                role, what _utils/supabase.getUserMembership reads from
--                                organization_members today.
--   core_v2_my_team()          — the caller's colleagues with their names, roles and job status
--                                (stores/team.js), which today reads organization_members + profiles
--                                — and gets only the caller's own profile back, profiles RLS being
--                                self-only, so every teammate's name came back empty.
--
-- THE ROLE (STAGE2-ROLE). core_v2 has no owner / admin columns; the app's four roles are read back as:
-- owner = the organization's billing owner (organization.owner_personage_id), admin = any other manager,
-- member = a member who is not a manager, viewer = a viewer — the inverse of core_v2_role_kind
-- (owner + admin -> manager). can_send_email = the SEND_EMAIL authority.
--
-- THE ORGANIZATION ID (STAGE2-ORG-ID). The 29 kept tables and their policies still hold the OLD
-- organization uuid (organizations.id) until stage 4, so both are returned: `id` (old uuid, what every
-- query on a kept table needs) and `core_id` (core_v2's bigint). The uuid is found through the bridge,
-- organizations.core_organization_id.
--
-- JOB STATUS. A worker who is ENDED belongs nowhere: no organization is returned. INACTIVE and
-- ON_LEAVE return everything with `read_only: true` (JOB-STATUS-READ, decided 04/10/2026): the app
-- tells them once, in a popup, and shows the product greyed with its inputs disabled. The database
-- holds the line on its own: no core_v2 write accepts anything but an ACTIVE worker.
--
-- Read-only, additive: nothing calls these until the stage-2 front end ships. Requires the core_v2
-- files and 20261003120000. PRE-PROD FIRST, PROD on an explicit go. Idempotent.

-- ============================================================
-- §0 — Pre-flight
-- ============================================================
do $$
begin
  if to_regprocedure('public.core_v2_my_subscription()') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'member' and column_name = 'tour_completed') then
    raise exception 'stage 2 reads: apply the core_v2 files (with member.tour_completed) first';
  end if;
end $$;

-- ============================================================
-- §1 — A person's role in an organization, in the app's four words
-- ============================================================
create or replace function public.core_v2_role_of(p_personage bigint, p_org bigint)
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select case
    when exists (select 1 from public.organization og
                  where og.company_id = p_org and og.owner_personage_id = p_personage)       then 'owner'
    when exists (select 1 from public.manager mg where mg.personage_id = p_personage) then 'admin'
    when exists (select 1 from public.member m where m.personage_id = p_personage)   then 'member'
    when exists (select 1 from public.viewer v where v.personage_id = p_personage)   then 'viewer'
  end;
$fn$;

-- ============================================================
-- §2 — The signed-in person
-- ============================================================
create or replace function public.core_v2_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_pid bigint := public.core_v2_personage_id();
  p public.personage;
  w public.organization_worker;
  v_org jsonb;
  v_lang text;
  v_region text;
  v_trial public.subscription;
  v_sub jsonb;
begin
  if v_uid is null then
    return null;
  end if;
  if v_pid is null then
    return jsonb_build_object('user_id', v_uid, 'personage_id', null, 'organization', null);
  end if;
  select * into p from public.personage where id = v_pid;
  -- uq_organization_worker_person: one organization per personage.
  select * into w from public.organization_worker x
   where x.personage_id = v_pid and x.job_status <> 'ENDED';

  -- 'fr-CA' -> locale 'fr', region 'CA'; a bare 'fr' -> region NULL (the language's base country).
  v_lang := split_part(coalesce(p.language_region_code, ''), '-', 1);
  v_region := nullif(split_part(coalesce(p.language_region_code, ''), '-', 2), '');

  if w.organization_id is not null then
    select jsonb_build_object(
             'id', (select o.id from public.organizations o where o.core_organization_id = w.organization_id),
             'core_id', w.organization_id,
             'name', c.name,
             'country_code', c.country_code,
             'currency_code', c.currency_code)
      into v_org
      from public.company c where c.id = w.organization_id;
  end if;

  -- The caller's own trial, wherever it ran (one per person): what "trial used / days left" reads.
  select * into v_trial from public.subscription s
   where s.kind = 'TRIAL' and s.personage_id = v_pid
   order by s.issue_date desc, s.id desc limit 1;

  if w.organization_id is not null then
    v_sub := public.core_v2_my_subscription() -> 'subscription';
  end if;

  return jsonb_build_object(
    'user_id', v_uid,
    'personage_id', v_pid,
    'first_name', p.first_name,
    'last_name', p.last_name,
    'email', p.email_address,
    'locale', nullif(v_lang, ''),
    'region', v_region,
    'organization', v_org,
    'job_status', w.job_status,
    'read_only', coalesce(w.job_status <> 'ACTIVE', false),
    'role', case when w.organization_id is null then null else public.core_v2_role_of(v_pid, w.organization_id) end,
    'can_send_email', exists (select 1 from public.member_authority a
                               where a.member_id = v_pid and a.authority = 'SEND_EMAIL'),
    -- CORE-V2-TOUR: a viewer is never shown the tour (no member row) — true, or the router would send
    -- them to a tour they could never finish.
    'tour_completed', coalesce((select m.tour_completed from public.member m where m.personage_id = v_pid), true),
    'subscription', v_sub,
    'trial', case when v_trial.id is null then null else jsonb_build_object(
               'started_at', v_trial.issue_date,
               'ends_at', v_trial.issue_date + v_trial.duration) end);
end;
$fn$;

-- ============================================================
-- §3 — A person's membership, for the server
-- ============================================================
-- What getUserMembership returns from organization_members: the organization (old uuid, plus the
-- core id) and the role. NULL when the person works nowhere or has left (ENDED). An INACTIVE or
-- ON_LEAVE worker is returned with that status: the route decides — a removal or an invitation by
-- them must be refused, which it can only do if it knows.
create or replace function public.core_v2_membership(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_pid bigint;
  w public.organization_worker;
begin
  select x.personage_id into v_pid
    from (select m.personage_id from public.member m where m.auth_user_id = p_user
          union all
          select v.personage_id from public.viewer v where v.auth_user_id = p_user) x
   limit 1;
  if v_pid is null then
    return null;
  end if;
  select * into w from public.organization_worker x
   where x.personage_id = v_pid and x.job_status <> 'ENDED';
  if w.organization_id is null then
    return null;
  end if;
  return jsonb_build_object(
    'user_id', p_user,
    'personage_id', v_pid,
    'organization_id', (select o.id from public.organizations o where o.core_organization_id = w.organization_id),
    'core_organization_id', w.organization_id,
    'role', public.core_v2_role_of(v_pid, w.organization_id),
    'job_status', w.job_status,
    'can_send_email', exists (select 1 from public.member_authority a
                               where a.member_id = v_pid and a.authority = 'SEND_EMAIL'),
    -- The language without its region ('fr-CA' -> 'fr'): what the invitation e-mail is written in.
    'locale', nullif(split_part(coalesce((select p.language_region_code from public.personage p where p.id = v_pid), ''), '-', 1), ''));
end;
$fn$;

-- ============================================================
-- §4 — The caller's colleagues
-- ============================================================
-- Everyone working in the caller's organization except the caller (stores/team.js keeps "self" apart),
-- ENDED excluded, oldest first. user_id is the login (member / viewer.auth_user_id): what the kept
-- tables' person columns hold (tasks.assignee, clients.csm_id, …). NULL for a contact with no login.
create or replace function public.core_v2_my_team()
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', coalesce(m.auth_user_id, v.auth_user_id),
           'personage_id', w.personage_id,
           'first_name', p.first_name,
           'last_name', p.last_name,
           'role', public.core_v2_role_of(w.personage_id, w.organization_id),
           'job_status', w.job_status,
           'joined_at', w.joined_at,
           'can_send_email', exists (select 1 from public.member_authority a
                                      where a.member_id = w.personage_id and a.authority = 'SEND_EMAIL'))
           order by w.joined_at nulls last, w.personage_id), '[]'::jsonb)
    from public.organization_worker w
    join public.personage p on p.id = w.personage_id
    left join public.member m on m.personage_id = w.personage_id
    left join public.viewer v on v.personage_id = w.personage_id
   where w.organization_id in (select public.core_v2_my_org_ids())
     and w.job_status <> 'ENDED'
     and w.personage_id is distinct from public.core_v2_personage_id();
$fn$;

revoke all on function public.core_v2_role_of(bigint, bigint) from public, anon, authenticated;
revoke all on function public.core_v2_my_team()               from public, anon;
grant execute on function public.core_v2_my_team()            to authenticated;
revoke all on function public.core_v2_me()                    from public, anon;
grant execute on function public.core_v2_me()                 to authenticated;
-- The server only: it answers for ANY login, so a user calling it would read other people's roles.
revoke all on function public.core_v2_membership(uuid)        from public, anon, authenticated;
grant execute on function public.core_v2_membership(uuid)     to service_role;

-- ============================================================
-- Verification (run AFTER applying, in pre-prod)
-- ============================================================
-- 1. core_v2 agrees with the old tables, person by person. Expect 0 rows: a row is someone whose
--    organization or role read from core_v2 differs from profiles / organization_members.
--
--   select p.id, p.organization_id, coalesce(om.role, p.org_role) as old_role,
--          public.core_v2_membership(p.id) ->> 'organization_id' as new_org,
--          public.core_v2_membership(p.id) ->> 'role' as new_role
--     from public.profiles p
--     left join public.organization_members om on om.user_id = p.id and om.organization_id = p.organization_id
--    where p.organization_id is not null
--      and (p.organization_id::text is distinct from public.core_v2_membership(p.id) ->> 'organization_id'
--           or coalesce(om.role, p.org_role) is distinct from public.core_v2_membership(p.id) ->> 'role');
--
-- 2. Signed in as yourself (SQL editor: set request.jwt.claim.sub), `select public.core_v2_me();`
--    shows your name, language, organization, role and current period.
--
-- ============================================================
-- Rollback
-- ============================================================
--   drop function if exists public.core_v2_my_team(), public.core_v2_membership(uuid), public.core_v2_me(),
--     public.core_v2_role_of(bigint, bigint);
