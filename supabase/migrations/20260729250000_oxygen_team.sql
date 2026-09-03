-- OXYGEN LOT 4 — boucle équipe (contrat R23 validé 29/07/2026, questionnaire ×6)
-- Appliquée préprod (GO OXY-4-MIG-PREPROD 29/07) puis prod (GO au merge).
-- ① organizations.oxygen_team_enabled : gate légale AIPD — OFF par défaut,
--    activation = UPDATE SQL sous GO après rendu juridique. Jamais côté client.
-- ② Colonne ajoutée au trigger protect_org_billing_fields (self-grant impossible).
-- ③ oxygen_team_aggregate : SECURITY DEFINER (E14 — les tables oxygen sont RLS
--    self-only, la fonction est LE seul chemin d'agrégat), seuil n ≥ 5 LITTÉRAL
--    (jamais paramétrable), owner-only (profiles.org_role, aligné isOrgOwner),
--    fail-closed (flag OFF → 'disabled'), fenêtre 14 j + tendance vs 14 j
--    précédents (même seuil, sinon null). AUCUNE donnée individuelle en sortie.

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

  -- Garde appelant : owner de CETTE org uniquement
  if v_uid is null or not exists (
    select 1 from profiles pr
    where pr.id = v_uid and pr.organization_id = p_org and pr.org_role = 'owner'
  ) then return jsonb_build_object('status', 'forbidden'); end if;

  -- Gate légale : flag OFF → fail-closed
  select o.oxygen_team_enabled into v_enabled from organizations o where o.id = p_org;
  if not coalesce(v_enabled, false) then
    return jsonb_build_object('status', 'disabled');
  end if;

  -- n = contributeurs distincts (≥1 check-in, fenêtre courante). SEUIL : 5, littéral.
  select count(distinct c.user_id) into v_n
  from oxygen_checkins c
  where c.organization_id = p_org and c.date between v_cur_start and v_today;
  if v_n < 5 then return jsonb_build_object('status', 'insufficient'); end if;

  -- 10 jours ouvrés lun–ven par fenêtre de 14 j (convention affichée à l'écran)
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

  -- Fenêtre précédente : MÊME seuil, sinon tendance absente
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
