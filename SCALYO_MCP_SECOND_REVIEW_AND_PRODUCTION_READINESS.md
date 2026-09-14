# Scalyo MCP — Second Review, Remaining Gaps, and Production Readiness Plan

**Repository reviewed:** `scalyo_new (2)`  
**Review date:** 2026-09-14  
**Purpose:** Document the current state of the Scalyo MCP implementation, confirm what is already correct, identify remaining blockers, and define the work required before production use with ChatGPT and Claude.

---

## 1. Executive summary

The Scalyo MCP implementation has improved substantially.

The repository now contains a real dedicated MCP Worker and the project has moved beyond planning into an actual working architecture.

### Current assessment

| Area | Assessment |
|---|---:|
| Overall architecture | **9/10** |
| MCP implementation quality | **8/10** |
| Claude testing readiness | **~7.5/10** |
| ChatGPT developer-mode testing readiness | **~7/10** |
| Public production readiness | **~6/10** |

The architecture is fundamentally sound:

```text
ChatGPT / Claude
       |
       | MCP over Streamable HTTP
       v
mcp.scalyo.app
       |
       v
Dedicated Cloudflare Worker
       |
       | delegated user identity
       v
Supabase Auth + PostgreSQL + RLS
```

The main remaining problems are not with the overall architecture.

They are concentrated in the OAuth trust boundary.

There are **two production blockers**:

1. OAuth access tokens are not yet strongly verified as being issued specifically for the Scalyo MCP resource.
2. OAuth-issued tokens can potentially access more of Supabase than the MCP interface intends unless RLS/policies distinguish AI/OAuth access from normal Scalyo application access.

Both should be fixed before a public launch.

---

# 2. What is now implemented correctly

The latest repository contains a real MCP implementation rather than only MCP developer tooling.

## 2.1 Dedicated MCP Worker

The repository now contains a dedicated MCP Worker under the new MCP project.

This is the preferred architecture for Scalyo.

Advantages:

- separate deployment;
- separate secrets;
- separate rate limits;
- separate observability;
- independent rollback;
- independent incident kill switch;
- less risk to the normal Scalyo frontend/API;
- simpler future review of write-capable tools.

Recommended production hostname:

```text
https://mcp.scalyo.app/mcp
```

Recommended pre-production hostname:

```text
https://mcp-preprod.scalyo.app/mcp
```

---

## 2.2 Correct MCP transport/runtime direction

The Worker uses the modern Cloudflare/MCP approach based around a stateless MCP handler and Streamable HTTP.

This is appropriate for a SaaS integration that will be called from cloud-hosted clients such as ChatGPT and Claude.

The architecture is:

```text
Remote MCP client
      |
      v
POST /mcp
      |
      v
createMcpHandler(...)
      |
      v
registered Scalyo tools
```

This is a strong implementation direction.

---

## 2.3 OAuth protected-resource discovery exists

The Worker now exposes OAuth protected-resource metadata and handles unauthenticated MCP access using a proper authorization challenge.

The repository contains support for endpoints such as:

```text
/.well-known/oauth-protected-resource
/.well-known/oauth-protected-resource/mcp
```

and returns a `WWW-Authenticate` challenge when appropriate.

This is an important improvement over the first version.

The intended flow is now:

```text
ChatGPT / Claude
       |
       v
Scalyo MCP
       |
       | discovers required authorization server
       v
Supabase OAuth
```

That is the correct overall OAuth model.

---

## 2.4 User-scoped Supabase access exists

The MCP Worker now uses the authenticated user's Supabase access token for normal data access.

Conceptually:

```text
SUPABASE_ANON_KEY
+
Authorization: Bearer <user OAuth token>
```

instead of:

```text
SUPABASE_SERVICE_ROLE_KEY
```

for ordinary MCP reads.

This is a very important improvement.

It allows Supabase RLS to remain active.

Recommended pattern:

```text
MCP user
   |
   | OAuth access token
   v
Scalyo MCP Worker
   |
   | anon key + same user access token
   v
Supabase
   |
   v
RLS
```

