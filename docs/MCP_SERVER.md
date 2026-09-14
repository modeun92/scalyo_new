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
| `get_server_status` | Connection check and the identity of the connected Scalyo user. |
| `get_portfolio_summary` | Client count, total ARR, ARR at risk, average health, status distribution, renewals, overdue tasks. |
| `search_clients` | Accounts by name, optionally filtered by effective status, lifecycle or renewal date. |
| `get_client_overview` | One account in detail, by id. |
| `get_at_risk_clients` | Accounts needing attention, ranked, each with machine-readable `riskReasons`. |
| `get_upcoming_renewals` | Renewals within N days, strictly future-dated. |
| `get_my_tasks` | The signed-in user's own tasks, each flagged overdue or not. |
| `search` / `fetch` | Thin adapters over `search_clients` / `get_client_overview` for ChatGPT's connector contract. They add **no** new data access. |

Tools express **goals, not tables**. `get_at_risk_clients` exists instead of a generic
`list_clients` precisely so the model does not invent its own definition of "at risk" and
then contradict the Scalyo UI in front of the customer.

Every tool returns JSON. The model writes the prose — which also keeps this Worker out of
the language policy, since it never emits a sentence that would need translating.

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

### 2. Worker secrets

```sh
cd app-v2/mcp-worker
npm install
wrangler secret put SUPABASE_URL      --env preprod
wrangler secret put SUPABASE_ANON_KEY --env preprod
```

**Never bind `SUPABASE_SERVICE_ROLE_KEY` to this Worker.** Its absence is the control that
keeps a future contributor from reaching for an RLS-bypassing client.

### 3. Rate-limit namespaces

Already declared in `wrangler.jsonc`, one triple per environment. The `namespace_id` values
are arbitrary positive integers unique to the account — changing one **resets its counters**.

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

## Open items

- **OAuth-client-aware authorization is not implemented.** The `client_id` claim is decoded
  and audited, but every valid Supabase token gets the same read surface. Restricting
  unknown OAuth clients to a narrower subset is the next security step.
- **`get_portfolio_summary` scans at most 200 accounts.** Beyond that it returns
  `partial: true` with a note rather than a quietly wrong total. A portfolio of 350+ accounts
  needs a server-side aggregate (an RPC) before the figures are complete.
- **The ChatGPT `search`/`fetch` contract is written to the known convention** and needs
  confirming against OpenAI's current connector requirements before publication.
- **Roles are audited, not enforced.** All four roles get the same read surface. That
  matches the product today — every role can read the portfolio in the UI — but a
  `viewer`-specific restriction would need adding here as well as in RLS.
