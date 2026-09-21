# Better idea — what to build instead

> **What this is.** Concrete counter-proposals to the parts of
> [`Database Plan.txt`](Database%20Plan.txt) that [`database_plan_view.md`](database_plan_view.md)
> rejects, plus the pieces the plan does not cover but needs.
>
> **What this is not.** A migration. The sketches below are DDL-shaped so the constraints are
> arguable, but nothing here has run against a real Postgres, and 27 of the 35 current tables
> have no `CREATE TABLE` in this repo — their types in
> [`SCHEMA_FROM_CODE.sql`](SCHEMA_FROM_CODE.sql) are **inferred**. Dump pre-prod and reconcile
> before writing a migration against any of this.
>
> Core domain (company / person / worker / client engagement / profit / churn / interaction)
> is already proposed in [`NEW_SCHEMA.sql`](NEW_SCHEMA.sql) and is **not** re-specified here.
> This document adds the work model, the plan model, and the cross-cutting rules that
> `Database Plan.txt` has no way to express.

---

## 1. The one rule that decides most of these arguments

> **If you will ever need to query, sort, constrain, authorize or aggregate the inner thing
> independently, it is a row. Otherwise it is a document.**

Applied to the plan:

| Thing | Row or document? | Why |
|---|---|---|
| `clients.contacts` | **row** (`person`) | "which clients does this email appear at?" |
| `Milestone.logs` | **row** (`work_item_event`) | "how long was it on hold?" |
| `Milestone.Comments` | **row** (`comment`) | ordering, authorship, notification |
| `Terminal_Task` checklist | **document** | never aggregated across items |
| `copils.blocks` | **document** | a deck genuinely *is* an ordered block list |
| `Chat Room.ChatInfos` | **row** (already is: `chat_channel_members`) | membership is authorization |
| `Interaction.Description // issue, conclusion` | **two columns** | it names two fields |
| `task_param` values | **neither — an enum type** | §2 |

---

## 2. Replace `task_param` with native enums plus i18n keys

```sql
-- Ordering is the declaration order, so `order by priority desc` sorts correctly
-- with no join and no `order` column.
create type work_priority as enum ('low', 'middle', 'important', 'urgent');
create type work_status   as enum ('todo', 'in_progress', 'on_hold', 'done', 'cancelled');
create type work_kind     as enum ('milestone', 'task', 'subtask');
```

**The stored value is an i18n key fragment, never a label.** The view renders
`t('task_priority_' + row.priority)`. Under rule 4 the only home for a translation is
`src/i18n/`; a lookup table of display strings is invisible to `check-i18n.mjs`.

**Cost of an enum:** adding a value is `alter type … add value` (cheap, not transactional
before PG 12; fine on current versions). Removing one is genuinely hard. If values will churn
with product experiments, use `text` + a `CHECK` constraint instead — same ordering problem,
solved with a `case` expression in one view. Do **not** use a generic lookup table.

**Migration note:** `tasks` currently has `priority`, `urgency`, `importance` **and**
`difficulty` as four separate text columns. Decide which of those are genuinely independent
dimensions before typing them; three of them look like one concept measured three times.

---

## 3. One `work_item` table, not four

Replaces `Milestone`, `Task`, `Repeatable_Task`, `Terminal_Task` — and is a
rename-and-extend of the existing `tasks` table rather than a new subsystem.

```sql
create table public.work_item (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organization(id) on delete cascade,
  parent_id         uuid references public.work_item(id) on delete cascade,
  kind              work_kind     not null,
  status            work_status   not null default 'todo',
  priority          work_priority not null default 'middle',

  title             text not null,
  description       jsonb,              -- the document half: md/html/mermaid, checklist items
  client_id         uuid references public.client(id) on delete set null,
  created_by        uuid not null references public.worker(person_id),

  -- planned
  due_date          date,
  planned_start     date,
  expected_effort   interval,           -- NOT a bare number: the unit is in the type
  difficulty        smallint check (difficulty between 1 and 5),

  -- actual (derived from work_item_event, cached here; see §4 of the ledger rule)
  started_at        timestamptz,
  finished_at       timestamptz,

  -- recurrence: ONE mechanism, shared with planning_events (§5)
  recurrence        text not null default 'none'
                      check (recurrence in ('none','daily','weekly','monthly')),
  series_id         uuid,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz          -- soft delete, applied schema-wide (§9)
);

create index on public.work_item (organization_id, status) where deleted_at is null;
create index on public.work_item (client_id)  where deleted_at is null;
create index on public.work_item (parent_id);
```

Why this instead of the plan's four tables:

