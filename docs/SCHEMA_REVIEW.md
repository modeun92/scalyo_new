# Schema review — `SCHEMA_FROM_CODE.sql` vs. `Database Plan.txt`

> **What this is.** A review of the current reconstructed schema against the redesign
> sketched in [`Database Plan.txt`](Database%20Plan.txt), and the reasoning behind the
> proposal in [`NEW_SCHEMA.sql`](NEW_SCHEMA.sql).
>
> **What this is not.** A decision. §6 lists four questions that only you can answer, and
> three of them change the DDL materially. `NEW_SCHEMA.sql` picks a defensible answer to
> each and says so out loud — it is a proposal to argue with, not a migration to run.

---

## 0. Verdict

**The plan is right about the core domain and wrong about the shape.**

Its central insights — that a *company* is one concept whether you sell to it or from it,
that a *person* is a first-class row rather than a JSON blob, and that revenue is an
append-only *ledger* rather than a mutable scalar — are all correct, and each one fixes a
real, documented defect in the current schema. Adopting them would resolve **four of the
eight code-vs-code contradictions** tracked in [BUSINESS.md](BUSINESS.md#8-contradictions-inside-the-machine).

But `Database Plan.txt` is an **object model, not a relational schema**. Three things have
to change before it can become DDL:

1. **`X (by id)` is not a column.** Roughly a dozen lines (`Clients (by id)`,
   `Workers (by id)`, `Messages (by id)`, `Profits (by id)`…) are relationships, and each is
   either a foreign key on the *other* table or a join table. Implemented literally as
   `uuid[]`, they cost you referential integrity, cascade behaviour, and every index that
   makes RLS affordable.
2. **`: ` inheritance has to be mapped.** `Worker : Person` needs an explicit strategy.
   Postgres table inheritance is a trap here — it does not inherit foreign keys or unique
   constraints, so `auth.users(id)` references silently stop being enforced.
3. **There is no RLS story, and in this codebase RLS *is* the security model.** Every
   table needs a cheap path to an `organization_id`. The current schema denormalizes that
   column onto almost everything for exactly this reason; the plan drops it everywhere.

And one framing correction: taken literally as "the new schema", the plan **deletes about
two-thirds of the product** (§5). It should be read as a redesign of the *core domain* that
the existing feature tables hang off — not as a replacement for all 35 tables.

**Recommendation:** adopt it in three tranches (§7). Tranche 1 alone — contacts out of
`jsonb`, client-as-engagement — is worth doing on its own merits and is the prerequisite for
everything else.

---

## 1. First, what `SCHEMA_FROM_CODE.sql` actually is

It matters for how much weight the review below can carry.

The file is **reconstructed from CRUD call sites**, not dumped from a database. Its own
header is honest about the consequences:

- **8 of 35 tables** have a real `CREATE TABLE` in the repo (`chat_channels`,
  `chat_messages`, `chat_channel_members`, `client_notes`, `client_metrics`, `quotes`,
  `sent_emails`, `user_profiles`). Those columns and types are verbatim.
- **27 tables are inferred.** Column *names* are proven by a real query; *types* are
  guessed from naming.
- **Not recoverable from code, and therefore absent everywhere:** `NOT NULL`, `DEFAULT`,
  `FOREIGN KEY`, `UNIQUE`, `CHECK`, indexes, and every RLS policy.

So: the file is trustworthy about **what columns exist** and untrustworthy about **what
they are**. That is enough to review the *shape* of the domain, which is what the plan
proposes to change. It is **not** enough to write a migration against — and a few of the
inferred types are visibly wrong on their face:

| Table.column | Inferred as | Almost certainly |
|---|---|---|
| `playbooks.steps` | `text` | `jsonb` |
| `tasks.subtasks` | `text` | `jsonb` |
| `oxygen_daily.index` | `text` | `numeric` — and `index` is a reserved-ish word, always quoted |
| `oxygen_recoveries.duration_s` | `text` | `integer` (the `_s` suffix says seconds) |
| `api_keys.scopes` | `text` | `text[]` or `jsonb` |
| `activity_log.changes` | `text` | `jsonb` |

Before *any* redesign work starts, dump the real schema
(`pg_dump --schema-only`, or `information_schema.columns`) from pre-prod and diff it against
this file. Redesigning against inferred types means porting your guesses into the new
schema and calling them facts.

---

## 2. What the current schema actually gets wrong

The plan is a reaction to real problems. Naming them precisely is what makes the review
useful, because each one is a test the new schema has to pass.

### 2.1 The same fact stored twice, with no arbiter

| Fact | Home A | Home B | Consequence |
|---|---|---|---|
| The plan | `profiles.plan` | `organizations.plan` | Documented live bug: `/api/ai`, `/api/email`, `/api/usage` read the profile; the front end and the SQL client-limit trigger read the org. A member of a paying org is entitled in the UI and 403'd by the API |
| The role | `profiles.org_role` | `organization_members.role` | Two sources for one authorization decision |
| The CSM on a client | `clients.csm` (text) | `clients.csm_id` (uuid) | A display string that drifts from the FK |
| The Resend key | `profiles.resend_api_key` | `org_email_config.resend_api_key` | Two encrypted secrets, unclear precedence |
| The user | `profiles` (16 cols) | `user_profiles` (21 cols) | Two tables per human: identity/plan/trial vs AI-context/currency |

Five duplications. **Rule 3 says one source per concern**, and the schema violates it five
times. This is the strongest argument for the redesign — stronger than anything in the plan
itself.

### 2.2 Relationships hidden inside `jsonb`

`clients.contacts jsonb` is the worst of these. A contact at a client has no row, so it has
no id, no foreign key, no RLS, and no index. You cannot ask "which clients does
`alice@acme.com` appear at?" without a full scan and a JSON walk. You cannot attach a note,
an email or a meeting to a person — only to a client.

The same pattern repeats in `copils.blocks`, `roadmaps.milestones`, `playbooks.steps`,
`tasks.subtasks`, `tasks.tags`, `snapshots.kpis`, `chat_messages.reactions`.

Some of those are legitimately documents (a COPIL deck genuinely is a block list). Contacts
are not. **The test is whether you ever need to query, constrain or authorize the inner
thing independently.** For contacts the answer is yes, and the plan is right to pull them
out.

### 2.3 Revenue is a mutable scalar with no history

`clients.mrr` and `clients.arr` are single numbers, overwritten in place. There is no record
of what MRR was last quarter, no record of *when* it changed, and no way to attribute a
change to an event. `client_metrics` partially compensates — monthly, manual, one row per
(client, kpi, month) — but it is a *measurement* table, not a ledger, and MRR is not in the
KPI catalogue as an automatic source.

Meanwhile `snapshots.kpis jsonb` exists to fake the history that a ledger would give you for
free.

`clients.churned_at` has the same defect: one nullable timestamp means one churn event, ever,
with no reason attached and no way to represent partial churn (a downgrade).

### 2.4 One text column doing three jobs

`clients.status` is used for lifecycle (`prospect` vs client — the `clientsOnly` filter that
excludes prospects from every aggregate), for health colour (which rule 8 forbids — colour
must come from `lib/health`), and implicitly for validity. `clients.lifecycle` and
`clients.pipeline_stage` also exist, each with a single call site. Three overlapping columns,
one of which is load-bearing for the paywall-adjacent client-count trigger.

### 2.5 Tables with no owner column

`team_members` has exactly two columns (`created_at`, `user_id`). `snapshots`, `projects`,
`webhooks`, `api_keys` are keyed on `user_id` with no `organization_id` — so an org-scoped
read requires a join through `profiles`, and org-scoped RLS on them is either expensive or
absent. Worth checking which of these are dead: `projects` and `team_members` look like
vestiges.

---

## 3. What `Database Plan.txt` gets right

Credit where it is due — these are not cosmetic.

1. **`Company` as one entity.** Today `organizations` and `clients` duplicate company
   attributes (name, logo) and can never be the same row. The plan unifies them, and that
   single move makes the recursion in `Client.Companies (by id) // the client of the
   organization has clients and the organization manages` *expressible* — which is currently
   impossible at any price. If Scalyo ever sells to an agency that runs CS for its own
   clients, this is the schema change that allows it.

2. **`Person` as a first-class row.** Fixes §2.2. Contacts get ids, foreign keys, RLS and
   indexes. It also makes `Interaction` possible, because an interaction needs two people,
   not a client and a string.

3. **`Profit` as an append-only ledger** with `issued-at`, `amount`, `currency`. Fixes §2.3
   properly: MRR history becomes a `sum()` over a date range instead of a snapshot table,
   and every change is attributable. This is the single highest-value idea in the document.

4. **`Churn` as a row, not a timestamp.** Multiple events, a reason, and — with an amount —
   partial churn / downgrades.

5. **`Interaction` as first-class.** Today the record of "what happened with this client" is
   scattered across `client_notes`, `planning_events`, `sent_emails` and `chat_messages`,
   with no unified timeline. The plan's `From (person-id) // who approached first?` is a nice
   touch: inbound vs outbound is a real CS signal that nothing currently captures.

6. **An explicit role hierarchy** (`Administrator` / `Manager` / `Employee`, each with an
   enumerated capability list). Fixes half of §2.1, and the capability lists are close enough
   to the current gating that they read as documentation of intent rather than a new design.

7. **`IsValid` on Person and Client.** Separates "the contract ended" from "the health score
   is bad" — directly addressing §2.4. Note the plan's own comment on `Visitor`: *declining
   the contract (from the organization)* — so `IsValid` has a user-facing write path, which
   means it needs an audit trail (who, when, why), not just a boolean.

8. **A `Visitor` role at all.** A client-side portal user is a product capability that does
   not exist today, and it is much cheaper to design the schema for it now than to retrofit
   RLS for a second audience later. Note the security weight of this: it is the first time a
   non-employee gets a login, and *every* existing RLS policy assumes `auth.uid()` belongs to
   an org member.

---

## 4. What has to change before it can be DDL

The must-fix list. Each of these is addressed in `NEW_SCHEMA.sql`.

### 4.1 `X (by id)` — a dozen relationships written as columns

| Plan line | Actually is | Lives where |
|---|---|---|
| `Organization.Workers (by id)` | 1-to-many | `worker.organization_id` |
| `Organization.Clients (by id)` | 1-to-many | `client.organization_id` |
| `Client.Workers (by id)` | **many-to-many** | join table `client_assignment` |
| `Worker.Clients (by id)` | the same M2M, written twice | the same join table |
| `Client.Visitors (by id)` | 1-to-many | `visitor.client_id` |
| `Client.Profits / Churns / Interactions (by id)` | 1-to-many | FK on the child |
| `Chat Room.Persons (by id)` | many-to-many | `chat_channel_member` (**already exists**) |
| `Chat Room.Messages (by id)` | 1-to-many | `chat_message.channel_id` (**already exists**) |
| `Message.emojis (by id)` | 1-to-many | `message_reaction.message_id` |
| `Worker.Assigned Tasks / Vacations (by id)` | 1-to-many | FK on the child |

Note that `Client.Workers` and `Worker.Clients` are the *same* relationship listed on both
sides — a tell that the document is describing object graphs rather than tables.

### 4.2 Inheritance needs a strategy

Three mappings exist. For `Worker : Person` and `Visitor : Person` the right one here is
**class-table inheritance**: a shared `person` table, plus `worker(person_id primary key
references person)` and `visitor(person_id primary key references person)` carrying only the
subtype's own columns.

Why not the alternatives:
- **Single-table** (one `person` with every subtype column, nullable) makes `worker`-only
  columns nullable for contacts, and you lose the ability to say "a worker *must* have an
  organization".
- **Postgres `INHERITS`** does not propagate foreign-key or unique constraints to children.
  A `person(auth_user_id) references auth.users(id)` silently stops being enforced for
  workers. Avoid entirely.

For `Administrator / Manager / Employee : Worker` the subtypes carry **no columns at all** —
only capability lists. That is not inheritance, it is an **enum**: `worker.role`. Three
tables would buy nothing and cost every query a union.

### 4.3 Every table needs a reachable `organization_id`

This is the omission that would hurt most, and it is invisible in an object model.

The security model is RLS keyed on `get_my_org_id()`. The existing schema denormalizes
`organization_id` onto `chat_channels`, `chat_messages`, `client_notes`, `client_metrics`,
`quotes`, `email_templates` — not out of sloppiness, but because a policy that has to join
three tables to find the org is slow on every row and easy to get subtly wrong.

`Database Plan.txt` has no `organization_id` anywhere. `Message` would have to reach its org
via `chat_room → person → company`, evaluated per row, per query.

**Keep the denormalized column**, and keep it honest with a trigger or a `CHECK` against the
parent. This is one of the few places where denormalization is the correct call, and the
reason should be written into the migration as a comment so nobody "normalizes" it later.

### 4.4 The plan re-introduces the `jsonb` habit it fixes elsewhere

`Profit.description (json)`, `Interaction.Description json // issue, conclusion`, and
`Chat Room.ChatInfos json // joining (by whom of whom), deleting (by whom), pinned (by whom)`.

The last one is the serious offender: joining, leaving and pinning are **membership and
audit**, both of which are already real tables in this codebase (`chat_channel_members`,
`chat_messages.pinned`). Putting them back into a JSON blob would undo
`20260909120000_chat_reactions_rpc.sql` — a migration written specifically because the
read-modify-write pattern on a JSON column let two simultaneous reactions overwrite each
other.

`Interaction.Description // issue, conclusion` names two fields. Make them two columns.

### 4.5 Reactions should be normalized — and this fixes a real bug class

Worth calling out as an *upgrade* the plan enables without quite realizing it.

`chat_messages.reactions jsonb` currently requires read-modify-write under a row lock, which
is exactly what `toggle_chat_reaction` does. A `message_reaction(message_id, person_id,
emoji)` table with a `UNIQUE` constraint makes toggling a single `INSERT ... ON CONFLICT DO
NOTHING` / `DELETE`. **No lock, no race, no RPC needed** for the concurrency half of the
problem.

The `SECURITY DEFINER` RPC is still needed for the *authorization* half (RLS on
`chat_messages` is `user_id = auth.uid()`, so you cannot react to someone else's message) —
but the policy on a separate reactions table can be written directly against
`can_read_chat_message()`, which already exists. The RPC gets simpler, and the row lock goes
away.

### 4.6 Identity: `person` is not `auth.users`

Supabase GoTrue owns identity. The plan does not mention it, and the distinction is
load-bearing: a **contact** at a client is a person with no login; a **visitor** is a person
*with* a login. Model this as a nullable `person.auth_user_id references auth.users(id)`,
with a partial unique index so one auth user maps to at most one person.

Getting this wrong in either direction is bad: make it `NOT NULL` and you cannot store a
contact you merely email; leave it unconstrained and two person rows can share a login,
which silently doubles RLS visibility.

### 4.7 Money

`Profit.currency` per row collides with **rule 9**: currency is a property of the account
(`user_profiles.currency`), with **zero conversion**. A ledger with mixed currencies cannot
be `SUM()`-ed — the aggregate is meaningless, and it will be silently wrong rather than
loudly broken, which is the worst failure mode this codebase recognizes (`R21`, `D-14`).

Three options, in order of preference:

1. **One currency per client engagement**, denormalized onto each ledger row and enforced
   with a `CHECK` against the parent. Aggregates within a client are always safe; aggregates
   across clients need an explicit currency filter.
2. Store both `amount` and `amount_normalized` in an org base currency, with the rate and
   rate date on the row. Honest, auditable, more machinery.
3. Mixed currencies with no normalization — **only** if every read path groups by currency.
   Fragile; one forgotten `GROUP BY` ships a wrong number.

`NEW_SCHEMA.sql` takes option 1 and leaves a marked seam for option 2.

Also: `numeric`, never `float`. The existing `quotes.amount numeric` and
`client_metrics.value numeric` already get this right.

### 4.8 Smaller, but real

- **`Message.To person-id` contradicts `Chat Room`.** If a message belongs to a room,
  `To` is redundant and wrong for group chat. The existing `chat_messages.channel_id` plus a
  `type = 'dm'` channel is the correct model — a DM is a two-person room. Drop `To`; keep
  `dm_key`, which already exists to make DM channels unique per pair.
- **`Message.read-at` is per-message, but "read" is per-recipient.** In a room with five
  people it needs its own table (`message_read`), or a per-member `last_read_at` watermark on
  `chat_channel_member` — cheaper, and enough for an unread badge. Take the watermark.
- **`Title (Dr./Mr./Ms./Mrs./Mx./None)`** reaches the screen, so under rule 4 it is stored as
  a stable key and rendered through `t()` — never as the display string.
- **`Language with Region`** → a BCP-47 tag (`fr-FR`, `ko-KR`). Note the app supports exactly
  three UI locales; a person's language tag and the UI locale are different fields with
  different validation.
- **No timestamps.** `Interaction`, `Churn`, `Chat Room` and the role tables have no
  `created_at`. Add `created_at` / `updated_at` everywhere; they are free and their absence
  is never noticed until an incident.
- **`Worker.Working Status // quit, vacation, available`** conflates employment (`quit`) with
  presence (`vacation`, `available`). `quit` is durable state; `vacation` is derivable from
  the `Vacations` table by date. Two fields: `employment_status` (active/left) and a computed
  availability.
- **`Emoji` as a table name** is the *reaction*, not the emoji character. Name it
  `message_reaction`.

---

## 5. What the plan silently deletes

If `Database Plan.txt` were implemented as written, these have no home:

| Gone | Currently |
|---|---|
| Health scores | `clients.health`, `churn_risk`, `nps` + `lib/health` |
| Tasks and OKRs | `tasks` (30 columns), `projects` |
| COPIL decks | `copils` (18 columns) |
| Playbooks | `playbooks` |
| Roadmaps | `roadmaps` |
| Planning | `planning_events` |
| **Oxygen** | `oxygen_checkins`, `oxygen_daily`, `oxygen_recoveries` |
| Quotes | `quotes` |
| Email studio | `email_templates`, `sent_emails`, `org_email_config` |
| Notifications | `notifications` |
| Invitations and seats | `invitations`, `organization_members` |
| Billing | `profiles.stripe_*`, `organizations.seats_paid`, `plan`, `trial_ends_at` |
| KPI measurements | `client_metrics` |
| AI history and context | `ai_conversations`, `ai_messages`, `user_profiles` |

That is the majority of the product, and **Oxygen is the stated differentiator**.

This is not a criticism of the document — it is clearly a core-domain sketch, and the
omission is a framing issue, not an error. But it has to be stated before anyone reads it as
"the new schema", because the deletion would be silent: nobody notices a table they forgot
to design until the feature stops working.

Related and non-negotiable: **Oxygen data is legally self-only.** The only aggregation path
is `oxygen_team_aggregate` (owner-only, literal `n ≥ 5`, fail-closed behind an org flag). Any
redesign that gives Oxygen tables an `organization_id` with an org-readable policy is a
**legal** change, not a technical one. `NEW_SCHEMA.sql` leaves the Oxygen tables untouched
and says why.

---

## 6. Four decisions only you can make

Each changes the DDL. `NEW_SCHEMA.sql` picks an answer and marks it.

**1. Can one company be a client of several organizations?**
The plan says `Client.Organization (by id) // maybe it could be multiple`. That "maybe" is
the highest-stakes word in the document.

*Proposal:* model `client` as an **engagement** — the relationship between an organization
and a company — with `UNIQUE (organization_id, company_id)`. One company row, many
engagements. This also makes the agency recursion work for free, since a company that is a
client of org A can itself be org B. Costs nothing if you only ever have one org per company;
retrofitting it later costs a rewrite of every client query.

**2. Does a worker belong to exactly one organization?**
Today `profiles.organization_id` says yes, and seat billing assumes it. Keep it as a plain
FK unless you want contractors shared across orgs — in which case it is another join table
and seat counting changes meaning.

**3. Do visitors (client-side portal users) actually ship?**
This is the one item with a genuine security cost. It puts non-employees inside your auth
tenant, and every existing policy is written assuming `auth.uid()` is an org member. If it is
not on the roadmap within ~two quarters, define the tables and **do not create the policies
yet** — dormant with a comment, the way Integrations already is.

**4. Does `profiles` merge with `user_profiles`?**
The plan implies one `Person`. Merging is the right end state, but it touches
`stores/profile.setCurrency`, `functions/api/billing.js` and
`_services/context.service.js`, and `user_profiles` is the only table in the repo with a real
`CREATE TABLE` for its 21 columns. Worth doing — but as its own tranche, not folded into a
domain redesign.

---

## 7. Recommended adoption path

Do **not** big-bang this. Three tranches, each independently shippable and independently
reversible, each following the expand → backfill → switch → contract discipline.

### Tranche 1 — Person and Company *(highest value, do this first)*

Add `company`, `person`, `worker`, `client_assignment`. Backfill `person` rows from
`clients.contacts jsonb`. Dual-write for one release. Contract `clients.contacts` much later.

Ships: real contacts, queryable by email, attachable to notes and emails.
Does not touch: any existing feature table.
Prerequisite for: everything else.

### Tranche 2 — the revenue ledger

Add `profit_entry` and `churn_event`. Backfill one entry per client from the current
`mrr`/`arr`. Switch the dashboards to `sum()` over the ledger. Keep `clients.mrr` as a
trigger-maintained cache if the query cost bites — but as a *cache*, documented as derived,
never written by hand.

Ships: real MRR history, attributable changes, partial churn.
Watch: §4.7, and confirm every aggregate filters by currency.

### Tranche 3 — role and plan consolidation

One home for role, one home for plan. This is the tranche that fixes the documented
entitlement bug (`profiles.plan` vs `organizations.plan`) — and it touches the paywall, so
`scripts/proof-paywall-member.mjs` runs before and after, and the before/after outputs go in
the PR.

Ships: rule 3 satisfied, one live bug closed.
Risk: highest of the three. Billing and gating. Do it alone, with nothing else in the deploy.

**Deferred indefinitely:** `Visitor` (until §6.3 is answered), the `profiles` /
`user_profiles` merge, and anything touching Oxygen.

**Not in scope:** chat. It is the healthiest part of the schema — the only subsystem with
real `CREATE TABLE`s, real RLS and a recent, well-reasoned migration. The one change worth
making is normalizing reactions (§4.5), and that is a small standalone migration, not part of
a redesign.

---

## 8. Old → new mapping

| Today | Becomes | Note |
|---|---|---|
| `organizations` | `company` + `organization` | Billing columns stay on `organization` |
| `clients` | `company` + `client` (engagement) | Splits identity from relationship |
| `clients.contacts jsonb` | `person` rows | Real ETL — the main work of tranche 1 |
| `clients.csm` + `csm_id` | `client_assignment` | M2M; kills the text/FK duplicate |
| `clients.mrr` / `arr` | `profit_entry` | Optionally a derived cache |
| `clients.churned_at` | `churn_event` | Many events, with reasons |
| `clients.status` / `lifecycle` / `pipeline_stage` | `client.lifecycle` + `client.is_valid` | Three columns → two, with distinct meanings |
| `profiles` | `person` + `worker` | Plan/Stripe columns move to `organization` |
| `profiles.org_role` + `organization_members.role` | `worker.role` | One home |
| `client_notes`, `planning_events` (client-facing) | `interaction` | Both keep their own tables; interaction is the unified timeline |
| `chat_messages.reactions jsonb` | `message_reaction` | Removes the row lock |
| `chat_channel_members` | + `last_read_at` | Unread badge without a per-message table |
| `oxygen_*` | **unchanged** | Legal constraint |
| every feature table in §5 | **unchanged** | Repointed at `client.id` where they referenced `clients.id` |

---

## 9. What `NEW_SCHEMA.sql` is

- A **proposal**, in the same spirit as `SCHEMA_FROM_CODE.sql` is a reference: **not a
  migration**, and marked as such in its header.
- It specifies what the current file cannot: `NOT NULL`, defaults, foreign keys, unique
  constraints, checks, indexes, and an RLS sketch per table.
- Every decision from §6 is marked inline with the alternative it rejected, so disagreeing
  with one shows you exactly which lines to change.
- Feature tables from §5 are **not** re-specified — they are listed as retained, with the
  one column that has to change (`client_id` now pointing at the engagement).

Before it becomes real DDL: dump the actual schema from pre-prod (§1) and reconcile. Several
inferred types in the current file are wrong, and porting a guess into a new schema is how a
guess becomes a fact nobody questions.
