# Scalyo MCP — Gap Analysis, Required Fixes, and Implementation Plan

**Repository reviewed:** `scalyo_new`  
**Review date:** 2026-09-14  
**Purpose:** Define what is currently missing for a customer-facing Scalyo MCP integration, what should be fixed before exposing it to ChatGPT or other MCP clients, and the recommended implementation order.

---

## 1. Executive summary

Scalyo is **well positioned to add an MCP server**, but the uploaded repository does **not currently contain a Scalyo MCP server**.

The repository has a root `.mcp.json`, but that file only connects developer AI tools to **Cloudflare-hosted MCP servers** for documentation, observability, builds, and bindings. It does not expose Scalyo data or Scalyo business actions to ChatGPT.

### Current readiness

| Area | Status | Notes |
|---|---|---|
| Cloudflare backend | Good | Existing Pages Functions under `app-v2/frontend/functions/api/` |
| Supabase database | Good | Existing tenant model, RLS migrations, Auth, storage |
| User authentication | Good foundation | Existing JWT validation against Supabase Auth |
| Tenant isolation | Good foundation | Existing organization model and RLS policies |
| AI/data-minimization patterns | Good | `context.service.js` already uses the user's JWT and explicit columns |
| Scalyo MCP endpoint | **Missing** | No public `/mcp` endpoint |
| MCP SDK / handler | **Missing** | No MCP server dependency or handler in `package.json` |
| MCP tools | **Missing** | No Scalyo tool definitions |
| MCP OAuth flow | **Missing** | No MCP authorization/consent integration |
| MCP audit logging | **Missing** | No dedicated MCP tool-call audit trail |
| MCP production rate limiting | **Missing / insufficient** | Existing in-memory rate limiter is not suitable as the only production control |

### Main recommendation

Create a **separate Cloudflare Worker for MCP**, deployed at a URL such as:

```text
https://mcp.scalyo.app/mcp
```

Use:

- Cloudflare Worker as the MCP transport/runtime.
- Supabase Auth OAuth 2.1 for customer authentication.
- The authenticated user's Supabase access token for read-only data access.
- Existing Supabase RLS as the primary tenant/data boundary.
- Explicit, goal-oriented MCP tools rather than wrapping every REST/database operation.

For version 1, expose **read-only tools only**.

---

# 2. What exists today

## 2.1 `.mcp.json` is developer tooling, not the Scalyo MCP server

Current repository file:

```text
/.mcp.json
```

It contains Cloudflare-hosted servers such as:

```json
{
  "mcpServers": {
    "cloudflare-docs": {
      "type": "http",
      "url": "https://docs.mcp.cloudflare.com/mcp"
    },
    "cloudflare-observability": {
      "type": "http",
      "url": "https://observability.mcp.cloudflare.com/mcp"
    },
    "cloudflare-builds": {
      "type": "http",
      "url": "https://builds.mcp.cloudflare.com/mcp"
    },
    "cloudflare-bindings": {
      "type": "http",
      "url": "https://bindings.mcp.cloudflare.com/mcp"
    }
  }
}
```

This is correctly documented in:

```text
docs/DEVELOPMENT.md
```

as developer tooling that ships no application code.

### Therefore

This exists:

```text
Developer AI
    |
    v
Cloudflare MCP services
    |
    v
Cloudflare docs / logs / builds / bindings
```

This does **not** exist yet:

```text
Scalyo customer
    |
    v
ChatGPT / MCP client
    |
    v
Scalyo MCP server
    |
    v
Scalyo customer data
```

---

## 2.2 Existing authentication foundation

Scalyo already validates Supabase user tokens in:

```text
app-v2/frontend/functions/api/_services/auth.service.js
```

`verifyJwt()` sends the bearer token to Supabase Auth and returns the authenticated user ID.

This is a useful foundation and the same user identity can be used for MCP.

---

## 2.3 Existing RLS-aware access pattern is useful for MCP

A particularly good existing pattern is in:

```text
app-v2/frontend/functions/api/_services/context.service.js
```

That service deliberately calls Supabase REST with:

- the Supabase anon key; and
- the **user's JWT**.

The comments explicitly state that RLS should apply and that the service should never see more than the user can see.

