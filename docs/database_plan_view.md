# Review — `Database Plan.txt`

> **What this is.** A read of `Database Plan.txt` **as it stands on 17/09/2026**, after the
> 70-line expansion that added the work-management hierarchy (`task_param`, `Terminal_Task`,
> `Task_Viewer`, `Comment`, `Milestone`, `Task`, `Repeatable_Task`), `Plan`, `Profit-Planner`,
> and moved `Profits` / `Churns` from `Client` onto `Organization`.
>
> [`SCHEMA_REVIEW.md`](SCHEMA_REVIEW.md) reviewed the **previous** version and is still
> correct about everything it covers — Company, Person, the revenue ledger, inheritance,
> RLS, the silent deletion of two-thirds of the product. This document does not repeat it.
> It covers **what is new**, **what the expansion changed for the worse**, and **what the
> two documents now contradict**.
>
> Companion documents: [`better_idea.md`](better_idea.md) (what to do instead) and
> [`database_old_and_new_comparison.md`](database_old_and_new_comparison.md) (table-by-table).

---

## 0. Verdict

**The domain instinct keeps getting better. The modelling discipline has not kept up, and
the expansion widened the gap rather than closing it.**

Three of the new ideas are genuinely worth building:

- **A work tree** (`Milestone` → `Task` → sub-task) is a real improvement on the flat
  30-column `tasks` table, which already has `parent_id`, `subtasks text`, `level`,
  `task_type`, `difficulty`, `min_hours`, `max_hours`, `expected_hours` and `actual_hours`
  — i.e. it is *already trying* to be a tree and a work-estimation model, badly.
- **`Comment` as a row.** There is no comment table anywhere in the product today.
  `client_notes` is the closest thing and it can only be attached to a client.
- **The author caught the ledger's hardest rule unprompted**: `currency // should never
  change, if it gets changed then we need to know when, from what currency`. That is the
  correct instinct, and there is a standard answer to it (never update a ledger row — post a
  reversal; see [`better_idea.md`](better_idea.md) §4).

But the three structural faults from the last review are still present and now apply to twice
as many entities: **`X (by id)` is not a column**, **`:` inheritance has no strategy**, and
**there is no `organization_id` anywhere**, in a codebase where RLS *is* the security model.
The expansion also added five new faults of its own (§2).

**Bottom line:** do not build the new work-management section from this document as written.
Build it as a *rename-and-extend* of the existing `tasks` table, which is cheaper and already
holds the data. See [`better_idea.md`](better_idea.md) §3.

---

## 1. What the expansion gets right

| New in the plan | Why it is right |
|---|---|
| `Milestone` with `startedAt` / `finishedAt` / `deletedAt` / `duedate` / `expected_duration` | Separates *planned* from *actual*. Today `tasks` has `finished boolean` — a boolean cannot answer "how long did it take". |
| `Task : Milestone` sharing one shape | Correct observation: a milestone and a task differ by *scope*, not by *fields*. (The conclusion should be one table with a discriminator, not inheritance — §2.2.) |
| `Comment` as a first-class entity | Nothing like it exists. Every CS product needs discussion attached to work items. |
| `priority : task_param` with an explicit `order` | Correct instinct: priority must **sort**, and a `text` column sorts alphabetically — which is why `tasks.priority`, `tasks.urgency` and `tasks.importance` are three unsortable strings today. |
| `Plans (by id)` — plan as history, not a scalar | Right direction. The worst live bug in this schema is `profiles.plan` vs `organizations.plan` disagreeing; a *derived* effective plan over a payment history is the fix. (The proposed columns are not — §2.4.) |
| `currency // should never change…` | The one line in the document that anticipates its own failure mode. |
| `Authorities` on `Worker` | Acknowledges that role-as-enum is not enough for "Managing the plan (only when granted)". |
| `Profit-Planner : Profit` — forecast on the same shape as actuals | Forecast-vs-actual variance reporting comes for free when both share a shape. |

---

## 2. What the expansion gets wrong

### 2.1 `task_param` is the "one true lookup table" antipattern

```
task_param
	order
	type string
		case priotiry: { low, middle, important, urgent }
```

One table holding the values of *every* enum in the work domain, discriminated by a `type`
string. It fails in four specific ways here:

1. **No referential integrity that means anything.** `milestone.priority → task_param.id`
   cannot stop a *status* value being stored in a *priority* column. The FK is satisfied;
   the data is nonsense.
