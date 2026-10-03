-- SCALYO — an alpha code records the subscription period it produced; the founding programme goes.
--
-- PROMO-LINK (03/10/2026, decided): an alpha code keeps its own terms — plan, max_seats, valid_days
-- stay on promo_codes for good (this reverses the 27/09 "drop them once subscription_id carries the
-- terms": a code is handed out before any organization exists, and a subscription row is a period
-- an organization had). promo_codes.subscription_id is filled at redemption with the PROMO period the code
-- opened (CORE-V2-SUBSCRIPTION: one row = one period of one organization), which also says again
-- which organization used the code — what dropping promo_codes.organization_id lost.
--
-- FOUNDING-REMOVED (03/10/2026, decided): the founding programme (the first 10 organizations,
-- /api/founding-status) is removed. The redemption stops setting organizations.is_founding; the
-- column itself is no longer read by the app (stores/auth.js stopped selecting it) and goes with
-- organizations in stage 4b.
--
-- Redefines redeem_promo_code from 20260927130000 — that file may already be applied (it shipped as a
-- security hotfix), and an applied migration is never edited: the change lives here.
--
-- ORDER: after 20260927130000, 20260927110000 (promo_codes.subscription_id) and the core_v2 files
-- (subscription, its mirror). §0 refuses otherwise.
--
-- PRE-PROD FIRST, PROD on an explicit go. Idempotent.

-- ============================================================
-- §0 — Pre-flight
-- ============================================================
do $$
begin
  if to_regprocedure('public.redeem_promo_code(uuid, text)') is null then
    raise exception 'promo link: apply 20260927130000_own_organization_per_user.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'promo_codes' and column_name = 'subscription_id') then
    raise exception 'promo link: promo_codes.subscription_id missing — apply 20260927110000 first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'subscription' and column_name = 'kind')
     or to_regprocedure('public.core_v2_sync_subscription(uuid)') is null then
    raise exception 'promo link: the core_v2 subscription periods are missing — apply the core_v2 files first';
  end if;
end $$;

