-- CR-2 / B-12 (serveur) : check_client_limit lisait profiles.plan (ancienne source)
-- et comptait par user_id. Depuis org_plan_source (8/07), la source unique = organizations.plan.
-- Bug avant-vente : un membre non-owner d'une org payante (son profiles.plan = starter/NULL)
-- etait bloque a 50 clients, et le quota n'etait pas org-scope.
-- Fix : source = organizations.plan (fallback profil pour comptes sans org),
-- comptage par organization_id, prospects non comptes (aligne PortfolioView : quota sur clients actifs).
-- Aligne 1:1 avec le front (getMaxClients(effectivePlan), clientsCount = clientsOnly).
-- Applique PREPROD d'abord (preuve REST x2), puis PROD (runbook R8), puis commit.

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
  -- prospects non limites (aligne PortfolioView L206 : quota sur clients actifs uniquement)
  if coalesce(new.lifecycle, 'client') = 'prospect' then
    return new;
  end if;

  -- source unique = organizations.plan quand l'org existe (aligne auth.js currentPlan) ; fallback profil
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

-- Le trigger enforce_client_limit BEFORE INSERT ON clients existe deja et reste inchange.
