-- SCALYO — Close the two paths an MCP/AI OAuth token can still take around table RLS.
--
-- 20260914120000_mcp_ai_session_restrictions.sql restricted public TABLES. Two doors were
-- left open, both reachable with the same token by calling Supabase directly and skipping
-- the MCP Worker entirely (fourth review §8 and §9):
--
--   1. STORAGE. storage.objects has its own policies. A token that cannot UPDATE a row in
--      public.clients could still upload, overwrite or delete a COPIL media file.
--   2. SECURITY DEFINER RPCs. These execute with the FUNCTION OWNER's privileges, so a
--      restrictive policy on the table they write does not stop them — that is the entire
--      point of SECURITY DEFINER. POST /rest/v1/rpc/open_dm would happily create a channel
--      for an AI session.
--
-- Both depend on public.is_mcp_session(), so both are INERT until the access-token hook
-- stamps ai_agent (docs/MCP_ACCESS_TOKEN_HOOK.md). Applying this changes nothing for a
-- website session, today or after the hook.
--
-- HOW THE RPCs ARE GUARDED — read this before changing anything here.
-- Each function is RENAMED to <name>_unguarded and a same-signature wrapper takes its
-- place. The wrapper checks is_mcp_session(), then calls the original. The original body
-- is NEVER retyped, so this migration cannot introduce a behaviour change or drift from
-- whatever is actually live — which matters because oxygen_team_aggregate carries a legal
-- threshold (n >= 5) and toggle_chat_reaction carries a concurrency fix, and silently
-- reverting either while "adding security" would be far worse than the gap being closed.
--
-- The wrapper is SECURITY DEFINER because EXECUTE on the inner function is revoked from
-- authenticated: only the owner may reach it. auth.uid() and auth.jwt() still read the
-- REQUEST's claims inside a definer function, so is_mcp_session() is evaluated for the
-- caller, not the owner.
--
-- PRE-PROD (wxbape…) FIRST, PROD on an explicit go (R8). Idempotent: the rename runs only
-- when the _unguarded twin does not already exist. Rollback in §4.

-- ============================================================
-- §0 — Pre-flight (run BEFORE applying, read the output)
-- ============================================================
-- Confirm the six functions exist with the signatures this migration assumes. A missing
-- row here means the rename below will silently skip and the RPC stays unguarded.
--
--   select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('open_dm','toggle_chat_reaction','set_chat_message_pinned',
--                       'get_org_member_names','get_org_email_status','oxygen_team_aggregate')
--   order by 1;
--
-- Also list every OTHER authenticated-callable SECURITY DEFINER function, so a new one
-- added since this migration is noticed rather than assumed absent:
--
--   select p.proname, pg_get_function_identity_arguments(p.oid)
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.prosecdef
--     and has_function_privilege('authenticated', p.oid, 'execute')
--     and p.proname not like '%\_unguarded'
--   order by 1;

-- ============================================================
-- §1 — Storage: an AI session touches no object (fourth review §8)
-- ============================================================
-- v1 MCP exposes no storage tool and needs no object access, so SELECT is denied too.
-- That is the safe default rather than a guess about future need: adding a read back is
-- one policy drop, whereas discovering an AI client read COPIL media is an incident.
--
-- If a future MCP tool must read an object, drop mcp_no_storage_select ALONE and say so
-- here — do not relax the write policies with it.
do $$
declare
  verb text;
begin
  if to_regclass('storage.objects') is null then
    raise warning 'storage.objects not present — skipping storage restrictions';
    return;
  end if;

  foreach verb in array array['select', 'insert', 'update', 'delete'] loop
    execute format('drop policy if exists %I on storage.objects', 'mcp_no_storage_' || verb);

    if verb = 'insert' then
      execute format(
        'create policy %I on storage.objects as restrictive for insert to authenticated with check (not public.is_mcp_session())',
        'mcp_no_storage_insert');
    else
      execute format(
        'create policy %I on storage.objects as restrictive for %s to authenticated using (not public.is_mcp_session())',
        'mcp_no_storage_' || verb, verb);
    end if;
  end loop;
