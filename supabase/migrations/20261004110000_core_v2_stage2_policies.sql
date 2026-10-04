-- SCALYO — core_v2, stage 2 (profiles + organization_members): the database stops asking them who
-- a person is. Step B, the policies and functions (written 04/10/2026).
--
-- WHY BEFORE THE WRITES (step C). The 29 kept tables' policies decide "is this row in MY organization"
-- by reading profiles.organization_id — inline, or through get_my_org_id() — and a few functions
-- read profiles / organization_members for a name or a role. Once the app writes core_v2 instead
-- (step C), profiles stops being kept up to date: someone who accepts an invitation would still be,
-- for every one of those policies, in the organization they left — and would read its clients. So the
-- readers move first, here, while profiles and core_v2 still agree (the mirror), and the writers after.
--
-- WHAT THIS FILE DOES
--   §1 helpers  get_my_org_id() — same name, same uuid result (the OLD organization id the kept tables
--               hold), now read from core_v2: every policy that calls it switches with no rewrite.
--               core_v2_my_role() — owner / admin / member / viewer, what profiles.org_role answered.
--               core_v2_can_write() — false for an INACTIVE / ON_LEAVE worker (JOB-STATUS-READ).
--   §2 functions  get_org_member_names, get_org_email_status, open_dm, oxygen_team_aggregate and
--               check_client_limit, edited IN PLACE: the live definition is read from the database,
--               the exact text that reads profiles / organization_members is replaced, and the result
--               is re-created. Nothing else in a body is retyped — oxygen_team_aggregate carries the
--               literal n >= 5 legal threshold, and retyping it is how a threshold silently changes
--               (CLAUDE.md, Traps). If the expected text is not found exactly once (a definition edited
--               in the dashboard, say), the run STOPS and names the function: nothing is guessed.
--               Where 20260914130000 renamed a function to <name>_unguarded behind an MCP wrapper, the
--               _unguarded twin is the one edited; the wrapper is left alone.
--   §3 policies  every policy, in any table but profiles / organization_members / user_profiles, whose
--               expression reads `(SELECT organization_id FROM profiles WHERE id = auth.uid())` or
--               `(SELECT org_role FROM profiles WHERE id = auth.uid())` is altered to call get_my_org_id()
--               / core_v2_my_role() instead — the repository's (clients, client_notes, quotes,
--               client_metrics, email_templates) and the dashboard's alike. A policy still reading
--               profiles or organization_members afterwards STOPS the run, listing it: it needs a
--               rewrite by hand, and a later step would otherwise break it silently.
--   §4 read-only  RESTRICTIVE insert / update / delete policies on the kept tables, keyed on
--               core_v2_can_write(): an INACTIVE / ON_LEAVE worker reads, writes nothing — the database
--               half of what the app and the API already refuse (JOB-STATUS-READ, decided 04/10/2026).
--               Restrictive policies are ANDed with the existing ones, so none is rewritten (the same
--               mechanism as the MCP restrictions, 20260914120000).
--
-- ORDER. After the core_v2 files, 20260924100000, 20260927130000, 20261003120000 and 20261004100000.
-- Before any step-C front end. Read §Verification before prod: the check there must return no row.
-- PRE-PROD FIRST, PROD on an explicit go. Idempotent: a re-run finds every replacement already made
-- (the new text present, the old one absent) and changes nothing.

-- ============================================================
-- §0 — Pre-flight
-- ============================================================
do $$
begin
  if to_regprocedure('public.core_v2_personage_id()') is null
     or to_regprocedure('public.core_v2_role_of(bigint, bigint)') is null then
    raise exception 'stage 2 policies: apply the core_v2 files and 20261004100000 first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'organizations' and column_name = 'core_organization_id') then
    raise exception 'stage 2 policies: organizations.core_organization_id missing — apply the core_v2 files first';
  end if;
end $$;

-- ============================================================
-- §1 — Helpers
-- ============================================================
-- The caller's organization, as the OLD uuid. Read: an INACTIVE / ON_LEAVE worker still reads
-- (JOB-STATUS-READ) — writing is refused by §4, not here. ENDED: none.
create or replace function public.get_my_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select o.id
    from public.organization_worker w
    join public.organizations o on o.core_organization_id = w.organization_id
   where w.personage_id = public.core_v2_personage_id()
     and w.job_status <> 'ENDED'
   limit 1;
