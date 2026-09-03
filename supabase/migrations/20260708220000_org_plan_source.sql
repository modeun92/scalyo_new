-- D1/D2 (contrat gating 8 juillet 2026) : organizations.plan = source unique du plan effectif.
-- V3 : organizations n'avait AUCUN trigger de protection ; org_manage (UPDATE owner,
-- toutes colonnes) permettait un self-grant org.plan cote client (E-01-bis).
-- Pattern protect_billing_fields (CR-3) : blocage des colonnes billing pour authenticated.
-- name reste ecrivable (OnboardingView etape 1, G9-5).
-- Appliquee PREPROD le 8/07 (apres validation contrat R8). PROD : avant merge main (piege 22).

create or replace function public.protect_org_billing_fields() returns trigger
language plpgsql as $$
begin
  if current_setting('role', true) = 'authenticated' then
    if new.plan is distinct from old.plan
       or new.seats_paid is distinct from old.seats_paid
       or new.trial_ends_at is distinct from old.trial_ends_at
       or new.stripe_customer_id is distinct from old.stripe_customer_id
       or new.stripe_subscription_id is distinct from old.stripe_subscription_id
       or new.max_clients is distinct from old.max_clients
       or new.is_founding is distinct from old.is_founding
       or new.owner_id is distinct from old.owner_id then
      raise exception 'org billing fields cannot be modified directly';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_org_billing_fields on public.organizations;
create trigger trg_protect_org_billing_fields
  before update on public.organizations
  for each row execute function public.protect_org_billing_fields();

-- Backfill D2 : reconcilier organizations.plan avec le plan paye de l'owner
-- (le webhook n'ecrivait que profiles -> ex. preprod : profiles=elite / org=starter).
update public.organizations o
   set plan = p.plan,
       seats_paid = greatest(o.seats_paid, coalesce(p.seats_paid, 1)),
       stripe_customer_id = coalesce(o.stripe_customer_id, p.stripe_customer_id),
       stripe_subscription_id = coalesce(o.stripe_subscription_id, p.stripe_subscription_id)
  from public.profiles p
 where p.id = o.owner_id
   and p.stripe_subscription_id is not null and p.stripe_subscription_id <> '' and p.stripe_subscription_id <> 'none'
   and p.plan in ('starter','growth','elite','enterprise');