It also uses explicit column lists instead of `select=*` for the AI context.

### Recommendation

Use this pattern as the model for MCP read tools.

For example:

```text
MCP request
   |
   | authenticated user token
   v
Scalyo MCP Worker
   |
   | anon key + USER token
   v
Supabase REST
   |
   v
RLS policies
```

---

# 3. What is missing

## P0 — Required before Scalyo can be used as an MCP service

### 3.1 A public Scalyo MCP endpoint

There is currently no endpoint such as:

```text
https://mcp.scalyo.app/mcp
```

or:

```text
https://scalyo.app/mcp
```

A remote MCP client needs a stable HTTPS endpoint implementing MCP over Streamable HTTP.

**Recommended:** use a dedicated Cloudflare Worker instead of mixing the first MCP implementation into the existing Pages Functions application.

Reasons:

- independent deployment and rollback;
- independent rate limits;
- independent observability;
- easier security review;
- less risk to the production web application;
- simpler MCP routing and protocol handling;
- write-capable MCP can later be isolated from the website backend.

---

### 3.2 MCP server dependencies

The current frontend `package.json` contains no MCP server package.

Create a separate package for the MCP Worker and install the current Cloudflare/MCP dependencies required by the implementation.

Suggested location:

```text
app-v2/mcp-worker/
```

Suggested structure:

```text
app-v2/mcp-worker/
├── package.json
├── wrangler.jsonc
├── src/
│   ├── index.ts
│   ├── auth/
│   │   ├── verify-token.ts
│   │   └── user-context.ts
│   ├── supabase/
│   │   └── user-client.ts
│   ├── tools/
│   │   ├── portfolio.ts
│   │   ├── clients.ts
│   │   ├── tasks.ts
│   │   └── health.ts
│   ├── services/
│   │   ├── portfolio.service.ts
│   │   ├── clients.service.ts
│   │   └── tasks.service.ts
│   └── audit/
│       └── mcp-audit.ts
└── test/
    ├── auth.test.ts
    ├── tenant-isolation.test.ts
    └── tools.test.ts
```

---

### 3.3 MCP tool definitions

No Scalyo MCP tools currently exist.

Do **not** map every database endpoint to an MCP tool.

The first tools should match actual Customer Success user goals.

Recommended version-1 tools:

#### `get_portfolio_summary`

Returns the authenticated user's/org's high-level portfolio state.

Possible data:

- total managed ARR;
- client count;
- health distribution;
- ARR at risk;
- upcoming renewals;
- overdue tasks.

#### `search_clients`

Searches the clients visible to the authenticated user.

Inputs should be limited, for example:

```text
query
status
health_band
renewal_before
limit
```

Do not accept arbitrary PostgREST query strings from an MCP caller.

#### `get_client_overview`

Returns a safe, useful account summary.

Possible data:

- client identity;
- lifecycle;
- ARR/MRR;
- health;
- churn risk;
- renewal date;
- assigned CSM;
- recent metrics;
- recent safe notes, if product/legal policy allows them.

#### `get_at_risk_clients`

Returns accounts currently needing attention.

This is more valuable to an AI assistant than exposing a generic `list_clients` database wrapper.

#### `get_upcoming_renewals`

Returns renewals within a constrained date range.

#### `get_my_tasks`

Returns due/overdue tasks visible to the current user.

---

### 3.4 OAuth / customer authorization

Scalyo currently authenticates website users, but it does not yet expose the OAuth flow required for an external MCP client to obtain delegated user access.

Recommended approach: **Supabase Auth OAuth 2.1**.

Supabase's current OAuth server can issue normal Supabase access tokens for an authenticated user. Those tokens can then be used by the MCP Worker when calling Supabase so RLS remains active.

Required work:

1. Enable OAuth 2.1 Server in the Supabase project.
2. Configure Scalyo's authorization/consent path.
3. Build a Scalyo consent screen.
4. Decide whether dynamic client registration will be enabled.
5. Require explicit user approval.
6. Ensure tokens used by MCP preserve the authenticated user identity.
7. Test token refresh/revocation.
8. Document account-disconnect behavior.

Recommended consent UI:

