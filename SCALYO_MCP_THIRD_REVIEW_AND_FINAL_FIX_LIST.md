# Scalyo MCP — Third Review, Cleanup Advice, and Final Fix List

**Repository reviewed:** `scalyo_new (3)`  
**Review date:** 2026-09-14  
**Compared against:**  
- `SCALYO_MCP_GAP_AND_IMPLEMENTATION_PLAN.md`  
- `SCALYO_MCP_SECOND_REVIEW_AND_PRODUCTION_READINESS.md`

---

# 1. Executive summary

The Scalyo MCP implementation is now in a much stronger state.

The first review identified that there was no real Scalyo MCP server. That is now fixed.

The second review identified several implementation and production-readiness problems. Most of those have also been fixed.

Current status:

| Area | Status |
|---|---|
| MCP architecture | **Very good** |
| Dedicated Cloudflare Worker | **Good** |
| Streamable HTTP | **Good** |
| User-scoped Supabase/RLS access | **Good** |
| Tool design | **Good** |
| Tool annotations | **Fixed** |
| Structured outputs | **Fixed** |
| Deterministic organization selection | **Fixed** |
| Distributed rate limiting | **Improved** |
| Audit logging | **Good** |
| Token-binding logic | **Implemented but not fully enforced** |
| OAuth-aware database restrictions | **Still missing** |
| OAuth consent page | **Still missing** |
| ChatGPT `search` / `fetch` | **Valid if Company Knowledge is desired, but contains a URL bug** |
| ChatGPT public packaging | **Still later work** |
| Live ChatGPT/Claude OAuth test | **Still required** |
| Model tool-selection evaluations | **Still missing** |

### Current assessment

| Area | Score |
|---|---:|
| MCP Worker implementation | **~9/10** |
| Production integration overall | **~7.5/10** |

The remaining important problems are mostly around:

```text
OAuth token issuance
+
database-level OAuth restrictions
+
OAuth consent UX
```

rather than the MCP tool server itself.

---

# 2. What has been fixed correctly

## 2.1 Real dedicated MCP Worker

Scalyo now has a real customer-facing MCP implementation rather than only developer MCP configuration.

The architecture is now:

```text
ChatGPT / Claude
        |
        | MCP
        v
mcp.scalyo.app
        |
        v
Dedicated Cloudflare Worker
        |
        v
Supabase
```

This is a good design.

Benefits:

- independent deployment;
- independent rollback;
- separate secrets;
- separate rate limits;
- separate observability;
- easy kill switch;
- lower risk to the normal Scalyo web application.

---

## 2.2 User-scoped Supabase access

The Worker correctly uses:

```text
SUPABASE_ANON_KEY
+
Authorization: Bearer <user OAuth token>
```

for ordinary MCP reads.

It does not use the service-role key as the default MCP database path.

That means Supabase RLS remains active.

This was one of the most important recommendations from the first review and is now implemented properly.

---

## 2.3 Safer Supabase query helper

The current MCP Supabase helper is well designed.

It includes protections such as:

```text
no service-role key
explicit column lists
select=* protection
bounded result counts
operator allowlists
column allowlists
no arbitrary PostgREST query input
no raw SQL execution
```

This is good MCP/backend design and should be kept.

---

## 2.4 Tool annotations are now correct

The second review recommended explicit MCP tool metadata.

That is now fixed.

The implementation includes read-only metadata similar to:

```typescript
{
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
}
```

This is appropriate for the current tool set.

---

## 2.5 Structured tool results are now implemented

The previous implementation mostly serialized JSON into text.

The current implementation now uses structured MCP responses, including:

```text
outputSchema
structuredContent
content
```

This is better for:

```text
ChatGPT
Claude
contract testing
future UI rendering
```

This issue can be considered fixed.

---

## 2.6 Organization context is now deterministic

Previously, the MCP code risked choosing:

```text
organization_members
limit 1
```

which could become ambiguous.

The new implementation instead uses the canonical organization source and verifies membership.

Conceptually:

```text
authenticated user
      |
      v
profiles.organization_id
      |
      v
organization membership verification
      |
      v
role
```

This is a much better approach.

This issue is fixed.

---

## 2.7 Rate limiting is improved

The previous low per-IP threshold was risky because ChatGPT/Claude users can share provider egress infrastructure.

The updated layered approach is better:

```text
high pre-auth IP threshold
+
per-user threshold
+
high-cost-tool threshold
```

The current values are much more reasonable for testing and early production.

Actual limits should later be tuned using telemetry.

---

## 2.8 Audit logging is appropriate

MCP-specific audit logging remains a good part of the implementation.

Keep logging:

```text
request ID
user ID
organization ID
OAuth client ID
tool name
result
duration
result count
rate-limit event
```

