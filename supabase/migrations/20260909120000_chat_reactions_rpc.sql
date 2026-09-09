-- SCALYO — Chat: reactions and pins on ANOTHER member's message (error_list §12.3)
-- Symptom observed: clicking 👍 on a message you did not write did nothing at all — no
-- reaction, no error toast. Cause: chat_messages_update is USING (user_id = auth.uid())
-- (20260705230000_secrets_and_org_rls.sql §4), so the PostgREST UPDATE matched ZERO rows
-- and returned 204 with error = null. A false success (D-14) that no `error` test could catch.
--
-- Widening chat_messages_update to the whole org was REJECTED: it would also let any member
-- rewrite or blank someone else's `content`. Instead, two SECURITY DEFINER RPCs that can
-- only touch `reactions` / `pinned`, and re-implement the SELECT visibility rule by hand
-- (definer bypasses RLS — the check has to be written out).
-- Bonus: the read-modify-write happens under a row lock, so two people reacting at the same
-- instant no longer overwrite each other (the front end's read-modify-write always could).
--
-- PRE-PROD (wxbape…) first, PROD on an explicit go (R8). Idempotent.

-- ============================================================
-- §1 — Visibility helper: "may the caller SELECT this message?"
-- ============================================================
-- Mirrors chat_messages_select + the type='dm' clause of chat_channels_select.
-- PARITY: if either policy changes, change this too.
create or replace function public.can_read_chat_message(p_message_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $fn$
  select exists (
    select 1
    from public.chat_messages m
    join public.chat_channels c on c.id = m.channel_id
    where m.id = p_message_id
      and (
        (m.organization_id is not null and m.organization_id = public.get_my_org_id())
        or (m.organization_id is null and m.user_id = auth.uid())
      )
      and (c.type <> 'dm' or public.is_chat_member(c.id))
  );
$fn$;
revoke all on function public.can_read_chat_message(uuid) from public;
revoke all on function public.can_read_chat_message(uuid) from anon;
grant execute on function public.can_read_chat_message(uuid) to authenticated;

-- ============================================================
-- §2 — Toggle a reaction
-- ============================================================
-- Returns the new reactions array so the caller can render the confirmed state
-- (never a locally guessed one — D-14).
create or replace function public.toggle_chat_reaction(p_message_id uuid, p_emoji text)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $fn$
declare
  v_uid       uuid := auth.uid();
  v_current   jsonb;
  v_next      jsonb := '[]'::jsonb;
  v_entry     jsonb;
  v_users     jsonb;
  v_found     boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_emoji is null or length(trim(p_emoji)) = 0 or length(p_emoji) > 16 then
    raise exception 'invalid_emoji' using errcode = '22023';
  end if;
  if not public.can_read_chat_message(p_message_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- FOR UPDATE: serializes concurrent reactors on the same message.
  select coalesce(reactions, '[]'::jsonb) into v_current
  from public.chat_messages where id = p_message_id for update;

  for v_entry in select * from jsonb_array_elements(v_current) loop
    if v_entry->>'emoji' = p_emoji then
      v_found := true;
      if coalesce(jsonb_exists(v_entry->'users', v_uid::text), false) then
        -- already reacted → remove me; drop the whole entry if I was the last one
        select coalesce(jsonb_agg(u), '[]'::jsonb) into v_users
        from jsonb_array_elements(coalesce(v_entry->'users', '[]'::jsonb)) u
        where u <> to_jsonb(v_uid::text);
      else
        v_users := coalesce(v_entry->'users', '[]'::jsonb) || to_jsonb(v_uid::text);
      end if;
      if jsonb_array_length(v_users) > 0 then
        v_next := v_next || jsonb_build_array(jsonb_build_object('emoji', p_emoji, 'users', v_users));
      end if;
    else
      v_next := v_next || jsonb_build_array(v_entry);
    end if;
  end loop;

  if not v_found then
    v_next := v_next || jsonb_build_array(jsonb_build_object('emoji', p_emoji, 'users', jsonb_build_array(v_uid::text)));
  end if;

  update public.chat_messages set reactions = v_next where id = p_message_id;
  return v_next;
end;
$fn$;
revoke all on function public.toggle_chat_reaction(uuid, text) from public;
revoke all on function public.toggle_chat_reaction(uuid, text) from anon;
grant execute on function public.toggle_chat_reaction(uuid, text) to authenticated;

-- ============================================================
-- §3 — Pin / unpin
-- ============================================================
-- Same false-success as the reaction: pinning someone else's message was a silent no-op.
create or replace function public.set_chat_message_pinned(p_message_id uuid, p_pinned boolean)
returns boolean
language plpgsql volatile security definer set search_path = public
as $fn$
declare
  v_result boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not public.can_read_chat_message(p_message_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.chat_messages set pinned = coalesce(p_pinned, false)
  where id = p_message_id
  returning pinned into v_result;
  return v_result;
end;
$fn$;
revoke all on function public.set_chat_message_pinned(uuid, boolean) from public;
revoke all on function public.set_chat_message_pinned(uuid, boolean) from anon;
grant execute on function public.set_chat_message_pinned(uuid, boolean) to authenticated;

-- ============================================================
-- §4 — Realtime: chat_channels was never published (G9-22 reloads by hand)
-- ============================================================
-- 20260421_chat_tables.sql adds it unconditionally, which FAILS on a project where it is
-- already published — so on a project where that migration half-applied, chat_channels can
-- be absent from the publication. Idempotent version, same shape as 20260706180000.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_channels'
  ) then
    alter publication supabase_realtime add table public.chat_channels;
  end if;
end $$;