```text
Connect Scalyo

ChatGPT wants permission to access your Scalyo account.

It may:
- View your customer portfolio
- View client health information
- View tasks and renewal information

[Cancel]  [Allow]
```

Version 1 should request only access required for read-only tools.

---

# 4. Security fixes / safeguards required

## P0 — Do not expose the generic service-role DB helper to MCP tools

Current file:

```text
app-v2/frontend/functions/api/_utils/supabase.js
```

contains:

```javascript
const key = env.SUPABASE_SERVICE_ROLE_KEY
```

and uses that key for normal database operations.

The file itself states:

```text
Uses service role key to bypass RLS when needed
```

This can be appropriate for narrowly controlled server administration routes, but it should **not** be the default database path for customer-facing MCP tools.

### Risk

A service-role query bypasses RLS. If a tool forgets one organization filter, an authorization bug can become a cross-tenant data leak.

Bad MCP pattern:

```text
MCP user Alice
    |
    v
MCP tool
    |
    v
SUPABASE_SERVICE_ROLE_KEY
    |
    v
Database without RLS
```

### Required MCP pattern

```text
MCP user Alice
    |
    | OAuth access token
    v
MCP Worker
    |
    | SUPABASE_ANON_KEY
    | Authorization: Bearer <Alice token>
    v
Supabase
    |
    v
RLS evaluates auth.uid()
```

### Rule

**MCP read tools must not import or use `createSupabaseClient(env)` from `_utils/supabase.js` if it uses the service-role key.**

Create a separate MCP/user-scoped Supabase helper instead.

Example responsibility:

```text
createUserSupabaseClient(env, accessToken)
```

It must use:

```text
apikey: SUPABASE_ANON_KEY
Authorization: Bearer <user access token>
```

---

## P0 — Always derive tenant/user context server-side

Never accept these values as trusted MCP input:

```text
user_id
organization_id
role
```

The MCP caller should not be allowed to say:

```json
{
  "organization_id": "another-company-id"
}
```

Instead build request context from the authenticated token and database membership.

Recommended internal context:

```ts
interface ScalyoUserContext {
  userId: string
  organizationId: string | null
  role: 'owner' | 'admin' | 'member' | 'viewer'
  oauthClientId?: string
}
```

Tool code should receive this context from middleware, not from tool arguments.

---

## P0 — Validate every tool input

All MCP tool inputs need schemas and strict limits.

Examples:

```text
limit: integer, min 1, max 50
query: string, max 100 chars
clientId: UUID
renewalBefore: ISO date
```

Do not expose parameters such as:

```text
sql
where
filter
postgrest_query
order_expression
rpc_name
```

An MCP caller should never be able to construct arbitrary database requests.

---

## P0 — Explicit output minimization

Follow the approach already present in `context.service.js`.

Do not return `select=*` payloads to ChatGPT.

For every tool, explicitly define allowed columns.

Example client overview output:

```text
id
name
industry
arr
mrr
health
status
churn_risk
renewal_date
lifecycle
csm
```

Do not expose by default:

- internal database metadata;
- billing secrets;
- integration credentials;
- API keys;
- private email configuration;
- OAuth refresh tokens;
- unrelated PII;
- internal-only flags.

Contacts, free-form notes, emails, and phone numbers should receive a specific privacy review before being included in MCP output.

---

## P0 — Preserve tenant isolation with RLS tests

Existing client RLS policies are a strong foundation. For example, migrations currently scope client reads to the user's organization.

However, MCP must add automated regression tests proving this boundary.

Minimum test:

```text
Organization A
  User A
  Client A

Organization B
  User B
  Client B
```

Assertions:

```text
User A -> search_clients -> can see Client A
User A -> search_clients -> cannot see Client B
User A -> get_client_overview(Client B ID) -> not found/forbidden
User B -> same checks in reverse
```

Run these tests before every MCP deployment.

---

## P1 — Improve production rate limiting

Current file:

```text
functions/api/_services/rate-limit.service.js
```

uses an in-memory JavaScript `Map`.

The code comments note that it resets on Worker cold start.

That can be acceptable as a light application safeguard, but it should not be the only abuse protection for a public MCP endpoint because Cloudflare instances are distributed and ephemeral.

