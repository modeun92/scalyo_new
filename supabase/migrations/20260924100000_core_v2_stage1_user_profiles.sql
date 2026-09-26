-- SCALYO — retiring the old core tables, stage 1/4: `user_profiles` -> core_v2.
--
-- Requires the three core_v2 files (20260920100000 / 110000 / 120000). The order of the stages
-- (user_profiles -> organization_members -> clients -> organizations + profiles) and the rule
-- "reads, then writes, then a NEW drop migration" are in docs/DATABASE.md ("Retiring the old core
-- tables").
--
-- DEPLOY ORDER. Apply this file BEFORE the front end that ships the stage-1 code
-- (stores/profile.js, OnboardingWizard.vue, SettingsPreferences.vue, api/billing.js,
-- _services/context.service.js). That code calls the RPCs of §6 and reads no user_profiles at all.
-- The OLD front end keeps working with this file applied: it still writes user_profiles and §4
-- mirrors those writes. So applying early is safe; deploying the front end first is not (its RPC
-- calls would 404 and nobody could finish the questionnaire).
--
-- WHERE EACH user_profiles COLUMN GOES (decided 20/09 and 24/09/2026)
--   currency              -> company.currency_code of the ORGANIZATION (CORE-V2-CURRENCY-ORG).
--                            Currency belongs to the organization and to each profit amount
--                            (profit.currency_code), never to a person. Only a manager changes it.
--   role, seniority       -> organization_worker.role_id / .seniority (part 1)
--   onboarding_completed  -> organization_worker.onboarding_completed (§1). The personal
--                            questionnaire is per organization: joining another organization
--                            means answering it again there, because role is per organization.
--   ai_consent, analytics_consent, consent_date
--                         -> `consent` (§2), an append-only log linked to the organization.
--   everything else       -> dropped by decision (industry, company_size, portfolio_size, goals,
--                            market, tools, challenges, processes, ai_tone, custom_data, …).
--
-- NOT IN THIS FILE: dropping user_profiles. That is a later migration, applied only once the
-- stage-1 front end is live and verified. It must: re-run §5 (answers given through the old front
-- end after this file was applied, by someone who had no ACTIVE worker row yet), drop
-- trg_core_v2_user_profile_mirror + its functions, drop the create_user_profile() trigger on
-- auth.users, remove the user_profiles read from core_v2_org_sync, then drop the table.
--
-- PRE-PROD (wxbape…) FIRST, PROD on an explicit go (R8). Idempotent: safe to re-run.

-- ============================================================
-- §0 — Pre-flight
-- ============================================================
do $$
begin
  if to_regclass('public.organization_worker') is null then
    raise exception 'core_v2 stage 1: apply the three core_v2 files (20260920100000/110000/120000) first';
  end if;
  -- Same rule as core_v2 part 1: never build on an unrelated table that happens to share a name.
  if to_regclass('public.consent') is not null
     and not exists (select 1 from pg_type where typname = 'consent_kind' and typnamespace = 'public'::regnamespace) then
    raise exception 'core_v2 stage 1: public.consent already exists but is not ours — refusing to build on an unknown table';
  end if;
  if to_regprocedure('public.mcp_guard()') is null then
    raise warning 'core_v2 stage 1: public.mcp_guard() not found — apply 20260914130000_mcp_rpc_and_storage_restrictions.sql, or an AI session can call the write RPCs of §6';
  end if;
end $$;

-- ============================================================
-- §1 — The questionnaire flag, on the worker
-- ============================================================
-- A boolean, not a timestamp: the rows backfilled from user_profiles.onboarding_completed have no
-- completion time anywhere (updated_at moves on every currency change), and a guessed one would be
-- a plausible-looking date that is not true (R21).
alter table public.organization_worker
  add column if not exists onboarding_completed boolean not null default false;

-- ============================================================
-- §2 — Consent log
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'consent_kind' and typnamespace = 'public'::regnamespace) then
    create type public.consent_kind as enum ('AI', 'ANALYTICS');
  end if;
end $$;

-- CORE-V2-CONSENT (24/09/2026): one row per consent GIVEN OR WITHDRAWN, never updated. The question
-- a consent record must answer is "what had this person agreed to on that date"; a row that is
-- updated in place can only answer "what now", and the old user_profiles columns lost every
-- withdrawal that way. Current state = the latest row per (personage_id, kind).
-- Linked to the organization (decided 24/09/2026): the consent is given as a worker of that
-- organization. Deleted with the person (CASCADE): after an erasure there is nobody left to prove
-- anything about, and a trail of "someone in org X consented at T" is not worth keeping.
create table if not exists public.consent (
  id bigint generated by default as identity primary key,
  organization_id bigint not null references public.organization(company_id) on delete cascade,
  personage_id    bigint not null references public.personage(id) on delete cascade,
  kind public.consent_kind not null,
  granted boolean not null,
  recorded_at timestamptz not null default now()
);

