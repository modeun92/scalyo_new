-- SCALYO — core_v2: who holds a seat, and how a manager changes a worker's job_status (JOB-STATUS).
--
-- Decided 03/10/2026: a seat is held by a MEMBER (managers included; a viewer never holds one) whose
-- job_status is neither ENDED — gone from the organization, the "quit" of the source model — nor
-- INACTIVE. ACTIVE and ON_LEAVE hold one. The ceiling is the plan's (SEAT-CEILING, 20261003110000:
-- starter 3, growth 7, elite 24, enterprise none), read from the organization's current subscription
-- period; no current period means no access, so no seat to give either.
--
-- A manager changes job_status through core_v2_set_job_status only: organization_worker has no user
-- write policy. Each restriction stops one way the logic would tangle:
--   * the caller is an ACTIVE manager, and only of their own organization (an AI session: refused);
--   * not their own status — INACTIVE or ON_LEAVE makes them read-only at once (no write asks for
--     anything but ACTIVE, JOB-STATUS-READ), and nobody might be left to undo it;
--   * not the billing owner's (organization.owner_personage_id), who pays and holds the organization;
--   * never to or from ENDED. Leaving is the removal (DELETE /api/members/[id]), which takes the
--     Stripe seat back and the membership away; ENDED written here would leave both behind. An ENDED
--     worker comes back only through an invitation, whose acceptance bills the seat;
--   * a change that makes a member hold a seat again (INACTIVE -> ACTIVE / ON_LEAVE) is checked
--     against the ceiling with the organization row locked, so two reactivations at once cannot both
--     take the last seat. ACTIVE <-> ON_LEAVE and anything -> INACTIVE take no new seat.
-- Answers {"ok": true, ...} or {"ok": false, "code": ...}, codes the front end translates:
-- not_manager · worker_not_found · own_status · owner_status · status_not_allowed · ended_worker ·
-- seat_limit_reached (with seats_used / seats_cap).
--
-- core_v2_seats_taken counts reserved seats the way /api/invite does: the members holding a seat plus
-- the pending, unexpired, non-viewer invitations (still the old `invitations` table, keyed by the old
-- organization id) — a reactivation must not take a seat an invitation already holds.
--
-- TRANSITION. No screen calls this yet, and the old tables have no job_status. Until the membership
-- screens read core_v2 (steps B / C of retiring profiles + organization_members), the live seat count
-- (invite.js, invite/accept.js, trg_seat_ceiling) still counts an INACTIVE worker's membership:
-- stricter than this rule, never looser, so the ceiling cannot be passed through the gap. The mirror
-- keeps a manager's INACTIVE / ON_LEAVE (core_v2_sync_user, JOB-STATUS). Billing is not touched here:
-- whether an INACTIVE worker stops being billed is still open.
--
-- Requires the core_v2 files (20260920100000 / 110000 / 120000) and 20261003110000. PRE-PROD FIRST,
-- PROD on an explicit go. Idempotent.

-- ============================================================
-- §0 — Pre-flight
-- ============================================================
do $$
begin
  if to_regclass('public.organization_worker') is null
     or to_regprocedure('public.core_v2_current_subscription(bigint)') is null then
    raise exception 'job status: apply the core_v2 files first';
  end if;
  if to_regprocedure('public.plan_seat_ceiling(text)') is null then
    raise exception 'job status: apply 20261003110000_seat_ceiling_guard.sql first';
  end if;
end $$;

-- ============================================================
-- §1 — Seats taken, and the ceiling
-- ============================================================
create or replace function public.core_v2_seats_taken(p_org bigint)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_workers integer;
  v_invited integer := 0;
begin
  select count(*) into v_workers
    from public.organization_worker w
    join public.member m on m.personage_id = w.personage_id
   where w.organization_id = p_org
     and w.job_status not in ('ENDED', 'INACTIVE');
  if to_regclass('public.invitations') is not null and to_regclass('public.organizations') is not null then
    execute $q$
      select count(*)
        from public.invitations i
        join public.organizations o on o.id = i.organization_id
       where o.core_organization_id = $1
         and i.status = 'pending'
         and coalesce(i.role, 'member') <> 'viewer'
         and (i.expires_at is null or i.expires_at > now())
    $q$ into v_invited using p_org;
  end if;
  return v_workers + v_invited;
