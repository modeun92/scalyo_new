-- SCALYO — core_v2: projects and tasks (stage T1: the database). Written 04/10/2026.
--
-- Decided 04/10/2026 (owner of this change): the old `projects` (a user's name / colour / status) and
-- `tasks` (30 columns) are REPLACED by the model below — project, milestone, task, task_assignee and
-- three per-organization lookups (task_status, task_difficulty, task_urgency). Also decided:
--   * task.project_id stays NOT NULL: a task always belongs to a project. A task with no project
--     cannot be created any more (client tasks, onboarding, playbooks change in T2);
--   * of the old task columns with no home in the model, only the client link and the tags are kept
--     (task.client_group_id, task.tags). importance, actual_hours, priority, finished / pended,
--     level, task_type, colour are NOT carried;
--   * a milestone belongs to the organization, not to a project (as the model has it).
--
-- Deviations from the model as handed over, each because the literal text cannot run or breaks a
-- flow that exists today (CORE-V2-TASK-DDL):
--   1. `organization(id)` -> organization(company_id) and `member(id)` -> member(personage_id): those
--      are the core_v2 keys; neither table has an `id` column.
--   2. `status_id ... references job_status(...)` (task and milestone) -> task_status. job_status is
--      the core_v2 ENUM of a worker's employment state, not a table; task_status is the lookup the
--      model defines and nothing else references.
--   3. Tables created in dependency order (the model created task before milestone and the lookups).
--   4. created_by is NULLABLE, ON DELETE SET NULL (project, milestone, task), and assigned_by too.
--      A NOT NULL foreign key with no action would make a member who created anything impossible to
--      erase (personage -> member cascades) and impossible to turn into a viewer (that deletes the
--      member row) — the same call as email_templates.created_by (27/09/2026). The column defaults
--      to the caller, and the insert policies require it to be the caller.
--   5. task.organization_id ON DELETE CASCADE (project and milestone already cascade): with no
--      action, an organization holding tasks could not be deleted at all.
--   6. task.parent_task_id is checked against the SAME organization ((organization_id, parent_task_id)
--      -> task(organization_id, id), unique (organization_id, id) added): the model's single-column
--      key let a sub-task hang under another company's task.
--   7. task.milestone_id is set NULL when its milestone is deleted (the model had no action).
--   8. task_assignee.member_id ON DELETE CASCADE: the assignment goes with the member.
--   9. task_status gets sort_order like the two other lookups: the Kanban needs its column order,
--      and rows seeded in one statement share created_at.
-- Added by decision: task.client_group_id (-> client_group(company_id), the 26/09/2026 rule for client
-- references) and task.tags (text[]).
--
-- The lookups are seeded for every organization — now, and for each new one (trigger on
-- organization): status todo / in_progress / blocked / done (the Kanban's persisted values);
-- difficulty very_easy..very_hard and urgency very_low..critical, sort_order 1..5 = the old 1..5 scale.
-- The texts are persisted KEYS the app translates (CODE_STYLE: persisted values are never
-- translated); an organization may add its own.
--
-- Access (RLS): an organization's workers READ (INACTIVE / ON_LEAVE included, JOB-STATUS-READ); a
-- write needs the caller's own authority in that organization (core_v2_has_authority: ACTIVE only) —
-- CREATE to insert, UPDATE to update, DELETE to delete (managers), or, for a member, deleting what they
-- created. The lookups are managers' to change. An AI (MCP) session reads and never writes
-- (RESTRICTIVE mcp_no_*, as for issue / profit / churn).
--
-- Moving the data: core_v2_backfill_project_task() copies the old rows, keeping their ids. It is
-- INSERT-only and idempotent: run it at apply time, and once more right after the T2 front end is
-- live, to pick up rows the old front end CREATED in between (an EDIT made there in between is not
-- carried). A task with no project, or whose project could not be moved, goes into one imported-tasks
-- project per organization (TASK-IMPORTED, decided 04/10/2026). Not carried, and counted in the
-- NOTICEs: a project whose creator is not in core_v2, a task with no organization to put it in, an
-- assignee that is not a member of the task's organization (old rows hold a name there). A sub-task
-- checklist item (tasks.subtasks) becomes a child task (parent_task_id), the model's way of holding
-- one. The old tables are NOT touched; their drop is a later migration, after T2.
--
-- ORDER. After the core_v2 files and 20261004110000. Before the T2 front end. PRE-PROD FIRST, PROD on
-- an explicit go. Idempotent. Tested 04/10/2026 on PostgreSQL 18.3 (PGlite) — see the header checks.

-- ============================================================
-- §0 — Pre-flight
-- ============================================================
do $$
begin
  if to_regclass('public.organization') is null or to_regclass('public.member') is null
     or to_regclass('public.client_group') is null or to_regprocedure('public.core_v2_has_authority(bigint, public.authority)') is null then
    raise exception 'project/task: apply the core_v2 files (20260920100000..120000) first';
  end if;
end $$;

-- ============================================================
-- §1 — Lookups, per organization
-- ============================================================
create table if not exists public.task_status (
  id uuid primary key default gen_random_uuid(),
  organization_id bigint not null references public.organization(company_id) on delete cascade,
  text text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint uq_task_status_organization_text unique (organization_id, text),
  constraint uq_task_status_organization_id unique (organization_id, id)
);

create table if not exists public.task_difficulty (
  id uuid primary key default gen_random_uuid(),
  organization_id bigint not null references public.organization(company_id) on delete cascade,
  text text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint uq_task_difficulty_organization_text unique (organization_id, text),
  constraint uq_task_difficulty_organization_id unique (organization_id, id)
);

create table if not exists public.task_urgency (
  id uuid primary key default gen_random_uuid(),
  organization_id bigint not null references public.organization(company_id) on delete cascade,
  text text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint uq_task_urgency_organization_text unique (organization_id, text),
  constraint uq_task_urgency_organization_id unique (organization_id, id)
);

-- ============================================================
-- §2 — Project, milestone, task, assignee
-- ============================================================
create table if not exists public.project (
  id uuid primary key default gen_random_uuid(),
  organization_id bigint not null references public.organization(company_id) on delete cascade,
  created_by bigint default public.core_v2_personage_id() references public.member(personage_id) on delete set null,
  title text not null,
  description jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_project_organization_id unique (organization_id, id)
);

create table if not exists public.milestone (
  id uuid primary key default gen_random_uuid(),
  organization_id bigint not null references public.organization(company_id) on delete cascade,
  created_by bigint default public.core_v2_personage_id() references public.member(personage_id) on delete set null,
  status_id uuid,
  title text not null,
  description jsonb not null default '{}'::jsonb,
  start_at timestamptz,
  target_at timestamptz,
  completed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fk_milestone_status foreign key (organization_id, status_id) references public.task_status(organization_id, id),
  constraint uq_milestone_organization_id unique (organization_id, id)
);

create table if not exists public.task (
  id uuid primary key default gen_random_uuid(),
  organization_id bigint not null references public.organization(company_id) on delete cascade,
  project_id uuid not null,
  milestone_id uuid,
  parent_task_id uuid,
  status_id uuid,
  difficulty_id uuid,
  urgency_id uuid,
  client_group_id bigint references public.client_group(company_id) on delete set null,
  created_by bigint default public.core_v2_personage_id() references public.member(personage_id) on delete set null,
  title text not null,
  description jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  expected_duration interval,
  min_duration interval,
  max_duration interval,
  start_at timestamptz,
  due_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_task_organization_id unique (organization_id, id),
  constraint fk_task_project foreign key (organization_id, project_id) references public.project(organization_id, id),
  constraint fk_task_milestone foreign key (organization_id, milestone_id) references public.milestone(organization_id, id)
    on delete set null (milestone_id),
  constraint fk_task_status foreign key (organization_id, status_id) references public.task_status(organization_id, id),
  constraint fk_task_difficulty foreign key (organization_id, difficulty_id) references public.task_difficulty(organization_id, id),
  constraint fk_task_urgency foreign key (organization_id, urgency_id) references public.task_urgency(organization_id, id),
  constraint fk_task_parent foreign key (organization_id, parent_task_id) references public.task(organization_id, id)
    on delete cascade,
  constraint chk_task_not_self_parent check (id <> parent_task_id),
  constraint chk_task_duration_range check (min_duration is null or max_duration is null or min_duration <= max_duration)
);

create table if not exists public.task_assignee (
  task_id uuid not null references public.task(id) on delete cascade,
  member_id bigint not null references public.member(personage_id) on delete cascade,
  assigned_by bigint default public.core_v2_personage_id() references public.member(personage_id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (task_id, member_id)
);

create index if not exists idx_project_organization on public.project (organization_id, created_at desc);
create index if not exists idx_task_project on public.task (organization_id, project_id, sort_order);
create index if not exists idx_task_parent on public.task (parent_task_id) where parent_task_id is not null;
create index if not exists idx_task_client_group on public.task (client_group_id) where client_group_id is not null;
create index if not exists idx_task_assignee_member on public.task_assignee (member_id);

-- updated_at follows every update.
create or replace function public.core_v2_touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

do $$
declare
  t text;
begin
  foreach t in array array['project', 'milestone', 'task'] loop
    execute format('drop trigger if exists trg_core_v2_touch_%s on public.%I', t, t);
    execute format('create trigger trg_core_v2_touch_%s before update on public.%I for each row execute function public.core_v2_touch_updated_at()', t, t);
  end loop;
end $$;

-- ============================================================
-- §3 — The default lookups of every organization
-- ============================================================
create or replace function public.core_v2_seed_task_lookups(p_org bigint)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.task_status (organization_id, text, sort_order)
  select p_org, x.text, x.ord from (values ('todo', 0), ('in_progress', 1), ('blocked', 2), ('done', 3)) as x(text, ord)
  on conflict (organization_id, text) do nothing;
  insert into public.task_difficulty (organization_id, text, sort_order)
  select p_org, x.text, x.ord from (values ('very_easy', 1), ('easy', 2), ('medium', 3), ('hard', 4), ('very_hard', 5)) as x(text, ord)
  on conflict (organization_id, text) do nothing;
  insert into public.task_urgency (organization_id, text, sort_order)
  select p_org, x.text, x.ord from (values ('very_low', 1), ('low', 2), ('medium', 3), ('high', 4), ('critical', 5)) as x(text, ord)
  on conflict (organization_id, text) do nothing;
end;
$fn$;

create or replace function public.core_v2_organization_seed_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform public.core_v2_seed_task_lookups(new.company_id);
  return new;
end;
$fn$;

drop trigger if exists trg_core_v2_organization_seed_tasks on public.organization;
create trigger trg_core_v2_organization_seed_tasks
  after insert on public.organization
  for each row execute function public.core_v2_organization_seed_tasks();

do $$
declare
  r record;
begin
  for r in select company_id from public.organization loop
    perform public.core_v2_seed_task_lookups(r.company_id);
  end loop;
end $$;

-- ============================================================
-- §4 — Row-level security
-- ============================================================
alter table public.task_status enable row level security;
alter table public.task_difficulty enable row level security;
alter table public.task_urgency enable row level security;
alter table public.project enable row level security;
alter table public.milestone enable row level security;
alter table public.task enable row level security;
alter table public.task_assignee enable row level security;

grant select, insert, update, delete on public.task_status, public.task_difficulty, public.task_urgency,
  public.project, public.milestone, public.task, public.task_assignee to authenticated;

-- Lookups: read by the organization, changed by its managers.
do $$
declare
  t text;
begin
  foreach t in array array['task_status', 'task_difficulty', 'task_urgency'] loop
    execute format('drop policy if exists %I on public.%I', 'core_v2_' || t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (organization_id in (select public.core_v2_my_org_ids()))',
                   'core_v2_' || t || '_select', t);
    execute format('drop policy if exists %I on public.%I', 'core_v2_' || t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.core_v2_is_manager(organization_id)) with check (public.core_v2_is_manager(organization_id))',
                   'core_v2_' || t || '_write', t);
  end loop;
end $$;

-- Project and milestone: read by the organization; created by a holder of CREATE, as themselves;
-- updated with UPDATE; deleted with DELETE, or by their creator while they may still create.
do $$
declare
  t text;
begin
  foreach t in array array['project', 'milestone'] loop
    execute format('drop policy if exists %I on public.%I', 'core_v2_' || t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (organization_id in (select public.core_v2_my_org_ids()))',
                   'core_v2_' || t || '_select', t);
    execute format('drop policy if exists %I on public.%I', 'core_v2_' || t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (
                      public.core_v2_has_authority(organization_id, ''CREATE'') and created_by = public.core_v2_personage_id())',
                   'core_v2_' || t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', 'core_v2_' || t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated
                      using (public.core_v2_has_authority(organization_id, ''UPDATE''))
                      with check (public.core_v2_has_authority(organization_id, ''UPDATE''))',
                   'core_v2_' || t || '_update', t);
    execute format('drop policy if exists %I on public.%I', 'core_v2_' || t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (
                      public.core_v2_has_authority(organization_id, ''DELETE'')
                      or (created_by = public.core_v2_personage_id() and public.core_v2_has_authority(organization_id, ''CREATE'')))',
                   'core_v2_' || t || '_delete', t);
  end loop;
end $$;

-- Task: the same, and its client group must be one its organization owns (a foreign key cannot say
-- that: organization_client_group is the link).
drop policy if exists core_v2_task_select on public.task;
create policy core_v2_task_select on public.task for select to authenticated
  using (organization_id in (select public.core_v2_my_org_ids()));

drop policy if exists core_v2_task_insert on public.task;
create policy core_v2_task_insert on public.task for insert to authenticated
  with check (
    public.core_v2_has_authority(organization_id, 'CREATE')
    and created_by = public.core_v2_personage_id()
    and (client_group_id is null or exists (select 1 from public.organization_client_group ocg
                                             where ocg.client_group_id = task.client_group_id
                                               and ocg.organization_id = task.organization_id))
  );

drop policy if exists core_v2_task_update on public.task;
create policy core_v2_task_update on public.task for update to authenticated
  using (public.core_v2_has_authority(organization_id, 'UPDATE'))
  with check (
    public.core_v2_has_authority(organization_id, 'UPDATE')
    and (client_group_id is null or exists (select 1 from public.organization_client_group ocg
                                             where ocg.client_group_id = task.client_group_id
                                               and ocg.organization_id = task.organization_id))
  );

drop policy if exists core_v2_task_delete on public.task;
create policy core_v2_task_delete on public.task for delete to authenticated
  using (public.core_v2_has_authority(organization_id, 'DELETE')
         or (created_by = public.core_v2_personage_id() and public.core_v2_has_authority(organization_id, 'CREATE')));

-- Assignees: read with the task; assigned and unassigned by whoever may update the task, and only a
-- worker of the task's own organization can be assigned (the model's member key alone let anyone be).
drop policy if exists core_v2_task_assignee_select on public.task_assignee;
create policy core_v2_task_assignee_select on public.task_assignee for select to authenticated
  using (exists (select 1 from public.task t where t.id = task_assignee.task_id
                   and t.organization_id in (select public.core_v2_my_org_ids())));

drop policy if exists core_v2_task_assignee_insert on public.task_assignee;
create policy core_v2_task_assignee_insert on public.task_assignee for insert to authenticated
  with check (
    exists (select 1 from public.task t
              join public.organization_worker w on w.organization_id = t.organization_id
                                               and w.personage_id = task_assignee.member_id
                                               and w.job_status <> 'ENDED'
             where t.id = task_assignee.task_id
               and public.core_v2_has_authority(t.organization_id, 'UPDATE'))
    and assigned_by = public.core_v2_personage_id()
  );

drop policy if exists core_v2_task_assignee_delete on public.task_assignee;
create policy core_v2_task_assignee_delete on public.task_assignee for delete to authenticated
  using (exists (select 1 from public.task t where t.id = task_assignee.task_id
                   and public.core_v2_has_authority(t.organization_id, 'UPDATE')));

-- An AI (MCP) session reads and never writes (same RESTRICTIVE pattern as issue / profit / churn).
do $$
declare
  t text;
  verb text;
begin
  if to_regprocedure('public.is_mcp_session()') is null then
    raise warning 'project/task: public.is_mcp_session() not found — apply 20260914120000 and re-run, or an AI session can write these tables';
    return;
  end if;
  foreach t in array array['task_status', 'task_difficulty', 'task_urgency', 'project', 'milestone', 'task', 'task_assignee'] loop
    foreach verb in array array['insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', 'mcp_no_' || verb || '_' || t, t);
      if verb = 'insert' then
        execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (not public.is_mcp_session())',
                       'mcp_no_insert_' || t, t);
      else
        execute format('create policy %I on public.%I as restrictive for %s to authenticated using (not public.is_mcp_session())',
                       'mcp_no_' || verb || '_' || t, t, verb);
      end if;
    end loop;
  end loop;
