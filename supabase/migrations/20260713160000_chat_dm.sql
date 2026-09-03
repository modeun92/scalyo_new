-- SCALYO — DM (contract 13/07, decision by Lidia: extensible foundation for groups)
-- + automatic "general" channel at org creation (fixes empty chat).
-- PRE-PROD (wxbape…) first — PROD only before the matching prod deploy (R8).
-- Idempotent.

-- ============================================================
-- §1 — Participants: dedicated table (foundation for groups, "case 2" decision 13/07)
-- ============================================================
create table if not exists public.chat_channel_members (
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index if not exists chat_channel_members_user_idx on public.chat_channel_members(user_id);
alter table public.chat_channel_members enable row level security;

-- Deterministic pair key (sorted uuids): uniqueness of the 1-to-1 DM per org.
-- Future groups will set dm_key to NULL (no dedup).
alter table public.chat_channels add column if not exists dm_key text;
create unique index if not exists chat_channels_dm_key_idx
  on public.chat_channels(organization_id, dm_key) where dm_key is not null;

-- ============================================================
-- §2 — Membership helper (SECURITY DEFINER: avoids RLS recursion)
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
-- Participants: read restricted to the channel's members. No INSERT/UPDATE/DELETE
-- policy: writes go through the open_dm RPC (definer).
drop policy if exists chat_channel_members_select on public.chat_channel_members;
create policy chat_channel_members_select on public.chat_channel_members
  for select using (public.is_chat_member(channel_id));

-- Channels: classic channel behaviour unchanged; type='dm' reserved for participants.
drop policy if exists chat_channels_select on public.chat_channels;
create policy chat_channels_select on public.chat_channels for select using (
  (
    (organization_id is not null and organization_id = public.get_my_org_id())
    or (organization_id is null and created_by = auth.uid())
  )
  and (type <> 'dm' or public.is_chat_member(id))
);

-- Direct creation: classic channels only — DMs are born via open_dm.
drop policy if exists chat_channels_insert on public.chat_channels;
create policy chat_channels_insert on public.chat_channels for insert with check (
  created_by = auth.uid()
  and organization_id is not distinct from public.get_my_org_id()
  and type <> 'dm'
);

-- Messages: visibility follows the channel (a DM never leaks outside its participants).
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
-- update/delete: unchanged (own rows only).

-- ============================================================
-- §4 — RPC open_dm: atomic find-or-create of the 1-to-1 DM
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
  -- The other participant must be a member of the same org
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
      -- Race: the other participant has just created it
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
-- §5 — Automatic "general" channel (fixes the empty-chat first contact)
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

-- Backfill: existing orgs without any classic channel
insert into public.chat_channels (name, description, type, created_by, organization_id)
select 'general', '', 'channel', null, o.id
from public.organizations o
where not exists (
  select 1 from public.chat_channels c
  where c.organization_id = o.id and c.type = 'channel'
);

-- ============================================================
-- §6 — Realtime: publication of the participants (client-side discovery)
-- ============================================================
do $do$
begin
  begin
    alter publication supabase_realtime add table public.chat_channel_members;
  exception when duplicate_object then null;
  end;
end
$do$;