For MCP, add a production-grade limit using an appropriate Cloudflare mechanism, for example:

- Cloudflare Rate Limiting;
- Durable Object-backed counters;
- another shared server-side rate-limit store.

Recommended dimensions:

```text
OAuth user ID
OAuth client ID
organization ID
IP / network signals where appropriate
specific high-cost tool
```

Use stricter limits for tools that perform heavy aggregations.

---

## P1 — Add MCP audit logging

Every MCP invocation should produce a security/audit event containing safe metadata such as:

```text
request_id
timestamp
user_id
organization_id
oauth_client_id
tool_name
success/failure
duration_ms
row_count/result_count
```

Do **not** log raw access tokens.

Do not log full customer data payloads unless there is a specific approved need.

Useful events:

```text
mcp.auth.success
mcp.auth.failure
mcp.tool.started
mcp.tool.completed
mcp.tool.denied
mcp.tool.rate_limited
```

---

## P1 — Add OAuth-client-aware authorization

Supabase OAuth tokens can include a `client_id` claim.

For stronger isolation, consider allowing RLS/application authorization to distinguish normal Scalyo web access from external OAuth/MCP access.

This lets Scalyo implement policies such as:

```text
Website user -> normal application permissions
Approved MCP client -> read-only subset
Unknown OAuth client -> denied
```

Do not enable a broad OAuth integration and assume every third-party client should automatically get the same access surface as the main website.

---

# 5. Recommended architecture

## 5.1 Final target

```text
                         ChatGPT / MCP client
                                  |
                                  | MCP Streamable HTTP
                                  v
                     https://mcp.scalyo.app/mcp
                                  |
                     +------------+------------+
                     |                         |
                     v                         v
              OAuth validation          MCP tool router
                     |                         |
                     v                         v
              User/org context        Scalyo MCP services
                     |                         |
                     +------------+------------+
                                  |
                                  | anon key + user JWT
                                  v
                              Supabase
                     +------------+------------+
                     |            |            |
                    Auth       PostgreSQL     Storage
                                  |
                                  v
                                 RLS
```

The existing site remains:

```text
Browser
   |
   v
Cloudflare Pages + Pages Functions
   |
   v
Supabase
```

MCP should be an additional backend surface, not a replacement for the website backend.

---

## 5.2 Why a separate Worker is recommended

Scalyo currently uses Cloudflare Pages Functions.

A separate MCP Worker gives a cleaner boundary:

```text
scalyo.app             -> Website / Pages
api routes             -> Existing Pages Functions
mcp.scalyo.app/mcp     -> Dedicated MCP Worker
```

Benefits:

- MCP can be deployed without redeploying the frontend.
- MCP dependencies do not enlarge or complicate frontend builds.
- MCP has its own secrets and bindings.
- MCP can have its own logging/rate limits.
- MCP can later add write tools without expanding the website backend attack surface.
- MCP can be disabled independently during an incident.

---

# 6. Suggested implementation files

## New directory

```text
app-v2/mcp-worker/
```

### `src/index.ts`

Responsibilities:

- route `/mcp`;
- initialize the MCP server;
- register tools;
- attach auth/user context;
- map errors safely;
- attach request IDs.

### `src/auth/verify-token.ts`

Responsibilities:

- extract bearer token;
- verify/resolve the Supabase user;
- reject expired/invalid tokens;
- never accept user identity from tool parameters.

### `src/auth/user-context.ts`

Responsibilities:

- resolve `userId`;
- resolve `organizationId`;
- resolve role/membership;
- optionally resolve OAuth `client_id`;
- fail closed if tenant membership is invalid.

### `src/supabase/user-client.ts`

Responsibilities:

- use `SUPABASE_URL`;
- use `SUPABASE_ANON_KEY`;
- forward the user's bearer token;
- preserve RLS;
- provide safe GET/RPC helpers only as needed.

Must **not** use `SUPABASE_SERVICE_ROLE_KEY` for ordinary MCP reads.

### `src/tools/*.ts`

Each tool should contain:

- name;
- human-readable description;
- strict input schema;
- read/write/destructive annotations where supported;
- call into service logic;
- structured result;
- no raw DB-query construction from user input.