exception
  -- storage.objects is owned by the storage role; a project where the migration runner
  -- cannot create policies on it must know that, not discover it later from an abuse test.
  when insufficient_privilege then
    raise warning 'insufficient privilege to create policies on storage.objects — apply §1 as the storage owner';
end $$;

-- ============================================================
-- §2 — SECURITY DEFINER RPCs: rename + guarded wrapper (fourth review §9)
-- ============================================================

-- Raises for an MCP session. One place, so the error code and message are uniform and
-- an abuse test can assert on them.
create or replace function public.mcp_guard()
returns void
language plpgsql
stable
set search_path = public
as $fn$
begin
  if public.is_mcp_session() then
    raise exception 'mcp_session_forbidden' using errcode = '42501';
  end if;
end;
$fn$;

comment on function public.mcp_guard() is
  'Raises 42501 mcp_session_forbidden when the caller is an MCP/AI OAuth session. Called at the top of every guarded SECURITY DEFINER RPC wrapper.';

grant execute on function public.mcp_guard() to authenticated;

-- Rename each original out of the way, ONCE. The wrappers below then take the public
-- name. Renaming is what preserves the original body byte-for-byte: nothing in this
-- migration retypes the concurrency fix in toggle_chat_reaction or the n >= 5 legal
-- threshold in oxygen_team_aggregate, so neither can be silently reverted by it.
do $$
declare
  originals text[][] := array[
    array['open_dm',                 'uuid'],
    array['toggle_chat_reaction',    'uuid, text'],
    array['set_chat_message_pinned', 'uuid, boolean'],
    array['get_org_member_names',    ''],
    array['get_org_email_status',    ''],
    array['oxygen_team_aggregate',   'uuid']
  ];
  i int;
begin
  for i in 1 .. array_length(originals, 1) loop
    -- Already wrapped? Then the public name holds the WRAPPER, and renaming again would
    -- bury the wrapper and re-expose nothing. Skip.
    if to_regprocedure('public.' || originals[i][1] || '_unguarded(' || originals[i][2] || ')') is not null then
      continue;
    end if;

    if to_regprocedure('public.' || originals[i][1] || '(' || originals[i][2] || ')') is null then
      raise warning 'skipping %(%): function not present — it will NOT be guarded', originals[i][1], originals[i][2];
      continue;
    end if;

    execute format('alter function public.%I(%s) rename to %I',
                   originals[i][1], originals[i][2], originals[i][1] || '_unguarded');
  end loop;
end $$;

-- The wrappers are written out explicitly rather than generated: a reviewer of a security
-- change should be able to read exactly what each one forwards, and there are only six.

drop function if exists public.open_dm(uuid);
create or replace function public.open_dm(other_user uuid)
returns uuid
language plpgsql volatile security definer set search_path = public
as $fn$
begin
  perform public.mcp_guard();
  return public.open_dm_unguarded(other_user);
end;
$fn$;

drop function if exists public.toggle_chat_reaction(uuid, text);
create or replace function public.toggle_chat_reaction(p_message_id uuid, p_emoji text)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $fn$
begin
  perform public.mcp_guard();
  return public.toggle_chat_reaction_unguarded(p_message_id, p_emoji);
end;
$fn$;

drop function if exists public.set_chat_message_pinned(uuid, boolean);
create or replace function public.set_chat_message_pinned(p_message_id uuid, p_pinned boolean)
returns boolean
language plpgsql volatile security definer set search_path = public
as $fn$
begin
  perform public.mcp_guard();
  return public.set_chat_message_pinned_unguarded(p_message_id, p_pinned);
end;
$fn$;

-- ------------------------------------------------------------
-- Read RPCs that expose data outside the MCP v1 contract.
-- ------------------------------------------------------------
-- get_org_member_names   colleagues' first/last names — PII, and nothing MCP offers needs it
-- get_org_email_status   the organization's email sender configuration
-- oxygen_team_aggregate  Oxygen well-being data. LEGALLY self-only (CLAUDE.md); this is the
--                        single sanctioned aggregation path and it must not become an AI
--                        surface. Owner-only + n >= 5 protects it from colleagues, not from
--                        an AI client holding an owner's token.
drop function if exists public.get_org_member_names();
create or replace function public.get_org_member_names()
returns table(user_id uuid, first_name text, last_name text)
language plpgsql stable security definer set search_path = public
as $fn$
begin
  perform public.mcp_guard();
  return query select * from public.get_org_member_names_unguarded();
