-- SCALYO — promo_codes, 1/2: add issued_at, contact and subscription_id; check the data the next
-- step relies on.
--
-- Decided 27/09/2026. promo_codes keeps id, code, valid_days, activated_at, plan, max_seats and gains:
--   issued_at        date   when the code was handed out. Default today for a new code; an existing
--                           code takes the date of its created_at when the table has one, and stays
--                           NULL otherwise — an unknown date is not guessed (R21).
--   contact          jsonb  who the code was handed to, free form (e.g. {"name", "email", "company"}).
--                           jsonb, not json: the same text, but comparable and indexable.
--   subscription_id  bigint the subscription whose terms the code grants — the plan and seats will be
--                           read through it (decided 27/09/2026). FK to the core_v2 subscription table.
-- and loses status, organization_id and expires_at in part 2 (20260927120000).
--
-- PROMO-TERMS (27/09/2026): plan and max_seats are NOT dropped yet. redeem_promo_code
-- (20260927130000, at signup) copies them into organizations.plan (NOT NULL) and seats_paid; subscription_id is where they will come from,
-- but nothing can fill it yet: a core_v2 subscription row belongs to an organization
-- (organization_id NOT NULL), and a code is handed out before its organization exists. That is for
-- the subscription-information table (seats, plan tier, TRIAL) to settle; plan and max_seats go with
-- the migration that makes activation read subscription_id. Dropping them now would stop every alpha
-- signup at the organization insert.
--
-- ON DELETE RESTRICT on subscription_id: a code must not silently lose the terms it grants. Deleting
-- an organization in core_v2 deletes its subscription rows (part 2 of core_v2); a code pointing at one
-- of them makes that mirror delete fail with a WARNING, and the old delete still goes through.
--
-- ORDER
--   * AFTER 20260920100000_core_v2_schema.sql (the subscription table) — this file refuses otherwise.
--   * BEFORE the API that reads activated_at instead of status (functions/api/alpha, PROMO-USED): §0
--     refuses to run on data that API would misread, so run it first and fix what it reports.
--   * Part 2 (20260927120000) AFTER that API is live.
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
      foreign key (subscription_id) references public.subscription(id) on delete restrict;
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
