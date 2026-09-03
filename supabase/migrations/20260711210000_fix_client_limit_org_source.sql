-- CR-2 / B-12 (server): check_client_limit read profiles.plan (the old source)
-- and counted by user_id. Since org_plan_source (8/07), the single source = organizations.plan.
-- Pre-sales bug: a non-owner member of a paying org (whose profiles.plan = starter/NULL)
-- was blocked at 50 clients, and the quota was not org-scoped.
-- Fix: source = organizations.plan (profile fallback for accounts without an org),
-- counting by organization_id, prospects not counted (aligned with PortfolioView: quota on active clients).
-- Aligned 1:1 with the front end (getMaxClients(effectivePlan), clientsCount = clientsOnly).
-- Applied on PRE-PROD first (REST evidence x2), then PROD (runbook R8), then commit.

create or replace function public.check_client_limit() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  eff_plan text;
  lim int;
  cnt int;
begin
  -- prospects not limited (aligned with PortfolioView L206: quota on active clients only)
  if coalesce(new.lifecycle, 'client') = 'prospect' then
    return new;
  end if;

  -- single source = organizations.plan when the org exists (aligned with auth.js currentPlan); profile fallback
  if new.organization_id is not null then
    select plan into eff_plan from organizations where id = new.organization_id;
  end if;
  if eff_plan is null then
    select plan into eff_plan from profiles where id = new.user_id;
  end if;

  lim := case coalesce(eff_plan, 'starter') when 'starter' then 50 else -1 end;

  if lim > 0 then
    if new.organization_id is not null then
      select count(*) into cnt from clients
        where organization_id = new.organization_id
          and coalesce(lifecycle, 'client') <> 'prospect';
    else
      select count(*) into cnt from clients
        where user_id = new.user_id
          and coalesce(lifecycle, 'client') <> 'prospect';
    end if;

    if cnt >= lim then
      raise exception 'CLIENT_LIMIT_REACHED: Maximum % clients for % plan', lim, coalesce(eff_plan, 'starter');
    end if;
  end if;

  return new;
end;
$$;

-- The enforce_client_limit BEFORE INSERT ON clients trigger already exists and stays unchanged.