- **`kind` instead of `Task : Milestone`.** The subtypes share every column but one. One
  table means no `UNION` on "all work for this client", and `parent_id` points at exactly one
  table.
- **`Terminal_Task` disappears.** It is `kind = 'subtask'` if it needs a row, or a checklist
  entry inside `description` if it does not. Not both (see `database_plan_view.md` §2.3).
- **`expected_duration` becomes `interval`.** A bare number invites the `min_hours` /
  `max_hours` / `expected_hours` / `actual_hours` sprawl already in `tasks`.
- **`organization_id` is denormalized on purpose.** Same reason as everywhere else in this
  schema: an RLS policy that joins to find the org is evaluated per row, per query. Keep it
  honest with the parent-consistency trigger in `NEW_SCHEMA.sql` §8.

**Assignees are a join table, never `assignees : Workers`:**

```sql
create table public.work_item_assignee (
  work_item_id uuid not null references public.work_item(id) on delete cascade,
  person_id    uuid not null references public.worker(person_id) on delete cascade,
  assigned_at  timestamptz not null default now(),
  primary key (work_item_id, person_id)
);
```

**Depth.** If milestones must not nest inside tasks, enforce it — a `before insert/update`
trigger checking `parent.kind < child.kind`, or accept arbitrary nesting and say so. An
unstated rule is enforced by nobody.

---

## 4. `work_item_event` — the table that makes the plan's own question answerable

This is the highest-value single addition in this document. The plan asks *"with this I can
calculate how long it really took to proceed / when on hold? / what happened meanwhile?"* and
answers it with `logs : json`, which cannot.

```sql
create table public.work_item_event (
  id            bigserial primary key,
  work_item_id  uuid not null references public.work_item(id) on delete cascade,
  at            timestamptz not null default now(),
  actor_id      uuid references public.person(id) on delete set null,
  from_status   work_status,
  to_status     work_status not null,
  note          text
);
create index on public.work_item_event (work_item_id, at);
```

Then the metric is a query rather than a human reading a blob:

```sql
-- real working time, excluding every on_hold interval
select work_item_id,
       sum(next_at - at) filter (where to_status = 'in_progress') as working_time,
       sum(next_at - at) filter (where to_status = 'on_hold')     as hold_time
from (select *, lead(at) over (partition by work_item_id order by at) as next_at
      from public.work_item_event) e
group by work_item_id;
```

`work_item.started_at` / `finished_at` stay as a **cache** maintained by a trigger on this
table — documented as derived, never hand-written. Same discipline as the `clients.mrr`
cache in `SCHEMA_REVIEW.md` §7.

---

## 5. One recurrence concept

`Repeatable_Task`, `Profit-Planner` and `planning_events.recurrence` are three
implementations of one idea, and rule 3 says one source per concern. The repo already chose:
**materialize a series, share a `series_id`** (migration `20260801120000_planning_recurrence`).

Keep that. `recurrence` + `series_id` are columns on whichever table recurs (`work_item`,
`profit_entry`), with one shared generator function and one shared `CHECK` vocabulary. If a
richer rule is needed later, store an RRULE subset in one place and expand it in one place.

`Profit-Planner : Profit` then stops being a separate entity: it is
`profit_entry.is_forecast boolean` — same shape, same table, filterable, and
`forecast vs actual` becomes a `group by is_forecast`.

---

## 6. The revenue ledger, and the currency rule the plan half-found

The plan's own comment — *"currency should never change, if it gets changed then we need to
know when, from what currency"* — has a standard answer:

> **A ledger row is never updated. A correction is a new, reversing row.**

```sql
create table public.profit_entry (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id) on delete cascade,
  client_id       uuid not null references public.client(id) on delete restrict,
  amount          numeric(14,2) not null,     -- numeric, never float
  currency        char(3) not null,           -- matches client.currency, enforced by trigger
  issued_at       date not null,
  is_forecast     boolean not null default false,
  reverses_id     uuid references public.profit_entry(id),  -- corrections, not updates
  memo            text,
  created_at      timestamptz not null default now()
);
-- No UPDATE grant to `authenticated` at all. Append-only is enforced, not requested.
```

This gives the author exactly what they asked for: the *when* is `created_at` on the
reversing row, the *from what* is the original row, and both are still there. It also means
`SUM()` over any date range is the truth, with no snapshot table faking history.

**Currency stays one per client engagement** (`client.currency`), denormalized onto each
entry and checked against the parent — `SCHEMA_REVIEW.md` §4.7 option 1. Rule 9 is zero
conversion; a mixed-currency `SUM()` is silently wrong, which is the failure mode this
codebase least tolerates (`R21`, `D-14`).