create index if not exists idx_consent_person_kind on public.consent (personage_id, kind, recorded_at desc);
create index if not exists idx_consent_organization on public.consent (organization_id);

-- Read: your own rows only. Write: the RPC of §6 only (no policy, privilege revoked) — the same
-- rule as every core_v2 mirror table.
alter table public.consent enable row level security;
revoke all on public.consent from anon;
revoke insert, update, delete, truncate on public.consent from authenticated;

drop policy if exists core_v2_consent_select on public.consent;
create policy core_v2_consent_select on public.consent for select to authenticated
  using (personage_id = public.core_v2_personage_id());

-- ============================================================
-- §3 — Seniority: the persisted key <-> the stored rank
-- ============================================================
-- The front end's SENIORITY_OPTIONS keys, in order, made numeric (higher = more senior).
-- Anything else -> NULL, never a guessed rank.
create or replace function public.core_v2_seniority_rank(p_seniority text)
returns integer
language sql
immutable
as $fn$
  select case lower(btrim(coalesce(p_seniority, '')))
    when 'junior'   then 1
    when 'mid'      then 2
    when 'senior'   then 3
    when 'lead'     then 4
    when 'director' then 5
    when 'vp'       then 6
    when 'c_level'  then 7
    else null
  end;
$fn$;

create or replace function public.core_v2_seniority_key(p_rank integer)
returns text
language sql
immutable
as $fn$
  select case p_rank
    when 1 then 'junior'
    when 2 then 'mid'
    when 3 then 'senior'
    when 4 then 'lead'
    when 5 then 'director'
    when 6 then 'vp'
    when 7 then 'c_level'
    else null
  end;
$fn$;

