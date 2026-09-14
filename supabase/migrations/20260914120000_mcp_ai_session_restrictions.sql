-- SCALYO — Make an MCP/AI OAuth token read-only AT THE DATABASE, not only in the Worker.
--
-- Problem: the MCP Worker (app-v2/mcp-worker) exposes six read-only tools and withholds
-- notes, contacts and Oxygen data. The TOKEN it holds is an ordinary Supabase user JWT.
-- Pointed straight at /rest/v1/clients it gets whatever normal RLS grants that user —
-- which includes UPDATE, and includes every table MCP deliberately hides. So the
-- read-only promise was a property of the Worker, not of the credential, and the consent
-- screen's "ChatGPT cannot modify your customers" was not true of the thing we hand out.
--
-- WHY RESTRICTIVE POLICIES, and why this migration is safe to run:
-- The obvious fix — add `and not is_mcp_session()` to every existing write policy —
-- requires REWRITING those policies, and 28 of the 35 tables this code touches have no
-- policy definition anywhere in the repository (they were created in the dashboard).
-- Rewriting from a guess risks either a more permissive policy (a cross-tenant hole
-- introduced by a security fix) or one that stops matching, which breaks the WEBSITE's
-- writes silently — PostgREST returns 204 with error = null on an UPDATE matching zero
-- rows (D-14). RESTRICTIVE policies avoid all of it: Postgres ANDs them with the existing
-- permissive set, so nothing existing is read, touched or replaced.
--
--   final access = (any permissive policy passes) AND (every restrictive policy passes)
--
-- For a normal website session public.is_mcp_session() is false, so `not is_mcp_session()`
-- is true, so every restrictive policy below passes and behaviour is IDENTICAL to today.
-- Only a JWT carrying ai_agent = true is affected.
--
-- DEPENDENCY — READ THIS BEFORE BELIEVING THIS MIGRATION DOES ANYTHING:
-- is_mcp_session() keys off the `ai_agent` JWT claim, which is stamped by the Supabase
-- Custom Access Token Hook described in docs/MCP_ACCESS_TOKEN_HOOK.md. Until that hook is
-- deployed NO token carries the claim, so every check here returns false and this
-- migration is INERT — safe, but not yet protecting anything. Verify with the Worker's
-- audit line: event = "mcp.auth.binding" → aiAgent: true. A deployed migration is not a
-- deployed control.
--
-- service_role is unaffected throughout: it bypasses RLS entirely, so the Pages API
-- functions in app-v2/frontend/functions/api/** keep working unchanged.
--
-- PRE-PROD (wxbape…) FIRST, PROD on an explicit go (R8). Idempotent: re-running drops and
-- recreates each policy. Fully reversible — see §5.

-- ============================================================
-- §1 — Who is an MCP/AI session?
-- ============================================================
-- Keyed on `ai_agent`, NOT on `client_id`. client_id is present on any OAuth-issued token,
-- so keying on it would also restrict a future first-party OAuth integration that is
-- supposed to write. `ai_agent` is stamped deliberately, by us, for exactly this purpose.
--
-- FAILS OPEN BY CONSTRUCTION, and that is a deliberate, narrow choice: a missing claim
-- means "a normal session", because the alternative — treating an unreadable JWT as an AI
-- session — would lock the entire website out of its own database the first time a claim
-- shape changed. The control that fails CLOSED is the Worker's token binding; this one is
-- defence in depth behind it.
create or replace function public.is_mcp_session()
returns boolean
language sql
stable
-- No security definer: this reads only the request's own JWT, nothing from any table.
set search_path = public
as $fn$
  select coalesce((auth.jwt() ->> 'ai_agent')::boolean, false);
$fn$;

comment on function public.is_mcp_session() is
  'True when the current request carries an MCP/AI OAuth token (ai_agent claim, stamped by the custom access token hook). Used by RESTRICTIVE policies to deny writes and sensitive reads to AI sessions. See docs/MCP_SERVER.md.';

grant execute on function public.is_mcp_session() to authenticated, anon;

-- ============================================================
-- §2 — No writes, anywhere, for an AI session
-- ============================================================
-- Every table the application code touches (docs/SCHEMA_FROM_CODE.sql). The list is
-- explicit rather than "every table in public" so that a new table is a deliberate
-- decision: a table added later is NOT silently write-protected, and equally is not
-- silently left open — it simply is not in this list, and adding it is one line.
--
-- v1 MCP has no write tools at all, so denying all three verbs costs nothing today and
-- means the first write tool must arrive with an explicit, reviewable exemption here.
do $$
declare
  t text;
  verb text;
  tables text[] := array[
    'activity_log', 'ai_conversations', 'ai_messages', 'alpha_feedback', 'api_keys',
    'chat_channel_members', 'chat_channels', 'chat_messages', 'client_metrics',
    'client_notes', 'clients', 'copils', 'email_templates', 'invitations', 'notifications',
    'org_email_config', 'org_integrations', 'organization_members', 'organizations',
    'oxygen_checkins', 'oxygen_daily', 'oxygen_recoveries', 'planning_events', 'playbooks',
    'profiles', 'projects', 'promo_codes', 'quotes', 'roadmaps', 'sent_emails', 'snapshots',
    'tasks', 'team_members', 'user_profiles', 'webhooks'
  ];
begin
  foreach t in array tables loop
    -- Skip a table that does not exist in this project rather than aborting the whole
    -- migration: SCHEMA_FROM_CODE.sql is reconstructed from call sites and may name a
    -- table that was renamed or never created.
    if to_regclass('public.' || t) is null then
      raise notice 'skipping %: table not present', t;
      continue;
    end if;

    -- RLS must be on for a policy to be evaluated at all. A table with RLS disabled is
    -- already open to every authenticated user, which is a separate pre-existing problem —
    -- flagged here rather than silently "protected" by a policy nothing consults.
    if not (select relrowsecurity from pg_class where oid = to_regclass('public.' || t)) then
      raise warning 'RLS is DISABLED on public.% — the MCP restriction below will NOT be enforced there', t;
    end if;

    foreach verb in array array['insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', 'mcp_no_' || verb || '_' || t, t);

      if verb = 'insert' then
        -- INSERT takes WITH CHECK; USING is not allowed on it.
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
-- §3 — No reads of sensitive data for an AI session
-- ============================================================
-- Defence in depth behind the Worker's column allowlists (clients.service.ts
-- EXCLUDED_COLUMNS, tasks.service.ts EXCLUDED_TASK_COLUMNS). Even if a future MCP bug
-- asks for one of these tables, the database refuses.
--
-- Each entry is a privacy decision, not a technical one. Removing one is a privacy review:
--   client_notes      free-form CSM prose; routinely commercial and personal detail
--   ai_conversations  the user's own AI history, including prompts about named customers
--   ai_messages       same
--   org_integrations  third-party credentials
--   org_email_config  the per-organization Resend key
--   api_keys          credentials
--   webhooks          endpoint URLs and secrets
--   sent_emails       message bodies sent to customers
--   oxygen_*          LEGALLY self-only well-being data (see CLAUDE.md). Never AI-readable.
--   activity_log      who did what, across the organization
--   invitations       email addresses of people not yet users
--   promo_codes       commercial terms
--   alpha_feedback    free-form prose
--
-- NOT restricted, because the MCP tools legitimately read them and RLS already scopes them
-- to the caller's own organization: clients, tasks, profiles, organization_members,
-- organizations, client_metrics.
do $$
declare
  t text;
  sensitive text[] := array[
    'activity_log', 'ai_conversations', 'ai_messages', 'alpha_feedback', 'api_keys',
    'client_notes', 'invitations', 'org_email_config', 'org_integrations',
    'oxygen_checkins', 'oxygen_daily', 'oxygen_recoveries', 'promo_codes', 'sent_emails',
    'webhooks'
  ];
begin
  foreach t in array sensitive loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipping %: table not present', t;
      continue;
    end if;

    execute format('drop policy if exists %I on public.%I', 'mcp_no_select_' || t, t);
    execute format(
      'create policy %I on public.%I as restrictive for select to authenticated using (not public.is_mcp_session())',
      'mcp_no_select_' || t, t);
  end loop;
end $$;

-- ============================================================
-- §4 — Verification (run these AFTER applying, in pre-prod)
-- ============================================================
-- 4.1 — The claim reader works and a normal session is NOT an MCP session.
--       Expect: false. If this returns true for a website session, STOP: every write in
--       the application is about to be refused.
--
--   select public.is_mcp_session();
--
-- 4.2 — The policies exist and are RESTRICTIVE (permissive = 'RESTRICTIVE').
--
--   select tablename, policyname, permissive, cmd
--   from pg_policies
--   where schemaname = 'public' and policyname like 'mcp_no_%'
--   order by tablename, policyname;
--
-- 4.3 — The website is unaffected. Sign in to pre-prod and, as a normal user:
--       create a client, edit it, delete it; create and complete a task; send a chat
--       message. All must work exactly as before. This is the check that matters most —
--       §2 touches 35 tables and a regression here is a production outage, not a
--       degraded AI feature.
--
-- 4.4 — The AI session is actually denied. With an MCP OAuth token that carries
--       ai_agent = true (i.e. AFTER the access-token hook is live), against Supabase REST
--       DIRECTLY, bypassing the MCP Worker:
--
--   curl -X PATCH "$SUPABASE_URL/rest/v1/clients?id=eq.<a client you can see>" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $MCP_TOKEN" \
--        -H "Content-Type: application/json" -d '{"name":"pwned"}'
--   -- expect: 0 rows affected / permission denied. NOT 204 with the name changed.
--
--   curl "$SUPABASE_URL/rest/v1/client_notes?select=*" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $MCP_TOKEN"
--   -- expect: [] or permission denied.
--
--   curl "$SUPABASE_URL/rest/v1/clients?select=id,name" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $MCP_TOKEN"
--   -- expect: the caller's own organization's clients — MCP must still WORK.
--
--       A PATCH returning 204 with zero rows matched is a PASS here, but note it is the
--       same shape as the D-14 false success: confirm by re-reading the row.

-- ============================================================
-- §5 — Rollback
-- ============================================================
-- If the website regresses, drop every policy this migration created. is_mcp_session()
-- itself is harmless to leave in place.
--
--   do $$
--   declare p record;
--   begin
--     for p in select tablename, policyname from pg_policies
--              where schemaname = 'public' and policyname like 'mcp_no_%'
--     loop
--       execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
--     end loop;
--   end $$;
