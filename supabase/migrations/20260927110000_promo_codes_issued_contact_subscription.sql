-- SCALYO — promo_codes, 1/2: add issued_at, contact and subscription_id; check the data the next
-- step relies on.
--
-- Decided 27/09/2026. promo_codes keeps id, code, valid_days, activated_at, plan, max_seats and gains:
--   issued_at        date   when the code was handed out. Default today for a new code; an existing
--                           code takes the date of its created_at when the table has one, and stays
--                           NULL otherwise — an unknown date is not guessed (R21).
--   contact          jsonb  who the code was handed to, free form (e.g. {"name", "email", "company"}).
--                           jsonb, not json: the same text, but comparable and indexable.
--   subscription_id  bigint the PROMO period the code opened, filled at redemption (PROMO-LINK,
--                           20261003100000). FK to the core_v2 subscription table.
-- and loses status, organization_id and expires_at in part 2 (20260927120000).
--
-- PROMO-TERMS (27/09/2026, settled 03/10/2026): plan, max_seats and valid_days STAY — they are the
-- code's terms, held by the code because a code is handed out before any organization exists and a
-- subscription row belongs to an organization. subscription_id records the PROMO period the
-- redemption opened (PROMO-LINK, 20261003100000), not where the terms come from.
--
-- ON DELETE SET NULL on subscription_id (03/10/2026): the column records which period a code
-- produced (PROMO-LINK), not its terms. A period outlives its organization (subscription.organization_id
-- is SET NULL, CORE-V2-SUBSCRIPTION), so the pointer normally stays; a period that never ran — opened
-- and closed in one transaction — is deleted (core_v2_end_period), and the code then stays used
-- (activated_at) and loses only the pointer. RESTRICT, the 27/09 choice, would make that delete fail.
--
-- ORDER
--   * AFTER 20260920100000_core_v2_schema.sql (the subscription table) — this file refuses otherwise.
--   * Its §0 refuses data on which status and activated_at disagree; run it, fix what it reports.
--     The usable-code test itself lives in promo_code_find (20260927130000, PROMO-STATUS), which
--     honours status while it exists; 20260927120000 checks again before dropping it.
--   * Part 2 (20260927120000) AFTER 20260927130000 and the alpha API that uses it are live.
--
-- PRE-PROD FIRST, PROD on an explicit go. Idempotent.

-- ============================================================
-- §0 — Pre-flight
-- ============================================================
do $$
declare
  v_other integer;
  v_used_no_time integer;
begin
  if to_regclass('public.promo_codes') is null then
    raise exception 'promo_codes: table not found';
  end if;
  if to_regclass('public.subscription') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'subscription' and column_name = 'type') then
    raise exception 'promo_codes: public.subscription (core_v2) not found — apply 20260920100000_core_v2_schema.sql first';
  end if;

  -- PROMO-USED: the new API reads "unused" as activated_at IS NULL. Only while status still exists
  -- can the two disagree, so check it here, before that API ships.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'promo_codes' and column_name = 'status') then
    -- A status other than active / used (a revoked code, say) has no home once status goes: with no
    -- activated_at it would become usable. Refuse rather than guess what it meant.
    execute $q$ select count(*) from public.promo_codes where status is distinct from 'active' and status is distinct from 'used' $q$
       into v_other;
    if v_other > 0 then
      raise exception 'promo_codes: % code(s) with a status other than active / used — decide what each means, then re-run: select id, code, status from public.promo_codes where status not in (''active'', ''used'') or status is null;', v_other;
    end if;
    -- A used code with no activated_at would be accepted again.
    execute $q$ select count(*) from public.promo_codes where status = 'used' and activated_at is null $q$
       into v_used_no_time;
    if v_used_no_time > 0 then
      raise exception 'promo_codes: % used code(s) have no activated_at and would become usable again — set it (e.g. update public.promo_codes set activated_at = coalesce(expires_at - make_interval(days => valid_days), now()) where status = ''used'' and activated_at is null;), then re-run', v_used_no_time;
    end if;
  end if;
end $$;

-- ============================================================
-- §1 — Columns
-- ============================================================
alter table public.promo_codes add column if not exists issued_at date;
alter table public.promo_codes alter column issued_at set default current_date;

alter table public.promo_codes add column if not exists contact jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'promo_codes_contact_is_object'
                    and conrelid = 'public.promo_codes'::regclass) then
    alter table public.promo_codes add constraint promo_codes_contact_is_object
      check (contact is null or jsonb_typeof(contact) = 'object');
  end if;
end $$;

alter table public.promo_codes add column if not exists subscription_id bigint;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'promo_codes_subscription_fkey'
                    and conrelid = 'public.promo_codes'::regclass) then
    alter table public.promo_codes add constraint promo_codes_subscription_fkey
      foreign key (subscription_id) references public.subscription(id) on delete set null;
  end if;
end $$;
create index if not exists idx_promo_codes_subscription on public.promo_codes (subscription_id);

-- An existing code's issue date: its created_at, when the dashboard gave the table one.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'promo_codes' and column_name = 'created_at') then
    execute $q$ update public.promo_codes set issued_at = created_at::date where issued_at is null and created_at is not null $q$;
  end if;
end $$;

-- ============================================================
-- Verification (run AFTER applying, in pre-prod)
-- ============================================================
-- 1. The three columns exist. Expect 3 rows: contact jsonb, issued_at date, subscription_id bigint.
--
--   select column_name, data_type from information_schema.columns
--    where table_schema = 'public' and table_name = 'promo_codes'
--      and column_name in ('issued_at', 'contact', 'subscription_id') order by 1;
--
-- 2. A contact that is not an object is refused. Expect: violates check constraint
--    "promo_codes_contact_is_object".
--
--   begin; update public.promo_codes set contact = '"x"' where id = (select id from public.promo_codes limit 1); rollback;
--
-- ============================================================
-- Rollback
-- ============================================================
--   alter table public.promo_codes drop column if exists subscription_id;
--   alter table public.promo_codes drop column if exists contact;
--   alter table public.promo_codes drop column if exists issued_at;