end $$;

-- ============================================================
-- §4b — "My tasks", one definition for the AI context and the MCP tool
-- ============================================================
-- MCP-TASKS-SELF (14/09/2026, carried over): the caller's own tasks — the ones they created or are
-- assigned to — never the organization's. SECURITY INVOKER: it reads under the caller's own RLS, so it
-- can show nothing their token could not read anyway, which is why the MCP Worker may call it
-- (MCP-RPC-ALLOWLIST). No description, no durations, no difficulty: free-form prose and the
-- estimation that feeds Oxygen stay out of what an external AI client receives. The client is given
-- by its client-screen id (company.public_id), the one the app's links use.
create or replace function public.core_v2_my_tasks()
returns table (id uuid, title text, status text, urgency integer, due_at timestamptz, project_id uuid,
               client_id uuid, assigned_to_me boolean, created_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $fn$
  select t.id, t.title, s.text, u.sort_order, t.due_at, t.project_id,
         (select c.public_id from public.company c where c.id = t.client_group_id),
         exists (select 1 from public.task_assignee a where a.task_id = t.id and a.member_id = public.core_v2_personage_id()),
         t.created_at
    from public.task t
    left join public.task_status s on s.id = t.status_id
    left join public.task_urgency u on u.id = t.urgency_id
   where t.created_by = public.core_v2_personage_id()
      or exists (select 1 from public.task_assignee a where a.task_id = t.id and a.member_id = public.core_v2_personage_id())
   order by t.due_at nulls last, t.id
   limit 1000;
$fn$;
revoke all on function public.core_v2_my_tasks() from public, anon;
grant execute on function public.core_v2_my_tasks() to authenticated;

-- ============================================================
-- §5 — Moving the old rows (INSERT-only, idempotent; ids kept)
-- ============================================================
-- A calendar date (the old date columns) becomes NOON UTC of that day (TASK-DATE-NOON): the model
-- stores instants, and noon is the same calendar day everywhere from UTC-11 to UTC+11. Midnight UTC
-- would show the day before to every user west of Greenwich.
create or replace function public.core_v2_task_date(p jsonb, p_key text)
returns timestamptz
language plpgsql
immutable
as $fn$
declare
  v text := nullif(btrim(p ->> p_key), '');
begin
  if v is null then
    return null;
  end if;
  return (left(v, 10)::date + time '12:00') at time zone 'UTC';
exception when others then
  return null;   -- not a date: nothing, never a guessed one (R21)
end;
$fn$;

-- An old 1..5 value (stored as text or number) -> the lookup of that sort_order.
create or replace function public.core_v2_task_level(p jsonb, p_key text)
returns integer
language plpgsql
immutable
as $fn$
declare
  v integer;
begin
  v := round((p ->> p_key)::numeric);
  return case when v between 1 and 5 then v end;
exception when others then
  return null;
end;
$fn$;

-- TASK-IMPORTED (decided 04/10/2026): an old task with no project — or whose project could not be
-- moved — goes into ONE project per organization made for the purpose, so nothing is lost when the old
-- table is dropped; new tasks still need a project. Its title is left empty and the row is marked
-- (description.source = 'tasks_without_project'): the app shows a translated name for it until someone
-- renames it. A name written here would be in one language for every user (CODE_STYLE).
create or replace function public.core_v2_imported_project(p_org bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
begin
  select pr.id into v_id from public.project pr
   where pr.organization_id = p_org and pr.description ->> 'source' = 'tasks_without_project'
   order by pr.created_at, pr.id limit 1;
  if v_id is null then
    insert into public.project (organization_id, created_by, title, description)
    values (p_org, null, '', jsonb_build_object('source', 'tasks_without_project'))
    returning id into v_id;
  end if;
  return v_id;
end;
$fn$;

create or replace function public.core_v2_backfill_project_task()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r record;
  v_org bigint;
  v_pid bigint;
  v_project uuid;
  v_n_projects integer := 0;
  v_skip_projects integer := 0;
  v_n_tasks integer := 0;
  v_n_imported integer := 0;
  v_skip_tasks integer := 0;
  v_n_sub integer := 0;
  v_n_assign integer := 0;
  v_skip_assign integer := 0;
  v_status uuid;
  v_item jsonb;
  v_i integer;
  v_rows integer;
begin
  if to_regclass('public.projects') is null or to_regclass('public.tasks') is null then
    raise notice 'project/task backfill: no old projects / tasks table here — nothing to move';
    return jsonb_build_object('ok', true, 'skipped', 'no_old_tables');
  end if;

  -- Projects: the old ones belong to a person; the new one to that person's organization.
  for r in select to_jsonb(p) as j from public.projects p loop
    select w.organization_id, m.personage_id into v_org, v_pid
      from public.member m
      join public.organization_worker w on w.personage_id = m.personage_id and w.job_status <> 'ENDED'
     where m.auth_user_id = nullif(r.j ->> 'user_id', '')::uuid;
    if v_org is null then
      v_skip_projects := v_skip_projects + 1;
      continue;
    end if;
    insert into public.project (id, organization_id, created_by, title, created_at)
    values ((r.j ->> 'id')::uuid, v_org, v_pid, coalesce(r.j ->> 'name', ''),
            coalesce(nullif(r.j ->> 'created_at', '')::timestamptz, now()))
    on conflict (id) do nothing;
    get diagnostics v_rows = row_count;
    v_n_projects := v_n_projects + v_rows;
  end loop;

  -- Tasks: into the organization of their project; with none (or one not moved), into the
  -- organization's imported-tasks project. Parents are linked in a second pass.
  for r in select to_jsonb(t) as j from public.tasks t loop
    if exists (select 1 from public.task k where k.id = (r.j ->> 'id')::uuid) then
      continue;   -- already moved, with its sub-tasks and assignee
    end if;
    v_project := null;
    v_org := null;
    if nullif(r.j ->> 'project_id', '') is not null then
      select pr.id, pr.organization_id into v_project, v_org from public.project pr where pr.id = (r.j ->> 'project_id')::uuid;
    end if;
    if v_project is null then
      -- the task's own organization, else its creator's
      if to_regclass('public.organizations') is not null then
        select o.core_organization_id into v_org from public.organizations o where o.id = nullif(r.j ->> 'organization_id', '')::uuid;
      end if;
      if v_org is null then
        select w.organization_id into v_org
          from public.member m
          join public.organization_worker w on w.personage_id = m.personage_id and w.job_status <> 'ENDED'
         where m.auth_user_id = nullif(r.j ->> 'user_id', '')::uuid;
      end if;
      if v_org is null or not exists (select 1 from public.organization og where og.company_id = v_org) then
        v_skip_tasks := v_skip_tasks + 1;
        continue;
      end if;
      v_project := public.core_v2_imported_project(v_org);
      v_n_imported := v_n_imported + 1;
    end if;
    select m.personage_id into v_pid
      from public.member m
      join public.organization_worker w on w.personage_id = m.personage_id and w.organization_id = v_org
     where m.auth_user_id = nullif(r.j ->> 'user_id', '')::uuid;
    select s.id into v_status from public.task_status s
     where s.organization_id = v_org
       and s.text = case when coalesce((r.j ->> 'finished')::boolean, false) then 'done' else r.j ->> 'status' end;
    insert into public.task (id, organization_id, project_id, status_id, difficulty_id, urgency_id, client_group_id,
                             created_by, title, description, tags, expected_duration, min_duration, max_duration,
                             start_at, due_at, created_at, updated_at)
    values (
      (r.j ->> 'id')::uuid, v_org, v_project, v_status,
      (select d.id from public.task_difficulty d where d.organization_id = v_org and d.sort_order = public.core_v2_task_level(r.j, 'difficulty')),
      (select u.id from public.task_urgency u where u.organization_id = v_org and u.sort_order = public.core_v2_task_level(r.j, 'urgency')),
      (select cg.company_id from public.company c join public.client_group cg on cg.company_id = c.id
         join public.organization_client_group ocg on ocg.client_group_id = cg.company_id and ocg.organization_id = v_org
        where c.public_id::text = nullif(r.j ->> 'client_id', '')),
      v_pid,
      coalesce(nullif(r.j ->> 'title', ''), r.j ->> 'name', ''),
      case when nullif(btrim(r.j ->> 'description'), '') is null then '{}'::jsonb
           else jsonb_build_object('text', r.j ->> 'description') end,
      case when jsonb_typeof(r.j -> 'tags') = 'array'
           then array(select jsonb_array_elements_text(r.j -> 'tags')) else '{}'::text[] end,
      case when (r.j ->> 'expected_hours') ~ '^[0-9]+([.][0-9]+)?$' then (r.j ->> 'expected_hours')::numeric * interval '1 hour' end,
      case when (r.j ->> 'min_hours') ~ '^[0-9]+([.][0-9]+)?$' then (r.j ->> 'min_hours')::numeric * interval '1 hour' end,
      case when (r.j ->> 'max_hours') ~ '^[0-9]+([.][0-9]+)?$'
                and ((r.j ->> 'min_hours') !~ '^[0-9]+([.][0-9]+)?$' or (r.j ->> 'max_hours')::numeric >= (r.j ->> 'min_hours')::numeric)
           then (r.j ->> 'max_hours')::numeric * interval '1 hour' end,
      public.core_v2_task_date(r.j, 'start_date'),
      coalesce(public.core_v2_task_date(r.j, 'due_date'), public.core_v2_task_date(r.j, 'end_date')),
      coalesce(nullif(r.j ->> 'created_at', '')::timestamptz, now()),
      coalesce(nullif(r.j ->> 'updated_at', '')::timestamptz, nullif(r.j ->> 'created_at', '')::timestamptz, now())
    );
    v_n_tasks := v_n_tasks + 1;

    -- The checklist (tasks.subtasks) -> child tasks.
    if jsonb_typeof(r.j -> 'subtasks') = 'array' then
      v_i := 0;
      for v_item in select * from jsonb_array_elements(r.j -> 'subtasks') loop
        v_i := v_i + 1;
        if jsonb_typeof(v_item) <> 'object'
           or coalesce(nullif(v_item ->> 'title', ''), nullif(v_item ->> 'text', ''), nullif(v_item ->> 'name', '')) is null then
          continue;
        end if;
        insert into public.task (organization_id, project_id, parent_task_id, status_id, created_by, title, sort_order)
        values (v_org, v_project, (r.j ->> 'id')::uuid,
                (select s.id from public.task_status s where s.organization_id = v_org
                   and s.text = case when coalesce((v_item ->> 'done')::boolean, false) then 'done' else 'todo' end),
                v_pid, coalesce(nullif(v_item ->> 'title', ''), nullif(v_item ->> 'text', ''), v_item ->> 'name'), v_i);
        v_n_sub := v_n_sub + 1;
      end loop;
    end if;

    -- The assignee: a member of this organization, by login id. Old rows that hold a name are skipped.
    if nullif(r.j ->> 'assignee', '') is not null then
      insert into public.task_assignee (task_id, member_id, assigned_by)
      select (r.j ->> 'id')::uuid, m.personage_id, v_pid
        from public.member m
        join public.organization_worker w on w.personage_id = m.personage_id and w.organization_id = v_org and w.job_status <> 'ENDED'
       where m.auth_user_id::text = lower(r.j ->> 'assignee')
      on conflict do nothing;
      get diagnostics v_rows = row_count;
      if v_rows = 1 then v_n_assign := v_n_assign + 1; else v_skip_assign := v_skip_assign + 1; end if;
    end if;
  end loop;

  -- Parents: only one in the same organization (fk_task_parent); the rest stay top-level.
  update public.task t
     set parent_task_id = (o.j ->> 'parent_id')::uuid
    from (select to_jsonb(x) as j from public.tasks x where nullif(to_jsonb(x) ->> 'parent_id', '') is not null) o
   where t.id = (o.j ->> 'id')::uuid
     and t.parent_task_id is null
     and t.id <> (o.j ->> 'parent_id')::uuid
     and exists (select 1 from public.task p where p.id = (o.j ->> 'parent_id')::uuid and p.organization_id = t.organization_id);

  raise notice 'project/task backfill: % projects moved, % skipped (creator not in a core_v2 organization)', v_n_projects, v_skip_projects;
  raise notice 'project/task backfill: % tasks moved (% of them into the imported-tasks project; + % checklist items as sub-tasks), % NOT moved (no organization to put them in)',
    v_n_tasks, v_n_imported, v_n_sub, v_skip_tasks;
  raise notice 'project/task backfill: % assignees moved, % not (a name, or not a member of the organization)', v_n_assign, v_skip_assign;
  return jsonb_build_object('ok', true, 'projects', v_n_projects, 'projects_skipped', v_skip_projects,
                            'tasks', v_n_tasks, 'tasks_imported', v_n_imported, 'subtasks', v_n_sub,
                            'tasks_skipped', v_skip_tasks, 'assignees', v_n_assign, 'assignees_skipped', v_skip_assign);
end;
$fn$;

revoke all on function public.core_v2_backfill_project_task() from public, anon, authenticated;
revoke all on function public.core_v2_imported_project(bigint) from public, anon, authenticated;
revoke all on function public.core_v2_seed_task_lookups(bigint) from public, anon, authenticated;

select public.core_v2_backfill_project_task();

-- ============================================================
-- Verification (run AFTER applying, in pre-prod)
-- ============================================================
-- 1. Every organization has its lookups. Expect 0 rows.
--
--   select o.company_id from public.organization o
--    where (select count(*) from public.task_status s where s.organization_id = o.company_id) < 4
--       or (select count(*) from public.task_difficulty d where d.organization_id = o.company_id) < 5
--       or (select count(*) from public.task_urgency u where u.organization_id = o.company_id) < 5;
--
-- 2. What was not moved, to decide about before the old tables are dropped (expect 0, or rows with
--    no organization at all):
--
--   select count(*) from public.tasks where id not in (select id from public.task);
--
-- 3. Re-run the move right after the T2 front end is live (rows created in between):
--
--   select public.core_v2_backfill_project_task();
--
-- ============================================================
-- Rollback (before the T2 front end only)
-- ============================================================
--   drop table if exists public.task_assignee, public.task, public.milestone, public.project,
--     public.task_urgency, public.task_difficulty, public.task_status cascade;
--   drop function if exists public.core_v2_my_tasks(), public.core_v2_backfill_project_task(), public.core_v2_imported_project(bigint),
--     public.core_v2_task_level(jsonb, text),
--     public.core_v2_task_date(jsonb, text), public.core_v2_organization_seed_tasks(),
--     public.core_v2_seed_task_lookups(bigint), public.core_v2_touch_updated_at();
