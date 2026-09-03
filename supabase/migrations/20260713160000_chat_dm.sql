-- SCALYO — DM (contrat 13/07, décision Lidia : socle extensible groupes)
-- + channel « general » automatique à la création d'org (fix chat vide).
-- PRÉPROD (wxbape…) d'abord — PROD uniquement avant le deploy prod correspondant (R8).
-- Idempotente.

-- ============================================================
-- §1 — Participants : table dédiée (socle groupes, décision « cas 2 » 13/07)
-- ============================================================
create table if not exists public.chat_channel_members (
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index if not exists chat_channel_members_user_idx on public.chat_channel_members(user_id);
alter table public.chat_channel_members enable row level security;

-- Clé déterministe de paire (uuids triés) : unicité du DM 1-à-1 par org.
-- Les futurs groupes poseront dm_key NULL (pas de dédup).
alter table public.chat_channels add column if not exists dm_key text;
create unique index if not exists chat_channels_dm_key_idx
  on public.chat_channels(organization_id, dm_key) where dm_key is not null;

-- ============================================================
-- §2 — Helper d'appartenance (SECURITY DEFINER : évite la récursion RLS)
-- ============================================================
create or replace function public.is_chat_member(ch uuid)
returns boolean
language sql stable security definer set search_path = public
as $fn$
  select exists (
    select 1 from public.chat_channel_members
    where channel_id = ch and user_id = auth.uid()
  );
$fn$;
revoke all on function public.is_chat_member(uuid) from public;
revoke all on function public.is_chat_member(uuid) from anon;
grant execute on function public.is_chat_member(uuid) to authenticated;

-- ============================================================
-- §3 — RLS
-- ============================================================
-- Participants : lecture réservée aux membres du canal. Aucune policy
-- INSERT/UPDATE/DELETE : les écritures passent par la RPC open_dm (definer).
drop policy if exists chat_channel_members_select on public.chat_channel_members;
create policy chat_channel_members_select on public.chat_channel_members
  for select using (public.is_chat_member(channel_id));

-- Canaux : comportement channels inchangé ; type='dm' réservé aux participants.
drop policy if exists chat_channels_select on public.chat_channels;
create policy chat_channels_select on public.chat_channels for select using (
  (
    (organization_id is not null and organization_id = public.get_my_org_id())
    or (organization_id is null and created_by = auth.uid())
  )
  and (type <> 'dm' or public.is_chat_member(id))
);

-- Création directe : channels classiques seulement — les DM naissent via open_dm.
drop policy if exists chat_channels_insert on public.chat_channels;
create policy chat_channels_insert on public.chat_channels for insert with check (
  created_by = auth.uid()
  and organization_id is not distinct from public.get_my_org_id()
  and type <> 'dm'
);

-- Messages : la visibilité suit le canal (un DM ne fuit jamais hors participants).
drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages for select using (
  (
    (organization_id is not null and organization_id = public.get_my_org_id())
    or (organization_id is null and user_id = auth.uid())
  )
  and exists (
    select 1 from public.chat_channels c
    where c.id = channel_id
      and (c.type <> 'dm' or public.is_chat_member(c.id))
  )
);

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages for insert with check (
  user_id = auth.uid()
  and organization_id is not distinct from public.get_my_org_id()
  and exists (
    select 1 from public.chat_channels c
    where c.id = channel_id
      and (c.type <> 'dm' or public.is_chat_member(c.id))
  )
);
-- update/delete : inchangés (propres lignes uniquement).

-- ============================================================
-- §4 — RPC open_dm : find-or-create atomique du DM 1-à-1
-- ============================================================
create or replace function public.open_dm(other_user uuid)
returns uuid
language plpgsql security definer set search_path = public
as $fn$
declare
  org uuid := public.get_my_org_id();
  me uuid := auth.uid();
  pair_key text;
  ch uuid;
begin
  if me is null or other_user is null or other_user = me then
    raise exception 'open_dm: invalid participants';
  end if;
  -- L'autre participant doit être membre de la même org
  if org is null or not exists (
    select 1 from public.organization_members om
    where om.user_id = other_user and om.organization_id = org
  ) then
    raise exception 'open_dm: not in same organization';
  end if;
  pair_key := least(me::text, other_user::text) || ':' || greatest(me::text, other_user::text);
  select id into ch from public.chat_channels
    where organization_id = org and dm_key = pair_key;
  if ch is null then
    begin
      insert into public.chat_channels (name, description, type, created_by, organization_id, dm_key)
      values ('dm', '', 'dm', me, org, pair_key)
      returning id into ch;
      insert into public.chat_channel_members (channel_id, user_id)
      values (ch, me), (ch, other_user);
    exception when unique_violation then
      -- Course : l'autre participant vient de le créer
      select id into ch from public.chat_channels
        where organization_id = org and dm_key = pair_key;
    end;
  end if;
  return ch;
end;
$fn$;
revoke all on function public.open_dm(uuid) from public;
revoke all on function public.open_dm(uuid) from anon;
grant execute on function public.open_dm(uuid) to authenticated;

-- ============================================================
-- §5 — Channel « general » automatique (fix premier contact chat vide)
-- ============================================================
create or replace function public.create_default_channel()
returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  insert into public.chat_channels (name, description, type, created_by, organization_id)
  values ('general', '', 'channel', null, new.id);
  return new;
end;
$fn$;

drop trigger if exists org_default_channel on public.organizations;
create trigger org_default_channel after insert on public.organizations
  for each row execute function public.create_default_channel();

-- Backfill : orgs existantes sans aucun channel classique
insert into public.chat_channels (name, description, type, created_by, organization_id)
select 'general', '', 'channel', null, o.id
from public.organizations o
where not exists (
  select 1 from public.chat_channels c
  where c.organization_id = o.id and c.type = 'channel'
);

-- ============================================================
-- §6 — Realtime : publication des participants (découverte côté client)
-- ============================================================
do $do$
begin
  begin
    alter publication supabase_realtime add table public.chat_channel_members;
  exception when duplicate_object then null;
  end;
end
$do$;