**Churn gets its fields back:**

```sql
create table public.churn_event (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id) on delete cascade,
  client_id       uuid not null references public.client(id) on delete restrict,
  effective_date  date not null,
  kind            text not null check (kind in ('full','downgrade','pause')),
  reason_key      text not null,              -- i18n key, GROUP-BY-able. Not free text.
  amount_delta    numeric(14,2),              -- negative; null when unknown (R21: never 0)
  currency        char(3),
  note            text,
  created_by      uuid references public.person(id),
  created_at      timestamptz not null default now()
);
```

`reason_key` is the point. "Why do customers leave" is the single most valuable aggregate a
CS product computes, and `description` free text cannot be grouped.

---

## 7. Billing: a plan **period** ledger plus one resolver

Replaces `Plan { id, paidAt, type int }`, and closes the documented live bug where
`profiles.plan` and `organizations.plan` disagree.

```sql
create table public.plan_period (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organization(id) on delete cascade,
  plan_code            text not null,          -- matches src/config/plans.config.js, one source
  seats                integer not null check (seats >= 0),
  period_start         timestamptz not null,
  period_end           timestamptz not null,   -- explicit. Never "computed from type int".
  source               text not null check (source in ('stripe','trial','promo','manual')),
  stripe_subscription_id text,
  created_at           timestamptz not null default now(),
  check (period_end > period_start)
);
create index on public.plan_period (organization_id, period_end desc);
```

```sql
-- THE single arbiter. Every entitlement read goes through this and nothing else.
create or replace function public.effective_plan(org uuid)
returns text language sql stable security definer set search_path = public as $$
  select plan_code from public.plan_period
   where organization_id = org and now() between period_start and period_end
   order by period_end desc limit 1
$$;
```

Why this shape:

- **`period_end` is stored, not derived.** It can appear in an index, a `CHECK`, an RLS
  policy and the client-limit trigger. A magic `type int` can appear in none of them.
- **Trials, promos and Stripe use one table.** `source` says which. `organizations.trial_ends_at`
  and `promo_codes` stop being a parallel entitlement path.
- **`seats` lives with the period it was paid for**, which is what "seats are billed at
  invitation, not acceptance" needs in order to be auditable.
- **One arbiter kills the split source.** `organizations.plan` survives only as a
  trigger-maintained cache written by the Stripe webhook, documented as derived;
  `profiles.plan` goes away. Run `scripts/proof-paywall-member.mjs` before and after, and put
  both outputs in the PR — this tranche touches the paywall.

**Do not** put billing columns anywhere `authenticated` can write. They stay
trigger-protected and `service_role`-only, as today.

---

## 8. `comment`, with a target that actually exists

```sql
create table public.comment (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id) on delete cascade,
  work_item_id    uuid references public.work_item(id) on delete cascade,
  interaction_id  uuid references public.interaction(id) on delete cascade,
  client_id       uuid references public.client(id) on delete cascade,
  author_id       uuid not null references public.person(id) on delete restrict,
  body            jsonb not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  -- exactly one target. This is what keeps real foreign keys.
  check (num_nonnulls(work_item_id, interaction_id, client_id) = 1)
);
```

**Do not** use untyped polymorphism (`target_type text` + `target_id uuid`). It cannot have a
foreign key, so a comment survives the deletion of the thing it comments on, and no cascade
can save you. Three nullable FKs plus a `num_nonnulls` check costs three columns and keeps
integrity. If the target list grows past ~5, switch to a `commentable` parent table — not to
an untyped pair.

---

## 9. Cross-cutting rules the plan cannot express

These apply to every table above and to `NEW_SCHEMA.sql`.

1. **`organization_id` on everything**, denormalized deliberately, kept honest by a
   parent-consistency trigger. A three-table join inside an RLS policy runs per row.
2. **`created_at` / `updated_at` on everything.** Free, and their absence is only ever
   noticed during an incident.
3. **Soft delete is one policy, not per table.** `deleted_at timestamptz` everywhere it
   applies, every index and policy carrying `where deleted_at is null`, and a documented
   purge job. The plan has `deletedAt` on exactly one entity.
4. **Naming: `snake_case`, singular table names, `id uuid primary key default
   gen_random_uuid()`.** The current schema is plural (`clients`, `profiles`); pick one and
   convert in one migration. Mixed conventions are worse than either.
5. **Every user-visible value is an i18n key**, never a display string — statuses,
   priorities, churn reasons, `Title (Dr./Mr./Ms.)`. Rule 4, and `check-i18n.mjs` can only
   see `src/i18n/`.