This should remain the default path for all read-only MCP tools.

---

## 2.5 Dedicated rate limiting exists

The latest implementation adds Cloudflare-backed production rate-limit controls rather than relying only on an in-memory JavaScript `Map`.

This is appropriate for a public MCP endpoint.

Useful rate-limit dimensions include:

```text
user ID
organization ID
OAuth client ID
IP / provider egress network
tool name
high-cost tool category
```

Rate limiting should remain layered:

```text
pre-auth abuse protection
+
per-user limits
+
stricter high-cost tool limits
```

---

## 2.6 Audit logging exists

The Worker now has MCP-specific audit logging.

This is good and should remain centralized.

Recommended audit fields:

```text
request_id
timestamp
user_id
organization_id
oauth_client_id
tool_name
success/failure
duration_ms
result_count
rate_limited
```

Do not log:

```text
access tokens
refresh tokens
service-role keys
full customer payloads
integration credentials
```

---

## 2.7 Tenant-isolation tests exist

The repository now contains a meaningful test suite, including tenant-isolation testing.

This is one of the most important improvements.

The critical model is:

```text
Organization A
  User A
  Client A

Organization B
  User B
  Client B
```

The MCP must always satisfy:

```text
User A -> can see Client A
User A -> cannot see Client B
User B -> can see Client B
User B -> cannot see Client A
```

This must be tested both through:

```text
search/list operations
```

and:

```text
direct known-ID lookup attempts
```

---

## 2.8 Read-only first-release design is still the right decision

The latest Worker remains focused on read-only MCP use.

That is strongly recommended.

The first production version should expose only information retrieval and analysis support.

Examples:

```text
get_portfolio_summary
search_clients
get_client_overview
get_at_risk_clients
get_upcoming_renewals
get_my_tasks
```

Do not add write operations until the read-only version has been stable in production.

---

# 3. Production blocker 1 — OAuth audience/resource verification is incomplete

This is the most important remaining authentication issue.

## 3.1 Current problem

The current access-token verification flow validates that the token belongs to a real Supabase user.

Conceptually:

```text
token
  |
  v
Supabase /auth/v1/user
  |
  v
valid user
  |
  v
accepted by MCP
```

That proves:

```text
"This is a valid Supabase user token."
```

It does **not necessarily prove**:

```text
"This token was issued specifically for
https://mcp.scalyo.app/mcp."
```

Those are different guarantees.

---

## 3.2 Required behavior

The desired OAuth flow is:

```text
ChatGPT / Claude
        |
        | authorization request
        | resource=https://mcp.scalyo.app/mcp
        v
Supabase OAuth
        |
        v
Access token
        |
        | audience/resource bound to Scalyo MCP
        v
Scalyo MCP Worker
```

The MCP Worker should verify at minimum:

```text
signature
issuer
expiration
audience/resource
client_id where relevant
```

before any tool executes.

---

## 3.3 Why this matters

Without resource/audience validation, a token issued for another purpose in the same Supabase project could potentially be accepted by MCP.

Bad trust model:

```text
Any valid Scalyo user token
          |
          v
       MCP accepts
```

Desired trust model:

```text
Valid Scalyo user token
        +
issued for Scalyo MCP resource
        |
        v
       accepted
```

---

## 3.4 Required fix

Add resource/audience-aware validation to the MCP auth layer.

The Worker should know its canonical resource identifier:

```text
https://mcp.scalyo.app/mcp
```

and verify that the access token is valid for that protected resource.

Recommended pre-production acceptance test:

```text
resource=https://mcp-preprod.scalyo.app/mcp
```

Token validation must verify:

```text
issuer       PASS
signature    PASS
expiration   PASS
audience     PASS
client_id    PASS or recognized
```

A valid Supabase user token with the wrong audience/resource should be rejected.

---

## 3.5 Definition of done

