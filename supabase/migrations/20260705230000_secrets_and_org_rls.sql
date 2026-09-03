-- CR-8/CR-9 (fix/secrets-backend) — 5 July 2026
-- C-04: the get_org_email_config RPC returned resend_api_key to the browser (GRANT anon+authenticated).
-- C-05: its non-owner branch referenced team_members, a non-existent table (42P01).
-- E-08: org_email_config readable/writable in clear text by the client (resend_api_key column).
-- E-09: org_integrations.access_token/refresh_token/config were sent down to the DOM.
-- C-06: single-tenant chat RLS (chat_messages_select = auth.uid() IS NOT NULL;
--       chat_channels_all = created_by only).
-- B-19: clients.organization_id never set — backfill of legacy rows.
-- D1 mechanism: SEPARATE trigger protect_secret_fields (protect_org_fields, a CR-3 artifact,
-- is NOT touched — R25 §2). A column-level REVOKE alone would be ineffective as long as a
-- table-level GRANT exists: we REVOKE the table then re-GRANT the safe columns.
-- Applied: PRE-PROD (wxbape…) first. PROD: dedicated runbook approved (R8) —
-- precedent: 20260704190000_protect_billing_fields.

-- ============================================================
-- §1 — RPC: leak removal (C-04) + member repair (C-05)
-- ============================================================

drop function if exists public.get_org_email_config(uuid);

create or replace function public.get_org_email_status()
returns table(configured boolean, sender_domain text, sender_name text)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_owner uuid;
begin
  -- Direct owner: their own config
  if exists (select 1 from org_email_config o where o.owner_id = auth.uid()) then
    v_owner := auth.uid();
  else
    -- Member: the config of their organization's owner
    select org.owner_id into v_owner
    from profiles p
    join organizations org on org.id = p.organization_id
    where p.id = auth.uid();
  end if;

  if v_owner is not null
     and exists (select 1 from org_email_config o where o.owner_id = v_owner) then
    return query
      select true, o.sender_domain, o.sender_name
      from org_email_config o
      where o.owner_id = v_owner;
  else
    return query select false, ''::text, ''::text;
  end if;
end;
$$;

revoke all on function public.get_org_email_status() from public;
revoke all on function public.get_org_email_status() from anon;
grant execute on function public.get_org_email_status() to authenticated;
grant execute on function public.get_org_email_status() to service_role;

-- ============================================================
-- §2 — Server-side custody of secret columns (E-08, E-09)
-- ============================================================

-- org_email_config: NO client access at all any more. Status read = the RPC above;
-- reading/writing the config = service_role back end only (/api/email/config).
revoke all on table public.org_email_config from anon, authenticated;

-- org_integrations: the client keeps the list (safe columns) and disconnection
-- (DELETE, gated by the existing user_id RLS). Secrets and config: service_role only.
revoke all on table public.org_integrations from anon, authenticated;
grant select (id, user_id, integration_id, status, connected_at, updated_at)
  on public.org_integrations to authenticated;
grant delete on public.org_integrations to authenticated;

-- ============================================================
-- §3 — Purge of legacy clear-text secrets (D5 approved: nothing to preserve, pre-beta)
-- ============================================================

delete from public.org_email_config;
update public.profiles set resend_api_key = null where resend_api_key is not null;

-- profiles.resend_api_key: dead column (no longer read or written by the code).
-- auth.js does select('*') on profiles → no column REVOKE here; we block
-- rewriting via a trigger (protect_billing_fields pattern, separate function).
create or replace function public.protect_secret_fields() returns trigger
language plpgsql as $$
begin
  if current_setting('role', true) = 'authenticated' then
    if new.resend_api_key is distinct from old.resend_api_key then
      raise exception 'resend_api_key cannot be modified directly';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_secret_fields on public.profiles;
create trigger trg_protect_secret_fields
  before update on public.profiles
  for each row execute function public.protect_secret_fields();

-- ============================================================
-- §4 — Multi-tenant chat (C-06) — scoping by organization via get_my_org_id()
--       (existing SECURITY DEFINER, baseline L148 — compliant with E14, zero self-reference)
-- ============================================================

alter table public.chat_channels add column if not exists organization_id uuid;
alter table public.chat_messages add column if not exists organization_id uuid;

update public.chat_channels c
  set organization_id = p.organization_id
  from public.profiles p
  where c.created_by = p.id and c.organization_id is null;

update public.chat_messages m
  set organization_id = p.organization_id
  from public.profiles p
  where m.user_id = p.id and m.organization_id is null;

drop policy if exists chat_channels_all on public.chat_channels;
drop policy if exists chat_messages_select on public.chat_messages;
drop policy if exists chat_messages_insert on public.chat_messages;
drop policy if exists chat_messages_update on public.chat_messages;
drop policy if exists chat_messages_delete on public.chat_messages;

-- D3 approved: a user without an org = personal chat (organization_id IS NULL branch).
create policy chat_channels_select on public.chat_channels for select using (
  (organization_id is not null and organization_id = public.get_my_org_id())
  or (organization_id is null and created_by = auth.uid())
);
create policy chat_channels_insert on public.chat_channels for insert with check (
  created_by = auth.uid()
  and organization_id is not distinct from public.get_my_org_id()
);
create policy chat_channels_update on public.chat_channels for update using (
  created_by = auth.uid()
);
create policy chat_channels_delete on public.chat_channels for delete using (
  created_by = auth.uid()
);

create policy chat_messages_select on public.chat_messages for select using (
  (organization_id is not null and organization_id = public.get_my_org_id())
  or (organization_id is null and user_id = auth.uid())
);
create policy chat_messages_insert on public.chat_messages for insert with check (
  user_id = auth.uid()
  and organization_id is not distinct from public.get_my_org_id()
);
create policy chat_messages_update on public.chat_messages for update using (
  user_id = auth.uid()
);
create policy chat_messages_delete on public.chat_messages for delete using (
  user_id = auth.uid()
);

-- ============================================================
-- §5 — Clients : backfill organization_id (B-19)
-- ============================================================

update public.clients c
  set organization_id = p.organization_id
  from public.profiles p
  where c.user_id = p.id and c.organization_id is null;