$fn$;

-- What profiles.org_role answered: owner / admin / member / viewer in the caller's organization.
create or replace function public.core_v2_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select public.core_v2_role_of(w.personage_id, w.organization_id)
    from public.organization_worker w
   where w.personage_id = public.core_v2_personage_id()
     and w.job_status <> 'ENDED'
   limit 1;
$fn$;

-- JOB-STATUS-READ: may the caller write? No when their worker row says INACTIVE or ON_LEAVE. Anyone
-- else — including a login core_v2 does not know yet (a mirror that lags) — is not refused here:
-- the rule is "the read-only are read-only", never "the unknown are locked out".
create or replace function public.core_v2_can_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select not exists (
    select 1 from public.organization_worker w
     where w.personage_id = public.core_v2_personage_id()
       and w.job_status in ('INACTIVE', 'ON_LEAVE'));
$fn$;

revoke all on function public.core_v2_my_role()   from public, anon;
revoke all on function public.core_v2_can_write() from public, anon;
grant execute on function public.core_v2_my_role()   to authenticated;
grant execute on function public.core_v2_can_write() to authenticated;
-- get_my_org_id keeps the privileges it had (CREATE OR REPLACE does not touch them).

-- ============================================================
-- §2 — Functions, edited in place
-- ============================================================
-- Replaces p_old by p_new in the live definition of p_fn (or of its _unguarded twin), exactly once.
-- Already done (p_new present, p_old absent): nothing. Neither, or p_old more than once: STOP.
create or replace function public.core_v2_stage2_edit_function(p_fn text, p_args text, p_old text, p_new text)
returns void
language plpgsql
set search_path = public
as $fn$
declare
  v_target text;
  v_def text;
  v_count integer;
begin
  if to_regprocedure('public.' || p_fn || '_unguarded(' || p_args || ')') is not null then
    v_target := p_fn || '_unguarded';
  elsif to_regprocedure('public.' || p_fn || '(' || p_args || ')') is not null then
    v_target := p_fn;
  else
    raise notice 'stage 2 policies: function %(%) not present — skipped', p_fn, p_args;
    return;
  end if;
  v_def := pg_get_functiondef(('public.' || v_target || '(' || p_args || ')')::regprocedure);
  v_count := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_count = 0 and position(p_new in v_def) > 0 then
    raise notice 'stage 2 policies: % already edited', v_target;
    return;
  end if;
  if v_count <> 1 then
    raise exception 'stage 2 policies: the text to replace was found % time(s) in %(%) — its live definition differs from the repository; compare it with pg_get_functiondef and adapt this migration', v_count, v_target, p_args;
  end if;
  execute replace(v_def, p_old, p_new);
  raise notice 'stage 2 policies: % edited', v_target;
end;
$fn$;
revoke all on function public.core_v2_stage2_edit_function(text, text, text, text) from public, anon, authenticated;

-- get_org_member_names (20260707230000): names of the caller's organization, from core_v2.
select public.core_v2_stage2_edit_function('get_org_member_names', '',
$old$  select p.id, p.first_name, p.last_name
  from public.profiles p
  join public.organization_members om on om.user_id = p.id
  where om.organization_id = public.get_my_org_id();$old$,
$new$  -- CORE-V2-ME (04/10/2026): read from core_v2 (stage 2 of retiring the old core tables).
  select coalesce(m.auth_user_id, v.auth_user_id), ps.first_name, ps.last_name
  from public.organization_worker w
  join public.personage ps on ps.id = w.personage_id
  left join public.member m on m.personage_id = w.personage_id
  left join public.viewer v on v.personage_id = w.personage_id
  where w.organization_id = (select o.core_organization_id from public.organizations o where o.id = public.get_my_org_id())
    and w.job_status <> 'ENDED'
    and coalesce(m.auth_user_id, v.auth_user_id) is not null;$new$);

-- get_org_email_status (20260705230000): the organization's owner, without profiles.
select public.core_v2_stage2_edit_function('get_org_email_status', '',
$old$    select org.owner_id into v_owner
    from profiles p
    join organizations org on org.id = p.organization_id
    where p.id = auth.uid();$old$,
$new$    select org.owner_id into v_owner
    from organizations org
    where org.id = public.get_my_org_id();   -- CORE-V2-ME (04/10/2026): the organization from core_v2$new$);