- [ ] MCP OAuth authorization request uses the `resource` parameter.
- [ ] Supabase-issued token contains appropriate audience/resource information.
- [ ] MCP Worker verifies the expected audience/resource.
- [ ] Wrong-resource token is rejected.
- [ ] Expired token is rejected.
- [ ] Token issued for the normal website but not MCP is rejected where appropriate.
- [ ] Tests cover ChatGPT and Claude-issued OAuth flows.

---

# 4. Production blocker 2 — OAuth token may have broader database access than MCP intends

This is a subtle but very important issue.

## 4.1 Current MCP policy

The MCP layer intends to provide a restricted read-only AI surface.

For example:

```text
Allowed:
- client overview
- portfolio summary
- renewal information
- tasks
- health/risk information

Not allowed:
- modifying customers
- writing notes
- sending emails
- changing billing
- viewing integration credentials
```

That is good.

However, the OAuth token itself is still a normal Supabase authenticated user token.

---

## 4.2 Risk

The same token used by the MCP Worker may also be usable directly against Supabase REST.

Conceptually:

```text
OAuth AI token
      |
      +--------------------+
      |                    |
      v                    v
Scalyo MCP             Supabase REST
      |                    |
restricted tools       normal user RLS
```

If normal RLS allows more actions than the MCP layer intends, then the token itself is more powerful than the MCP integration.

Example:

```text
MCP says:
"read-only"

but database RLS says:
"authenticated user may UPDATE clients"
```

Then an OAuth token holder may be able to bypass the MCP read-only interface and use the token directly against Supabase.

---

## 4.3 Required fix

Make OAuth/MCP sessions distinguishable at the database-policy level.

Useful identity information may include:

```text
client_id
custom JWT claim
AI/MCP-specific claim
```

For example:

```json
{
  "client_id": "chatgpt-or-claude-oauth-client",
  "ai_agent": true
}
```

Then RLS/write policies can reject writes from AI/OAuth sessions.

Conceptually:

```sql
normal user session
    -> normal Scalyo permissions

AI/MCP OAuth session
    -> restricted read-only permissions
```

---

## 4.4 Sensitive data should also be blocked at RLS level

Do not rely only on the MCP code to hide sensitive tables.

Sensitive data categories should be explicitly reviewed.

Recommended default:

```text
client_notes             DENY to AI/MCP token unless approved
contacts                 DENY by default
billing secrets          DENY
integration secrets      DENY
OAuth credentials        DENY
email credentials        DENY
Oxygen individual data   DENY by default
admin-only data          DENY
```

The goal is defense in depth.

Even if a future MCP bug accidentally requests one of these tables, the database itself should reject access.

---

## 4.5 Definition of done

- [ ] AI/MCP OAuth tokens are identifiable via claims.
- [ ] Normal website sessions remain unaffected.
- [ ] AI/MCP tokens cannot execute UPDATE/INSERT/DELETE where not intended.
- [ ] AI/MCP tokens cannot access notes/contacts unless explicitly approved.
- [ ] AI/MCP tokens cannot access billing/integration credentials.
- [ ] Tests attempt direct Supabase REST access with an MCP OAuth token.
- [ ] All forbidden direct requests fail.

---

# 5. Tool metadata needs improvement

The current tool set is good, but MCP metadata should be made more explicit.

## 5.1 Add human-readable titles

Each tool should provide a title.

Example:

```typescript
title: 'Get client overview'
```

This improves model/tool UX and discovery.

---

## 5.2 Add read-only annotations

For all current v1 tools, explicitly declare:

```typescript
annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false
}
```

Do not rely on implicit defaults.

The tool server should clearly tell ChatGPT and Claude:

```text
this tool is read-only
this tool does not perform destructive changes
this tool acts only on Scalyo's internal data domain
```

---

## 5.3 Example

Recommended pattern:

```typescript
server.registerTool(
    'get_client_overview',
    {
        title: 'Get client overview',

        description:
            'Returns a read-only overview of one customer account visible to the authenticated Scalyo user.',

        inputSchema: {
            clientId: z.string().uuid()
        },

        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: false
        }
    },

    async ({ clientId }) =>
    {
        // implementation
    }
)
```

