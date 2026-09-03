-- OXYGEN LOT 4 — team loop (contract R23 approved 29/07/2026, questionnaire × 6)
-- Applied on pre-prod (GO OXY-4-MIG-PREPROD 29/07) then prod (GO on merge).
-- ① organizations.oxygen_team_enabled: legal DPIA gate — OFF by default,
--    activation = SQL UPDATE under GO after legal review. Never client-side.
-- ② Column added to the protect_org_billing_fields trigger (self-grant impossible).
-- ③ oxygen_team_aggregate: SECURITY DEFINER (E14 — the oxygen tables are self-only
--    RLS, this function is THE only aggregation path), threshold n ≥ 5 LITERAL
--    (never parameterizable), owner-only (profiles.org_role, aligned with isOrgOwner),
--    fail-closed (flag OFF → 'disabled'), 14 d window + trend vs the previous 14 d
--    (same threshold, otherwise null). NO individual data in the output.

alter table public.organizations
  add column if not exists oxygen_team_enabled boolean not null default false;

create or replace function public.protect_org_billing_fields() returns trigger
language plpgsql as $$
begin
  if current_setting('role', true) = 'authenticated' then
    if new.plan is distinct from old.plan
       or new.seats_paid is distinct from old.seats_paid
       or new.trial_ends_at is distinct from old.trial_ends_at
       or new.stripe_customer_id is distinct from old.stripe_customer_id
       or new.stripe_subscription_id is distinct from old.stripe_subscription_id
       or new.max_clients is distinct from old.max_clients
       or new.is_founding is distinct from old.is_founding
       or new.owner_id is distinct from old.owner_id
       or new.oxygen_team_enabled is distinct from old.oxygen_team_enabled then
      raise exception 'org billing fields cannot be modified directly';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.oxygen_team_aggregate(p_org uuid)
returns jsonb
language plpgsql security definer stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_enabled boolean;
  v_today date := (now() at time zone 'utc')::date;
  v_cur_start date; v_prev_start date; v_prev_end date;
  v_workdays int; v_n int; v_n_prev int;
  v_cur jsonb; v_prev jsonb;
begin
  v_cur_start := v_today - 13; v_prev_end := v_today - 14; v_prev_start := v_today - 27;

  -- Caller guard: owner of THIS org only
  if v_uid is null or not exists (
    select 1 from profiles pr
    where pr.id = v_uid and pr.organization_id = p_org and pr.org_role = 'owner'
  ) then return jsonb_build_object('status', 'forbidden'); end if;

  -- Legal gate: flag OFF → fail-closed
  select o.oxygen_team_enabled into v_enabled from organizations o where o.id = p_org;
  if not coalesce(v_enabled, false) then
    return jsonb_build_object('status', 'disabled');
  end if;

  -- n = distinct contributors (≥ 1 check-in, current window). THRESHOLD: 5, literal.
  select count(distinct c.user_id) into v_n
  from oxygen_checkins c
  where c.organization_id = p_org and c.date between v_cur_start and v_today;
  if v_n < 5 then return jsonb_build_object('status', 'insufficient'); end if;

  -- 10 working days Mon–Fri per 14 d window (convention displayed on screen)
  select count(*) into v_workdays
  from generate_series(v_cur_start, v_today, interval '1 day') d
  where extract(isodow from d) between 1 and 5;

  select jsonb_build_object(
    'index_avg', round(avg(dy.index)::numeric, 1),
    'load_avg',  round(avg(dy.load_score)::numeric, 1),
    'closure_rate', round(100.0 * least((
        select count(distinct (r.user_id, r.date)) from oxygen_recoveries r
        where r.organization_id = p_org and r.kind = 'cloture' and r.completed
          and r.date between v_cur_start and v_today
          and r.user_id in (select c2.user_id from oxygen_checkins c2
                            where c2.organization_id = p_org
                              and c2.date between v_cur_start and v_today))::numeric
        / nullif(v_n * v_workdays, 0), 1.0), 0)
  ) into v_cur
  from oxygen_daily dy
  where dy.organization_id = p_org and dy.date between v_cur_start and v_today;

  -- Previous window: SAME threshold, otherwise no trend
  select count(distinct c.user_id) into v_n_prev
  from oxygen_checkins c
  where c.organization_id = p_org and c.date between v_prev_start and v_prev_end;
  if v_n_prev >= 5 then
    select jsonb_build_object(
      'index_avg', round(avg(dy.index)::numeric, 1),
      'load_avg',  round(avg(dy.load_score)::numeric, 1),
      'closure_rate', round(100.0 * least((
          select count(distinct (r.user_id, r.date)) from oxygen_recoveries r
          where r.organization_id = p_org and r.kind = 'cloture' and r.completed
            and r.date between v_prev_start and v_prev_end
            and r.user_id in (select c2.user_id from oxygen_checkins c2
                              where c2.organization_id = p_org
                                and c2.date between v_prev_start and v_prev_end))::numeric
          / nullif(v_n_prev * v_workdays, 0), 1.0), 0)
    ) into v_prev
    from oxygen_daily dy
    where dy.organization_id = p_org and dy.date between v_prev_start and v_prev_end;
  else v_prev := null; end if;

  return jsonb_build_object('status','ok','n',v_n,'window_days',14,'workdays',v_workdays,
                            'current',v_cur,'previous',v_prev);
end;
$$;

revoke all on function public.oxygen_team_aggregate(uuid) from public, anon;
grant execute on function public.oxygen_team_aggregate(uuid) to authenticated;
