-- CR-3 (E-01) — 4 juillet 2026
-- Étend public.protect_org_fields() : le rôle authenticated ne peut plus
-- modifier directement les colonnes billing de profiles. Le provisioning
-- passe exclusivement par le webhook Stripe (service_role, non affecté).
-- NB : trial_used / trial_started_at restent modifiables côté client —
-- écrits légitimement par auth.js (startTrial, fetchProfile). L'abus
-- d'extension de trial est un constat séparé (session dédiée).
-- Appliqué : PRÉPROD (wxbape…) le 4 juillet 2026. PROD : au merge validé (R8).

create or replace function public.protect_org_fields() returns trigger
language plpgsql as $$
begin
  if current_setting('role', true) = 'authenticated' then
    if new.org_role is distinct from old.org_role then
      raise exception 'org_role cannot be modified directly';
    end if;
    if new.organization_id is distinct from old.organization_id then
      raise exception 'organization_id cannot be modified directly';
    end if;
    if new.plan is distinct from old.plan then
      raise exception 'plan cannot be modified directly';
    end if;
    if new.stripe_subscription_id is distinct from old.stripe_subscription_id then
      raise exception 'stripe_subscription_id cannot be modified directly';
    end if;
    if new.stripe_customer_id is distinct from old.stripe_customer_id then
      raise exception 'stripe_customer_id cannot be modified directly';
    end if;
    if new.seats_paid is distinct from old.seats_paid then
      raise exception 'seats_paid cannot be modified directly';
    end if;
    if new.subscription_end_date is distinct from old.subscription_end_date then
      raise exception 'subscription_end_date cannot be modified directly';
    end if;
  end if;
  return new;
end;
$$;