---

# 6. Add `outputSchema` and `structuredContent`

The current JSON-as-text tool responses are valid, but they should be improved.

## 6.1 Current pattern

The current implementation returns JSON serialized into text.

Conceptually:

```typescript
return {
    content: [{
        type: 'text',
        text: JSON.stringify(value, null, 2)
    }]
}
```

This works, but it is not ideal for structured agent integrations.

---

## 6.2 Recommended pattern

Return both:

```text
structuredContent
```

and a compact text fallback.

Example:

```typescript
return {
    structuredContent: payload,

    content: [{
        type: 'text',
        text: JSON.stringify(payload)
    }]
}
```

---

## 6.3 Add output schemas

For example:

```typescript
outputSchema: {
    clients: z.array(
        z.object({
            id: z.string(),
            name: z.string().nullable(),
            health: z.number().nullable(),
            effectiveStatus: z.enum([
                'critical',
                'watch',
                'healthy'
            ])
        })
    )
}
```

Benefits:

- clearer model behavior;
- more reliable ChatGPT handling;
- more reliable Claude handling;
- easier contract testing;
- safer future UI rendering;
- easier tool evolution.

---

# 7. Reconsider generic `search` and `fetch` tools

The implementation currently includes generic tools such as:

```text
search
fetch
```

These may be useful for specific host integrations, but they can overlap with existing business-specific tools.

Scalyo already has clearer tools such as:

```text
search_clients
get_client_overview
```

Having both:

```text
search
search_clients
```

or:

```text
fetch
get_client_overview
```

can make model tool selection less deterministic.

---

## Recommended decision

If Scalyo specifically wants to qualify as a generic company-knowledge source, keep `search`/`fetch` and implement their exact required contract.

Otherwise, for the first SaaS assistant release, consider removing them.

Prefer focused tools:

```text
get_portfolio_summary
search_clients
get_client_overview
get_at_risk_clients
get_upcoming_renewals
get_my_tasks
```

These directly express customer-success goals.

---

# 8. ChatGPT packaging is still separate from the MCP server

The MCP backend can be perfectly usable without yet being packaged for public ChatGPT distribution.

There are three distinct stages:

```text
Stage 1
MCP server exists
      |
      v
mcp.scalyo.app/mcp
```

```text
Stage 2
ChatGPT Developer Mode testing
      |
      v
connect remote MCP endpoint
```

```text
Stage 3
Public ChatGPT plugin/app packaging and publication
```

The repository currently focuses mainly on Stage 1.

Public ChatGPT distribution still requires the current OpenAI packaging/submission flow.

This is not a backend blocker.

It is a distribution task to complete after the MCP endpoint is stable.

---

# 9. Claude integration is simpler

Claude can use a remote MCP server directly as a custom connector.

Therefore:

```text
https://mcp.scalyo.app/mcp
```

can serve both:

```text
ChatGPT
```

and:

```text
Claude
```

without two different backend implementations.

Recommended architecture:

```text
                       Scalyo MCP
                          |
                          v
              https://mcp.scalyo.app/mcp
                          |
               +----------+----------+
               |                     |
               v                     v
           ChatGPT                Claude
           Plugin/App        Remote Connector
```

Keep one standards-compliant MCP server.

Do not create a separate Claude-specific API unless a future requirement truly needs it.

---

# 10. OAuth consent frontend still needs final confirmation

The backend contains OAuth-related support, but the complete customer-facing consent flow must exist and be tested end-to-end.

Recommended route:

```text
https://scalyo.app/oauth/consent
```

Recommended user experience:

```text
Connect ChatGPT to Scalyo

ChatGPT is requesting access to your Scalyo account.

It may:
✓ View customer portfolio information
✓ View customer health information
✓ View upcoming renewals
✓ View your tasks

It cannot:
✗ Modify customers
✗ Send emails
✗ View private notes
✗ Modify billing

[Cancel] [Allow]
```