Do not log:

```text
access tokens
refresh tokens
service-role keys
full customer records
integration credentials
```

---

# 3. Remaining production blocker — OAuth tokens still have broader database permissions

This is currently the most important unresolved security issue.

## 3.1 MCP itself is read-only

The MCP tool layer is intentionally restricted.

For example:

```text
allowed:
- client summaries
- portfolio information
- risk information
- renewals
- tasks

not allowed:
- update client
- delete client
- write note
- send email
- change billing
```

This is correct.

---

## 3.2 But the OAuth token itself can still be more powerful

The OAuth access token used by MCP is also a normal Supabase authenticated token.

Therefore:

```text
ChatGPT / Claude OAuth token
          |
          +----------------------+
          |                      |
          v                      v
     Scalyo MCP             Supabase REST
          |                      |
     read-only tools        normal user RLS
```

If normal user RLS allows writes, then the token may be able to perform operations that MCP does not expose.

For example:

```text
MCP:
read-only

database RLS:
authenticated user may UPDATE clients
```

That creates a mismatch between:

```text
what the MCP interface promises
```

and:

```text
what the credential can actually do
```

---

## 3.3 Recommended fix

Make AI/OAuth sessions identifiable at the JWT/RLS level.

Useful claims can include:

```text
client_id
ai_agent
mcp_access
```

Example:

```json
{
  "client_id": "...",
  "ai_agent": true
}
```

Then RLS policies can distinguish:

```text
normal Scalyo web session
    -> normal application permissions

AI/MCP OAuth session
    -> approved read-only subset
```

Recommended principle:

```text
AI/MCP token:
- SELECT approved customer-success data
- no UPDATE
- no INSERT
- no DELETE
- no sensitive tables unless explicitly approved
```

---

## 3.4 Sensitive data should be protected in RLS too

Do not rely only on MCP code to hide sensitive data.

Recommended default restrictions for AI/MCP sessions:

```text
client_notes             deny by default
contacts                 deny by default
billing secrets          deny
integration secrets      deny
OAuth credentials        deny
email credentials        deny
admin-only data          deny
Oxygen individual data   deny by default
```

This provides defense in depth.

---

# 4. Token/resource binding has improved but is not finished

## 4.1 Good improvement

The new implementation now contains token-binding validation logic.

It checks concepts such as:

```text
issuer
expiration
audience/resource
OAuth client
```

and includes dedicated token-binding tests.

This directly addresses a major concern from the second review.

---

## 4.2 Production is still in observation mode

The current production configuration uses:

```text
MCP_TOKEN_BINDING=observe
```

rather than:

```text
MCP_TOKEN_BINDING=enforce
```

This means:

```text
bad token binding
      |
      v
detected
      |
      v
logged
      |
      v
request still allowed
```

That is useful during rollout, but it is not a final security boundary.

Before production sign-off, token binding should move to:

```text
enforce
```

after live OAuth compatibility is confirmed.

---

## 4.3 Token issuance must also support the expected audience/resource

Worker-side validation is only half the solution.

The OAuth access token itself needs to contain resource/audience information that can be validated.

Desired flow:

```text
ChatGPT / Claude
       |
       | resource=https://mcp.scalyo.app/mcp
       v
Supabase OAuth
       |
       v
token contains expected audience/resource
       |
       v
Scalyo MCP verifies audience/resource
```

A clean future token could contain something conceptually like:

```json
{
  "aud": "https://mcp.scalyo.app/mcp",
  "client_id": "...",
  "ai_agent": true
}
```

This would support both:

```text
MCP resource validation
```

and:

```text
RLS restrictions for AI sessions
```

---

# 5. OAuth consent page is still missing

This remains unfinished.

The current code/documentation contains an incorrect assumption that Supabase owns the consent UI.

Supabase provides the OAuth authorization server mechanics, but Scalyo still needs its own authorization/consent screen.

Recommended route:

```text
https://scalyo.app/oauth/consent
```

The page should:

```text
show requesting app
show requested access
allow approval
allow denial
preserve authorization_id
return control to Supabase OAuth flow
```

Recommended user experience:

```text
Connect ChatGPT to Scalyo

ChatGPT is requesting permission to:

✓ View customer portfolio information
✓ View customer health information
✓ View renewal information
✓ View your tasks

It cannot:

✗ Modify customers
✗ Send email
✗ View private notes
✗ Modify billing

[Cancel] [Allow]
```

Equivalent behavior should work for Claude.

---

# 6. Real bug in ChatGPT `search` / `fetch`

The current Company Knowledge adapter returns client URLs similar to:

```text
https://scalyo.app/clients/<id>
```

However, the actual Scalyo Vue route is:

```text
/app/clients/:id
```