2. **Every read becomes a join** — including every RLS-evaluated read — to fetch a string
   you already knew.
3. **The value reaches the screen.** Under rule 4 it must be an i18n key rendered by `t()`,
   not a display string. A database table of user-visible labels is invisible to
   `check-i18n.mjs` — exactly the failure the "no hard-coded translation" rule (04/09) was
   written about.
4. **`order` is a reserved word** and will be quoted forever.

Postgres has a native answer that gives ordering, integrity and zero joins:
`create type work_priority as enum ('low','middle','important','urgent')` — enum comparison
follows *declaration order*, so `order by priority desc` just works.

*(Also: `priotiry` is a typo in the source. Fix it before it becomes a column name — `enfroce`
in `MCP_TOKEN_BINDING` is this repo's standing example of a typo that reached production
semantics.)*

### 2.2 `Milestone` and `Task` contradict each other

The document says both of these:

- `Task : Milestone` — a task **is a** milestone (inheritance), and
- `Milestone.Tasks (by id) // tasks or sub tasks` — a milestone **has** tasks (composition).

Both at once describes a self-referencing tree in which `Task` adds exactly one field
(`status`) over its parent. That is not inheritance worth a second table — it is
**one table with `parent_id` and a `kind` discriminator**, which is precisely what
`tasks.parent_id` + `tasks.level` + `tasks.task_type` already are.

Two tables costs a `UNION` on every "show me this client's work" query and leaves `parent_id`
pointing at two possible tables.

### 2.3 `Terminal_Task` contradicts its own comment

```
Terminal_Task
	id
	assignees : Workers
	startedAt / finishedAt
	// too small to be an item in Task management
	// it will be inside the content only
```

It has an `id`, assignees and timestamps — that is a row. The comment says it lives *inside
the content*, i.e. inside `description json` — that is not a row. Pick one:

- **A checklist item inside the description JSON** → no table, no assignee FK, no timestamps
  you can aggregate. Fine for "tick the box".
- **A row** → then it is a `work_item` with `kind = 'subtask'` and needs no separate table
  at all (§2.2).

Shipping both is how you get two half-features — and there is precedent: `tasks.subtasks` is
already a JSON column *while* `tasks.parent_id` already exists. The current schema made this
exact mistake once.

### 2.4 `Plan { id, paidAt, type int }` cannot answer the question it exists to answer

The comment says `type int // with this, I can calculate until when it is left`. That needs a
lookup from a magic integer to a duration that lives nowhere in the schema, in code the
database cannot see. Consequences:

- **No `period_end`** → "is this org entitled right now?" is a computation, not a query, so
  it cannot appear in an RLS policy, a `CHECK`, or the client-limit trigger.
- **No seats** → `organizations.seats_paid` has no home, and seats are **billed at
  invitation** under a fail-closed rule.
- **No Stripe identifiers** → the Stripe webhook is the only writer that matters and it has
  nothing to write to.
- **`Organization.Plans (by id)` with no arbiter** → a list of plans with no defined
  "current" one is *worse* than today's split source. Today two columns disagree and you can
  name which one is wrong; a list disagrees with itself, silently.

`paidAt` is also the wrong anchor: a trial has no payment, and `organizations.trial_ends_at`
currently gates beta access.

### 2.5 `Comment` has no target, and `logs : json` cannot produce the number it promises

`Comment { id, who, content }` — nothing says what it comments on. The relationship is implied
by `Milestone.Comments (by id)`, which means the FK belongs on `comment`
(`comment.work_item_id`). As written, a comment floats.

More importantly:

```
description : json // with this I can calculate how long it really took to proceed
	when on hold?  what happened mean while?
logs : json
```

**Nothing can be calculated from that.** "How long did this really take, excluding hold time"
is a `SUM` over status intervals, which needs a **status-transition table**
(`work_item_event(item_id, from_status, to_status, at, by)`), not a JSON blob a human reads.

This is the highest-value correction in this review: the author has correctly identified the
metric they want (real cycle time, hold time) and chosen the one storage shape that makes it
uncomputable.

### 2.6 Three recurrence mechanisms, one concept

`Repeatable_Task : Task { interval }`, `Profit-Planner : Profit { interval }`, and the
already-shipped `planning_events.recurrence` + `series_id` (migration
`20260801120000_planning_recurrence`). That is **rule 3** — one source per concern — broken
before the first line of DDL. One recurrence concept, one materialization strategy; the repo
has already chosen "materialize a series sharing a `series_id`".