Equivalent wording should be shown for Claude.

---

## Required OAuth flow tests

- [ ] authorization starts from ChatGPT;
- [ ] authorization starts from Claude;
- [ ] Scalyo login works;
- [ ] consent screen displays requesting client;
- [ ] user can approve;
- [ ] user can deny;
- [ ] OAuth authorization code flow completes;
- [ ] PKCE works;
- [ ] access token works;
- [ ] refresh token works if enabled;
- [ ] revoked connection stops working;
- [ ] expired access token is rejected;
- [ ] wrong-resource token is rejected.

---

# 11. Organization-context selection should be deterministic

The current MCP user-context logic should avoid relying on:

```text
organization_members
limit 1
```

if multiple organization memberships are ever possible.

Even if Scalyo currently operates as a single-organization-per-user product, the MCP implementation should follow the same canonical organization source as the normal application.

Recommended pattern:

```text
authenticated user
      |
      v
profiles.organization_id
      |
      v
verify organization_members membership
      |
      v
resolve role
```

This creates a deterministic tenant context.

If Scalyo later supports multiple organizations per user, introduce an explicit connection-bound organization selection strategy.

Do not silently take the first membership row returned by the database.

---

# 12. Review the pre-auth IP limit

A strict per-IP rate limit can behave unexpectedly with cloud-hosted MCP clients.

Many different Scalyo users may appear to come from the same OpenAI or Anthropic egress infrastructure.

Conceptually:

```text
User A ─┐
User B ─┼── provider cloud IP ──> Scalyo MCP
User C ─┤
User D ─┘
```

A low pre-auth IP limit may therefore throttle unrelated customers.

Recommended approach:

```text
high pre-auth IP abuse threshold
+
strict authenticated per-user threshold
+
strict high-cost-tool threshold
```

Example concept:

```text
pre-auth IP: high enough to absorb shared provider egress
per user: moderate
high-cost tools: low
```

Tune actual values using production telemetry rather than assumptions.

---

# 13. Reduce `get_server_status` output

A status tool should return only data needed by the user/model.

Avoid returning raw:

```text
userId
organizationId
requestId
```

unless they are genuinely necessary.

Recommended response:

```json
{
  "server": "scalyo-mcp",
  "connected": true,
  "role": "member",
  "readOnly": true
}
```

Optionally return organization display name.

Keep internal IDs in logs.

---

# 14. Tool-selection evaluation should be added

Protocol tests alone are not enough.

A good MCP server must also cause models to select the correct tool.

Create a golden-prompt evaluation set.

Examples:

```text
"Which customers need my attention?"
-> get_at_risk_clients
```

```text
"What is happening with Acme?"
-> search_clients
-> get_client_overview
```

```text
"What renewals do I have next month?"
-> get_upcoming_renewals
```

```text
"Give me my portfolio overview."
-> get_portfolio_summary
```

Negative tests:

```text
"What's the weather tomorrow?"
-> Scalyo tools should NOT be called
```

```text
"Delete Acme."
-> no matching v1 destructive tool should exist
```

```text
"Send an email to Acme."
-> no matching v1 send-email tool should exist
```

These tests matter because tool names, descriptions, schemas, and annotations influence model behavior.

---

# 15. Current status matrix

## Previous version

```text
Actual MCP server          MISSING
OAuth protected resource  MISSING
RLS user client           MISSING
MCP tools                 MISSING
Production rate limits    MISSING
Audit logging             MISSING
Isolation tests           MISSING
```

## Current version

```text
Actual MCP server          DONE
Separate Worker            DONE
Streamable HTTP            DONE
OAuth resource discovery   DONE
Supabase OAuth foundation  DONE
User-scoped RLS reads      DONE
Read-only tools            DONE
Privacy minimization       DONE
Rate limiting              DONE
Audit logging              DONE
Tenant isolation tests     DONE
Kill switch                DONE
```