end;
$fn$;

drop function if exists public.get_org_email_status();
create or replace function public.get_org_email_status()
returns table(configured boolean, sender_domain text, sender_name text)
language plpgsql stable security definer set search_path = public
as $fn$
begin
  perform public.mcp_guard();
  return query select * from public.get_org_email_status_unguarded();
end;
$fn$;

drop function if exists public.oxygen_team_aggregate(uuid);
create or replace function public.oxygen_team_aggregate(p_org uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
begin
  perform public.mcp_guard();
  return public.oxygen_team_aggregate_unguarded(p_org);
end;
$fn$;

-- ------------------------------------------------------------
-- Grants: the wrapper is callable, the original is not.
-- ------------------------------------------------------------
do $$
declare
  sigs text[] := array[
    'open_dm(uuid)', 'toggle_chat_reaction(uuid, text)', 'set_chat_message_pinned(uuid, boolean)',
    'get_org_member_names()', 'get_org_email_status()', 'oxygen_team_aggregate(uuid)'
  ];
  inner_sigs text[] := array[
    'open_dm_unguarded(uuid)', 'toggle_chat_reaction_unguarded(uuid, text)',
    'set_chat_message_pinned_unguarded(uuid, boolean)', 'get_org_member_names_unguarded()',
    'get_org_email_status_unguarded()', 'oxygen_team_aggregate_unguarded(uuid)'
  ];
  i int;
begin
  for i in 1 .. array_length(sigs, 1) loop
    if to_regprocedure('public.' || sigs[i]) is not null then
      execute format('revoke all on function public.%s from public, anon', sigs[i]);
      execute format('grant execute on function public.%s to authenticated', sigs[i]);
    end if;
    -- The unguarded original must be reachable ONLY through its wrapper. This revoke is
    -- the control; without it an MCP token calls /rest/v1/rpc/open_dm_unguarded and the
    -- guard is decoration.
    if to_regprocedure('public.' || inner_sigs[i]) is not null then
      execute format('revoke all on function public.%s from public, anon, authenticated', inner_sigs[i]);
    end if;
  end loop;
end $$;

-- ============================================================
-- §3 — Release gate (fourth review §10, fifth review §7 and §8)
-- ============================================================
-- A non-empty result from public.mcp_security_check() must BLOCK a production deploy.
--
-- MCP-GATE-EXACT (14/09/2026, fifth review §7): the first version asked only whether SOME
-- policy named `mcp_no_%` existed on a table. That would have passed this state:
--
--     mcp_no_insert_clients   present
--     mcp_no_update_clients   MISSING      <- writes allowed
--     mcp_no_delete_clients   MISSING      <- deletes allowed
--
-- A gate that reports "protected" for a half-protected table is worse than no gate: it
-- converts an unknown into a false assurance, and the release proceeds because of it.
-- Every expected policy is therefore checked BY NAME.

-- The canonical lists. Defined as functions so the gate and any future migration read the
-- SAME set from one place.
--
-- PARITY (hand-synced): these must match the arrays inside
-- 20260914120000_mcp_ai_session_restrictions.sql §2 and §3. A table added there and not
-- here would be protected but unverified; added here and not there, the gate reports it
-- missing — which is the safe direction. Check C below catches the first case.
create or replace function public.mcp_protected_tables()
returns text[]
language sql
immutable
as $fn$
  select array[
    'activity_log', 'ai_conversations', 'ai_messages', 'alpha_feedback', 'api_keys',
    'chat_channel_members', 'chat_channels', 'chat_messages', 'client_metrics',
    'client_notes', 'clients', 'copils', 'email_templates', 'invitations', 'notifications',
    'org_email_config', 'org_integrations', 'organization_members', 'organizations',
    'oxygen_checkins', 'oxygen_daily', 'oxygen_recoveries', 'planning_events', 'playbooks',
    'profiles', 'projects', 'promo_codes', 'quotes', 'roadmaps', 'sent_emails', 'snapshots',
    'tasks', 'team_members', 'user_profiles', 'webhooks'
  ];
$fn$;

create or replace function public.mcp_sensitive_tables()
returns text[]
language sql
immutable
as $fn$
  select array[
    'activity_log', 'ai_conversations', 'ai_messages', 'alpha_feedback', 'api_keys',
    'client_notes', 'invitations', 'org_email_config', 'org_integrations',
    'oxygen_checkins', 'oxygen_daily', 'oxygen_recoveries', 'promo_codes', 'sent_emails',
    'webhooks'
  ];
$fn$;

create or replace function public.mcp_security_check()
returns table(object_name text, problem text)
language plpgsql
stable
set search_path = public
as $fn$
declare
  t text;
  verb text;
  pol text;
begin
  -- The whole model rests on this one function. Without it every mcp_no_* policy and
  -- every wrapper guard references something that does not exist.
  if to_regprocedure('public.is_mcp_session()') is null then
    object_name := 'public.is_mcp_session()';
    problem := 'MISSING — run 20260914120000_mcp_ai_session_restrictions.sql first; nothing below is enforced without it';
    return next;
  end if;

  -- ---------------------------------------------------------------- A: write protection
  foreach t in array public.mcp_protected_tables() loop
    if to_regclass('public.' || t) is null then
      continue;   -- absent in this project; the migrations report it as a notice
    end if;

    -- RLS off means every restrictive policy on the table is inert. RELEASE BLOCKER.
    if not (select relrowsecurity from pg_class where oid = to_regclass('public.' || t)) then
      object_name := 'public.' || t;
      problem := 'RLS DISABLED — every mcp_no_* policy on this table is inert (release blocker)';
      return next;
    end if;

    foreach verb in array array['insert', 'update', 'delete'] loop
      pol := 'mcp_no_' || verb || '_' || t;
      if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = t and policyname = pol
      ) then
        object_name := 'public.' || t;
        problem := 'missing policy ' || pol || ' — an AI session can ' || upper(verb) || ' this table';
        return next;
      end if;
    end loop;
  end loop;

  -- ---------------------------------------------------------------- B: sensitive reads
  foreach t in array public.mcp_sensitive_tables() loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    pol := 'mcp_no_select_' || t;
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = pol
    ) then
      object_name := 'public.' || t;
      problem := 'missing policy ' || pol || ' — an AI session can READ this sensitive table';
      return next;
    end if;
  end loop;

  -- ---------------------------------------------------------------- C: list drift
  -- A table carrying mcp_no_* policies but absent from mcp_protected_tables() is
  -- protected by the other migration and NOT verified here. That is the drift direction
  -- this gate would otherwise never notice.
  for t in
    select distinct pg_policies.tablename
    from pg_policies
    where schemaname = 'public' and policyname like 'mcp\_no\_%'
      and not (pg_policies.tablename = any (public.mcp_protected_tables()))
  loop
    object_name := 'public.' || t;
    problem := 'has mcp_no_* policies but is not in mcp_protected_tables() — the gate does not verify it';
    return next;
  end loop;

  -- ---------------------------------------------------------------- D: storage, by name
  if to_regclass('storage.objects') is null then
    object_name := 'storage.objects';
    problem := 'not present — expected in a Supabase project; storage restrictions unverifiable';
    return next;
  else
    foreach verb in array array['select', 'insert', 'update', 'delete'] loop
      pol := 'mcp_no_storage_' || verb;
      if not exists (
        select 1 from pg_policies
        where schemaname = 'storage' and tablename = 'objects' and policyname = pol
      ) then
        object_name := 'storage.objects';
        problem := 'missing policy ' || pol || ' — an AI session can ' || upper(verb) ||
                   ' objects (§1 may have hit insufficient_privilege; re-run it as the storage owner)';
        return next;
      end if;
    end loop;
  end if;

  -- ---------------------------------------------------------------- E: unguarded RPCs
  -- Catches a SECURITY DEFINER function added AFTER this migration as well as one this
  -- migration failed to rename.
  for t in
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'execute')
      and p.proname not like '%\_unguarded'
      and p.proname not in ('is_mcp_session', 'mcp_guard', 'mcp_security_check',
                            'mcp_protected_tables', 'mcp_sensitive_tables',
                            'can_read_chat_message', 'is_chat_member', 'get_my_org_id')
      and pg_get_functiondef(p.oid) not like '%mcp_guard()%'
  loop
    object_name := 'public.' || t;
    problem := 'authenticated SECURITY DEFINER function with no mcp_guard() — review it';
    return next;
  end loop;

  -- ---------------------------------------------------------------- F: leaky originals
  -- A renamed original that authenticated can still execute makes its wrapper decoration.
  for t in
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like '%\_unguarded'
      and has_function_privilege('authenticated', p.oid, 'execute')
  loop
    object_name := 'public.' || t;
    problem := 'unguarded original is still EXECUTE-able by authenticated — the wrapper can be bypassed';
    return next;
  end loop;
