-- CR-8/CR-9 (fix/secrets-backend) — 5 juillet 2026
-- C-04 : la RPC get_org_email_config renvoyait resend_api_key au navigateur (GRANT anon+authenticated).
-- C-05 : sa branche non-owner référençait team_members, table inexistante (42P01).
-- E-08 : org_email_config lisible/écrivable en clair par le client (colonne resend_api_key).
-- E-09 : org_integrations.access_token/refresh_token/config redescendaient au DOM.
-- C-06 : RLS chat mono-tenant (chat_messages_select = auth.uid() IS NOT NULL ;
--        chat_channels_all = created_by seul).
-- B-19 : clients.organization_id jamais posé — backfill des lignes legacy.
-- Mécanisme D1 : trigger SÉPARÉ protect_secret_fields (protect_org_fields, artefact CR-3,
-- n'est PAS touché — R25 §2). Un REVOKE(colonne) seul serait inopérant tant qu'un GRANT
-- table-level existe : on REVOKE table puis on re-GRANT les colonnes sûres.
-- Appliqué : PRÉPROD (wxbape…) d'abord. PROD : runbook dédié validé (R8) —
-- précédent : 20260704190000_protect_billing_fields.

-- ============================================================
-- §1 — RPC : suppression de la fuite (C-04) + réparation membre (C-05)
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
  -- Owner direct : sa propre config
  if exists (select 1 from org_email_config o where o.owner_id = auth.uid()) then
    v_owner := auth.uid();
  else
    -- Membre : la config de l'owner de son organisation
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
-- §2 — Custody serveur des colonnes secrètes (E-08, E-09)
-- ============================================================

-- org_email_config : plus AUCUN accès client. Lecture statut = RPC ci-dessus ;
-- lecture/écriture de la config = backend service_role uniquement (/api/email/config).
revoke all on table public.org_email_config from anon, authenticated;

-- org_integrations : le client garde la liste (colonnes sûres) et la déconnexion
-- (DELETE, gaté par la RLS user_id existante). Secrets et config : service_role seul.
revoke all on table public.org_integrations from anon, authenticated;
grant select (id, user_id, integration_id, status, connected_at, updated_at)
  on public.org_integrations to authenticated;
grant delete on public.org_integrations to authenticated;

-- ============================================================
-- §3 — Purge des secrets legacy en clair (D5 validé : rien à préserver, pré-beta)
-- ============================================================

delete from public.org_email_config;
update public.profiles set resend_api_key = null where resend_api_key is not null;

-- profiles.resend_api_key : colonne morte (plus lue ni écrite par le code).
-- auth.js fait select('*') sur profiles → pas de REVOKE colonne ici ; on bloque
-- la réécriture par trigger (pattern protect_billing_fields, fonction séparée).
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
-- §4 — Chat multi-tenant (C-06) — scoping par organisation via get_my_org_id()
--       (SECURITY DEFINER existant, baseline L148 — conforme E14, zéro self-référence)
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

-- D3 validé : user sans org = chat personnel (branche organization_id IS NULL).
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
