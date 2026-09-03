-- CR-3 (E-01) — 4 July 2026
-- Extends public.protect_org_fields(): the authenticated role can no longer
-- modify the billing columns of profiles directly. Provisioning goes
-- exclusively through the Stripe webhook (service_role, unaffected).
-- NB: trial_used / trial_started_at stay client-writable —
-- legitimately written by auth.js (startTrial, fetchProfile). Trial-extension
-- abuse is a separate finding (dedicated session).
-- Applied: PRE-PROD (wxbape…) on 4 July 2026. PROD: on approved merge (R8).

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