end;
$fn$;

comment on function public.mcp_security_check() is
  'Release gate for the MCP AI-session controls. A non-empty result must BLOCK a production deploy. Checks every expected policy BY NAME. See docs/MCP_SERVER.md.';

-- MCP-GATE-PRIVATE (fifth review §8): NOT executable by authenticated. It enumerates
-- exactly which controls are missing, which is a map of the holes for anyone holding a
-- user token. Release tooling runs it as the migration/service role.
revoke all on function public.mcp_protected_tables() from public, anon, authenticated;
revoke all on function public.mcp_sensitive_tables() from public, anon, authenticated;
revoke all on function public.mcp_security_check() from public, anon, authenticated;
grant execute on function public.mcp_security_check() to service_role;

-- Run it now, and make the migration noisy if anything is wrong:
--   select * from public.mcp_security_check();
do $$
declare
  n int;
  r record;
begin
  select count(*) into n from public.mcp_security_check();
  if n > 0 then
    raise warning 'mcp_security_check(): % problem(s) — THIS IS A RELEASE BLOCKER', n;
    for r in select * from public.mcp_security_check() loop
      raise warning '  % : %', r.object_name, r.problem;
    end loop;
  else
    raise notice 'mcp_security_check(): clean';
  end if;
end $$;

-- ============================================================
-- §4 — Verification and rollback
-- ============================================================
-- VERIFY (pre-prod, with a real MCP token carrying ai_agent = true):
--
--   -- the website is unaffected: as a normal signed-in user, open a DM, react to a
--   -- message, pin a message, open Settings > Email, open the Oxygen team view.
--
--   -- direct RPC misuse must fail with 42501 mcp_session_forbidden:
--   curl -X POST "$SUPABASE_URL/rest/v1/rpc/open_dm" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $MCP_TOKEN" \
--        -H "Content-Type: application/json" -d '{"other_user":"<a colleague uuid>"}'
--
--   -- and the unguarded original must NOT be callable at all (expect 404/permission):
--   curl -X POST "$SUPABASE_URL/rest/v1/rpc/open_dm_unguarded" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $MCP_TOKEN" \
--        -H "Content-Type: application/json" -d '{"other_user":"<uuid>"}'
--
--   -- storage must refuse an upload with the MCP token.
--
--   select * from public.mcp_security_check();   -- expect zero rows
--
-- ROLLBACK: drop each wrapper and rename the original back.
--
--   drop function if exists public.open_dm(uuid);
--   alter function public.open_dm_unguarded(uuid) rename to open_dm;
--   grant execute on function public.open_dm(uuid) to authenticated;
--   -- ...repeat for the other five...
--   do $$ declare p record; begin
--     for p in select policyname from pg_policies
--              where schemaname = 'storage' and tablename = 'objects' and policyname like 'mcp_no_%'
--     loop execute format('drop policy if exists %I on storage.objects', p.policyname); end loop;
--   end $$;
