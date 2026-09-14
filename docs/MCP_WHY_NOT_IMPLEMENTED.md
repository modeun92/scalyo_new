# Why the OAuth-token DB restrictions and the OAuth consent page are not implemented

> **SUPERSEDED 14/09/2026 — both are now implemented.** Kept because the reasoning is still
> the record of why they waited, and because one part of it was wrong in an instructive way.
>
> - **The consent page is built** (`/oauth/consent`). This document argued the architecture
>   said it should not exist, because `protected-resource.ts` treated the consent screen as
>   Supabase's. That premise was wrong — Supabase owns the OAuth *mechanics*, not the page —
>   and the comment has been corrected. See [MCP_CONSENT_PAGE.md](MCP_CONSENT_PAGE.md).
> - **The RLS restrictions are written** (`20260914120000_mcp_ai_session_restrictions.sql`).
>   The blocker described below — that 28 of 35 tables have no policy definition here, so a
>   policy *rewrite* would be guesswork — was accurate, and it still is. What it missed is
>   that **RESTRICTIVE** policies are ANDed with the existing permissive set and therefore
>   never touch those 28 unknown policies at all. The blocker was real for the approach
>   being considered; it does not apply to the one that was used.
>   See [MCP_OPEN_QUESTIONS.md](MCP_OPEN_QUESTIONS.md) Q2.
>
> The evidence below (the 28-of-35 count, the D-14 silent-failure risk) remains correct and
> is why the migration uses the technique it does.


**Written:** 14/09/2026
**About:** the two items from
[`SCALYO_MCP_SECOND_REVIEW_AND_PRODUCTION_READINESS.md`](reviews/SCALYO_MCP_SECOND_REVIEW_AND_PRODUCTION_READINESS.md)
(§4 / P0.2 and §10 / P0.5) that were **not** fixed in the 14/09/2026 MCP change.
**Companion:** [MCP_OPEN_QUESTIONS.md](MCP_OPEN_QUESTIONS.md) — the decisions needed to close them.

Short version: both are real gaps, both are still open, and neither was skipped because it
was hard. Each one needs something this repository does not contain — the live RLS policy
set in one case, the Supabase OAuth server's consent configuration in the other — and
guessing at either produces a change that breaks the **website**, not just MCP.

This document is the reason, with the evidence. It is not an argument that the work should
not be done.

---

## 1. OAuth-token database restrictions (review §4, P0.2)

### The gap, stated plainly

The MCP Worker is read-only. **The token is not.**

```
                 OAuth access token
                         |
          +--------------+--------------+
          |                             |
          v                             v
   Scalyo MCP Worker            Supabase REST, directly
          |                             |
  6 read-only tools,           whatever normal user RLS
  column allowlists,           allows: UPDATE, DELETE,
  notes/contacts withheld      client_notes, contacts, …
```

Everything MCP promises — read-only, no notes, no contacts — is a property of
`app-v2/mcp-worker`, not of the credential it was handed. Anyone holding that token can
skip the Worker entirely and talk to PostgREST.

That is exactly what the review says, and it is correct.

### Why it was not fixed

**The migration cannot be written against what this repository can see.**

The fix is one clause — `and not public.is_ai_session()` — added to every write policy and
every sensitive-table read policy. Adding a clause to a policy means **rewriting that
policy**, which means knowing its current `USING` and `WITH CHECK` expressions exactly.

Here is what the repository actually contains:

```
tables the code touches ........................ 35
tables with ANY write policy visible in the repo .. 7
   clients, client_notes, client_metrics, quotes,
   chat_channels, chat_messages, email_templates

tables with NO repo-visible write policy ....... 28
   activity_log, ai_conversations, ai_messages, alpha_feedback,
   api_keys, chat_channel_members, copils, invitations,
   notifications, org_email_config, org_integrations,
   organization_members, organizations, oxygen_checkins,
   oxygen_daily, oxygen_recoveries, planning_events, playbooks,
   profiles, projects, promo_codes, roadmaps, sent_emails,
   snapshots, tasks, team_members, user_profiles, webhooks
```

