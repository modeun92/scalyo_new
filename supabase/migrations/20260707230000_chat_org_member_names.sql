-- fix/chat-polish (G9-21, G9-19) : RPC noms des membres de l'org (D3)
-- + hygiène search_path sur get_my_org_id (même famille qu'ENV-3)
-- + backfill author_name des messages 'user_default'.
-- Appliquée en PRÉPROD le 2026-07-07 (SQL editor). À appliquer en PROD AVANT le merge main (piège 22).
-- Idempotente.

-- D3 : exposition minimale (id, prénom, nom) des membres de l'org du caller.
-- Une policy RLS org sur profiles est EXCLUE : la table porte resend_api_key / champs Stripe (CR-8).
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

-- Hygiène ENV-3 : get_my_org_id est SECURITY DEFINER sans search_path (proconfig NULL constaté
-- en préprod le 7/07). Utilisée par toutes les policies RLS org (chat, email_config).
alter function public.get_my_org_id() set search_path = public;

-- Backfill : plus aucun message « user_default » ; prénom sinon préfixe email.
update public.chat_messages m
set author_name = coalesce(nullif(p.first_name, ''), split_part(u.email, '@', 1))
from public.profiles p
join auth.users u on u.id = p.id
where p.id = m.user_id
  and m.author_name in ('user_default', '');