end;
$fn$;

-- NULL = no limit (enterprise). 0 when there is no current period: no access, no seat to give.
create or replace function public.core_v2_seat_ceiling(p_org bigint)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_cur public.subscription;
begin
  v_cur := public.core_v2_current_subscription(p_org);
  if v_cur.id is null then
    return 0;
  end if;
  return public.plan_seat_ceiling(v_cur.type::text);
end;
$fn$;

-- ============================================================
-- §2 — A manager changes a worker's job_status
-- ============================================================
create or replace function public.core_v2_set_job_status(p_personage_id bigint, p_status public.job_status)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_me bigint := public.core_v2_personage_id();
  v_org bigint;
  v_owner bigint;
  v_w public.organization_worker;
  v_cap integer;
  v_used integer;
begin
  -- An AI (MCP) session never changes who works here (20260914130000).
  if to_regprocedure('public.mcp_guard()') is not null then
    perform public.mcp_guard();
  end if;

  select o into v_org from public.core_v2_my_org_ids() as o limit 1;
  if v_org is null or not public.core_v2_is_manager(v_org) then
    return jsonb_build_object('ok', false, 'code', 'not_manager');
  end if;
  if p_status is null or p_status = 'ENDED' then
    return jsonb_build_object('ok', false, 'code', 'status_not_allowed');
  end if;

  -- Every seat decision for this organization goes through its row.
  select og.owner_personage_id into v_owner from public.organization og where og.company_id = v_org for update;
  select * into v_w from public.organization_worker w
   where w.organization_id = v_org and w.personage_id = p_personage_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'worker_not_found');
  end if;
  if p_personage_id = v_me then
    return jsonb_build_object('ok', false, 'code', 'own_status');
  end if;
  if p_personage_id = v_owner then
    return jsonb_build_object('ok', false, 'code', 'owner_status');
  end if;
  if v_w.job_status = 'ENDED' then
    return jsonb_build_object('ok', false, 'code', 'ended_worker');
  end if;
  if v_w.job_status = p_status then
    return jsonb_build_object('ok', true, 'job_status', p_status, 'unchanged', true);
  end if;

  -- A member holding a seat again: within the ceiling, or not at all.
  if v_w.job_status = 'INACTIVE' and p_status in ('ACTIVE', 'ON_LEAVE')
     and exists (select 1 from public.member m where m.personage_id = p_personage_id) then
    v_cap := public.core_v2_seat_ceiling(v_org);
    if v_cap is not null then
      v_used := public.core_v2_seats_taken(v_org);
      if v_used >= v_cap then
        return jsonb_build_object('ok', false, 'code', 'seat_limit_reached', 'seats_used', v_used, 'seats_cap', v_cap);
      end if;
    end if;
  end if;

  update public.organization_worker set job_status = p_status
   where organization_id = v_org and personage_id = p_personage_id;
  return jsonb_build_object('ok', true, 'job_status', p_status);
end;
$fn$;

revoke all on function public.core_v2_seats_taken(bigint)                         from public, anon, authenticated;
revoke all on function public.core_v2_seat_ceiling(bigint)                        from public, anon, authenticated;
revoke all on function public.core_v2_set_job_status(bigint, public.job_status)   from public, anon;
grant execute on function public.core_v2_set_job_status(bigint, public.job_status) to authenticated;

-- ============================================================
-- Verification (run AFTER applying, in pre-prod)
-- ============================================================
-- 1. The functions exist. Expect 3 rows.
--
--   select proname from pg_proc where proname in ('core_v2_seats_taken', 'core_v2_seat_ceiling', 'core_v2_set_job_status');
--
-- 2. Seats taken per organization against its ceiling (a reading, nothing to fix; an organization
--    above its ceiling after a downgrade keeps everyone and cannot grow):
--
--   select o.company_id, public.core_v2_seats_taken(o.company_id) as taken, public.core_v2_seat_ceiling(o.company_id) as ceiling
--     from public.organization o order by 1;
--
-- ============================================================
-- Rollback
-- ============================================================
--   drop function if exists public.core_v2_set_job_status(bigint, public.job_status),
--     public.core_v2_seat_ceiling(bigint), public.core_v2_seats_taken(bigint);
