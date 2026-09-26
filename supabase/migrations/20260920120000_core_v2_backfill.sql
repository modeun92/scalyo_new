-- SCALYO — core_v2, part 3/3: mirror the rows that already exist.
--
-- Requires parts 1 and 2 (20260920100000_core_v2_schema.sql, 20260920110000_core_v2_sync_triggers.sql).
-- The triggers of part 2 only see writes made from now on; this file runs the same logic once
-- over the existing rows so current data is not left in the old schema only.
--
-- IT REUSES THE TRIGGERS, IT DOES NOT COPY THEIR LOGIC. Two implementations of "how an organization
-- becomes a company" would drift, and the drift would be invisible until a re-sync disagreed with
-- the backfill. So:
--   * organizations / clients — a no-op `set name = name` UPDATE on the rows that are not mirrored
--     yet (organizations: no bridge value; clients: no company whose public_id is the row's id).
--     That fires the part-2 trigger, which creates the mirror. Rows already mirrored are not
--     touched, which is what makes a re-run safe.
--   * client_notes — the same, `set content = content`, on the notes that have no issue yet
--     (CORE-V2-NOTES). trg_notify_client_note is AFTER INSERT only: nobody is notified.
--   * people — core_v2_sync_user(user_id), the same function the profiles / organization_members
--     triggers call.
--   * subscription — one baseline row per organization that has none, so the history starts from
--     the plan the organization is on today.
--
-- SIDE EFFECT TO KNOW ABOUT: the no-op UPDATE also fires any other BEFORE UPDATE trigger on those
-- tables. If `organizations` / `clients` / `client_notes` carry an `updated_at` trigger, every backfilled row's
-- updated_at moves to the time of this run, once. Check for it first (§1) — and note that any
-- screen sorting or showing "last modified" will then show the backfill date for those rows.
--
-- Per-row error handling: one bad row is reported as a WARNING and skipped; it does not abort the
-- run. Re-run after fixing it. The closing report counts what is still unmirrored.
--
-- PRE-PROD (wxbape…) FIRST, PROD on an explicit go (R8). Idempotent.

-- ============================================================
-- §1 — Before you run it
-- ============================================================
-- 1.1 — Any updated_at trigger that the no-op UPDATE would fire? (Expect 0 rows, or accept the
--       one-time timestamp move.)
--
--   select event_object_table, trigger_name, action_statement
--   from information_schema.triggers
--   where event_object_schema = 'public'
--     and event_object_table in ('organizations', 'clients', 'client_notes')
--     and event_manipulation = 'UPDATE'
--     and trigger_name not like '%core_v2%';
--
-- 1.2 — How much will it create? (Just row counts; nothing to fix.)
--
--   select (select count(*) from public.organizations)                                        as orgs,
--          (select count(*) from public.profiles where organization_id is not null)           as people_in_orgs,
--          (select count(*) from public.clients
--            where organization_id is not null and lifecycle is distinct from 'prospect')     as clients,
--          (select count(*) from public.clients
--            where organization_id is not null and lifecycle = 'prospect')                    as prospects,
--          (select count(*) from public.client_notes)                                         as notes;

-- ============================================================
-- §2 — Backfill
-- ============================================================
-- Organizations first: people and clients both hang off the organization's bridge value.
update public.organizations
   set name = name
 where core_organization_id is null;

-- Baseline subscription history. issue_date is the time of THIS run: the old tables carry no
-- plan-change timestamp and a guessed one would be a plausible-looking lie (R21). An
-- organization whose plan has no subscription_type is skipped, as in the live trigger.
insert into public.subscription (organization_id, issue_date, type)
select o.core_organization_id, now(), public.core_v2_subscription_type(o.plan)
  from public.organizations o
 where o.core_organization_id is not null
   and public.core_v2_subscription_type(o.plan) is not null
   and not exists (
     select 1 from public.subscription s where s.organization_id = o.core_organization_id
   );

-- People. A person in an organization is the unit; one failing profile does not stop the rest.
do $$
declare
  r record;
  v_done integer := 0;
  v_failed integer := 0;
begin
  for r in
    select p.id from public.profiles p where p.organization_id is not null order by p.id
  loop
    begin
      perform public.core_v2_sync_user(r.id);
      v_done := v_done + 1;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'core_v2 backfill: profile % skipped: % (%)', r.id, sqlerrm, sqlstate;
    end;
  end loop;
  raise notice 'core_v2 backfill: % profiles processed, % failed', v_done, v_failed;
end $$;

-- Clients and prospects (the same as the live trigger: a company and a client group for every
-- row — status PROSPECT for a prospect — plus contacts, the CSM, and for a client the opening profit
-- row and churn). A row with no organization has nothing to attach to and is left out.
-- Runs AFTER the people step above: the CSM of a client is assigned only if that login is
-- already a member (and core_v2_sync_user also assigns it later, if the member appears after).
update public.clients c
   set name = name
 where c.organization_id is not null
   and not exists (select 1 from public.company co where co.public_id = c.id);

-- Notes, AFTER the clients: a note is attached to its client's client group, which must exist.
-- A note whose client has no mirror is left out, as that client is.
update public.client_notes n
   set content = content
 where exists (select 1 from public.company co where co.public_id = n.client_id)
   and not exists (select 1 from public.issue i
                    where i.description ->> 'source' = 'client_notes'
                      and i.description ->> 'note_id' = n.id::text);

-- ============================================================
-- §3 — Closing report
-- ============================================================
-- Counts what the run could NOT mirror. Everything here should be 0; a non-zero value means a
-- WARNING above explains it. People whose role is outside owner/admin/member/viewer are reported
-- on a separate NOTICE line and do not raise the "incomplete" warning: they are skipped on
-- purpose, and re-running cannot change that.
do $$
declare
  v_orgs integer;
  v_clients integer;
  v_prospects integer;
  v_notes integer;
  v_people integer;
  v_norole integer;
begin
  select count(*) into v_orgs
    from public.organizations o
   where o.core_organization_id is null;

  -- CORE-V2-PROSPECT: a client and a prospect are both a client group; what differs is the status.
  select count(*) filter (where c.lifecycle is distinct from 'prospect'),
         count(*) filter (where c.lifecycle = 'prospect')
    into v_clients, v_prospects
    from public.clients c
   where c.organization_id is not null
     and exists (select 1 from public.organizations o
                  where o.id = c.organization_id and o.core_organization_id is not null)
     and not exists (select 1 from public.company co
                       join public.client_group g on g.company_id = co.id
                      where co.public_id = c.id
                        and (g.status = 'PROSPECT') = (c.lifecycle is not distinct from 'prospect'));

  select count(*) into v_notes
    from public.client_notes n
   where exists (select 1 from public.company co where co.public_id = n.client_id)
     and not exists (select 1 from public.issue i
                      where i.description ->> 'source' = 'client_notes'
                        and i.description ->> 'note_id' = n.id::text);

  -- A person in an organization with a role core_v2_role_kind() does not recognise is NOT a
  -- failure: the sync refuses to guess a permission level, by design. They are counted apart, so
  -- that "incomplete" only ever means something a re-run can fix.
  select count(*) filter (where public.core_v2_role_kind(coalesce(nullif(om.role, ''), p.org_role)) is not null),
         count(*) filter (where public.core_v2_role_kind(coalesce(nullif(om.role, ''), p.org_role)) is null)
    into v_people, v_norole
    from public.profiles p
    join public.organizations o on o.id = p.organization_id
    left join public.organization_members om on om.organization_id = p.organization_id and om.user_id = p.id
   where o.core_organization_id is not null
     and not exists (select 1 from public.member m where m.auth_user_id = p.id)
     and not exists (select 1 from public.viewer v where v.auth_user_id = p.id);

  raise notice 'core_v2 backfill — unmirrored: % organizations, % clients, % prospects, % notes, % people', v_orgs, v_clients, v_prospects, v_notes, v_people;
  if v_norole > 0 then
    raise notice 'core_v2 backfill — % people skipped on purpose: in an organization with no recognised role (owner/admin/member/viewer)', v_norole;
  end if;
  if v_orgs + v_clients + v_prospects + v_notes + v_people > 0 then
    raise warning 'core_v2 backfill incomplete — see the WARNINGs above, fix, and re-run this file (it is idempotent)';
  end if;
end $$;

-- ============================================================
-- §4 — Verification (run AFTER applying, in pre-prod)
-- ============================================================
-- 4.1 — Every organization has a company + organization row. Expect 0.
--
--   select count(*) from public.organizations where core_organization_id is null;
--
-- 4.2 — Every client and prospect that belongs to an organization has a client group. Expect 0.
--
--   select count(*) from public.clients c
--    where c.organization_id is not null
--      and not exists (select 1 from public.company co join public.client_group g on g.company_id = co.id
--                       where co.public_id = c.id);
--
-- 4.3 — Prospects carry PROSPECT and a stage, clients do not (CORE-V2-PROSPECT), and no prospect
--       has an opening profit or churn row. Expect the two counts equal, then 0.
--
--   select (select count(*) from public.client_group where status = 'PROSPECT') as prospect_groups,
--          (select count(*) from public.clients where lifecycle = 'prospect' and organization_id is not null) as prospect_clients;
--
--   select count(*) from public.client_group g
--     join public.profit p on p.client_group_id = g.company_id and p.description ->> 'source' = 'clients.arr'
--    where g.status = 'PROSPECT';
--
-- 4.3b — Every note of a mirrored client is an issue (CORE-V2-NOTES). Expect the two counts equal.
--
--   select (select count(*) from public.issue where description ->> 'source' = 'client_notes') as note_issues,
--          (select count(*) from public.client_notes n
--            where exists (select 1 from public.company co where co.public_id = n.client_id)) as notes;
--
-- 4.4 — Every person in an organization has a member or viewer row and an ACTIVE worker row.
--       Expect 0 (a person with an unrecognised role is the only legitimate exception).
--
--   select p.id, p.org_role from public.profiles p
--   where p.organization_id is not null
--     and not exists (
--       select 1 from public.organization_worker w
--       join public.member m on m.personage_id = w.personage_id and m.auth_user_id = p.id
--       where w.job_status = 'ACTIVE'
--       union all
--       select 1 from public.organization_worker w
--       join public.viewer v on v.personage_id = w.personage_id and v.auth_user_id = p.id
--       where w.job_status = 'ACTIVE');
--
-- 4.5 — Role mapping. Expect manager = owners + admins, member = members, viewer = viewers.
--       Every manager holds VIEW, CREATE, UPDATE, DELETE, INVITE and ASSIGN_CLIENT_GROUP (6, plus
--       SEND_EMAIL when they may send email); every member holds VIEW, CREATE, UPDATE (plus
--       SEND_EMAIL when can_send_email); a viewer holds none. Per-authority head-count:
--
--   select a.authority, count(*) from public.member_authority a group by 1 order by 1;
--
--       and the DELETE / with_delete split by kind:
--
--   select case when mg.personage_id is not null then 'manager' else 'member' end as kind,
--          count(distinct m.personage_id) as people,
--          count(a.authority) filter (where a.authority = 'DELETE') as with_delete
--   from public.member m
--   left join public.manager mg on mg.personage_id = m.personage_id
--   left join public.member_authority a on a.member_id = m.personage_id
--   group by 1;
--
-- 4.6 — Every organization has its billing owner. Expect 0 (an organization whose owner never
--       joined it has none, and that is the honest answer).
--
--   select o.id from public.organizations o
--   join public.organization org on org.company_id = o.core_organization_id
--   where org.owner_personage_id is null;
--
-- 4.7 — Row counts line up: one company per organization + one per mirrored client.
--
--   select (select count(*) from public.company)      as companies,
--          (select count(*) from public.organization)  as organizations,
--          (select count(*) from public.client_group)  as client_groups;
--
-- 4.8 — Nothing existing broke. `node scripts/check-i18n.mjs` (no i18n touched), then by hand on
--       pre-prod: log in, onboard a fresh account, invite + accept a teammate, create / edit /
--       delete a client, change plan through a Stripe test webhook. No code changed — this checks
--       the triggers, not the app.

-- ============================================================
-- §5 — Rollback
-- ============================================================
-- The backfill only ADDS rows and sets bridge columns. To undo it, empty the mirror; the bridge
-- columns are ON DELETE SET NULL, so the old tables keep every row.
--
--   Drop the part-2 triggers first (part 2 §Rollback) or the next write re-creates the mirror. Then:
--
--   delete from public.subscription;
--   delete from public.profit;  delete from public.churn;  delete from public.issue;
--   delete from public.company;     -- cascades organization, client_group, organization_client_group,
--                                   -- organization_position, organization_worker
--   delete from public.personage;   -- cascades member, viewer, manager, member_authority, ...
--
--   DO NOT use `truncate ... cascade` here: organizations.core_organization_id is a foreign key
--   INTO these tables, so TRUNCATE CASCADE would also truncate the live `organizations` table.
--   `delete` fires ON DELETE SET NULL on the bridge column instead. issue / profit / churn are
--   ON DELETE RESTRICT: delete them first (the mirror writes profit and churn rows itself).