### `src/services/*.service.ts`

Contains business logic so tools remain small.

Example:

```text
getAtRiskClients(context, filters)
getPortfolioSummary(context)
getClientOverview(context, clientId)
```

### `src/audit/mcp-audit.ts`

Centralized structured audit events.

---

# 7. Version 1 tool scope

## Include

### Portfolio

```text
get_portfolio_summary
get_at_risk_clients
get_upcoming_renewals
```

### Clients

```text
search_clients
get_client_overview
```

### Work

```text
get_my_tasks
```

These six tools are enough to create a useful first integration.

---

## Do not include yet

Version 1 should **not** expose:

```text
delete_client
update_client
send_email
change_subscription
invite_member
remove_member
change_role
execute_playbook
modify_billing
create_quote
update_integration_credentials
```

Do not expose generic administrative RPC execution.

Do not expose arbitrary CRUD merely because the web application can perform it.

---

# 8. Version 2 — controlled write operations

Only after read-only MCP has production usage and security telemetry should write tools be considered.

Possible later tools:

```text
add_client_note
create_task
update_task_status
assign_csm
create_playbook_action
```

Each write tool should have:

- explicit permission check;
- role check;
- tenant check;
- strict schema;
- idempotency handling where applicable;
- confirmation behavior for consequential actions;
- audit log;
- safe result summary.

Destructive operations should remain absent unless there is a compelling product need.

---

# 9. Supabase / database work

## 9.1 Keep RLS as the main customer-data boundary

The existing organization/client RLS model is valuable and should remain active for MCP requests.

MCP should **not** reproduce tenant authorization solely in TypeScript.

Use both:

```text
Application authorization
+
Database RLS
```

Defense in depth is important for an agent-facing endpoint.

---

## 9.2 Review every table used by MCP

Before a table is exposed through a tool, verify:

- RLS is enabled;
- SELECT policy is correct for organization members;
- role behavior matches the product;
- no service-role dependency is required;
- no hidden/private column is returned;
- test users from another org cannot access it.

Create a table-level MCP security matrix:

| Data | MCP v1 | RLS reviewed | Output minimized |
|---|---:|---:|---:|
| clients | Yes | Required | Required |
| client_metrics | Yes | Required | Required |
| tasks | Yes | Required | Required |
| organizations | Limited | Required | Required |
| client_notes | Decide separately | Required | Required |
| billing data | No | N/A | N/A |
| email credentials | No | N/A | N/A |
| integration secrets | No | N/A | N/A |
| oxygen individual data | No by default | N/A | N/A |

---

## 9.3 Review notes and contacts separately

Scalyo's existing AI-context code deliberately excludes notes and contacts for data-minimization reasons.

Do not accidentally weaken that privacy decision by exposing them through MCP.

Before adding notes/contacts:

1. confirm the product need;
2. review GDPR/privacy implications;
3. define exact columns;
4. define role access;
5. cap number/length;
6. test that data does not cross organizations;
7. update customer-facing consent wording if necessary.

---

# 10. OAuth implementation checklist

## Required

- [ ] Enable Supabase OAuth 2.1 server.
- [ ] Configure authorization path in Supabase.
- [ ] Add a Scalyo OAuth consent page.
- [ ] Preserve `authorization_id` through login.
- [ ] Display requesting client information.
- [ ] Display requested access clearly.
- [ ] Implement approve action.
- [ ] Implement deny action.
- [ ] Decide dynamic client registration policy.
- [ ] Test access token issuance.
- [ ] Test refresh tokens.
- [ ] Test token revocation/disconnect.
- [ ] Verify MCP rejects revoked/expired tokens.
- [ ] Verify RLS with OAuth-issued access token.
- [ ] Consider asymmetric JWT signing keys for OAuth/OIDC.

## Recommended customer controls

Add to Scalyo account settings:

```text
Connected AI applications
```

Allow the user/admin to see and revoke active MCP/OAuth connections.

---

# 11. MCP API design rules

## Rule 1 — tools express goals, not tables

Good:

```text
get_at_risk_clients
get_portfolio_summary
get_upcoming_renewals
```

Less useful:

```text
select_clients
select_client_metrics
run_query
```

---

