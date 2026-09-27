-- SCALYO — every login has its own organization (step A of retiring profiles + organization_members).
--
-- OWN-ORG (27/09/2026, decided): every account gets an organization of its own at signup, as owner.
-- Until now an ordinary signup had none — only an alpha code (/api/alpha/activate) created one — so
-- a solo user's plan, trial and Stripe ids lived on profiles, their clients carried
-- organization_id NULL, and core_v2 could not hold any of it: a clients row with no organization is
-- not mirrored at all, and a subscription row must belong to an organization. With one organization
-- per person, "a person is in exactly one organization" (organization_worker) holds with no
-- exception, the personal subscription becomes the organization's, and the org-less RLS branches
-- ("organization_id IS NULL and created_by = auth.uid()") stop being needed.
--
-- This step writes the OLD tables (organizations, organization_members, profiles); the core_v2
-- triggers mirror it. The app still reads the old tables, so nothing on screen changes except that
-- a solo account now shows its organization. Later steps: B reads and C writes move to core_v2,
-- D moves the billing fields to subscription, E drops profiles and organization_members.
--
-- WHAT IT DOES
--   * ensure_own_organization(user) — the one place that gives a person an organization: the name is
--     profiles.company_name, else the part of the e-mail before '@' (the convention
--     /api/alpha/activate used); plan starter, 1 seat — unless the profile carries a live Stripe
--     subscription, whose plan, seats and ids are copied (the organization's plan wins in the app, so
--     a paying solo user must not wake up on starter; same rule as 20260708220000's D2 backfill).
--     The person's org-less rows (their clients, chat, templates, notes, metrics, quotes, activity)
--     move into it (OWN-ORG-ADOPT).
--   * trg_zz_own_organization — AFTER INSERT on profiles, i.e. at signup (the profile row is created
--     by a trigger on auth.users that lives in the dashboard). Then, if the signup carried a promo
--     code in its metadata (raw_user_meta_data.promo_code), redeem_promo_code applies it to that
--     organization in the same transaction (PROMO-AT-SIGNUP) — replacing /api/alpha/activate, which
--     trusted a user id from the request body and had no authentication at all.
--   * switch_to_invited_organization(user, org, role) — invite acceptance in ONE transaction: an
--     EMPTY own organization is deleted and the person joins the inviting one (decided 27/09/2026);
--     an own organization that holds anything is refused ('own_organization_not_empty'), and so is
--     membership of somebody else's organization ('already_member_other_org').
--   * A backfill giving every org-less profile its own organization.
--
-- FAIL-OPEN at signup: an error in the trigger becomes a WARNING and the signup completes, as a solo
-- account, exactly as before this file. The drift check below lists such accounts; running
-- ensure_own_organization for them heals it.
--
-- ORDER
--   * Any time after the core_v2 files (if they are applied, the mirror follows; if not, nothing here
--     depends on them).
--   * BEFORE the front end that sends the promo code at signup instead of calling /api/alpha/activate
--     (stores/auth.register, RegisterView — PROMO-AT-SIGNUP). An old front end still calls
--     /api/alpha/activate, which this change deletes: deploy both together, migration first.
--   * The accept (functions/api/invite/accept.js) and member-removal (members/[id].js) changes call
--     the functions below: same deploy.
--
-- CHECK FIRST (pre-prod): the trigger that creates profiles on auth.users must be an AFTER INSERT
-- trigger in the same transaction as the signup — otherwise the promo metadata is still read
-- correctly, but a failure here cannot be tied to the signup in the logs:
--
--   select tgname, pg_get_triggerdef(t.oid) from pg_trigger t
--    where tgrelid = 'auth.users'::regclass and not tgisinternal;
--
-- PRE-PROD FIRST, PROD on an explicit go. Idempotent.

-- ============================================================
-- §0 — Pre-flight
-- ============================================================
do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.organizations') is null
     or to_regclass('public.organization_members') is null then
    raise exception 'own organization: profiles / organizations / organization_members not found';
  end if;
end $$;

-- ============================================================
-- §1 — Moving a person's org-less rows into their organization (OWN-ORG-ADOPT)
-- ============================================================
-- The same move 20260705230000 made for clients and chat when organizations arrived, for every table
-- whose RLS still has an "organization_id IS NULL" branch or whose rows are org-scoped. Each table is
-- checked first: several were created in the dashboard, and a column missing here must not stop a
-- signup. The creator column is compared as text — email_templates.created_by is text in some
-- environments (SCHEMA_FROM_CODE), uuid in others.
create or replace function public.own_org_adopt(p_user uuid, p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r record;
begin
  for r in
    select * from (values
      ('clients', 'user_id'), ('chat_channels', 'created_by'), ('chat_messages', 'user_id'),
      ('email_templates', 'created_by'), ('client_notes', 'author_id'), ('client_metrics', 'user_id'),
      ('quotes', 'user_id'), ('activity_log', 'user_id')
    ) as t(tbl, col)
  loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = r.tbl and column_name = 'organization_id')
       and exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = r.tbl and column_name = r.col) then
      execute format('update public.%I set organization_id = $1 where organization_id is null and %I::text = $2::text',
                     r.tbl, r.col)
        using p_org, p_user;
    end if;
  end loop;