### 2.7 `Task_Viewer` is UI state wearing a domain name — and that name is already taken

`Task_Viewer` / `Task_Viewer_Tab` are saved views and tabs belonging to a worker. Persisting
them is legitimate, but:

- they are **not domain data** and should not sit in the middle of the core-domain document;
- `description : json` as the only payload makes the filters unqueryable, so you can never
  ask "how many people filter by overdue?";
- **the name collides with `Viewer : Person`**, the client-portal login defined two sections
  later. Two unrelated "Viewer"s in one schema is a naming bug that will outlive everyone who
  remembers the distinction.

### 2.8 Churn lost its engagement and its analysable fields

The previous draft had `Churn { company-id, from company-id, description }` under `Client`.
It is now `Churn { company-id, description }` under `Organization`. So:

- **which engagement churned** is no longer expressible if a company can be a client of more
  than one organization — and the plan still says `Organization (by id) // maybe it could be
  multiple`;
- **no amount** → no revenue-at-risk, no partial churn or downgrade, which was the reason to
  make churn a row in the first place;
- **no date** → `clients.churned_at` is at least a timestamp, so this is a regression against
  the *current* schema;
- **`description` as free text** → churn *reasons* are the most valuable aggregate a CS
  product produces, and free text cannot be grouped.

### 2.9 The recursion was dropped

`Client.Companies (by id) // the client of the organization has clients and the organization
manages` is gone. `SCHEMA_REVIEW.md` §3.1 called this the keystone — the thing that made
unifying `Company` pay for itself. Dropping the line is harmless **if** `client` is modelled
as an engagement (`organization_id`, `company_id`, unique on the pair), because the recursion
then falls out for free. It matters a great deal if `client` becomes a subtype table again.

---

## 3. Still unfixed from the previous review

Each of these was raised against the earlier draft and is still true of this one. Not
restated in full — see [`SCHEMA_REVIEW.md`](SCHEMA_REVIEW.md) §4.

| # | Issue | Now affects |
|---|---|---|
| 4.1 | `X (by id)` is a relationship, not a column | ~20 lines, up from ~12 |
| 4.2 | `:` inheritance needs an explicit strategy | 8 pairs now (`Profit-Planner`, `Task`, `Repeatable_Task` added) |
| 4.3 | No `organization_id` anywhere | Every new table too — a work item without one cannot be RLS'd cheaply |
| 4.4 | `jsonb` re-introduced where rows are needed | Worse: `logs`, `description`, `Task_Viewer_Tab.description`, `Comment.content`, `ChatInfos` |
| 4.6 | `person` is not `auth.users` | Unchanged — `Viewer` still has no login model |
| 4.7 | Money and currency mixing | Unchanged, though the author now flags it |
| 4.8 | `Message.To` vs chat rooms, per-message `read-at`, `Emoji` as a table name, missing timestamps | Unchanged |
| §5 | The plan silently deletes Oxygen, COPIL, playbooks, roadmaps, quotes, email, notifications, AI, invitations, seats and health scores | Unchanged — and Oxygen is the stated differentiator, under a **legal** self-only constraint |

Two mechanical additions:

- **Naming is inconsistent inside the document itself**: `First-Name`, `company-id`,
  `startedAt`, `due_date`, `IsValid`, `Chat Room`. Four conventions. Pick `snake_case`,
  singular table names, and apply it once — mixed conventions are worse than either.
- **Soft delete appears exactly once** (`Milestone.deletedAt`) and nowhere else. Deletion
  policy is a whole-schema decision, not a per-table mood.

---

## 4. What to do with this document

It is a good **domain sketch** and a poor **schema**. Treat it as the former:

1. **Do not implement the work-management section as drawn.** `tasks` already holds the data
   and already has `parent_id`; the change is a rename-and-extend plus two new tables
   (`work_item_event`, `comment`), not a new subsystem.
2. **Fix the five new faults first** (§2.1–2.5). Each is cheap on paper and expensive once
   data has landed on it.
3. **Keep the three-tranche adoption path** in `SCHEMA_REVIEW.md` §7 and add the work model
   as tranche 4 — after Person/Company, because work items assign to people.
4. **Before any DDL**: dump the real schema from pre-prod. 27 of the 35 tables have no
   `CREATE TABLE` in this repo and their types in `SCHEMA_FROM_CODE.sql` are *inferred*.
   Redesigning against a guess is how a guess becomes a fact nobody questions.

Concrete proposals: [`better_idea.md`](better_idea.md).
