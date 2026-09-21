# Old vs. new — the current database against `Database Plan.txt`

> **What this is.** A table-by-table comparison of the **current** schema (35 tables, as
> reconstructed in [`SCHEMA_FROM_CODE.sql`](SCHEMA_FROM_CODE.sql) and documented in
> [`DATABASE.md`](DATABASE.md)) against the redesign in
> [`Database Plan.txt`](Database%20Plan.txt) as it stands on **17/09/2026**, with the
> corrections proposed in [`better_idea.md`](better_idea.md) folded in as the "recommended"
> column.
>
> **Accuracy warning.** Only **8 of the 35** current tables have a real `CREATE TABLE` in
> this repo (`chat_channels`, `chat_messages`, `chat_channel_members`, `client_notes`,
> `client_metrics`, `quotes`, `sent_emails`, `user_profiles`). The other 27 are reconstructed
> from CRUD call sites: **column names are proven, types are guessed**, and `NOT NULL`,
> defaults, foreign keys, unique constraints, checks and indexes are not recoverable at all.
> Every "current" cell below inherits that uncertainty.

---

## 1. At a glance

| | Current | `Database Plan.txt` | Recommended |
|---|---|---|---|
| Tables | 35 | ~22 named entities | ~30 core + ~20 retained feature tables |
| Company identity | Two disjoint tables (`organizations`, `clients`) | One `Company`, subtyped | One `company` + `organization` + `client` **engagement** |
| A contact | A `jsonb` array element | `Person` row | `person` row with a nullable `auth_user_id` |
| Revenue | Two mutable scalars (`mrr`, `arr`) | `Profit` ledger | Append-only `profit_entry`, corrections by reversal |
| Churn | One nullable `churned_at` | `Churn { company-id, description }` | `churn_event` with date, amount, `reason_key` |
| Plan / entitlement | **Two disagreeing columns** (`profiles.plan`, `organizations.plan`) | `Plans (by id)` list, no arbiter | `plan_period` + one `effective_plan()` resolver |
| Work items | One flat table, 30 columns | 4 entities + a lookup table | One `work_item` + assignee join + event log |
| Work history | `finished boolean` | `logs : json` | `work_item_event` transition table |
| Comments | None | `Comment`, no target | `comment` with exactly-one-target check |
| Roles | **Two homes** (`profiles.org_role`, `organization_members.role`) | Subtype tables + `Authorities` | One `worker.role` enum + granular grants |
| Recurrence | 1 implementation (`planning_events`) | 2 more added | 1, shared |
| Tenant isolation | `organization_id` denormalized on most tables | **Absent entirely** | Denormalized, trigger-enforced |
| RLS | The security model, 3 patterns | Not mentioned | Per-table policy sketched with the DDL |
| Oxygen | 3 tables, legally self-only | **Deleted** | Untouched |

---

## 2. Core domain, table by table

### 2.1 Identity and tenancy

| Current | Columns today | Plan | Recommended | Migration cost |
|---|---|---|---|---|
| `organizations` | `plan`, `seats_paid`, `trial_ends_at`, `oxygen_team_enabled`, stripe ids, billing trigger-protected | `Organization : Company` + `Plans (by id)` | `company` (identity) + `organization` (tenancy/billing) + `plan_period` | **High** — every RLS policy resolves through `get_my_org_id()` |
| `profiles` | 16 cols: plan, trial, `organization_id`, `org_role`, locale, stripe ids, dead `resend_api_key` | `Person` + `Worker` | `person` + `worker`; plan/stripe move to `organization` | **Highest** — `get_my_org_id()` reads this table; rewrite it alone |
| `user_profiles` | 21 cols: role, seniority, company size, sector, **`currency`** | *(no equivalent)* | Merge into `person` / `worker` — **deferred**, own tranche | Medium; 3 known call sites |
| `organization_members` | `(organization_id, user_id)` unique on the **pair**, seat trigger | `Organization.Workers (by id)` | `worker.organization_id` FK; keep a join table only if contractors are shared | Medium — seat counting changes meaning |
| `invitations` | token, `expires_at`, pending/accepted/expired/revoked | **absent** | Retained unchanged | None |
| `team_members` | 2 columns (`created_at`, `user_id`) | **absent** | **Probably dead — verify and drop** | None |

> The plan's single `Person` is right, but note what it collapses: the database currently
> allows **multiple memberships** (`uq_org_member` is on the pair) while
> `profiles.organization_id` allows exactly one. Two models coexist today. The plan does not
> pick one; `better_idea.md` §11 leaves it as an open question, because seat billing depends
> on the answer.

### 2.2 The client relationship