-- ============================================================
-- §4 — Transitional mirror: user_profiles -> core_v2 (while the old front end is live)
-- ============================================================
-- CORE-V2-UP-MIRROR (24/09/2026): only ANSWERS are mirrored. Role and seniority are copied only
-- once onboarding_completed is true: before that they are the column DEFAULTs ('csm', 'mid') that
-- create_user_profile() puts on every signup, and copying them would record a job nobody stated
-- (R21) — the 20/09 draft of part 2 did exactly that.
-- The row is read as jsonb: ai_consent / analytics_consent / consent_date are written by the
-- onboarding wizard but have no CREATE TABLE anywhere in the repository, so whether they exist in a
-- given database is unknown. NEW.ai_consent raises where they do not; jsonb ->> returns NULL.
-- Idempotent (the backfill of §5 calls it too): consent rows are keyed on their recorded_at.
create or replace function public.core_v2_apply_user_profile(p_user uuid, p_new jsonb, p_old jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_pid bigint;
  v_org bigint;
  v_role text;
  v_rank integer;
  v_role_id bigint;
  v_consent_at timestamptz;
begin
  if coalesce((p_new ->> 'onboarding_completed')::boolean, false) is not true then
    return;
  end if;

  -- The person's ACTIVE worker row (one organization per personage). None -> nothing to attach
  -- to; the drop migration re-runs §5 for whoever joins an organization later.
  select w.personage_id, w.organization_id into v_pid, v_org
    from public.organization_worker w
   where w.job_status = 'ACTIVE'
     and w.personage_id in (
       select m.personage_id from public.member m where m.auth_user_id = p_user
       union
       select v.personage_id from public.viewer v where v.auth_user_id = p_user
     );
  if v_pid is null then
    return;
  end if;

  v_role := nullif(lower(btrim(p_new ->> 'role')), '');
  v_rank := public.core_v2_seniority_rank(p_new ->> 'seniority');
  v_role_id := null;
  if v_role is not null then
    insert into public.organization_role (organization_id, name)
    values (v_org, v_role)
    on conflict (organization_id, name) do nothing;
    select r.id into v_role_id
      from public.organization_role r
     where r.organization_id = v_org and r.name = v_role;
  end if;

  update public.organization_worker
     set role_id = v_role_id, seniority = v_rank, onboarding_completed = true
   where organization_id = v_org and personage_id = v_pid
     and (role_id, seniority, onboarding_completed) is distinct from (v_role_id, v_rank, true);

  -- The wizard stamps consent_date at submit, next to the two booleans. A row whose stamp did not
  -- change (the currency picker's upsert of the same row) appends nothing.
  v_consent_at := (p_new ->> 'consent_date')::timestamptz;
  if v_consent_at is not null
     and v_consent_at is distinct from (p_old ->> 'consent_date')::timestamptz then
    insert into public.consent (organization_id, personage_id, kind, granted, recorded_at)
    select v_org, v_pid, k.kind, (p_new ->> k.col)::boolean, v_consent_at
      from (values ('AI'::public.consent_kind, 'ai_consent'),
                   ('ANALYTICS'::public.consent_kind, 'analytics_consent')) as k(kind, col)
     where p_new ->> k.col is not null
       and not exists (
         select 1 from public.consent c
          where c.personage_id = v_pid and c.kind = k.kind and c.recorded_at = v_consent_at
       );
  end if;
end;
$fn$;

-- CORE-V2-FAILOPEN, as every part-2 trigger: a projection bug must never fail the old write.
create or replace function public.core_v2_user_profile_mirror()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  begin
    perform public.core_v2_apply_user_profile(
      new.id, to_jsonb(new), case when tg_op = 'UPDATE' then to_jsonb(old) end);
  exception when others then
    raise warning 'core_v2 user_profiles mirror failed for %: % (%)', new.id, sqlerrm, sqlstate;
  end;
  return new;
end;
$fn$;

-- On the questionnaire columns only: the currency picker's upsert (currency alone) does not fire it.
drop trigger if exists trg_core_v2_user_profile_mirror on public.user_profiles;
create trigger trg_core_v2_user_profile_mirror
  after insert or update of role, seniority, onboarding_completed on public.user_profiles
  for each row execute function public.core_v2_user_profile_mirror();

-- ============================================================
-- §5 — Backfill (idempotent; the drop migration runs it once more)
-- ============================================================
do $$
declare
  r record;
  v_done integer := 0;
  v_failed integer := 0;
begin
  for r in select up.id, to_jsonb(up) as j from public.user_profiles up order by up.id loop
    begin
      perform public.core_v2_apply_user_profile(r.id, r.j, null);
      v_done := v_done + 1;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'core_v2 stage 1 backfill: user_profiles % skipped: % (%)', r.id, sqlerrm, sqlstate;
    end;
  end loop;
  raise notice 'core_v2 stage 1 backfill: % user_profiles rows processed, % failed', v_done, v_failed;
end $$;

-- ============================================================
-- §6 — What the stage-1 front end calls
-- ============================================================
-- The caller's own profile, in one call: organization, its currency, their role / seniority keys,
-- whether they finished the questionnaire, whether they are a manager. NULL when the caller has no
-- ACTIVE worker row (not in an organization yet): the front end then shows no questionnaire and
-- formats money in the default currency.
create or replace function public.core_v2_my_profile()
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
           'organization_id',      w.organization_id,
           'currency',             c.currency_code,
           'role',                 r.name,
           'seniority',            public.core_v2_seniority_key(w.seniority),
           'onboarding_completed', w.onboarding_completed,
           'is_manager',           public.core_v2_is_manager(w.organization_id)
         )
    from public.organization_worker w
    join public.company c on c.id = w.organization_id
    left join public.organization_role r on r.id = w.role_id
   where w.personage_id = public.core_v2_personage_id()
     and w.job_status = 'ACTIVE';
$fn$;

-- CORE-V2-CURRENCY-ORG: a manager of the caller's organization only (decided 24/09/2026) — the
-- currency relabels every amount the whole team sees. D-14: an UPDATE that matches nothing raises;
-- it must never come back as a silent success.
create or replace function public.core_v2_set_organization_currency(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_org bigint;
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if to_regprocedure('public.mcp_guard()') is not null then
    perform public.mcp_guard();
  end if;

  select x into v_org from public.core_v2_my_org_ids() as x limit 1;
  if v_org is null then
    raise exception 'no_organization' using errcode = '42501';
  end if;
  if not public.core_v2_is_manager(v_org) then
    raise exception 'not_a_manager' using errcode = '42501';
  end if;
  if not exists (select 1 from public.currency c where c.code = v_code) then
    raise exception 'unsupported_currency' using errcode = '22023';
  end if;

  update public.company set currency_code = v_code where id = v_org;
  if not found then
    raise exception 'organization_not_found' using errcode = 'P0002';
  end if;
end;
$fn$;

-- The questionnaire's answers, the completion flag and the two consents, in ONE transaction: a
-- half-saved questionnaire (flag set, consent missing) would let the person past the consent step
-- with nothing recorded. Every argument is required; an unknown role or seniority key raises
-- rather than being stored as NULL, so the wizard never shows success for an answer it lost.
create or replace function public.core_v2_complete_onboarding(
  p_role text, p_seniority text, p_ai_consent boolean, p_analytics_consent boolean)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_pid bigint := public.core_v2_personage_id();
  v_org bigint;
  v_role text := lower(btrim(coalesce(p_role, '')));
  v_rank integer := public.core_v2_seniority_rank(p_seniority);
  v_role_id bigint;
begin
  if to_regprocedure('public.mcp_guard()') is not null then
    perform public.mcp_guard();
  end if;

  select w.organization_id into v_org
    from public.organization_worker w
   where w.personage_id = v_pid and w.job_status = 'ACTIVE';
  if v_org is null then
    raise exception 'no_organization' using errcode = '42501';
  end if;
  -- A persisted key ('csm', 'head_cs', …), never a label: the screen renders it through i18n.
  if v_role !~ '^[a-z_]{1,40}$' then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if v_rank is null then
    raise exception 'invalid_seniority' using errcode = '22023';
  end if;
  if p_ai_consent is null or p_analytics_consent is null then
    raise exception 'consent_missing' using errcode = '22023';
  end if;

  insert into public.organization_role (organization_id, name)
  values (v_org, v_role)
  on conflict (organization_id, name) do nothing;
  select r.id into v_role_id
    from public.organization_role r
   where r.organization_id = v_org and r.name = v_role;

  update public.organization_worker
     set role_id = v_role_id, seniority = v_rank, onboarding_completed = true
   where organization_id = v_org and personage_id = v_pid;
  if not found then
    raise exception 'worker_not_found' using errcode = 'P0002';
  end if;

  insert into public.consent (organization_id, personage_id, kind, granted)
  values (v_org, v_pid, 'AI', p_ai_consent),
         (v_org, v_pid, 'ANALYTICS', p_analytics_consent);
end;
$fn$;

-- ============================================================
-- §7 — Who may call what
-- ============================================================
-- Functions are executable by PUBLIC by default. Only the three §6 RPCs are for users.
revoke all on function public.core_v2_seniority_rank(text)                       from public, anon, authenticated;
revoke all on function public.core_v2_seniority_key(integer)                     from public, anon, authenticated;
revoke all on function public.core_v2_apply_user_profile(uuid, jsonb, jsonb)     from public, anon, authenticated;
revoke all on function public.core_v2_user_profile_mirror()                      from public, anon, authenticated;
revoke all on function public.core_v2_my_profile()                               from public, anon;
revoke all on function public.core_v2_set_organization_currency(text)            from public, anon;
revoke all on function public.core_v2_complete_onboarding(text, text, boolean, boolean) from public, anon;
grant execute on function public.core_v2_my_profile()                            to authenticated;
grant execute on function public.core_v2_set_organization_currency(text)         to authenticated;
grant execute on function public.core_v2_complete_onboarding(text, text, boolean, boolean) to authenticated;

-- ============================================================
-- §8 — Verification (run AFTER applying, in pre-prod)
-- ============================================================
-- 8.1 — Every worker whose user_profiles says the questionnaire was completed carries the flag and
--       a role. Expect 0 rows.
--
--   select up.id from public.user_profiles up
--   join (select auth_user_id, personage_id from public.member
--         union all select auth_user_id, personage_id from public.viewer) p on p.auth_user_id = up.id
--   join public.organization_worker w on w.personage_id = p.personage_id and w.job_status = 'ACTIVE'
--   where up.onboarding_completed and (not w.onboarding_completed
--         or (nullif(btrim(up.role), '') is not null and w.role_id is null));
--
-- 8.2 — The RPCs are callable by a signed-in user and by nobody else. As `anon`, expect
--       "permission denied for function" on each of the three.
--
-- 8.3 — Currency is manager-only. Signed in as a MEMBER (not owner/admin), in the SQL editor with
--       request.jwt.claim.sub set to their id:
--
--   select public.core_v2_set_organization_currency('USD');   -- expect ERROR: not_a_manager
--
-- 8.4 — The old front end still works: log in on the currently deployed site, change the currency
--       in Settings, finish the questionnaire with a fresh account. Both still write user_profiles;
--       the second must also set organization_worker.onboarding_completed (8.1 stays at 0).

-- ============================================================
-- §9 — Rollback
-- ============================================================
-- Only after rolling the stage-1 front end back (it calls §6):
--
--   drop trigger if exists trg_core_v2_user_profile_mirror on public.user_profiles;
--   drop function if exists public.core_v2_my_profile(), public.core_v2_set_organization_currency(text),
--     public.core_v2_complete_onboarding(text, text, boolean, boolean),
--     public.core_v2_user_profile_mirror(), public.core_v2_apply_user_profile(uuid, jsonb, jsonb),
--     public.core_v2_seniority_key(integer), public.core_v2_seniority_rank(text);
--   drop table if exists public.consent;
--   drop type if exists public.consent_kind;
--   alter table public.organization_worker drop column if exists onboarding_completed;
--
-- Rolling back loses what the new front end wrote (currency changes, questionnaire answers,
-- consents); user_profiles still holds what the old front end wrote.
