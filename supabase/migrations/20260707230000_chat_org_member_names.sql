-- fix/chat-polish (G9-21, G9-19): RPC for the names of the org's members (D3)
-- + search_path hygiene on get_my_org_id (same family as ENV-3)
-- + backfill of author_name for 'user_default' messages.
-- Applied on PRE-PROD on 2026-07-07 (SQL editor). To be applied on PROD BEFORE merging main (pitfall 22).
-- Idempotent.

-- D3: minimal exposure (id, first name, last name) of the members of the caller's org.
-- An org-wide RLS policy on profiles is EXCLUDED: the table carries resend_api_key / Stripe fields (CR-8).
create or replace function public.get_org_member_names()
returns table(user_id uuid, first_name text, last_name text)
language sql
stable
security definer
set search_path = public
as $fn$
  select p.id, p.first_name, p.last_name
  from public.profiles p
  join public.organization_members om on om.user_id = p.id
  where om.organization_id = public.get_my_org_id();
$fn$;

revoke all on function public.get_org_member_names() from public;
revoke all on function public.get_org_member_names() from anon;
grant execute on function public.get_org_member_names() to authenticated;

-- ENV-3 hygiene: get_my_org_id is SECURITY DEFINER without a search_path (proconfig NULL observed
-- on pre-prod on 7/07). Used by every org RLS policy (chat, email_config).
alter function public.get_my_org_id() set search_path = public;

-- Backfill: no more "user_default" messages; first name, otherwise the email prefix.
update public.chat_messages m
set author_name = coalesce(nullif(p.first_name, ''), split_part(u.email, '@', 1))
from public.profiles p
join auth.users u on u.id = p.id
where p.id = m.user_id
  and m.author_name in ('user_default', '');