end;
$fn$;

-- ============================================================
-- §2 — The one place a person gets their own organization
-- ============================================================
create or replace function public.ensure_own_organization(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  p record;
  j jsonb;
  v_org uuid;
  v_email text;
  v_name text;
  v_plan text := 'starter';
  v_seats integer := 1;
  v_sub text;
  v_cust text;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found then
    return null;
  end if;
  -- Read through jsonb: the billing columns were added in the dashboard and may differ by environment.
  j := to_jsonb(p);
  if nullif(j ->> 'organization_id', '') is not null then
    return (j ->> 'organization_id')::uuid;
  end if;

  select u.email into v_email from auth.users u where u.id = p_user;
  v_name := coalesce(nullif(btrim(j ->> 'company_name'), ''),
                     nullif(split_part(coalesce(v_email, ''), '@', 1), ''), '');

  -- A live Stripe subscription on the profile is copied; anything else starts on starter. A plan
  -- on the profile WITHOUT a subscription (an ended trial, a stale value) is not copied: the
  -- organization's plan wins in the app (stores/auth.currentPlan), so copying it would hand out that
  -- plan for good.
  v_sub := nullif(btrim(j ->> 'stripe_subscription_id'), '');
  if v_sub is not null and v_sub <> 'none'
     and j ->> 'plan' in ('starter', 'growth', 'elite', 'enterprise') then
    v_plan := j ->> 'plan';
    v_seats := greatest(1, coalesce(nullif(j ->> 'seats_paid', '')::integer, 1));
  else
    v_sub := null;
  end if;
  v_cust := nullif(btrim(j ->> 'stripe_customer_id'), '');

  insert into public.organizations (name, owner_id, plan, seats_paid, stripe_customer_id, stripe_subscription_id)
  values (v_name, p_user, v_plan, v_seats, v_cust, v_sub)
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, p_user, 'owner')
  on conflict do nothing;

  update public.profiles set organization_id = v_org, org_role = 'owner' where id = p_user;

  perform public.own_org_adopt(p_user, v_org);
  return v_org;
end;
$fn$;

-- ============================================================
-- §3 — A promo code, applied to the owner's organization (PROMO-AT-SIGNUP)
-- ============================================================
-- Returns 'applied', or why not: 'no_code' · 'no_organization' · 'not_owner' · 'invalid' (unknown,
-- or already used). The code is CLAIMED first — one UPDATE on a row locked with SKIP LOCKED — so two
-- signups with one code cannot both get it, and nothing is written for the loser. plan / max_seats
-- are read from promo_codes until subscription_id carries them (PROMO-TERMS, 20260927110000).
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

  select pc.id into v_id
    from public.promo_codes pc
   where pc.code = upper(btrim(p_code)) and pc.activated_at is null
   order by pc.id
   limit 1
   for update skip locked;
  if v_id is null then
    return 'invalid';
  end if;
  update public.promo_codes pc set activated_at = now() where pc.id = v_id
  returning to_jsonb(pc) into v_promo;

  v_days := nullif(v_promo ->> 'valid_days', '')::integer;
  update public.organizations o
     set plan = coalesce(nullif(v_promo ->> 'plan', ''), o.plan),
         seats_paid = coalesce(nullif(v_promo ->> 'max_seats', '')::integer, o.seats_paid),
         trial_ends_at = case when v_days is null then o.trial_ends_at else now() + make_interval(days => v_days) end
   where o.id = v_org;

  -- What /api/alpha/activate also did: the first 10 organizations are founding ones, and the person
  -- is marked an alpha tester. Both columns live in the dashboard; skipped where absent.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'organizations' and column_name = 'is_founding') then
    execute 'update public.organizations set is_founding = true
              where id = $1 and (select count(*) from public.organizations where is_founding) < 10'
      using v_org;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_alpha_tester') then
    execute 'update public.profiles set is_alpha_tester = true where id = $1' using p_user;
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

