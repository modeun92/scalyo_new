-- SCALYO — promo_codes, 2/2: drop status, organization_id and expires_at.
--
-- Decided 27/09/2026.
--   status           PROMO-USED: "used" is activated_at IS NOT NULL. The two said the same thing
--                    twice, and 20260927110000 refused to run while any row made them disagree.
--   organization_id  which organization redeemed the code. Dropped by decision: after this, nothing
--                    records which code created which organization (activity_log keeps
--                    source = 'promo_code' on the organization's creation, not the code).
--   expires_at       a copy of organizations.trial_ends_at, written at the same moment; the
--                    organization's own column is the one every access check reads.
-- plan and max_seats stay (PROMO-TERMS in 20260927110000) until activation reads subscription_id.
--
-- ORDER — AFTER 20260927130000 and the API that uses it are live: /api/alpha/verify asks
-- promo_code_lookup, the signup asks redeem_promo_code, and both go through promo_code_find, which
-- reads status only while it exists (PROMO-STATUS). Applied before them, every code check fails:
-- the old API filters on status=eq.active, and PostgREST rejects a column that does not exist — no
-- alpha signup gets through.
--
-- ROLLING THE API BACK after this file needs the columns back first (Rollback below). Between the
-- API deploy and this file, a rollback of the API alone must first run
--   update public.promo_codes set status = 'used' where activated_at is not null and status = 'active';
-- or codes used through the new API are accepted again by the old one.
--
-- No CASCADE: if a dashboard view or policy uses one of these columns, the drop fails and names it.
--
-- PRE-PROD FIRST, PROD on an explicit go. Idempotent.

-- PROMO-STATUS (03/10/2026): once status is gone, "usable" is activated_at IS NULL alone
-- (promo_code_find). A code held back by its status — revoked, frozen — and never activated would
-- become usable the moment this runs. Refuse until each one is decided: activated (spent) or deleted.
do $$
declare
  v_held integer;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'promo_codes' and column_name = 'status') then
    execute $q$ select count(*) from public.promo_codes
                 where activated_at is null and status is distinct from 'active' $q$ into v_held;
    if v_held > 0 then
      raise exception 'promo_codes: % code(s) are held back only by their status and would become usable — decide each (update ... set activated_at = now(), or delete), then re-run: select id, code, status from public.promo_codes where activated_at is null and status is distinct from ''active'';', v_held;
    end if;
  end if;
end $$;

alter table public.promo_codes drop column if exists status;
alter table public.promo_codes drop column if exists organization_id;
alter table public.promo_codes drop column if exists expires_at;

-- ============================================================
-- Verification (run AFTER applying, in pre-prod)
-- ============================================================
-- 1. Expect 0 rows.
--
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'promo_codes'
--      and column_name in ('status', 'organization_id', 'expires_at');
--
-- 2. By hand: register with an unused code — the organization is created on the code's plan, and
--    the same code is then refused ("alpha_code_invalid") on a second registration.
--
-- ============================================================
-- Rollback
-- ============================================================
--   alter table public.promo_codes add column if not exists status text;
--   alter table public.promo_codes add column if not exists organization_id uuid;
--   alter table public.promo_codes add column if not exists expires_at timestamptz;
--   update public.promo_codes
--      set status = case when activated_at is null then 'active' else 'used' end,
--          expires_at = activated_at + make_interval(days => valid_days)
--    where status is null;
--   -- organization_id cannot be recovered: nothing else records which code made which organization.