Still incomplete:

```text
Audience/resource binding        BLOCKER
OAuth-token DB restrictions      BLOCKER
Tool annotations                 NEEDS FIX
Structured tool results          NEEDS FIX
OAuth consent frontend           VERIFY/FINISH
Deterministic org selection      NEEDS FIX
ChatGPT packaging                LATER
Live ChatGPT test                NOT COMPLETE
Live Claude test                 NOT COMPLETE
```

---

# 16. Priority plan

## P0 — fix before public production

### P0.1 OAuth resource/audience binding

- [ ] define canonical MCP resource;
- [ ] use `resource` parameter;
- [ ] ensure token contains correct audience/resource;
- [ ] verify audience/resource in Worker;
- [ ] reject wrong-resource token.

### P0.2 Restrict OAuth/AI token permissions in Supabase

- [ ] identify MCP/OAuth tokens using `client_id` or custom claims;
- [ ] deny UPDATE/INSERT/DELETE for AI/MCP tokens;
- [ ] deny sensitive tables by default;
- [ ] preserve normal website user behavior;
- [ ] test direct Supabase REST misuse.

### P0.3 Tool metadata

- [ ] add `title`;
- [ ] add `readOnlyHint: true`;
- [ ] add `destructiveHint: false`;
- [ ] add `openWorldHint: false`;
- [ ] verify every tool has accurate descriptions.

### P0.4 Structured outputs

- [ ] add `outputSchema`;
- [ ] add `structuredContent`;
- [ ] retain compact text fallback.

### P0.5 Complete OAuth UX

- [ ] verify consent page exists;
- [ ] verify approve/deny flow;
- [ ] verify DCR configuration where required;
- [ ] verify revoke/disconnect.

---

## P1 — before broad customer rollout

- [ ] deterministic organization context;
- [ ] tune provider-aware rate limits;
- [ ] reduce status-tool metadata;
- [ ] add tool-selection evaluations;
- [ ] add more negative security tests;
- [ ] complete privacy review;
- [ ] test all tools from ChatGPT;
- [ ] test all tools from Claude.

---

## P2 — distribution and product polish

- [ ] prepare ChatGPT plugin/app package;
- [ ] prepare branding;
- [ ] privacy policy URL;
- [ ] support URL;
- [ ] customer onboarding instructions;
- [ ] connected-AI-apps settings page;
- [ ] revoke connection control;
- [ ] monitoring dashboard;
- [ ] customer-facing documentation.

---

# 17. Recommended final tool set for v1

Keep the first release small.

Recommended:

```text
get_portfolio_summary
search_clients
get_client_overview
get_at_risk_clients
get_upcoming_renewals
get_my_tasks
```

Optional:

```text
get_server_status
```

but minimize its output.

Consider removing generic:

```text
search
fetch
```

unless they are required for a specific supported host feature.

---

# 18. Do not add these yet

Do not add the following until the read-only integration has production history:

```text
update_client
delete_client
send_email
add_note
change_subscription
invite_member
remove_member
change_role
execute_playbook
modify_billing
update_integration_credentials
```

Potential version-2 write tools should be narrow and reversible where possible.

Examples:

```text
create_task
update_task_status
add_client_note
assign_csm
```

Every write tool should require:

```text
strict role authorization
tenant validation
input schema
idempotency where relevant
audit logging
clear write annotation
confirmation behavior where appropriate
```

---

# 19. Production acceptance tests

Scalyo MCP should not be considered production-ready until all tests below pass.

## Authentication

- [ ] no token rejected;
- [ ] malformed token rejected;
- [ ] expired token rejected;
- [ ] revoked token rejected;
- [ ] valid token accepted;
- [ ] wrong-resource token rejected;
- [ ] wrong OAuth client rejected if policy requires it.

## Authorization

- [ ] Org A cannot see Org B;
- [ ] direct Org B client ID lookup fails;
- [ ] AI token cannot write;
- [ ] AI token cannot read restricted notes;
- [ ] AI token cannot read integration secrets;
- [ ] normal web user permissions remain unchanged.