-- ============================================================
-- §1 — The redemption, linked to its period
-- ============================================================
create or replace function public.redeem_promo_code(p_user uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_org uuid;
  v_owner uuid;
  v_id uuid;
  v_promo jsonb;
  v_days integer;
  v_has_status boolean;
  v_core bigint;
  v_period bigint;
begin
  if nullif(btrim(p_code), '') is null then
    return 'no_code';
  end if;
  select organization_id into v_org from public.profiles where id = p_user;
  if v_org is null then
    return 'no_organization';
  end if;
  select owner_id into v_owner from public.organizations where id = v_org;
  if v_owner is distinct from p_user then
    return 'not_owner';
  end if;

  -- PROMO-STATUS (03/10/2026): the code is found by promo_code_find, the same test
  -- /api/alpha/verify runs through promo_code_lookup — the screen and the signup cannot disagree.
  -- While `status` exists it is stamped 'used', and organization_id / expires_at are filled, as
  -- /api/alpha/activate did, so anything still reading them sees a spent code.
  v_has_status := exists (select 1 from information_schema.columns
                           where table_schema = 'public' and table_name = 'promo_codes' and column_name = 'status');
  v_id := public.promo_code_find(p_code, true);
  if v_id is null then
    return 'invalid';
  end if;
  update public.promo_codes pc set activated_at = now() where pc.id = v_id
  returning to_jsonb(pc) into v_promo;

  v_days := nullif(v_promo ->> 'valid_days', '')::integer;
  if v_has_status then
    execute 'update public.promo_codes set status = ''used'' where id = $1' using v_id;
  end if;
  if v_promo ? 'organization_id' then
    execute 'update public.promo_codes set organization_id = $2 where id = $1' using v_id, v_org;
  end if;
  if v_promo ? 'expires_at' and v_days is not null then
    execute 'update public.promo_codes set expires_at = now() + make_interval(days => $2) where id = $1' using v_id, v_days;
  end if;
  update public.organizations o
     set plan = coalesce(nullif(v_promo ->> 'plan', ''), o.plan),
         seats_paid = coalesce(nullif(v_promo ->> 'max_seats', '')::integer, o.seats_paid),
         trial_ends_at = case when v_days is null then o.trial_ends_at else now() + make_interval(days => v_days) end
   where o.id = v_org;

  -- FOUNDING-REMOVED (03/10/2026): the founding programme is gone, so is_founding is no longer
  -- set (20260927130000 still set it for the first 10). The person is still an alpha tester.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_alpha_tester') then
    execute 'update public.profiles set is_alpha_tester = true where id = $1' using p_user;
  end if;

  -- PROMO-LINK (03/10/2026, decided): the code keeps its terms (plan, max_seats, valid_days) and
  -- subscription_id records the period it produced. The organizations UPDATE above made the core_v2
  -- mirror open that PROMO period in this same transaction (core_v2_sync_subscription); when the
  -- mirror failed (it is fail-open) the link stays NULL rather than pointing at a guess.
  select o.core_organization_id into v_core from public.organizations o where o.id = v_org;
  if v_core is not null then
    select s.id into v_period
      from public.subscription s
     where s.organization_id = v_core and s.kind = 'PROMO'
     order by s.issue_date desc, s.id desc
     limit 1;
    if v_period is not null then
      update public.promo_codes set subscription_id = v_period where id = v_id;
    else
      raise warning 'redeem_promo_code: no PROMO period for organization % — subscription_id left NULL', v_org;
    end if;
  end if;

  -- The audit line must never undo a redemption.
  begin
    if to_regclass('public.activity_log') is not null then
      execute 'insert into public.activity_log (organization_id, user_id, action, entity_type, entity_id, changes)
               values ($1, $2, ''update'', ''settingsOrg'', $1, $3)'
        using v_org, p_user,
              jsonb_build_object('plan', jsonb_build_object('old', null, 'new', v_promo ->> 'plan'),
                                 'source', jsonb_build_object('old', null, 'new', 'promo_code'));
    end if;
  exception when others then
    raise warning 'redeem_promo_code: activity_log not written: %', sqlerrm;
  end;
  return 'applied';
end;
$fn$;

revoke all on function public.redeem_promo_code(uuid, text) from public, anon, authenticated;

-- ============================================================
-- §2 — Codes redeemed before this file: link them to their PROMO period when one is unambiguous
-- ============================================================
-- A code redeemed through 20260927130000 recorded its organization in promo_codes.organization_id
-- while that column existed. Where it still does and the organization has exactly one PROMO period,
-- that period is the code's. Anything less certain stays NULL (R21).
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'promo_codes' and column_name = 'organization_id') then
    execute $q$
      update public.promo_codes pc
         set subscription_id = (select s.id from public.subscription s
                                 join public.organizations o on o.core_organization_id = s.organization_id
                                where o.id = pc.organization_id and s.kind = 'PROMO')
       where pc.subscription_id is null and pc.activated_at is not null and pc.organization_id is not null
         and (select count(*) from public.subscription s
                join public.organizations o on o.core_organization_id = s.organization_id
               where o.id = pc.organization_id and s.kind = 'PROMO') = 1
    $q$;
  end if;
end $$;

-- ============================================================
-- Verification (run AFTER applying, in pre-prod)
-- ============================================================
-- 1. By hand: sign up with an unused code, then expect its subscription_id to be a PROMO period of the
--    new account's organization, ending valid_days from now:
--
--   select pc.code, s.kind, s.type, s.seats, s.issue_date + s.duration as period_end
--     from public.promo_codes pc join public.subscription s on s.id = pc.subscription_id
--    where pc.code = '<the code>';
--
-- 2. Nothing sets is_founding any more. Expect the count to stay where it was after a signup:
--
--   select count(*) from public.organizations where is_founding;
--
-- ============================================================
-- Rollback
-- ============================================================
-- Re-run §3 of 20260927130000_own_organization_per_user.sql (its redeem_promo_code), then
--   update public.promo_codes set subscription_id = null;   -- only if the links must go too
