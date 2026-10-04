-- SCALYO — the plan's seat ceiling, held by the database on every new seat (SEAT-CEILING).
--
-- Decided 03/10/2026: STARTER 3 seats, GROWTH 7, ELITE 24, ENTERPRISE no limit. A seat is a
-- non-viewer member, the owner included (ORG_SETTINGS.seatCountIncludesOwner). At the ceiling no
-- invitation can be sent (api/invite.js, which counts pending invitations as reserved seats) and none
-- can be accepted (api/invite/accept.js checks again before billing). This trigger is the second
-- check of the acceptance, the one that holds under concurrency: accept.js counts the members, then
-- inserts in another round trip, so two acceptances in the same second both counted N, both went
-- through, and a team with a ceiling of N + 1 ended at N + 2. Here the organization row is locked
-- before counting, so the second acceptance waits for the first and counts it.
--
-- plan_seat_ceiling() is a THIRD copy of maxSeats (src/config/plans.config.js and
-- functions/api/_config/plans.config.js): change all three together. An unknown plan gives 0, like
-- getMaxSeats (fail closed); NULL means no limit, like maxSeats: null.
--
-- Only a NEW seat is checked: inserting a non-viewer, turning a viewer into one, or moving a member to
-- another organization. A team already above its ceiling (after a downgrade) keeps everyone; it just
-- cannot grow. The error message starts with SEAT_LIMIT_REACHED, which accept.js (409
-- seat_limit_reached) and stores/team.addMember already recognise.
--
-- Independent of core_v2: it guards the old organization_members, which the app still writes. When
-- membership writes move to core_v2 (step C of retiring profiles + organization_members), the guard
-- moves with them.
--
-- PRE-PROD FIRST, PROD on an explicit go. Idempotent.

-- ============================================================
-- §0 — Pre-flight
-- ============================================================
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'organizations' and column_name = 'plan')
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'organization_members' and column_name = 'role') then
    raise exception 'seat ceiling: organizations.plan or organization_members.role not found';
  end if;
end $$;

-- ============================================================
-- §1 — The ceiling, and the guard
-- ============================================================
create or replace function public.plan_seat_ceiling(p_plan text)
returns integer
language sql
immutable
as $fn$
  select case lower(btrim(coalesce(p_plan, '')))
    when 'starter'    then 3
    when 'growth'     then 7
    when 'elite'      then 24
    when 'enterprise' then null
    else 0
  end;
$fn$;

create or replace function public.enforce_seat_ceiling()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_plan text;
  v_cap integer;
  v_used integer;
begin
  -- A viewer takes no seat; a role NULL counts as one, as `m.role !== 'viewer'` does in the API.
  if coalesce(new.role, 'member') = 'viewer' then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.role, 'member') <> 'viewer'
     and old.organization_id is not distinct from new.organization_id then
    return new;   -- already holding a seat here
  end if;

  select o.plan into v_plan from public.organizations o where o.id = new.organization_id for update;
  if not found then
    return new;   -- no such organization: not this guard's business
  end if;
  v_cap := public.plan_seat_ceiling(v_plan);
  if v_cap is null then
    return new;   -- no limit
  end if;

  select count(*) into v_used
    from public.organization_members m
   where m.organization_id = new.organization_id
     and coalesce(m.role, 'member') <> 'viewer'
     and m.id is distinct from new.id;
  if v_used >= v_cap then
    raise exception 'SEAT_LIMIT_REACHED: % of % seats taken on plan %', v_used, v_cap, v_plan
      using errcode = 'check_violation';
  end if;
  return new;
end;
$fn$;

revoke all on function public.enforce_seat_ceiling() from public, anon, authenticated;

drop trigger if exists trg_seat_ceiling on public.organization_members;
create trigger trg_seat_ceiling
  before insert or update of role, organization_id on public.organization_members
  for each row execute function public.enforce_seat_ceiling();

-- ============================================================
-- §2 — What is already above its ceiling (reported, not changed)
-- ============================================================
do $$
declare
  r record;
begin
  for r in
    select o.id, o.plan, count(*) as used, public.plan_seat_ceiling(o.plan) as cap
      from public.organizations o
      join public.organization_members m on m.organization_id = o.id and coalesce(m.role, 'member') <> 'viewer'
     group by o.id, o.plan
    having public.plan_seat_ceiling(o.plan) is not null and count(*) > public.plan_seat_ceiling(o.plan)
  loop
    raise notice 'seat ceiling: organization % (plan %) holds % seats for a ceiling of % — it keeps them, it cannot add more',
      r.id, r.plan, r.used, r.cap;
  end loop;
end $$;

-- ============================================================
-- Verification (run AFTER applying, in pre-prod)
-- ============================================================
-- 1. The trigger exists. Expect 1 row.
--
--   select tgname from pg_trigger where tgrelid = 'public.organization_members'::regclass and tgname = 'trg_seat_ceiling';
--
-- 2. A full starter team refuses a fourth member (in a transaction you roll back). Expect:
--    ERROR: SEAT_LIMIT_REACHED: 3 of 3 seats taken on plan starter
--
--   begin;
--   insert into public.organizations (id, name, owner_id, plan) values ('00000000-0000-0000-0000-0000000005ea', 'seat test', null, 'starter');
--   insert into public.organization_members (organization_id, user_id, role)
--     select '00000000-0000-0000-0000-0000000005ea', id, 'member' from auth.users limit 4;
--   rollback;
--
-- ============================================================
-- Rollback
-- ============================================================
--   drop trigger if exists trg_seat_ceiling on public.organization_members;
--   drop function if exists public.enforce_seat_ceiling(), public.plan_seat_ceiling(text);