Therefore the correct URL should be:

```text
https://scalyo.app/app/clients/<id>
```

This should be fixed in both:

```text
search
fetch
```

results.

Otherwise ChatGPT citations/open links can point to the wrong page.

---

# 7. Are `search` and `fetch` useless?

No.

But they are only necessary if Scalyo wants to support the generic Company Knowledge/search-source style integration.

For a normal MCP assistant, tools such as:

```text
search_clients
get_client_overview
get_at_risk_clients
get_portfolio_summary
```

are already enough.

Therefore:

## Keep `search` / `fetch` if:

```text
Scalyo wants ChatGPT Company Knowledge compatibility
```

## Remove them if:

```text
Scalyo only wants normal MCP tool usage
```

If they are kept, change the code comment to something clearer:

```typescript
// ChatGPT Company Knowledge compatibility.
// Normal Scalyo MCP tool usage does not require these tools.
// Keep them only to support the standard search/fetch knowledge-source contract.
```

This avoids confusing future developers.

---

# 8. `get_server_status` is optional

`get_server_status` is not required by MCP.

It is useful during:

```text
development
beta
OAuth debugging
connection support
```

Therefore it is reasonable to keep for now.

After production stabilizes, consider removing it to reduce the number of tools visible to the model.

Its response should remain minimal.

Recommended output:

```json
{
  "server": "scalyo-mcp",
  "connected": true,
  "readOnly": true,
  "organizationConnected": true,
  "role": "member"
}
```

Avoid returning:

```text
raw user ID
raw organization ID
request ID
email
```

unless necessary.

---

# 9. Root `.mcp.json` is not useless

The repository root `.mcp.json` still points to Cloudflare MCP services for developers.

That is separate from the Scalyo customer-facing MCP Worker.

Keep it.

Document the distinction clearly:

```text
/.mcp.json
    -> MCP servers used BY developers working on Scalyo

/app-v2/mcp-worker
    -> MCP server PROVIDED BY Scalyo to customers
```

Do not remove `.mcp.json` merely because Scalyo now has its own MCP service.

---

# 10. One configuration behavior should be tightened

The current token-binding config falls back to observation mode if the value is not exactly `enforce`.

That means a typo such as:

```text
MCP_TOKEN_BINDING=enfroce
```

could silently become:

```text
observe
```

Once production is supposed to enforce token binding, this is too permissive.

Recommended:

```typescript
if (
    binding !== 'observe' &&
    binding !== 'enforce'
) {
    throw new Error(
        'Invalid MCP_TOKEN_BINDING'
    )
}
```

Then explicitly configure:

```text
production -> enforce
pre-production -> enforce
local development -> observe if desired
```

Fail closed for invalid production security configuration.

---

# 11. Source archive cleanup

The reviewed archive contains runtime/development artifacts such as:

```text
node_modules/
.wrangler/
.dev.vars
```

These should not be part of source-review or release archives.

Recommended source package:

```text
mcp-worker/
├── src/
├── test/
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.test.json
├── wrangler.jsonc
├── README.md
└── .gitignore
```

Then install clean dependencies using:

```bash
npm ci
```

Avoid shipping:

```text
node_modules
.wrangler
.dev.vars
```

especially because local/native dependency artifacts can cause cross-platform test failures.

---

# 12. Testing result from this review

TypeScript compilation succeeds.

```text
npm run typecheck
-> PASS
```

That is a positive result.

The full automated test suite could not be independently verified from the uploaded archive because the bundled `node_modules` contained a broken/incompatible native Rolldown binding.

Therefore:

```text
TypeScript compile:
PASS

Full Vitest run:
NOT independently confirmed from this archive
```

This does not prove the tests are bad.

It means the archive should be cleaned and dependencies installed fresh before final verification.

Recommended final CI command sequence:

```bash
npm ci
npm run typecheck
npm test
```

Live tenant-isolation tests should also run against a dedicated pre-production environment with test credentials.

---

# 13. Missing model/tool-selection evaluations

The MCP protocol can work perfectly while ChatGPT or Claude still chooses the wrong tool.

Add a golden-prompt evaluation suite.

Examples:

```text
"Which customers need my attention?"
-> get_at_risk_clients
```

```text
"What's happening with Acme?"
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

Negative cases:

```text
"What's the weather tomorrow?"
-> no Scalyo tool
```

```text
"Delete Acme."
-> no destructive v1 tool
```

```text
"Send an email to Acme."
-> no send-email v1 tool
```

This is recommended before broad customer release.

---

# 14. ChatGPT packaging is still later work

The MCP server can be tested without a public plugin package.

Current stages:

```text
Stage 1
Remote MCP server
    -> mostly implemented