Counted from `supabase/migrations/` + `app-v2/frontend/supabase/migrations/` against the
35 tables in `SCHEMA_FROM_CODE.sql`. It is the same fact `CLAUDE.md` already records from
the other direction: only 8 of 35 tables have a `CREATE TABLE` anywhere here — the rest
were created in the Supabase dashboard and exist in this repo only as `ALTER`s and a
partial set of policies.

So for 28 of 35 tables I would be writing `CREATE OR REPLACE POLICY` against an expression
I have never seen. Two ways that goes wrong, both silent:

1. **The rewritten policy is more permissive than the original.** A dropped
   `organization_id` check in a policy I reconstructed from call sites is a cross-tenant
   hole — introduced by a change whose stated purpose was to *tighten* security.
2. **The rewritten policy stops matching.** The website's own writes start failing. Not a
   degraded AI feature: Scalyo stops saving tasks. And per this repo's own doctrine
   (`D-14`/`D-15`), a PostgREST `UPDATE` matching zero rows returns **204 with
   `error = null`** — a false success no error check catches. That is documented here as
   the exact bug that made chat reactions silently do nothing. The same failure across 28
   tables would not announce itself.

`SCHEMA_FROM_CODE.sql` is not a substitute: its own header marks every inferred column as
inferred, and it reconstructs *columns* from CRUD call sites — it reconstructs no policy
expressions at all, because call sites do not contain them.

### The second reason: the claim to key off does not provably exist

`is_ai_session()` has to distinguish an MCP/OAuth session from a website session. The
obvious key is the `client_id` claim. Whether Supabase's OAuth server actually puts it
there, and whether normal session tokens lack it, is
[MCP_OPEN_QUESTIONS.md](MCP_OPEN_QUESTIONS.md) Q1 — the same unknown that keeps
`MCP_TOKEN_BINDING` in `observe`.

Writing 28 policy rewrites keyed on a claim that may not be present would produce either a
no-op (every session looks non-AI, nothing is restricted, and the consent screen's promise
is still false) or a lockout (every session looks AI, and the website cannot write).

### What was done instead

The binding work that *is* verifiable from here was done, and it narrows this gap without
closing it: `checkTokenBinding()` rejects tokens not issued for the MCP resource, and
`MCP_ALLOWED_OAUTH_CLIENTS` restricts which OAuth clients are accepted at all. That
controls **who gets a token for MCP**. It does not control **what that token can do
elsewhere**, which is the part that needs the database.

### What it would take

1. A decision on urgency. There is a defensible reading in which this is not a launch
   blocker — see below.
2. `select * from pg_policies where schemaname = 'public';` from the live project. With
   that, the migration is mechanical and reviewable.
3. Confirmation of the claim from Q1.
4. Pre-prod first, with the website's write paths exercised — not just MCP's reads.

### The honest counter-argument on severity

Whether this is an escalation depends on who holds the token:

- **the user themselves** — no escalation. They can already update clients and read notes
  in the Scalyo UI. The token grants them nothing they did not have.
- **the AI host, or anything that reaches the token inside it** — a real escalation. The
  user consented to "view my portfolio" and handed over a credential that can also write.

The second is why it matters for a consent screen that says *"It cannot: modify customers,
view private notes"*. Today that sentence is true of the Worker and false of the token.
Which is the direct link to the next section.

---

## 2. The OAuth consent page (review §10, P0.5)

### What exists

Nothing. Verified, not assumed:

```
app-v2/frontend/src/views/           no consent view
app-v2/frontend/src/router/index.js  no /oauth route
grep -r "oauth/consent" src/         no hits
```

The only OAuth code in the front end is the **dormant Integrations module**, where Scalyo
is the OAuth *client* to Slack, HubSpot, Jira and friends. That is the opposite direction
and reuses nothing.

### Why it was not built

**Because the architecture currently says it should not exist, and the review says it
should — and I could not determine which is right without the Supabase project.**

`src/auth/protected-resource.ts` is explicit, and the comment predates this change:

> Scalyo is the RESOURCE server only. Supabase is the AUTHORIZATION server — it owns the
> login, the consent screen, dynamic client registration and revocation. That is why this
> Worker has no `/authorize` route, no KV namespace and no workers-oauth-provider:
> building our own consent UI here would duplicate an OAuth 2.1 server Supabase already
> operates against the same user table.

Under that design the consent screen is **Supabase's**, rendered by Supabase, and a
Scalyo-hosted page at `scalyo.app/oauth/consent` would have nothing to hook into: the
authorization endpoint the connector is redirected to belongs to Supabase, not to us.

Building one anyway means one of two much larger changes:

| Option | What it actually is |
|---|---|
| Configure Supabase to redirect its authorization flow to a Scalyo-hosted consent page | depends on whether Supabase's OAuth server supports a custom consent URL at all — a dashboard capability I cannot check from here |
| Run our own OAuth 2.1 authorization server (`workers-oauth-provider` + KV) | Scalyo becomes an authorization server: issuing, storing and revoking tokens, plus dynamic client registration. That reverses an explicit architecture decision and adds a credential-issuing surface to a product whose current MCP security story is *"we hold no secrets that bypass RLS"* |

Scaffolding a consent page that no authorization flow ever routes to would be worse than
having none: it would look like the gap was closed. `MOCK_CODE_AUDIT.md` exists in this
repository precisely because that pattern has shipped here before.

### The part that is a real problem regardless

Independent of *where* the consent screen lives, the review's proposed wording is:

```
It cannot:
✗ Modify customers
✗ Send emails
✗ View private notes
✗ Modify billing
```

**Three of those four are not currently enforceable against the token** — that is §1 of
this document. So the consent copy and the database restrictions are the same problem seen
twice: a promise on a screen, and the mechanism that would make it true.

Order matters. Fix §1 first, then write consent copy that is true; a consent screen
shipped first is a written commitment to users that the system does not keep.

### What it would take

1. Confirmation of which consent screen is in play — Supabase's own, or a custom redirect
   if the OAuth server supports one.
2. If Supabase's: whether its wording can be configured to carry those four lines, and if
   not, what it does say — because that is what users actually agree to.
3. Either way: end-to-end verification of the flow the review lists (approve, deny, PKCE,
   refresh, **revoke**). Revocation in particular is worth testing rather than assuming —
   the Worker pays a network hop to `/auth/v1/user` on every single request specifically so
   that a revoked connection stops working immediately, and that property has never been
   exercised against a live project.

---

## 3. What I could have done and deliberately did not

Stated plainly, so the choice is reviewable rather than invisible:

- **I could have written the RLS migration as a proposal file** (like `NEW_SCHEMA.sql`,
  which this repo marks "a proposal, not a migration"). I did not, because a file of 28
  `CREATE OR REPLACE POLICY` statements built on invented expressions is a loaded gun in a
  `supabase/migrations/` directory — the next person to run it in order would break the
  website. The draft `is_ai_session()` function in
  [MCP_OPEN_QUESTIONS.md](MCP_OPEN_QUESTIONS.md) Q2 carries the idea without the hazard.
- **I could have scaffolded the consent page.** I did not, for the reason above: a page
  nothing routes to reads as a closed gap.

Both remain available. If you want either as an explicitly-marked proposal, say so — for
the migration I would need the `pg_policies` dump first, and I would write it against that
rather than against inference.

---

## Summary

| Item | Status | Blocked on | Not blocked on |
|---|---|---|---|
| §4 / P0.2 — restrict AI tokens in the database | **open** | the live `pg_policies` set (28 of 35 tables invisible here); confirmation of the `client_id` claim; a severity decision | effort, or agreement that it is a real gap |
| §10 / P0.5 — OAuth consent page | **open** | which consent screen the Supabase OAuth server actually renders, and whether a custom one is supported | effort |

Both are recorded as open items in [MCP_SERVER.md](MCP_SERVER.md#open-items) and
[`CLAUDE.md`](../CLAUDE.md#known-open-items). Neither should be treated as done, and MCP
should not be described to customers as "read-only" without the qualifier in §1.