## Rule 2 — tool descriptions must be precise

A model chooses tools based heavily on their descriptions.

Example:

```text
get_at_risk_clients

Returns customer accounts visible to the authenticated Scalyo user that
currently require attention based on health, churn risk, renewal timing,
and existing Scalyo risk signals. Read-only.
```

Avoid vague descriptions such as:

```text
Gets client data.
```

---

## Rule 3 — small outputs

Do not return hundreds of accounts by default.

Use:

```text
default limit: 10
maximum limit: 50
```

and return summary fields first.

---

## Rule 4 — stable structured output

Prefer structured tool results such as:

```json
{
  "count": 2,
  "clients": [
    {
      "id": "...",
      "name": "Example",
      "health": 3,
      "arr": 120000,
      "renewalDate": "2026-10-15",
      "riskReasons": ["critical_health", "renewal_soon"]
    }
  ]
}
```

rather than building a large prose response inside the MCP server.

Let ChatGPT present/explain the structured data.

---

# 12. Error-handling requirements

Do not return stack traces or database internals to the MCP client.

Recommended categories:

```text
UNAUTHENTICATED
FORBIDDEN
NOT_FOUND
INVALID_ARGUMENT
RATE_LIMITED
INTERNAL_ERROR
```

Internally log the detailed failure with `request_id`.

Externally return a safe error.

Example:

```json
{
  "error": "NOT_FOUND",
  "message": "The requested client is not available to this account.",
  "requestId": "..."
}
```

This wording intentionally does not reveal whether a cross-tenant client ID actually exists.

---

# 13. Testing requirements

## Authentication tests

- [ ] No bearer token -> denied.
- [ ] Invalid token -> denied.
- [ ] Expired token -> denied.
- [ ] Revoked OAuth connection -> denied.
- [ ] Valid Scalyo user -> allowed.

## Tenant isolation tests

- [ ] Org A cannot search Org B clients.
- [ ] Org A cannot request Org B client by known UUID.
- [ ] Org A cannot retrieve Org B metrics.
- [ ] Org A cannot retrieve Org B tasks.

## Role tests

- [ ] owner receives permitted read results.
- [ ] admin receives permitted read results.
- [ ] member receives permitted read results.
- [ ] viewer remains read-only.
- [ ] no role gains a permission through MCP that it does not have in Scalyo.

## Input tests

- [ ] invalid UUID rejected.
- [ ] oversize query rejected.
- [ ] excessive limit rejected.
- [ ] arbitrary PostgREST filter cannot be injected.
- [ ] SQL-like input is treated as text, never executable query syntax.

## Privacy tests

- [ ] service-role key never appears in response/log.
- [ ] OAuth tokens never appear in response/log.
- [ ] integration secrets never returned.
- [ ] billing secrets never returned.
- [ ] contacts/notes omitted unless explicitly approved.

## Protocol tests

- [ ] MCP server initializes successfully.
- [ ] tool discovery works.
- [ ] each tool schema is correct.
- [ ] structured output parses correctly.
- [ ] malformed calls return protocol-safe errors.
- [ ] connection works from at least one external MCP client before ChatGPT publication work.

---

# 14. Observability

Add an MCP-specific dashboard or log query for:

```text
requests per minute
auth failure rate
tool calls by tool name
tool latency
5xx rate
rate-limit events
forbidden cross-tenant attempts
OAuth client distribution
```

Add alerts for:

```text
sudden authentication failures
sudden high request volume
repeated forbidden client IDs
increased Supabase errors
increased MCP 5xx responses
```

---

# 15. Deployment plan

## Phase 0 — foundation

- [ ] Create `app-v2/mcp-worker/`.
- [ ] Add Worker configuration.
- [ ] Add MCP server handler.
- [ ] Deploy a health/test MCP service to pre-production.
- [ ] Configure `mcp-preprod.scalyo.app` or equivalent.

**Acceptance:** an MCP client can connect and list a harmless `get_server_status` tool.

---

## Phase 1 — authentication

- [ ] Enable Supabase OAuth 2.1 in pre-production.
- [ ] Build consent page.
- [ ] Connect OAuth to MCP.
- [ ] Build authenticated user context.
- [ ] Use anon key + user access token for Supabase requests.