## MCP contracts

- [ ] all tools discover correctly;
- [ ] all titles present;
- [ ] all read-only annotations correct;
- [ ] all input schemas strict;
- [ ] all output schemas valid;
- [ ] all tools return structured content;
- [ ] malformed calls return safe errors.

## Model behavior

- [ ] ChatGPT chooses correct tool;
- [ ] Claude chooses correct tool;
- [ ] irrelevant prompts do not trigger Scalyo;
- [ ] destructive requests cannot find a destructive v1 tool.

## Rate limiting

- [ ] shared provider IP traffic does not block normal users;
- [ ] per-user limit works;
- [ ] heavy-tool limit works;
- [ ] abuse events are logged.

## Privacy

- [ ] tokens never logged;
- [ ] service-role key never exposed;
- [ ] sensitive data omitted;
- [ ] internal IDs minimized in user-facing responses.

---

# 20. Final recommended architecture

```text
                              INTERNET
                                  |
               +------------------+------------------+
               |                                     |
               v                                     v
           ChatGPT                                Claude
               |                                     |
               | MCP + OAuth                         | MCP + OAuth
               +------------------+------------------+
                                  |
                                  v
                      https://mcp.scalyo.app/mcp
                                  |
                        Cloudflare MCP Worker
                                  |
              +-------------------+-------------------+
              |                                       |
              v                                       v
       OAuth validation                         MCP tool router
              |                                       |
              | issuer                                |
              | expiration                            |
              | audience/resource                     |
              | OAuth client                          |
              | user                                  |
              +-------------------+-------------------+
                                  |
                                  v
                         Scalyo MCP services
                                  |
                     anon key + user OAuth JWT
                                  |
                                  v
                              Supabase
                    +-------------+--------------+
                    |             |              |
                   Auth       PostgreSQL       Storage
                                  |
                                  v
                                 RLS
                                  |
                     +------------+------------+
                     |                         |
              normal web token            AI/MCP token
                     |                         |
               normal rights          restricted read-only
```

This is the target architecture.

---

# 21. Final verdict

The latest Scalyo repository is a major improvement.

The project now contains a legitimate, thoughtfully structured MCP server with:

```text
dedicated Worker
Streamable HTTP
OAuth discovery
user-scoped Supabase access
RLS
read-only tools
rate limiting
audit logging
tenant-isolation tests
kill switch
```

The architecture is suitable for both ChatGPT and Claude.

However, it should **not yet be considered fully production-ready**.

The two most important remaining items are:

```text
1. Bind and validate OAuth tokens to the Scalyo MCP resource.

2. Restrict AI/OAuth tokens at the Supabase/RLS level so that
   the token cannot bypass the MCP server's read-only/privacy restrictions.
```

After those are fixed, the remaining work is mainly quality and interoperability improvement:

```text
tool annotations
structured results
output schemas
OAuth consent UX
organization selection
host-specific testing
ChatGPT packaging
```

The project has now moved from:

```text
"MCP implementation missing"
```

to:

```text
"Real MCP implementation that needs final security hardening
and integration polish before production."
```

That is a strong position.

---

# 22. Recommended next actions

Implement these in order:

1. Add audience/resource validation.
2. Add OAuth-client-aware or AI-token-aware Supabase restrictions.
3. Add MCP tool titles and annotations.
4. Add output schemas and `structuredContent`.
5. Finish/verify OAuth consent and revoke flow.
6. Make organization selection deterministic.
7. Run live end-to-end OAuth from ChatGPT.
8. Run live end-to-end OAuth from Claude.
9. Run tenant isolation and direct-Supabase misuse tests.
10. Tune rate limits using provider traffic behavior.
11. Prepare ChatGPT packaging/publication.
12. Launch read-only production integration.
13. Observe usage before considering write tools.

Once items 1–9 pass, Scalyo should be in a strong position for a secure public MCP launch.