Stage 2
ChatGPT Developer Mode
    -> test live OAuth and tools

Stage 3
Public ChatGPT packaging / publication
    -> still later work
```

Do not prioritize packaging before the OAuth/security work is complete.

Claude can use the same remote MCP endpoint directly as a connector.

One standards-compliant MCP backend should serve both platforms.

---

# 15. What MCP-related code can be removed?

There is very little obviously useless MCP code now.

## Keep

```text
dedicated MCP Worker
auth verification
protected-resource metadata
user-scoped Supabase helper
tool registry
audit logging
rate limiting
token-binding logic
tenant-isolation tests
root developer .mcp.json
```

All have a clear purpose.

## Optional

### `get_server_status`

Keep during beta/support.

Remove later if no longer useful.

### `search` / `fetch`

Keep only if Company Knowledge support is a real product goal.

Otherwise remove them to avoid overlapping with:

```text
search_clients
get_client_overview
```

No other major MCP code appears obviously redundant.

---

# 16. Priority fix list

## P0 — before public production

### 1. Add OAuth-aware RLS restrictions

- [ ] distinguish AI/OAuth sessions;
- [ ] block write operations;
- [ ] block sensitive tables;
- [ ] preserve normal web-session behavior;
- [ ] test direct Supabase REST misuse.

### 2. Finish resource/audience binding

- [ ] ensure OAuth token contains expected MCP audience/resource;
- [ ] confirm live ChatGPT token behavior;
- [ ] confirm live Claude token behavior;
- [ ] switch production from `observe` to `enforce`;
- [ ] reject wrong-resource tokens.

### 3. Build OAuth consent UI

- [ ] `/oauth/consent`;
- [ ] show requesting client;
- [ ] show permission summary;
- [ ] approve;
- [ ] deny;
- [ ] revoke/disconnect;
- [ ] test full PKCE flow.

### 4. Fix Company Knowledge URLs

Change:

```text
https://scalyo.app/clients/<id>
```

to:

```text
https://scalyo.app/app/clients/<id>
```

---

## P1 — before broad rollout

- [ ] fail closed on invalid token-binding configuration;
- [ ] remove email from `get_server_status` if unnecessary;
- [ ] add model/tool-selection evaluations;
- [ ] clean source archives;
- [ ] run fresh dependency installation;
- [ ] run full automated tests;
- [ ] run live tenant-isolation tests;
- [ ] tune rate limits from real traffic.

---

## P2 — distribution

- [ ] ChatGPT plugin/app packaging;
- [ ] branding;
- [ ] privacy URL;
- [ ] support URL;
- [ ] customer onboarding;
- [ ] connected-AI-app settings page;
- [ ] revoke connection control;
- [ ] production monitoring dashboard.

---

# 17. Recommended final architecture

```text
                           ChatGPT / Claude
                                  |
                                  | MCP + OAuth
                                  v
                      https://mcp.scalyo.app/mcp
                                  |
                         Cloudflare MCP Worker
                                  |
                  +---------------+----------------+
                  |                                |
                  v                                v
            OAuth validation                MCP tool router
                  |                                |
                  | issuer                         |
                  | expiry                         |
                  | audience/resource              |
                  | OAuth client                   |
                  | user                           |
                  +---------------+----------------+
                                  |
                                  v
                          Scalyo MCP services
                                  |
                       anon key + user JWT
                                  |
                                  v
                               Supabase
                      +-----------+-----------+
                      |           |           |
                     Auth      PostgreSQL   Storage
                                  |
                                  v
                                 RLS
                                  |
                    +-------------+-------------+
                    |                           |
             normal web token             AI/MCP token
                    |                           |
             normal permissions           restricted read
```

This remains the recommended target.

---

# 18. Final verdict

The MCP Worker itself is now well designed.

Most of the recommendations from the first and second reviews have been implemented correctly.

The remaining major work is outside the core tool registry:

```text
OAuth token issuance
OAuth audience/resource enforcement
AI/OAuth-specific RLS restrictions
OAuth consent UI
live host testing
```

The only MCP-related code that may be unnecessary is:

```text
get_server_status
```

after beta, and:

```text
search
fetch
```

if Company Knowledge support is not a real product requirement.

Everything else has a clear purpose.

### Recommended release judgment

```text
Internal development:
YES

Pre-production:
YES

Live ChatGPT/Claude testing:
YES, after OAuth setup is completed

Public production:
NOT YET
```

The two most important fixes before public production are:

```text
1. Make AI/OAuth tokens read-only at the Supabase/RLS level.

2. Bind OAuth tokens to the Scalyo MCP resource and enforce that binding.
```

After those are complete and the OAuth consent flow works end-to-end, Scalyo should be in a strong position for a secure public MCP launch.