-- open_dm (20260713160000): the other person must work in the same organization — core_v2.
select public.core_v2_stage2_edit_function('open_dm', 'uuid',
$old$    select 1 from public.organization_members om
    where om.user_id = other_user and om.organization_id = org$old$,
$new$    -- CORE-V2-ME (04/10/2026): a worker of the same organization, from core_v2.
    select 1 from public.organization_worker w
      join public.organizations o on o.core_organization_id = w.organization_id
      left join public.member m on m.personage_id = w.personage_id
      left join public.viewer v on v.personage_id = w.personage_id
     where coalesce(m.auth_user_id, v.auth_user_id) = other_user
       and o.id = org and w.job_status <> 'ENDED'$new$);

-- oxygen_team_aggregate (20260729250000): ONLY the owner guard changes. The n >= 5 threshold and the
-- rest of the body are not retyped (§2 header); the check below proves the threshold survived.
select public.core_v2_stage2_edit_function('oxygen_team_aggregate', 'uuid',
$old$    select 1 from profiles pr
    where pr.id = v_uid and pr.organization_id = p_org and pr.org_role = 'owner'$old$,
$new$    -- CORE-V2-ME (04/10/2026): owner of THIS organization, from core_v2 (v_uid = auth.uid()).
    select 1 where public.get_my_org_id() = p_org and public.core_v2_my_role() = 'owner'$new$);

-- check_client_limit (20260711210000): the profiles.plan fallback for an account with no
-- organization goes — every account has one since OWN-ORG (27/09/2026); with none the plan is the
-- starter floor the next line already applies.
select public.core_v2_stage2_edit_function('check_client_limit', '',
$old$  if eff_plan is null then
    select plan into eff_plan from profiles where id = new.user_id;
  end if;$old$,
$new$  -- CORE-V2-ME (04/10/2026): no personal-plan fallback — every account has an organization (OWN-ORG).$new$);

-- The helper has done its job; it is not left in the schema.
drop function public.core_v2_stage2_edit_function(text, text, text, text);

-- The legal threshold of the Oxygen aggregate is still there, twice, literally.
do $$
declare
  v_fn text := case when to_regprocedure('public.oxygen_team_aggregate_unguarded(uuid)') is not null
                    then 'public.oxygen_team_aggregate_unguarded(uuid)' else 'public.oxygen_team_aggregate(uuid)' end;
  v_def text;
begin
  if to_regprocedure(v_fn) is null then
    return;
  end if;
  v_def := pg_get_functiondef(v_fn::regprocedure);
  if position('if v_n < 5 then' in v_def) = 0 or position('if v_n_prev >= 5 then' in v_def) = 0 then
    raise exception 'stage 2 policies: the n >= 5 threshold is no longer literally in % — stop and inspect', v_fn;
  end if;
end $$;

-- ============================================================
-- §3 — Policies
-- ============================================================
do $$
declare
  r record;
  v_qual text;
  v_check text;
  v_org_re constant text := '\(\s*SELECT\s+profiles\.organization_id\s+FROM\s+(public\.)?profiles\s+WHERE\s+\(profiles\.id\s*=\s*auth\.uid\(\)\)\s*\)';
  v_role_re constant text := '\(\s*SELECT\s+profiles\.org_role\s+FROM\s+(public\.)?profiles\s+WHERE\s+\(profiles\.id\s*=\s*auth\.uid\(\)\)\s*\)';
  v_sql text;
  v_left text := '';
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and tablename not in ('profiles', 'organization_members', 'user_profiles')
       and (coalesce(qual, '') ~ 'profiles' or coalesce(with_check, '') ~ 'profiles')
  loop
    v_qual := regexp_replace(r.qual, v_org_re, 'get_my_org_id()', 'gi');
    v_qual := regexp_replace(v_qual, v_role_re, 'core_v2_my_role()', 'gi');
    v_check := regexp_replace(r.with_check, v_org_re, 'get_my_org_id()', 'gi');
    v_check := regexp_replace(v_check, v_role_re, 'core_v2_my_role()', 'gi');
    v_sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if r.qual is not null then v_sql := v_sql || ' using (' || v_qual || ')'; end if;
    if r.with_check is not null then v_sql := v_sql || ' with check (' || v_check || ')'; end if;
    execute v_sql;
    raise notice 'stage 2 policies: % on % now reads core_v2', r.policyname, r.tablename;
  end loop;

  -- Anything still reading profiles or organization_members is left for a hand rewrite: stop.
  for r in
    select tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename not in ('profiles', 'organization_members', 'user_profiles')
       and (coalesce(qual, '') ~ '\m(profiles|organization_members)\M'
            or coalesce(with_check, '') ~ '\m(profiles|organization_members)\M')
  loop
    v_left := v_left || ' ' || r.tablename || '.' || r.policyname;
  end loop;
  if v_left <> '' then
    raise exception 'stage 2 policies: still reading profiles / organization_members, rewrite by hand:%', v_left;
  end if;