-- ============================================================
-- §4 — At signup: the organization, then the code
-- ============================================================
create or replace function public.own_org_on_profile_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_code text;
  v_result text;
begin
  begin
    perform public.ensure_own_organization(new.id);
  exception when others then
    raise warning 'own organization for % failed: % (%)', new.id, sqlerrm, sqlstate;
    return null;
  end;
  begin
    select u.raw_user_meta_data ->> 'promo_code' into v_code from auth.users u where u.id = new.id;
    if nullif(btrim(v_code), '') is not null then
      v_result := public.redeem_promo_code(new.id, v_code);
      if v_result <> 'applied' then
        raise warning 'promo code for % not applied: %', new.id, v_result;
      end if;
    end if;
  exception when others then
    raise warning 'promo code for % failed: % (%)', new.id, sqlerrm, sqlstate;
  end;
  return null;
end;
$fn$;

-- trg_zz_: after the core_v2 profile mirror, which then sees the organization on the UPDATE this makes.
drop trigger if exists trg_zz_own_organization on public.profiles;
create trigger trg_zz_own_organization
  after insert on public.profiles
  for each row execute function public.own_org_on_profile_insert();

-- ============================================================
-- §5 — Invite acceptance, in one transaction
-- ============================================================
-- Why an own organization is not empty, or NULL when it is: other members, clients or prospects,
-- quotes, e-mail templates, monthly metrics, client notes, invitations it sent that are still
-- pending, chat messages, or a live Stripe subscription. Leftovers that are not the person's work —
-- the automatic 'general' channel, revoked invitations, activity lines — do not count.
create or replace function public.own_org_busy(p_org uuid, p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r record;
  v_hit boolean;
  v_sub text;
begin
  if exists (select 1 from public.organization_members om
              where om.organization_id = p_org and om.user_id <> p_user) then
    return 'members';
  end if;
  select nullif(btrim(to_jsonb(o) ->> 'stripe_subscription_id'), '') into v_sub
    from public.organizations o where o.id = p_org;
  if v_sub is not null and v_sub <> 'none' then
    return 'subscription';
  end if;
  for r in
    select * from (values
      ('clients', ''), ('quotes', ''), ('email_templates', ''), ('client_metrics', ''),
      ('client_notes', ''), ('chat_messages', ''), ('invitations', ' and status = ''pending''')
    ) as t(tbl, extra)
  loop
    if to_regclass('public.' || r.tbl) is not null then
      execute format('select exists (select 1 from public.%I where organization_id = $1%s)', r.tbl, r.extra)
        into v_hit using p_org;
      if v_hit then
        return r.tbl;
      end if;
    end if;
  end loop;
  return null;
end;
$fn$;

create or replace function public.switch_to_invited_organization(p_user uuid, p_org uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cur uuid;
  v_owner uuid;
  v_name text;
  v_busy text;
  v_role text := coalesce(nullif(btrim(p_role), ''), 'member');
  r record;
begin
  select organization_id into v_cur from public.profiles where id = p_user for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'profile_not_found');
  end if;
  if v_cur = p_org then
    return jsonb_build_object('ok', true, 'already_member', true);
  end if;

  if v_cur is not null then
    select o.owner_id, o.name into v_owner, v_name from public.organizations o where o.id = v_cur;
    if v_owner is distinct from p_user then
      return jsonb_build_object('ok', false, 'code', 'already_member_other_org', 'current_organization', v_name);
    end if;
    v_busy := public.own_org_busy(v_cur, p_user);
    if v_busy is not null then
      return jsonb_build_object('ok', false, 'code', 'own_organization_not_empty',
                                'current_organization', v_name, 'reason', v_busy);
    end if;

    -- Empty: release it. The profile first (it references the organization), then what is left of
    -- the organization — the automatic channel, old invitations, activity lines — then the row.
    update public.profiles set organization_id = null, org_role = 'member' where id = p_user;
    delete from public.organization_members where organization_id = v_cur;
    for r in
      select * from (values ('chat_messages'), ('chat_channels'), ('invitations'), ('activity_log')) as t(tbl)
    loop
      if to_regclass('public.' || r.tbl) is not null then
        if r.tbl = 'chat_channels' and to_regclass('public.chat_channel_members') is not null then
          execute 'delete from public.chat_channel_members m using public.chat_channels c
                    where m.channel_id = c.id and c.organization_id = $1' using v_cur;
        end if;
        execute format('delete from public.%I where organization_id = $1', r.tbl) using v_cur;
      end if;
    end loop;
    delete from public.organizations where id = v_cur;
  end if;

  -- The seat-limit trigger may raise here: the whole call rolls back, the own organization included.
  insert into public.organization_members (organization_id, user_id, role)
  values (p_org, p_user, v_role);
  update public.profiles set organization_id = p_org, org_role = v_role where id = p_user;
  return jsonb_build_object('ok', true, 'released_organization', v_cur is not null);
end;
$fn$;

-- ============================================================
-- §6 — Who may call these
-- ============================================================
-- ensure_own_organization and switch_to_invited_organization are called by the Pages API with the
-- service role (members/[id].js, invite/accept.js), after it has verified the caller's token; they
-- take a user id, so a signed-in user must never reach them.
revoke all on function public.own_org_adopt(uuid, uuid)                           from public, anon, authenticated;
revoke all on function public.ensure_own_organization(uuid)                        from public, anon, authenticated;
revoke all on function public.redeem_promo_code(uuid, text)                        from public, anon, authenticated;
revoke all on function public.own_org_on_profile_insert()                          from public, anon, authenticated;
revoke all on function public.own_org_busy(uuid, uuid)                             from public, anon, authenticated;
revoke all on function public.switch_to_invited_organization(uuid, uuid, text)     from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.ensure_own_organization(uuid) to service_role;
    grant execute on function public.switch_to_invited_organization(uuid, uuid, text) to service_role;
  end if;
end $$;

-- ============================================================
-- §7 — Backfill: every org-less account gets its own organization
-- ============================================================
do $$
declare
  r record;
  v_done integer := 0;
  v_failed integer := 0;
begin
  for r in select p.id from public.profiles p where p.organization_id is null order by p.id loop
    begin
      perform public.ensure_own_organization(r.id);
      v_done := v_done + 1;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'own organization backfill: profile % skipped: % (%)', r.id, sqlerrm, sqlstate;
    end;
  end loop;
  raise notice 'own organization backfill: % created, % failed', v_done, v_failed;
end $$;

-- ============================================================
-- Verification (run AFTER applying, in pre-prod)
-- ============================================================
-- 1. Drift check — accounts with no organization. Expect 0 rows (run any time).
--
--   select p.id from public.profiles p where p.organization_id is null;
--
-- 2. Every organization has its owner as a member. Expect 0 rows.
--
--   select o.id from public.organizations o
--    where o.owner_id is not null
--      and not exists (select 1 from public.organization_members m
--                       where m.organization_id = o.id and m.user_id = o.owner_id);
--
-- 3. Nobody signed in can call the functions. As a user: expect permission denied.
--
--   select public.ensure_own_organization(auth.uid());
--
-- 4. By hand: sign up with an alpha code → the account lands in its own organization on the code's
--    plan, and the code is used; sign up through an invitation → the account ends in the inviting
--    organization and its own empty one is gone.
--
-- ============================================================
-- Rollback
-- ============================================================
-- The organizations created here stay (they hold the adopted rows); remove the mechanism only:
--
--   drop trigger if exists trg_zz_own_organization on public.profiles;
--   drop function if exists public.own_org_on_profile_insert(), public.switch_to_invited_organization(uuid, uuid, text),
--     public.own_org_busy(uuid, uuid), public.redeem_promo_code(uuid, text),
--     public.ensure_own_organization(uuid), public.own_org_adopt(uuid, uuid);