**Acceptance:** MCP can identify the signed-in Scalyo user and RLS is applied.

---

## Phase 2 — first read-only tools

Implement:

- [ ] `get_portfolio_summary`
- [ ] `search_clients`
- [ ] `get_client_overview`
- [ ] `get_at_risk_clients`
- [ ] `get_upcoming_renewals`
- [ ] `get_my_tasks`

**Acceptance:** all six tools pass tenant-isolation tests.

---

## Phase 3 — production security

- [ ] Production rate limiting.
- [ ] MCP audit events.
- [ ] request IDs.
- [ ] safe error mapping.
- [ ] output minimization review.
- [ ] OAuth revocation test.
- [ ] dependency/security review.
- [ ] abuse tests.

**Acceptance:** security checklist passes on pre-production.

---

## Phase 4 — external client testing

- [ ] Connect a real MCP client.
- [ ] Verify tool descriptions produce correct tool selection.
- [ ] Test multiple users in the same organization.
- [ ] Test two separate organizations.
- [ ] Test viewer role.
- [ ] Test disconnected/revoked account.

**Acceptance:** no cross-tenant access; expected user experience is stable.

---

## Phase 5 — ChatGPT distribution/publishing work

Only after the MCP endpoint is stable:

- [ ] Prepare integration name/branding.
- [ ] Prepare privacy/support URLs.
- [ ] Finalize customer-facing OAuth consent wording.
- [ ] Test installation/connection flow in the current ChatGPT plugin/app workflow.
- [ ] Complete any current OpenAI review/publication requirements.

Do not design backend security around a particular ChatGPT UI. The MCP endpoint should remain standards-based and usable by approved MCP clients.

---

# 16. Suggested first implementation sequence for a developer

Do the work in this exact order:

1. Create separate `mcp-worker` project.
2. Deploy `/mcp` with one harmless tool: `get_server_status`.
3. Enable Supabase OAuth on **pre-production only**.
4. Build the Scalyo OAuth consent page.
5. Authenticate MCP requests.
6. Create a user-scoped Supabase REST helper using anon key + user token.
7. Implement `search_clients` with explicit columns and maximum 20 results.
8. Write Org A / Org B isolation tests.
9. Implement `get_client_overview`.
10. Implement portfolio/risk/renewal tools.
11. Add tasks.
12. Add production rate limiting.
13. Add MCP audit logging.
14. Perform privacy review of every returned field.
15. Test with a real external MCP client.
16. Deploy to production only after pre-prod security tests pass.
17. Start ChatGPT publication/distribution work.
18. Consider write tools only after the read-only version has been stable in production.

---

# 17. Concrete fixes to the existing repository

## Fix A — keep `.mcp.json`, but rename/document its purpose clearly

The file itself is fine for developer tooling.

Do **not** delete it just because it is not the Scalyo MCP server.

Its purpose should remain clearly documented as:

```text
Cloudflare MCP connections for developers/agents working on the repository.
Not the customer-facing Scalyo MCP server.
```

This is already mostly clear in `docs/DEVELOPMENT.md`.

---

## Fix B — do not reuse `_utils/supabase.js` for MCP reads

Keep the helper for current privileged backend use where required.

Add a distinct user/RLS-scoped helper for MCP.

Naming should make accidental misuse obvious, for example:

```text
createServiceRoleSupabaseClient()
createUserScopedSupabaseClient()
```

The current generic name:

```text
createSupabaseClient()
```

can hide the fact that it bypasses RLS.

### Recommended existing-code refactor

Rename:

```text
createSupabaseClient
```

to:

```text
createServiceRoleSupabaseClient
```

in the existing backend, then update imports.

This is not strictly required to make MCP work, but it significantly reduces the chance that a future developer accidentally uses an RLS-bypassing helper in a user-facing tool.

---

## Fix C — production rate-limit strategy

Do not reuse the current in-memory `Map` as the sole MCP rate limiter.

Keep it if useful as a local/secondary limit, but add a distributed control for the public MCP endpoint.

---

## Fix D — extract reusable data logic where practical

The current code already has useful business logic in modules/services.

Do not duplicate formulas such as:

```text
health classification
ARR at risk
renewal timing
portfolio summaries
```

between:

```text
frontend
existing AI context
MCP
```

Create shared pure functions or shared backend services when a rule is used by both the website and MCP.

This avoids future disagreement between what Scalyo UI says and what ChatGPT says.

---

# 18. Definition of done for MCP v1

Scalyo MCP v1 is ready only when all statements below are true:

- [ ] A public HTTPS MCP endpoint exists.
- [ ] It uses current Streamable HTTP MCP transport.
- [ ] Customer authentication uses delegated user identity.
- [ ] Supabase RLS remains active for normal MCP reads.
- [ ] MCP tools never default to the service-role database client.
- [ ] User ID and organization ID are derived server-side.
- [ ] At least 5 useful read-only Scalyo tools exist.
- [ ] Tool inputs have strict schemas.
- [ ] Tool outputs use explicit fields and bounded result sizes.
- [ ] Org A / Org B isolation tests pass.
- [ ] OAuth revoke/expiry tests pass.
- [ ] Production rate limiting is active.
- [ ] Audit logging is active.
- [ ] Tokens/secrets are never logged.
- [ ] Notes/contacts/PII have explicit privacy decisions.
- [ ] Pre-production test with a real MCP client passes.
- [ ] Production endpoint can be disabled independently if necessary.

---

# 19. Things that do NOT need to be rebuilt

Do not replace the following just to add MCP:

- Supabase database;
- Supabase Auth;
- existing organization model;
- existing RLS architecture;
- Cloudflare Pages frontend;
- existing REST/Pages Functions backend;
- existing AI provider architecture.

MCP is an **additional integration surface**, not a rewrite of Scalyo.

---

# 20. Highest-priority decisions

Before implementation starts, settle these product/security decisions:

### Decision 1 — MCP hostname

Recommended:

```text
mcp.scalyo.app
```

### Decision 2 — first tool set

Recommended:

```text
get_portfolio_summary
search_clients
get_client_overview
get_at_risk_clients
get_upcoming_renewals
get_my_tasks
```

### Decision 3 — read-only launch

Recommended: **Yes.**

### Decision 4 — notes and contacts

Recommended: **Do not expose in v1.** Review separately.

### Decision 5 — service-role usage

Recommended: **Never for ordinary MCP user reads.**

### Decision 6 — separate Worker

Recommended: **Yes.**

---

# 21. Current official platform notes checked for this plan

These items are external implementation guidance, not observations from the Scalyo repository.

As of 2026-09-14:

1. Cloudflare documents building remote MCP servers using **Streamable HTTP** and recommends `createMcpHandler()` for new stateless MCP tools.
2. Supabase documents using its **OAuth 2.1 server** to authenticate MCP clients against an existing Supabase user base.
3. Supabase OAuth access tokens are standard Supabase tokens and can therefore participate in normal RLS evaluation when forwarded as the user's bearer token.
4. Supabase recommends asymmetric JWT signing keys for OAuth/OIDC use cases.

Official references:

- Cloudflare — Build a Remote MCP server: https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/
- Supabase — OAuth 2.1 Server: https://supabase.com/docs/guides/auth/oauth-server
- Supabase — MCP Authentication: https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
- Supabase — OAuth 2.1 Getting Started: https://supabase.com/docs/guides/auth/oauth-server/getting-started

---

# Final recommendation

Do **not** treat the current `.mcp.json` as the Scalyo MCP implementation.

Keep the existing Scalyo stack and add one isolated layer:

```text
ChatGPT / MCP client
        |
        v
Dedicated Cloudflare MCP Worker
        |
        | authenticated user JWT
        v
Supabase + existing RLS
```

The fastest safe route is:

```text
Separate Worker
-> Supabase OAuth
-> user-scoped Supabase access
-> six read-only business tools
-> cross-tenant tests
-> distributed rate limiting
-> audit logging
-> external MCP testing
-> ChatGPT distribution
```

The existing Scalyo codebase already contains most of the tenant, auth, and data-access concepts needed. The main work is not rebuilding the SaaS; it is adding a clean, RLS-preserving MCP boundary around the parts of Scalyo that are genuinely useful to an AI assistant.
