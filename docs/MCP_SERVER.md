# Scalyo MCP server

The customer-facing MCP surface: a **separate Cloudflare Worker** that lets a Scalyo user
connect their account to Claude, ChatGPT or any other MCP client and ask questions about
their own portfolio.

It is **read-only**, it preserves Supabase RLS, and it is deployed and rolled back
independently of the website.

> Not to be confused with the root [`.mcp.json`](../.mcp.json), which wires *Cloudflare's*
> MCP servers into developer tooling and exposes no Scalyo data. See
> [DEVELOPMENT.md](DEVELOPMENT.md#cloudflare-mcp-servers-agent-tooling).

Code: `app-v2/mcp-worker/`.

---

## Shape

```
Claude / ChatGPT
      |  MCP Streamable HTTP + OAuth 2.1 bearer
      v
mcp.scalyo.app/mcp          <- this Worker (resource server)
      |  anon key + the USER's access token
      v
Supabase  ->  RLS  ->  the user's own rows
```

Supabase is the **authorization server**: it owns the login, the consent screen, dynamic
client registration and revocation. This Worker is only the **resource server** — which is
why it has no `/authorize` route, no KV namespace and no `workers-oauth-provider`. Building
a consent UI here would duplicate an OAuth 2.1 server Supabase already runs against the
same user table.

The website is untouched: Pages and its Functions still serve `scalyo.app`. MCP is an
additional surface, not a replacement.

### Why a separate Worker

Pages Functions cannot host this cleanly, and the isolation is the point: MCP deploys
without redeploying the front end, has its own secrets, its own rate limits, its own logs,
and its own kill switch. During an incident MCP can be turned off while the product keeps
running.

---

## Routes

| Route | Auth | Purpose |
|---|---|---|
| `GET /health` | none | Liveness. Returns environment and whether MCP is enabled. |
| `GET /.well-known/oauth-protected-resource` | none | RFC 9728 metadata. Also served at `/.well-known/oauth-protected-resource/mcp` because clients disagree on whether to append the resource path. |
| `* /mcp` | **bearer required** | MCP Streamable HTTP. |

An unauthenticated `/mcp` request returns **401 with `WWW-Authenticate: Bearer …
resource_metadata="…"`**. That header is not a failure — it is what tells Claude and
ChatGPT where to find the authorization server, and it is the step that makes Scalyo
*installable* rather than a token the user has to paste by hand.

---

## The tools (v1 — read-only)

| Tool | Returns |
|---|---|
| `get_server_status` | Connection check: role and organization status only — no identifiers, no email. |
| `get_portfolio_summary` | Client count, total ARR, ARR at risk, average health, status distribution, renewals, overdue tasks. |
| `search_clients` | Accounts by name, optionally filtered by effective status, lifecycle or renewal date. |
| `get_client_overview` | One account in detail, by id. |
| `get_at_risk_clients` | Accounts needing attention, ranked, each with machine-readable `riskReasons`. |
| `get_upcoming_renewals` | Renewals within N days, strictly future-dated. |
| `get_my_tasks` | The signed-in user's own tasks, each flagged overdue or not. |
| `search` / `fetch` | Thin adapters over `search_clients` / `get_client_overview`, needed **only** for ChatGPT Company Knowledge. They add **no** new data access. Ordinary MCP use, Claude included, does not need them — delete them if Company Knowledge is dropped ([MCP_OPEN_QUESTIONS.md](MCP_OPEN_QUESTIONS.md) Q3). |

Tools express **goals, not tables**. `get_at_risk_clients` exists instead of a generic
`list_clients` precisely so the model does not invent its own definition of "at risk" and
then contradict the Scalyo UI in front of the customer.

Every tool returns JSON. The model writes the prose — which also keeps this Worker out of
the language policy, since it never emits a sentence that would need translating.

Every tool also declares, explicitly rather than by default:

| Field | Value | Why it is declared rather than implied |
|---|---|---|
| `title` | a human phrase ("Accounts needing attention") | what the host shows a user in a permission prompt |
| `annotations.readOnlyHint` | `true` | lets a host skip a write confirmation, and makes the day a write tool appears a visible diff |
| `annotations.destructiveHint` | `false` | v1 cannot destroy anything |
| `annotations.openWorldHint` | `false` | Scalyo's own database only — no web access, no third-party call |
| `outputSchema` | a zod object per tool | the SDK validates `structuredContent` against it on every call |

Results carry **both** `structuredContent` and a compact text rendering of the same object
(`MCP-STRUCTURED-RESULT`). The structured copy is what a host parses; the text block is the
fallback for a client that ignores structured results. An **error** result deliberately
carries no `structuredContent` — the SDK exempts `isError` from schema validation, and an
error shaped like a successful payload is exactly how a model ends up reporting "0 clients"
for a failed read (R21 / D-14).

`get_server_status` returns **role and organization status only** — no `userId`, no
`organizationId`, no `requestId`, and no **email** (`MCP-STATUS-MINIMAL`). It is the tool an
assistant calls first and quotes back verbatim, so anything identifying in it ends up
pasted into a chat transcript that leaves the EU; an email address is personal data under
GDPR and "which account am I connected as" does not justify shipping it to a third-party
model on every connection check. All of it stays in the audit log.

Every list-shaped result carries **two different honesty flags** (`MCP-PARTIAL-HONEST`):

| Flag | Means |
|---|---|
| `truncated` | more results matched than the caller's `limit` asked for |
| `partial` | the 200-row scan ceiling was hit, so matches may exist that were **never fetched** |

They are not the same statement, and conflating them is how a model tells a customer "you
have 3 at-risk accounts" when the 4th simply sat past the scan window. `partialNote` says
it in words. The real fix at scale is a database-side filter or an RPC; until then the flag
is what keeps the answer honest.

Connector results deep-link to `https://scalyo.app/app/clients/<id>` (`MCP-CLIENT-URL`).
The authenticated area is mounted under `/app` — the shorter `/clients/<id>` 404s, and it
404s *in the user's browser*, so no tool call would ever have reported it.

### Not exposed, deliberately

No write tools. No `delete_client`, `send_email`, `invite_member`, `create_quote`, no
generic RPC execution. v2 write tools wait until the read surface has production telemetry.

No **contacts**, no **free-form notes**, no billing or integration secrets, no Oxygen
workload columns. `context.service.js` already excluded contacts and notes from the AI
prompt on GDPR grounds (D3); MCP does not quietly reverse that decision. Adding them is a
privacy review, not a refactor — `get_client_overview` names the withheld fields in its
response so the model reports them as withheld rather than as empty.

---

## Security model

| Control | Where |
|---|---|
| RLS is the tenant boundary | `src/supabase/user-client.ts` — anon key + the user's token, never the service role |
| The service-role key is **not bound to this Worker** | `wrangler.jsonc` / `src/env.ts` |
| Tenant context is derived server-side | `src/auth/user-context.ts` — no tool accepts `user_id`, `organization_id` or `role` |
| Tenant context is **deterministic** | `src/auth/user-context.ts` — `profiles.organization_id` is canonical, cross-checked against `organization_members` |
| Tokens are checked against **this** resource | `src/auth/verify-token.ts` — issuer, expiry, audience/resource, OAuth-client allowlist |
| An AI token is read-only **in the database too** | `supabase/migrations/20260914120000_mcp_ai_session_restrictions.sql` — RESTRICTIVE policies keyed on `is_mcp_session()` |
| …including Storage and SECURITY DEFINER RPCs | `supabase/migrations/20260914130000_mcp_rpc_and_storage_restrictions.sql` |
| A release gate that fails on a missing control | `public.mcp_security_check()` — must return zero rows before a production deploy |
| A misconfigured binding mode refuses to start | `src/env.ts` — an unrecognised `MCP_TOKEN_BINDING` throws (`MCP-BINDING-MODE-STRICT`) |
| No caller-built queries | column + operator allowlists, values quoted; no `sql`/`where`/`filter` parameter exists |
| Output minimization | explicit column lists; `select=*` throws |
| Bounded reads | default 10, max 50 per tool, hard cap 200 rows per query |
| Distributed rate limiting | three Cloudflare rate-limit namespaces: pre-auth IP, per-user, per-heavy-tool |
| Audit trail | `src/audit/mcp-audit.ts` — one JSON line per event, never a token, never a row payload |
| Safe errors | `src/errors.ts` — categories + `requestId`; no stack, no PostgREST body |

Two details worth keeping:

- **`NOT_FOUND` is deliberately ambiguous.** Answering "no such client" for one UUID and
  "forbidden" for another would turn `get_client_overview` into a cross-tenant existence
  oracle.
- **A read failure is never an empty result (R21).** An unreachable database returns
  `UPSTREAM_UNAVAILABLE`, never `clientCount: 0` — an AI client would report that as "you
  have no customers".

---

## Token resource binding (`MCP-RESOURCE-BINDING`)

`/auth/v1/user` proves *"this is a live Scalyo user token"*. It does **not** prove *"this
token was issued for `https://mcp.scalyo.app/mcp`"*. Those are different guarantees, and
without the second one a token minted for any other purpose in the same Supabase project
is accepted by an endpoint an external AI client can reach.

`checkTokenBinding()` is the second guarantee. Before the call to Supabase Auth it checks:

| Check | Failure reason token |
|---|---|
| payload decodes | `unparseable_token` |
| `iss` is this project's `/auth/v1` | `issuer_mismatch` |
| `exp` is in the future | `expired` |
| `aud` **or** the RFC 8707 `resource` claim names this resource | `audience_mismatch` |
| `client_id` is in `MCP_ALLOWED_OAUTH_CLIENTS`, when that list is non-empty | `client_not_allowed` |

A normal Scalyo **website session token** carries `aud: "authenticated"` and therefore fails
`audience_mismatch`. That is the intended outcome: it is a valid user token that was not
issued for MCP.

The resource identifier is derived in exactly **one** place, `canonicalResourceUrl()`, so
the value advertised in discovery and the value validated are the same string. A client
that dutifully requests `resource=<advertised>` must not then be 401'd for an audience we
never advertised. `MCP_RESOURCE_URL` wins; the request origin is only the `wrangler dev`
fallback, because an attacker-chosen `Host` header must not be able to redefine what a
token is bound to.

### `MCP_TOKEN_BINDING` — observe, then enforce

| Mode | Behaviour |
|---|---|
| `observe` | the verdict is computed and audited on every request, and the request is **served** |
| `enforce` | a token that is not bound is rejected `UNAUTHENTICATED`, **before** the round trip to Supabase Auth |

An unrecognised value is a **hard startup error** (`MCP-BINDING-MODE-STRICT`, third review
§10). It used to read as `observe`, which is backwards for a security control:
`MCP_TOKEN_BINDING=enfroce` would have meant the deploy that was supposed to *start*
enforcing quietly kept serving unbound tokens, with the only evidence an audit field nobody
was watching any more *because the flip was believed done*. Now `getConfig()` throws, the
Worker serves 500 and audits it, and somebody notices in a minute.

Pre-production runs in `enforce` — a wrong-resource token has to actually fail somewhere
before production, and observing it proves nothing. **Production ships in `observe`** and
stays there until a real ChatGPT connection and a real Claude connection have both been
seen `bound: true` in the pre-prod audit lines:

```
event = "mcp.auth.binding"   →  mode, bound, bindingReasons, claimedAudience
```

`claimedAudience` is what the token actually claims. Read it from a live connection of each
host, confirm it matches `MCP_RESOURCE_URL`, then flip production:

```sh
wrangler deploy --env production   # after setting MCP_TOKEN_BINDING: "enforce" in wrangler.jsonc
```

Flipping it blind is the one change in this Worker that can break every connector
simultaneously. Whether Supabase's OAuth server emits a resource-bound audience at all is
still open — see [MCP_OPEN_QUESTIONS.md](MCP_OPEN_QUESTIONS.md) Q1.

---

## Which organization a request reads (`MCP-ORG-DETERMINISTIC`)

The organization comes from **`profiles.organization_id`** — the same canonical source
`stores/auth.js` uses — and is then cross-checked against `organization_members`:

| Profile org | Membership rows | Result |
|---|---|---|
| set | a row for that org | that org; role from the membership row |
| set | rows, none for that org | **FORBIDDEN** — the two sources disagree and guessing would invent a tenant |
| set | none at all | that org; role from `profiles.org_role` (the legacy owner shape) |
| absent | exactly one | that org, source `sole_membership` |
| absent | more than one | **FORBIDDEN** — ambiguous |
| absent | none | no organization; org-scoped tools refuse |

It used to be `organization_members limit 1`, which is whichever row Postgres felt like
returning. With two memberships the answer to "my portfolio" could differ between two calls
a second apart, and the user had no way to tell which company they had just been shown.

---

## Health scale parity

`src/domain/health.ts` is the **third** mirror of the /10 scale, after
`src/lib/health.js` (canonical) and `functions/api/_services/context.service.js`. A separate
Worker cannot import from the Pages app, so this is a copy — and the cost of drift is now
higher than it used to be: a wrong threshold no longer just makes a screen disagree with a
prompt, it makes ChatGPT tell a customer an account is healthy while Scalyo shows it
critical.

`test/health-parity.test.ts` reads the other two files and **fails if the numbers diverge**.
Run it before any change to the scale.

---

## Setup

### 1. Supabase — enable the OAuth 2.1 server

In the Supabase dashboard, **pre-production first**:

1. Authentication → OAuth Server → enable.
2. Configure the authorization path and consent screen.
3. Enable **dynamic client registration** (Claude and ChatGPT both register themselves;
   without it every client must be added by hand).
4. Consider asymmetric JWT signing keys, as Supabase recommends for OAuth/OIDC.

Access tokens it issues are standard Supabase JWTs carrying `user_id`, `role` and
`client_id`, so existing RLS applies unchanged and `/auth/v1/user` validates them.

5. Confirm what the issued token carries as its **audience**. If Supabase echoes the RFC
   8707 `resource` parameter into `aud` or a `resource` claim, the binding check above can
   be enforced. If it does not, `MCP_TOKEN_BINDING` must stay `observe` and the binding has
   to come from somewhere else — see [MCP_OPEN_QUESTIONS.md](MCP_OPEN_QUESTIONS.md) Q1.

### 2. Worker secrets

```sh
cd app-v2/mcp-worker
npm install
wrangler secret put SUPABASE_URL      --env preprod
wrangler secret put SUPABASE_ANON_KEY --env preprod
```

**Never bind `SUPABASE_SERVICE_ROLE_KEY` to this Worker.** Its absence is the control that
keeps a future contributor from reaching for an RLS-bypassing client.

The non-secret vars live in `wrangler.jsonc` per environment:

| Var | preprod | production | Meaning |
|---|---|---|---|
| `MCP_RESOURCE_URL` | `https://mcp-preprod.scalyo.app/mcp` | `https://mcp.scalyo.app/mcp` | the one resource identifier advertised and validated |
| `MCP_TOKEN_BINDING` | `enforce` | `observe` | see above before changing production |
| `MCP_ALLOWED_OAUTH_CLIENTS` | empty | empty | comma-separated `client_id` allowlist; empty = any client registered with Supabase |
| `MCP_ENABLED` | `on` | `on` | the incident kill switch |

### 3. Rate-limit namespaces

Already declared in `wrangler.jsonc`, one triple per environment. The `namespace_id` values
are arbitrary positive integers unique to the account — changing one **resets its counters**.

| Namespace | Limit | Why |
|---|---|---|
| `MCP_RATE_LIMIT_IP` | 600 / min | pre-auth flood protection only. Deliberately **high**: ChatGPT and Claude call from a shared provider egress range, so every Scalyo customer on the same host arrives on a handful of IPs. At 60/min the first busy customer of the minute throttles every other customer, and the ticket reads "Scalyo is down", not "rate limited". |
| `MCP_RATE_LIMIT_USER` | 120 / min | the real ceiling, per authenticated user |
| `MCP_RATE_LIMIT_HEAVY` | 20 / min | portfolio aggregations, which read the whole client page on every call |

Tune these from production telemetry, not from assumptions.

### 4. Deploy

```sh
npm run deploy:preprod
curl https://mcp-preprod.scalyo.app/health
```

Local development:

```sh
printf 'SUPABASE_URL=...\nSUPABASE_ANON_KEY=...\n' > .dev.vars   # git-ignored
npm run dev
```

---

## Connecting a client

**Claude** — Settings → Connectors → Add custom connector → `https://mcp.scalyo.app/mcp`.
The OAuth flow runs in the browser against Supabase.

**ChatGPT** — add it as a connector with the same URL. Verify the `search`/`fetch` contract
against OpenAI's current connector documentation before publication; it has changed before.

**Any MCP client** — the endpoint is standards-based. Do not design anything here around a
particular vendor's UI.

---

## Before every deploy

```sh
cd app-v2/mcp-worker
npm run typecheck
npm test
```

And against pre-production, with two throwaway accounts in two different organizations:

```sh
SCALYO_TEST_SUPABASE_URL=... \
SCALYO_TEST_SUPABASE_ANON_KEY=... \
SCALYO_TEST_ORG_A_TOKEN=... SCALYO_TEST_ORG_A_CLIENT_ID=... \
SCALYO_TEST_ORG_B_TOKEN=... SCALYO_TEST_ORG_B_CLIENT_ID=... \
npm run test:isolation
```

`test/tenant-isolation.test.ts` has **no mocks**. A mocked Supabase would only prove that
our fake returns what we told it to — the exact class of false signal
[MOCK_CODE_AUDIT.md](MOCK_CODE_AUDIT.md) exists to catch, and "cross-tenant isolation
verified" is the worst possible thing to be wrong about. It therefore **skips** when
credentials are absent and says so loudly.

**A skipped isolation run is not a pass.** Never ship MCP to production on one.

---

## Incidents

Disable MCP without touching the website:

```sh
wrangler deploy --env production --var MCP_ENABLED:off
```

`/mcp` then returns 503 and `/health` reports `enabled: false`.

Useful log queries (Workers Logs — every line is JSON):

| Signal | Filter |
|---|---|
| Authentication failures | `event = "mcp.auth.failure"` |
| Cross-tenant attempts | `event = "mcp.tool.completed" AND errorCode = "NOT_FOUND"` |
| Rate limiting | `event = "mcp.tool.rate_limited"` |
| Tool usage and latency | `event = "mcp.tool.completed"` → `tool`, `durationMs` |
| Which OAuth clients are connecting | `oauthClientId` |

Alert on: a spike in `mcp.auth.failure`, repeated `NOT_FOUND` from one `userId`
(cross-tenant probing), and any rise in `UPSTREAM_UNAVAILABLE`.

---

## Making an AI token read-only in the database

The Worker is read-only. The **token** was not: pointed straight at Supabase REST it got
whatever normal user RLS allowed, including writes and the tables MCP withholds. So the
read-only promise was a property of this Worker, not of the credential.

`supabase/migrations/20260914120000_mcp_ai_session_restrictions.sql` closes that with
**RESTRICTIVE** policies keyed on `public.is_mcp_session()` (the `ai_agent` JWT claim):

```
final access = (any permissive policy passes) AND (every restrictive policy passes)
```

Restrictive policies are ANDed with the existing permissive set, so the 28 tables whose
policies live only in the Supabase dashboard are never read, rewritten or replaced — which
is what made this writable from the repository at all. For a website session
`is_mcp_session()` is false, so every restriction passes and behaviour is unchanged.
`service_role` bypasses RLS, so the Pages API functions are unaffected.

It denies INSERT/UPDATE/DELETE on all 35 tables and SELECT on 15 sensitive ones, while
leaving `clients`, `tasks`, `profiles`, `organization_members`, `organizations` and
`client_metrics` readable — exactly what the tools need.

**It is inert until the access-token hook is live**, because nothing stamps `ai_agent` yet.
A deployed migration is not a deployed control; the Worker's audit line says which state
you are in:

```
event = "mcp.auth.binding"  →  aiAgent: true   (the hook is live)
```

### Two doors table policies do not close

Restricting `public.<tables>` is not the whole credential boundary
(`20260914130000_mcp_rpc_and_storage_restrictions.sql`):

- **Supabase Storage.** `storage.objects` has its own policies. A token that cannot
  `UPDATE` a row in `public.clients` could still upload, overwrite or delete a COPIL media
  file. v1 MCP has no storage tool, so **all four verbs are denied**, `SELECT` included —
  adding a read back later is one policy drop; discovering an AI client read COPIL media
  is an incident.
- **`SECURITY DEFINER` RPCs.** These run with the *function owner's* privileges, so a
  restrictive policy on the table they write does not stop them — that is what
  `SECURITY DEFINER` means. `POST /rest/v1/rpc/open_dm` would have created a chat channel
  for an AI session.

Six authenticated RPCs are guarded: `open_dm`, `toggle_chat_reaction`,
`set_chat_message_pinned` (writes) and `get_org_member_names`, `get_org_email_status`,
`oxygen_team_aggregate` (reads outside the v1 contract — the last is **legally self-only**
Oxygen data, and owner-only + `n >= 5` protects it from colleagues, not from an AI client
holding an owner's token).

**How they are guarded matters.** Each original is *renamed* to `<name>_unguarded` and a
same-signature wrapper takes the public name, calls `public.mcp_guard()`, then forwards.
The original body is never retyped, so the migration cannot silently revert the
concurrency fix in `toggle_chat_reaction` or the legal threshold in
`oxygen_team_aggregate` while "adding security". `EXECUTE` on each `_unguarded` original is
revoked from `authenticated` — without that revoke the guard is decoration, because
`/rest/v1/rpc/open_dm_unguarded` would still answer.

### The release gate

`public.mcp_security_check()` returns one row per problem. **A non-empty result must block a
production deploy.**

It checks **every expected policy by name** (`MCP-GATE-EXACT`), not merely that *some*
`mcp_no_*` policy exists on the table. The looser version would have reported this state as
protected:

```
mcp_no_insert_clients   present
mcp_no_update_clients   MISSING     <- writes allowed
mcp_no_delete_clients   MISSING     <- deletes allowed
```

A gate that says "protected" about a half-protected table is worse than no gate: it turns
an unknown into a false assurance, and the release proceeds *because of it*.

| Check | Catches |
|---|---|
| A | RLS disabled on a protected table (**release blocker** — every restrictive policy on it is inert), and each of `mcp_no_insert/update/delete_<table>` missing |
| B | `mcp_no_select_<table>` missing on any of the 15 sensitive tables |
| C | a table carrying `mcp_no_*` policies but absent from `mcp_protected_tables()` — list drift the gate would otherwise never notice |
| D | each of the four `mcp_no_storage_*` policies, by name (a `SELECT`-only failure is invisible to a "some policy exists" test) |
| E | an authenticated `SECURITY DEFINER` function with no `mcp_guard()`, **including one added after this migration** |
| F | a `*_unguarded` original still `EXECUTE`-able by `authenticated` — which would make its wrapper decoration |

The expected table lists live in `mcp_protected_tables()` / `mcp_sensitive_tables()` so the
gate and any future migration read one source. They are hand-synced with the arrays in
`20260914120000`; check C exists because that sync can drift.

**The gate is not executable by `authenticated`** (`MCP-GATE-PRIVATE`). It enumerates
exactly which controls are missing, which is a map of the holes for anyone holding a user
token. Release tooling runs it as the service/migration role.

### Pre-production order

Each step is verifiable before the next, and none of it can be validated from this
repository (fifth review §17):

1. **Read the real JWT claims.** Website session: `client_id` absent. Connector token:
   `client_id` present. *If that is not true, stop — the hook design is wrong.*
2. **Deploy the Custom Access Token Hook** ([MCP_ACCESS_TOKEN_HOOK.md](MCP_ACCESS_TOKEN_HOOK.md));
   confirm `ai_agent: true` and the expected audience on a real token.
3. **Apply both migrations**, then `select * from public.mcp_security_check();` → zero rows.
4. **Direct abuse tests** with a real MCP token: REST writes, sensitive reads, Storage
   read/upload/replace/delete, and `rpc/open_dm`, `rpc/toggle_chat_reaction`,
   `rpc/set_chat_message_pinned`. All denied.
5. **Normal website regression** — update a customer, create a task, use chat, upload
   media, use the RPC features. This is the step that catches a migration mistake, and it
   matters more than any of the MCP checks: the restrictions touch 35 tables plus Storage.
6. **OAuth consent**: first authorization, approve, deny, repeat authorization,
   already-authorized redirect, scope display, revocation.
7. **Live ChatGPT**, then **live Claude**: OAuth completes, binding succeeds,
   `aiAgent == true`, tools list and execute, wrong-resource token denied.
8. `MCP_TOKEN_BINDING=enforce` in production.
9. Flip `RESTRICTIONS_DEPLOYED` so the consent page may state its "it cannot…" promises
   ([MCP_CONSENT_PAGE.md](MCP_CONSENT_PAGE.md)).

---

## Tool-selection evaluation

Protocol tests prove the tools work. Nothing there proves a model *picks* the right one —
and names, titles, descriptions, schemas and annotations are exactly what drives that
choice, so any edit to them can silently change routing.

| Layer | When | What it does |
|---|---|---|
| `test/tool-selection.test.ts` | every CI run | integrity only, **no model called**: every `expectedTools` name exists, every `forbiddenTools` name does not, negatives stay negative, every business tool has a prompt |
| `test/evals/golden-prompts.json` | nightly / pre-release / before any tool-schema change / before publication | run the 12 prompts against real models, score routing accuracy, threshold **95%** |

The integrity layer catches the failure that would otherwise be invisible: rename a tool
and the eval set silently starts asserting nothing about a server that no longer exists.
The `forbiddenTools` list doubles as a guard on v1's read-only promise — the day
`add_client_note` or `send_email` is registered, that test fails and forces both the eval
set and the consent copy to be revisited.

**A passing integrity check is not a passing evaluation.** Also keep a manual smoke test in
ChatGPT and in Claude before release: host orchestration differs from raw model behaviour.

---

## Open items

- **The access-token hook is drafted, not applied** — and until it is, both the database
  restrictions and the resource binding are inert. It is the highest-blast-radius change in
  the whole MCP effort (it runs on every token issuance in the project, website logins
  included), so it is deliberately not shipped from here:
  [MCP_ACCESS_TOKEN_HOOK.md](MCP_ACCESS_TOKEN_HOOK.md).
- **The consent page's three Supabase API calls are unverified**, and the "it cannot…"
  promises are flagged off until the hook and the migration are live:
  [MCP_CONSENT_PAGE.md](MCP_CONSENT_PAGE.md).
- **`MCP_TOKEN_BINDING` is `observe` in production.** The binding is computed and audited
  but not enforced until a live ChatGPT and a live Claude token have been seen `bound` in
  pre-prod. Until then a valid Scalyo session token is still accepted.
- **The OAuth client allowlist is empty.** `MCP_ALLOWED_OAUTH_CLIENTS` is implemented and
  tested; the `client_id` values for ChatGPT and Claude are not yet known, so every client
  registered with Supabase is accepted.
- **`get_portfolio_summary` scans at most 200 accounts.** Beyond that it returns
  `partial: true` with a note rather than a quietly wrong total. A portfolio of 350+ accounts
  needs a server-side aggregate (an RPC) before the figures are complete.
- **The ChatGPT `search`/`fetch` contract is written to the known convention** and needs
  confirming against OpenAI's current connector requirements before publication. Whether
  to keep them at all is the one still-undecided question:
  [MCP_OPEN_QUESTIONS.md](MCP_OPEN_QUESTIONS.md) Q3.
- **Neither migration has ever run against a real Postgres.** They contain dynamic SQL,
  policy creation, function renames, `SECURITY DEFINER` wrappers and grants; static review
  cannot prove any of it. Pre-flight queries, verification and rollback are in their
  headers. This is the single largest untested surface in the MCP work.
- **Storage policy creation may need the storage owner role.** §1 warns rather than
  failing silently, and check D of the release gate catches the result.
- **The live model evaluation has never been run.** The cases and the integrity check
  exist; the nightly model run does not.
- **The `partial` flag is honesty, not completeness.** An organization with more than 200
  accounts gets a truthful "incomplete" rather than a wrong total, but it still does not get
  the whole picture. A server-side aggregate (an RPC) is the real fix.
- **`app-v2/frontend` has no test runner**, so `lib/oauthConsent.js` — argument shape,
  already-authorized redirect, scope parsing — is covered by review and the live checklist
  in [MCP_CONSENT_PAGE.md](MCP_CONSENT_PAGE.md), not by an automated test.
- **Roles are audited, not enforced.** All four roles get the same read surface. That
  matches the product today — every role can read the portfolio in the UI — but a
  `viewer`-specific restriction would need adding here as well as in RLS.