end $$;

-- ============================================================
-- §4 — The read-only account writes nothing (JOB-STATUS-READ)
-- ============================================================
do $$
declare
  t text;
  verb text;
  v_name text;
  tables text[] := array[
    'activity_log', 'ai_conversations', 'ai_messages', 'alpha_feedback', 'api_keys',
    'chat_channel_members', 'chat_channels', 'chat_messages', 'client_metrics',
    'client_notes', 'clients', 'copils', 'email_templates', 'invitations', 'notifications',
    'org_email_config', 'org_integrations', 'organizations',
    'oxygen_checkins', 'oxygen_daily', 'oxygen_recoveries', 'planning_events', 'playbooks',
    'projects', 'quotes', 'roadmaps', 'sent_emails', 'snapshots', 'tasks', 'team_members', 'webhooks'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    foreach verb in array array['insert', 'update', 'delete'] loop
      v_name := 'read_only_no_' || verb;
      execute format('drop policy if exists %I on public.%I', v_name, t);
      if verb = 'insert' then
        execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.core_v2_can_write())', v_name, t);
      elsif verb = 'update' then
        execute format('create policy %I on public.%I as restrictive for update to authenticated using (public.core_v2_can_write()) with check (public.core_v2_can_write())', v_name, t);
      else
        execute format('create policy %I on public.%I as restrictive for delete to authenticated using (public.core_v2_can_write())', v_name, t);
      end if;
    end loop;
  end loop;
end $$;

-- ============================================================
-- Verification (run AFTER applying, in pre-prod)
-- ============================================================
-- 1. No policy outside the retiring tables reads profiles or organization_members. Expect 0 rows.
--
--   select tablename, policyname from pg_policies
--    where schemaname = 'public' and tablename not in ('profiles', 'organization_members', 'user_profiles')
--      and (coalesce(qual, '') ~ '\m(profiles|organization_members)\M' or coalesce(with_check, '') ~ '\m(profiles|organization_members)\M');
--
-- 2. get_my_org_id agrees with profiles for everyone (while profiles is still kept). Expect 0 rows —
--    run as each user, or compare through core_v2_membership (20261004100000, Verification 1).
--
-- 3. Functions that still read profiles / organization_members, for the record (the core_v2 mirror,
--    the own-organization functions and the protect_* triggers go with steps C / E):
--
--   select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.prosrc ~ '\m(profiles|organization_members)\M' order by 1;
--
-- ============================================================
-- Rollback
-- ============================================================
-- The function and policy edits are reversed by re-running the migrations that defined them
-- (20260705230000, 20260707230000, 20260708230000, 20260711210000, 20260713160000, 20260720230000,
-- 20260720233000, 20260720240000, 20260722200000, 20260729250000 — then 20260914130000 for the
-- MCP wrappers), and get_my_org_id from its dashboard definition. Then:
--   do $$ declare t text; begin for t in select tablename from pg_policies where policyname like 'read_only_no_%' loop
--     execute format('drop policy if exists read_only_no_insert on public.%I', t);
--     execute format('drop policy if exists read_only_no_update on public.%I', t);
--     execute format('drop policy if exists read_only_no_delete on public.%I', t); end loop; end $$;
--   drop function if exists public.core_v2_can_write(), public.core_v2_my_role();