| Current | Plan | Recommended | Note |
|---|---|---|---|
| `clients` (21 cols) | `Client : Company` | `company` + `client` engagement, unique `(organization_id, company_id)` | Splits identity from relationship |
| `clients.contacts jsonb` | `Person` rows | `person` + `client_contact` | **The main ETL of tranche 1** |
| `clients.csm text` **and** `clients.csm_id uuid` | `assignees (by id) : Worker` | `client_assignment` join table | Kills a text/FK duplicate that drifts |
| `clients.mrr`, `clients.arr` | `Profits (by id)` on `Organization` | `profit_entry` (+ optional cached scalar) | Ledger replaces two overwritten numbers |
| `clients.churned_at` | `Churns (by id)` on `Organization` | `churn_event` | Plan **loses** the date; see `database_plan_view.md` §2.8 |
| `clients.status` / `lifecycle` / `pipeline_stage` | `IsValid (it can stop the contract)` | `client.lifecycle` + `client.is_valid` + audit | Three overlapping columns → two with distinct meanings |
| `clients.health`, `churn_risk`, `nps` | **absent from the plan** | Retained; `/10` scale through `lib/health` only | Rule 8 — thresholds are mirrored in three files and parity is mandatory |
| `client_notes` | folded into `Interaction` | Retained; `interaction` is the unified timeline above it | Low |
| `client_metrics` | **absent** | Retained | None |
| `snapshots` | **absent** | Candidate for deletion **once** the ledger lands | It exists to fake the history a ledger gives free |

### 2.3 Work management — the biggest delta

| Current `tasks` column | Plan | Recommended |
|---|---|---|
| `id`, `title`, `description`, `status` | `Milestone` / `Task` | `work_item` |
| `parent_id`, `level`, `task_type`, `subtasks text` | `Task : Milestone` + `Terminal_Task` | `parent_id` + `kind` enum; checklist stays in `description jsonb` |
| `priority`, `urgency`, `importance`, `difficulty` | `priority : task_param` | `work_priority` enum + `difficulty smallint` — **and decide whether these are 4 dimensions or 1** |
| `min_hours`, `max_hours`, `expected_hours`, `actual_hours` | `expected_duration` | `expected_effort interval`; actuals derived from `work_item_event` |
| `finished boolean`, `start_date`, `end_date`, `due_date`, `pended` | `startedAt` / `finishedAt` / `duedate` / `deletedAt` | Same, plus a real event log |
| `assignee text` | `assignees : Workers` | `work_item_assignee` join table |
| `client_id`, `project_id`, `user_id`, `tags jsonb`, `color` | `Clients (by id)`, `createdBy` | `client_id`, `created_by`, `organization_id` |
| *(nothing)* | `logs : json` | **`work_item_event`** — this is what makes cycle time computable |
| *(nothing)* | `Comment` | `comment` with a typed target |
| *(nothing)* | `Repeatable_Task.interval` | `recurrence` + `series_id`, shared with `planning_events` |
| *(nothing)* | `Task_Viewer` / `Task_Viewer_Tab` | `saved_view` — UI state, renamed, kept out of the domain core |
| `projects` | **absent** | Verify whether it is dead; `roadmaps` overlaps it |

**Verdict on this section:** the plan's work model is a *better idea than what exists* and a
*worse shape than it needs to be*. The 30-column `tasks` table already contains most of these
fields — the change is a rename-and-extend, not a new subsystem.

### 2.4 Communication

| Current | Plan | Recommended | Note |
|---|---|---|---|
| `chat_channels` (real DDL, RLS, `dm_key`) | `Chat Room` | **Keep as is** | Healthiest part of the schema |
| `chat_channel_members` (real DDL, `open_dm` RPC) | `ChatInfos json` | **Keep**, add `last_read_at` | The plan would move membership *back* into JSON — that undoes `20260909120000` |
| `chat_messages` (realtime, `reactions jsonb`) | `Message { From, To, read-at }` | Keep; drop `To` (a DM is a two-person room); normalize reactions | `read-at` is per-recipient — use the member watermark |
| `chat_messages.reactions jsonb` + `toggle_chat_reaction` RPC | `Emoji { type, person }` | `message_reaction` with a unique key | Removes the row lock; the RPC survives only for the authorization half |
| `notifications` (`type` + `payload`) | **absent** | Retained | Locale-agnostic by design |
| *(no unified timeline)* | `Issue (Interaction)` | `interaction` + `interaction_participant` | Inbound-vs-outbound is a CS signal nothing captures today |

---

## 3. What the plan deletes and the recommendation keeps

Implemented literally, `Database Plan.txt` has no home for these. `SCHEMA_REVIEW.md` §5
raised it against the previous draft; the expansion did not address it.