6. **`numeric`, never `float`, for money.** `quotes.amount` and `client_metrics.value`
   already get this right.
7. **`null` means unknown and renders `—`. `0` is a real value.** Rule R21. This has to be
   in the DDL as *nullable*, not defaulted to zero for tidiness.
8. **Identity: `person.auth_user_id uuid references auth.users(id)`, nullable**, with a
   partial unique index. A contact has no login; a `Viewer` has one. Both are people.
9. **Oxygen is untouched.** `oxygen_checkins`, `oxygen_daily`, `oxygen_recoveries` are
   legally self-only, aggregated only through `oxygen_team_aggregate` (owner-only, literal
   `n ≥ 5`, fail-closed). Giving them an org-readable `organization_id` is a **legal**
   change, not a technical one.
10. **MCP surface.** Any new table reachable from `app-v2/mcp-worker` needs a matching
    RESTRICTIVE policy keyed on `public.is_mcp_session()`, and
    `public.mcp_security_check()` updated to name it. That gate checks policies **by name** —
    a new table it does not know about is an unchecked hole that reports green.

---

## 10. Naming fixes

| Plan name | Use | Why |
|---|---|---|
| `Task_Viewer` / `Task_Viewer_Tab` | `saved_view` / `saved_view_tab` | UI state, and `Viewer` already means a client-portal person |
| `Viewer : Person` | `client_user` (or keep `visitor`) | Says what it is; frees `viewer` |
| `Emoji` | `message_reaction` | The row is the reaction, not the character |
| `task_param` | *(deleted — enums)* | §2 |
| `Terminal_Task` | *(deleted — `kind='subtask'` or a checklist)* | §3 |
| `Profit-Planner` | `profit_entry.is_forecast` | §5 |
| `Profit` | `profit_entry` | "Profit" is a computed figure; these are invoice lines |
| `Chat Room` | `chat_channel` *(already exists)* | Do not rename a healthy subsystem |
| `Issue (Interaction)` | `interaction` | Pick one word; `Issue` collides with support tooling |

---

## 11. Adoption order

Extends the three tranches in `SCHEMA_REVIEW.md` §7. Each is independently shippable and
reversible, each follows expand → backfill → switch → contract.

| # | Tranche | Contains | Risk |
|---|---|---|---|
| 0 | **Ground truth** | `pg_dump --schema-only` from pre-prod; reconcile against `SCHEMA_FROM_CODE.sql`; fix the six visibly wrong inferred types | None. **Blocking for everything below.** |
| 1 | Person & Company | `company`, `person`, `worker`, `client` engagement, `client_assignment`; backfill from `clients.contacts` | Medium — real ETL |
| 2 | Revenue ledger | `profit_entry`, `churn_event` (§6); `clients.mrr` becomes a cache | Medium — every dashboard number |
| 3 | Role & plan | `plan_period`, `effective_plan()` (§7); one home for role | **Highest.** Billing and the paywall. Deploy alone. |
| 4 | **Work model** *(new)* | `work_item`, `work_item_assignee`, `work_item_event`, `comment`, enums (§2–4, §8); rename-and-extend of `tasks` | Medium — 30 columns to map, one live feature |
| 5 | Chat hygiene | `message_reaction` normalized, `last_read_at` watermark | Low, standalone |

**Deferred deliberately:** the `profiles` / `user_profiles` merge, `Viewer` logins (they put
non-employees inside the auth tenant, and every existing policy assumes `auth.uid()` is an org
member), and anything touching Oxygen.

---

## 12. Open questions this document cannot answer

Four from `SCHEMA_REVIEW.md` §6 stand unchanged — multi-org clients, one org per worker,
whether `Viewer` ships, and the `profiles` / `user_profiles` merge. The expansion adds three:

1. **Are `priority`, `urgency`, `importance` and `difficulty` four dimensions or one?**
   `tasks` has all four today. Four enums means a four-axis sort nobody will use; one means
   three columns get dropped. This changes §2 and §3.
2. **Does a milestone belong to a client, a roadmap, or both?** `roadmaps.milestones jsonb`
   already exists and the plan's `Milestone.Clients (by id)` is plural — plural implies a join
   table and "one milestone spanning several clients", which is a different product.
3. **Is `Issue` the same thing as a `Task`?** The plan's own `$to-think` leaves this open. The
   recommendation here: **no.** `interaction` records *communication* (who approached whom —
   inbound vs outbound is a CS signal nothing currently captures); `work_item` records
   *work*; an interaction optionally spawns work items via `work_item.interaction_id`.
   Merging them forces one priority scheme onto two unrelated lifecycles.