| Current table(s) | Feature | Status in the plan | Recommended |
|---|---|---|---|
| `oxygen_checkins`, `oxygen_daily`, `oxygen_recoveries` | **Oxygen — the stated differentiator** | deleted | **Untouched.** Self-only is a *legal* constraint; `oxygen_team_aggregate` (owner-only, literal `n ≥ 5`, fail-closed) is the only aggregation path |
| `copils` | COPIL deck builder | deleted | Retained; `blocks jsonb` is a legitimate document |
| `playbooks` | Retention playbooks | deleted | Retained; repoint `client_id` at the engagement |
| `roadmaps` | Roadmaps & milestones | deleted | Retained — but it overlaps the plan's `Milestone`; reconcile before building both |
| `planning_events` | Calendar | deleted | Retained; **its recurrence model is the one to reuse** |
| `quotes` | Quotes | deleted | Retained |
| `email_templates`, `sent_emails`, `org_email_config` | Email studio | deleted | Retained; `org_email_config` has **no client access at all** |
| `ai_conversations`, `ai_messages`, `ai_usage` | AI history & quota | deleted | Retained |
| `clients.health` / `churn_risk` / `nps` | Health scores | deleted | Retained; `/10` through `lib/health`, three-file parity |
| `invitations`, `organization_members`, `seats_paid` | Seats & invitations | deleted | Retained; seats are billed **at invitation**, fail-closed |
| `activity_log`, `api_keys`, `webhooks`, `promo_codes`, `alpha_feedback`, `org_integrations` | Misc / dormant | deleted | Retained; Integrations is dormant **on purpose** |

That is roughly two-thirds of the product. The omission is a framing problem rather than an
error — the document is a core-domain sketch — but it has to be stated, because the deletion
would be silent: nobody notices a table they forgot to design until the feature stops working.

---

## 4. Which existing defects each approach fixes

The eight code-vs-code contradictions are tracked in
[`BUSINESS.md`](BUSINESS.md#8-contradictions-inside-the-machine).

| Defect | Current | Plan as written | With `better_idea.md` |
|---|---|---|---|
| `profiles.plan` vs `organizations.plan` — a member of a paying org is entitled in the UI and 403'd by the API | **live bug** | ✗ worse — a list with no arbiter | ✓ `effective_plan()`, one source |
| `profiles.org_role` vs `organization_members.role` | duplicated | ✓ one role | ✓ one role + granular grants |
| `clients.csm` (text) vs `csm_id` (uuid) | drifts | ✓ | ✓ join table |
| Two secret homes for the Resend key | duplicated | — not addressed | — own cleanup, out of scope |
| `profiles` vs `user_profiles` | two rows per human | ✓ implied | ~ deferred deliberately |
| Contacts unqueryable inside `jsonb` | broken | ✓ | ✓ |
| No revenue history | broken | ✓ | ✓ + append-only and reversals |
| Churn is one nullable timestamp | broken | ~ loses the date | ✓ date, amount, groupable reason |
| Cycle time / hold time unknowable | broken | ✗ `logs : json` cannot compute it | ✓ `work_item_event` |
| Priority does not sort | broken | ~ right instinct, EAV execution | ✓ native enum |
| Tenant isolation | denormalized, works | ✗ absent | ✓ kept and trigger-enforced |
| Chat reaction races | fixed in `20260909120000` | ✗ regresses membership into JSON | ✓ normalized, lock removed |

**Score:** the plan fixes 5 real defects, regresses 3, and leaves tenant isolation
unaddressed. The corrected version fixes 10 and regresses none — at the price of being four
times longer to write down.

---

## 5. Sequencing against what already exists

| Step | Touches | Reversible? | Gate before proceeding |
|---|---|---|---|
| 0. Dump pre-prod schema, reconcile the 27 inferred tables | nothing | n/a | **Blocking.** Six inferred types are visibly wrong (`playbooks.steps`, `tasks.subtasks`, `oxygen_daily.index`, `oxygen_recoveries.duration_s`, `api_keys.scopes`, `activity_log.changes`) |
| 1. `company` / `person` / `worker` / `client` engagement | new tables only; dual-write from `clients.contacts` | yes | Contacts queryable by email in pre-prod |
| 2. `profit_entry` / `churn_event` | dashboards | yes, ledger is additive | Every aggregate filters by currency (rule 9 — a mixed `SUM()` is silently wrong) |
| 3. `plan_period` + `effective_plan()` | **paywall, billing, gating** | hard | `scripts/proof-paywall-member.mjs` before **and** after, both outputs in the PR. Deploy with nothing else. |
| 4. `work_item` family | the tasks feature | yes, rename-and-extend | 30 columns mapped explicitly; no column silently dropped |
| 5. `message_reaction`, `last_read_at` | chat | yes | Standalone; do not bundle |

Every migration stays idempotent, goes to **pre-prod first** with the checks in its header,
and reaches prod only on an explicit go. Any new table reachable from the MCP Worker needs a
RESTRICTIVE `is_mcp_session()` policy **and** an entry in `public.mcp_security_check()` — that
gate checks policies by name, so a table it does not know about reports green while being
wide open.

---

## 6. Summary

The current schema is **accurate about the product and incoherent about its core**: five
facts stored twice, revenue as an overwritten scalar, contacts trapped in JSON, and three
columns fighting over what a client's lifecycle is.

`Database Plan.txt` is **coherent about the core and silent about the product**: it fixes the
identity and revenue models, invents a usable work tree, and then omits Oxygen, tenant
isolation, RLS, billing periods and two-thirds of the tables.

Neither is the target. The target is the current schema **with the plan's core-domain
insights applied in tranches**, keeping the three things this codebase already gets right —
denormalized `organization_id`, self-only Oxygen, and a chat subsystem that has real DDL and
real policies.
