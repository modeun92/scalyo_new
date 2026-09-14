# Scalyo MCP — Fourth Review, Remaining Security Gaps, and Launch Checklist

**Repository reviewed:** latest `scalyo_new.zip`  
**Review date:** 2026-09-14  
**Compared against:**  
- `SCALYO_MCP_GAP_AND_IMPLEMENTATION_PLAN.md`
- `SCALYO_MCP_SECOND_REVIEW_AND_PRODUCTION_READINESS.md`
- `SCALYO_MCP_THIRD_REVIEW_AND_FINAL_FIX_LIST.md`
- `SCALYO_MCP_OPEN_QUESTIONS_ANSWERS.md`

---

# 1. Executive summary

The Scalyo MCP implementation is now substantially better.

Most of the original MCP architecture and tool-design problems have been fixed. The MCP Worker itself is now clean, well structured, and close to production quality.

Current assessment:

| Area | Status |
|---|---|
| MCP Worker architecture | **Very good** |
| Tool design | **Very good** |
| Supabase user-scoped reads | **Very good** |
| Tool annotations / schemas | **Fixed** |
| Structured MCP outputs | **Fixed** |
| Organization context | **Fixed** |
| Rate limiting | **Good** |
| Audit logging | **Good** |
| Token-binding code | **Implemented** |
| OAuth consent route | **Added, but contains bugs** |
| AI-session RLS | **Added, but incomplete** |
| Custom access-token hook | **Documented, not yet deployed in code** |
| Storage restrictions | **Missing** |
| SECURITY DEFINER RPC restrictions | **Missing** |
| Public-production readiness | **Not yet** |

Approximate readiness:

| Area | Score |
|---|---:|
| MCP Worker implementation | **~9/10** |
| End-to-end OAuth/security integration | **~7/10** |
| Overall public-production readiness | **~7.5/10** |

The remaining important work is no longer in the core MCP tool server.

The remaining work is mainly around:

```text
OAuth consent correctness
OAuth token issuance
OAuth token binding
database-level AI restrictions
Supabase Storage
SECURITY DEFINER RPCs
live ChatGPT / Claude verification
```

---

# 2. What is now fixed correctly

## 2.1 Dedicated MCP Worker

The project now has a dedicated Cloudflare MCP Worker.

Recommended architecture remains:

```text
ChatGPT / Claude
        |
        | MCP
        v
https://mcp.scalyo.app/mcp
        |
        v
Dedicated Cloudflare Worker
        |
        v
Supabase
```

This remains the correct architecture.

Benefits:

- independent deployment;
- independent rollback;
- separate secrets;
- separate rate limits;
- dedicated audit logs;
- easy kill switch;
- lower risk to the normal Scalyo website/API.

---

## 2.2 User-scoped Supabase access

The MCP Worker correctly uses:

```text
SUPABASE_ANON_KEY
+
Authorization: Bearer <user OAuth token>
```

for normal MCP reads.

It does not use the service-role key as the default MCP data-access path.

Therefore Supabase RLS remains active for ordinary MCP reads.

This is correct and should remain unchanged.

---

## 2.3 Safe Supabase query helper

The MCP data client contains good protections:

```text
no service-role key
explicit column allowlists
select=* protection
bounded queries
allowed operators only
allowed columns only
no arbitrary PostgREST query string
no raw SQL
```

This is one of the strongest parts of the MCP implementation.

Keep it.

---

## 2.4 MCP tool metadata is now good

The MCP tools now include explicit metadata such as:

```typescript
readOnlyHint: true
destructiveHint: false
idempotentHint: true
openWorldHint: false
```

Tool titles, descriptions, input schemas, and output schemas are also present.

This issue is fixed.

---

## 2.5 Structured outputs are fixed

The MCP tools now return:

```text
outputSchema
structuredContent
content
```

rather than only JSON text.

This is better for:

```text
ChatGPT
Claude
contract testing
future UI rendering
```

This issue is fixed.

---

## 2.6 Deterministic organization context is fixed

The MCP user context now uses the canonical organization and verifies membership instead of choosing an arbitrary `organization_members` row.

Correct pattern:

```text
authenticated user
      |
      v
profiles.organization_id
      |
      v
verify organization membership
      |
      v
derive role
```

This issue is fixed.

---

## 2.7 Rate limiting is improved

The current layered model is good:

```text
high pre-auth IP threshold
+
per-user threshold
+
high-cost-tool threshold
```

This is much better for ChatGPT/Claude cloud egress than a low shared-IP limit.

Actual numbers should still be tuned later from production telemetry.

---

## 2.8 Audit logging is good

Continue logging:

```text
request ID
user ID
organization ID
OAuth client ID
tool name
success / failure
duration
result count
rate-limit events
binding failures
```

Do not log:

```text
access tokens
refresh tokens
service-role keys
integration credentials
full customer payloads
```

---

## 2.9 Company Knowledge URL bug is fixed

The previous wrong URL:

```text
https://scalyo.app/clients/<id>
```

has been corrected to:

```text
https://scalyo.app/app/clients/<id>
```

which matches the actual Vue route.

This issue is fixed.

---

## 2.10 Token-binding config now fails closed on invalid values

The previous risk where a typo could silently fall back to `observe` has been improved.

Invalid token-binding configuration should now fail instead of silently weakening security.

This is correct.

---

# 3. P0 bug — OAuth consent helper calls Supabase with the wrong argument shape

This is a real implementation bug.

Current file:

```text
app-v2/frontend/src/lib/oauthConsent.js
```

The current implementation passes:

```javascript
{
    authorization_id: authorizationId
}
```

to OAuth methods.

The Supabase OAuth methods expect the authorization ID string directly.

Recommended pattern:

```javascript
await supabase.auth.oauth.getAuthorizationDetails(
    authorizationId
)

await supabase.auth.oauth.approveAuthorization(
    authorizationId
)

await supabase.auth.oauth.denyAuthorization(
    authorizationId
)
```

not:

```javascript
await call({
    authorization_id: authorizationId
})
```

---

## Required fix

Change the helper so each OAuth method receives:

```text
authorizationId
```

directly.

This affects:

```text
getAuthorizationDetails
approveAuthorization
denyAuthorization
```

---

# 4. P0 bug — Already-authorized OAuth redirect is not handled

Supabase can return a redirect result when the user has already consented.

In that situation, the consent page should not try to render another consent form.

It should immediately redirect.

Recommended behavior:

```javascript
const { data, error } =
    await supabase.auth.oauth.getAuthorizationDetails(
        authorizationId
    )

if (error) {
    throw error
}

if (!data) {
    throw new Error(
        'OAuth authorization returned no data'
    )
}

if (!('authorization_id' in data)) {
    window.location.assign(
        data.redirect_url
    )
    return
}
```

The current code does not properly distinguish:

```text
consent required
```

from:

```text
already authorized -> redirect
```

This should be fixed before live ChatGPT/Claude OAuth testing.

---

# 5. P0 bug — OAuth scopes field is interpreted incorrectly

The current consent helper expects something like:

```text
data.scopes
```

as an array.

Supabase returns the OAuth scope as a string field:

```text
scope
```

for example:

```text
openid email profile
```

Recommended conversion:

```javascript
const scopes =
    typeof data.scope === 'string'
        ? data.scope
            .trim()
            .split(/\s+/)
            .filter(Boolean)
        : []
```

The consent page should display the requested scopes clearly.

---

# 6. Custom access-token hook is still not actually implemented by the repository

The repository now contains:

```text
docs/MCP_ACCESS_TOKEN_HOOK.md
```

which correctly describes the intended access-token design.

Desired token:

```json
{
  "aud": "https://mcp.scalyo.app/mcp",
  "client_id": "...",
  "ai_agent": true
}
```

However, the hook itself is still documentation, not a deployed implementation.

That means the following is not yet guaranteed:

```text
ai_agent = true
aud = MCP resource
```

for real OAuth tokens.

---

## Why this matters

The AI-session RLS migration depends on:

```text
ai_agent = true
```

If the real token does not contain that claim:

```text
public.is_mcp_session()
    -> false
```

and the AI-specific RLS restrictions do nothing.

Therefore:

```text
RLS migration exists
```

does not automatically mean:

```text
MCP OAuth tokens are restricted
```

The Auth Hook must be installed and verified in the live Supabase project.

---

## Required pre-production sequence

```text
1. Install Custom Access Token Hook
2. Configure it in Supabase Authentication -> Hooks
3. Connect ChatGPT in pre-production
4. Inspect token claims
5. Confirm:
   client_id exists
   ai_agent == true
   expected audience exists
6. Connect Claude
7. Confirm same behavior
8. Apply/test AI-session RLS
9. Only then move token binding to enforce
```

---

# 7. AI-session RLS is a good step, but it is incomplete

The new migration:

```text
20260914120000_mcp_ai_session_restrictions.sql
```

is directionally correct.

It attempts to restrict AI/MCP sessions from:

```text
INSERT
UPDATE
DELETE
```

and sensitive table access.

That is good.

However, it currently focuses mainly on:

```text
public.<tables>
```

and does not cover every capability available to a Supabase authenticated token.

---

# 8. P0 security gap — Supabase Storage is not restricted for MCP tokens

Supabase authenticated tokens can also access Storage.

The project contains policies on:

```text
storage.objects
```

for a private bucket such as:

```text
copil-media
```

Normal users can currently perform actions such as:

```text
SELECT
INSERT
UPDATE
DELETE
```

on allowed objects.

The MCP AI-session migration does not currently restrict those Storage policies.

Therefore an OAuth token intended to be read-only could potentially bypass MCP and directly call Supabase Storage APIs.

Example:

```text
AI OAuth token
      |
      v
Supabase Storage API
      |
      v
upload / update / delete object
```

---

## Recommended fix

Add AI-session restrictions to:

```text
storage.objects
```

For read-only MCP v1, deny:

```text
INSERT
UPDATE
DELETE
```

for MCP sessions.

If MCP does not need Storage at all, also consider denying:

```text
SELECT
```

for MCP sessions.

Conceptual policy:

```sql
create policy mcp_no_storage_insert
on storage.objects
as restrictive
for insert
to authenticated
with check (
    not public.is_mcp_session()
);
```

Add corresponding policies for:

```text
UPDATE
DELETE
```

and possibly SELECT.

---

# 9. P0 security gap — SECURITY DEFINER RPCs can bypass table RLS

This is one of the most important remaining issues.

The codebase contains authenticated PostgreSQL functions using:

```text
SECURITY DEFINER
```

These functions execute with the function owner's privileges rather than only the caller's table permissions.

That means restrictive table RLS may not fully protect against them.

Examples found include RPCs such as:

```text
toggle_chat_reaction(...)
set_chat_message_pinned(...)
open_dm(...)
get_org_member_names()
get_org_email_status()
oxygen_team_aggregate(...)
```

Some of them write data.

Examples:

```text
toggle_chat_reaction()
    -> UPDATE chat_messages
```

```text
open_dm()
    -> INSERT chat_channels
    -> INSERT chat_channel_members
```

Therefore an OAuth token could potentially bypass the normal MCP tool restrictions by calling:

```text
/rest/v1/rpc/<function>
```

directly.

---

## Recommended fix

Audit every authenticated `SECURITY DEFINER` function.

For write-capable functions, add:

```sql
if public.is_mcp_session() then
    raise exception 'mcp_session_forbidden'
        using errcode = '42501';
end if;
```

before performing writes.

At minimum review and protect:

```text
toggle_chat_reaction
set_chat_message_pinned
open_dm
```

Also review read RPCs that expose data outside the MCP v1 contract, such as:

```text
get_org_member_names
get_org_email_status
oxygen_team_aggregate
```

If they are not needed for MCP, deny MCP sessions explicitly.

---

# 10. P1 — RLS-disabled tables should fail security verification

The migration currently warns if RLS is disabled.

Example behavior:

```text
RLS disabled
    -> WARNING
```

But a restrictive policy on a table with RLS disabled provides no protection.

Before production, any MCP-protected table with RLS disabled should be treated as a hard failure.

Recommended deployment verification:

```text
if MCP-protected table has relrowsecurity = false
    -> fail deployment/security check
```

This does not necessarily need to make the migration itself fail, but the release pipeline should block production.

---

# 11. P1 — Some read tools can silently return partial results

This is not a security issue, but it can cause incorrect model answers at scale.

## `get_portfolio_summary`

This already indicates:

```text
partial: true
```

when appropriate.

Good.

---

## `get_at_risk_clients`

It scans a bounded number of clients.

If the organization has more than the scan limit, the result may be incomplete.

Recommended response:

```json
{
  "partial": true,
  "scannedClients": 200
}
```

when the scan limit is reached.

---

## `search_clients`

When filtering by effective/derived status, the implementation can over-fetch a bounded number of records and filter afterward.

This may miss matching records later in the dataset.

At higher scale, use one of:

```text
database-side filter
RPC
cursor pagination
repeated bounded paging
```

rather than one fixed over-fetch.

---

## `get_upcoming_renewals`

The current over-fetch strategy may skip later valid renewals if many early results are excluded after fetch.

At scale, this should be moved closer to the database query.

These are P1 correctness/scaling improvements.

---

# 12. `search` / `fetch` are still optional

They are not universally required for MCP.

Keep them only if Scalyo wants:

```text
ChatGPT Company Knowledge
```

support.

For ordinary MCP usage, the focused business tools are enough:

```text
get_portfolio_summary
search_clients
get_client_overview
get_at_risk_clients
get_upcoming_renewals
get_my_tasks
```

If Company Knowledge is not a launch feature, removing:

```text
search
fetch
```

reduces tool ambiguity.

If Company Knowledge is a launch feature, keep them.

---

# 13. `get_server_status` remains optional

This tool is useful for:

```text
development
beta support
OAuth diagnostics
connection troubleshooting
```

It is not required by MCP.

Keep it through beta.

Consider removing it later if it no longer provides operational value.

Its response should stay minimal.

---

# 14. Root `.mcp.json` should remain

The root:

```text
/.mcp.json
```

is developer tooling.

It connects development agents to Cloudflare MCP services.

It is separate from:

```text
/app-v2/mcp-worker
```

which is the MCP server Scalyo provides to customers.

Keep both.

Document the distinction clearly.

---

# 15. Source archive cleanup is still recommended

Do not package these into source-review/release archives:

```text
node_modules/
.wrangler/
.dev.vars
```

Especially:

```text
.dev.vars
```

should remain local.

Recommended source archive:

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

Then install dependencies using:

```bash
npm ci
```

before:

```bash
npm run typecheck
npm test
```

---

# 16. Current status compared with previous reviews

| Previous issue | Current status |
|---|---|
| No real MCP server | **Fixed** |
| `.mcp.json` confused with product MCP | **Fixed / documented** |
| MCP service-role usage | **Fixed** |
| User-scoped RLS access | **Fixed** |
| MCP tools missing | **Fixed** |
| Tool input schemas | **Fixed** |
| Tool annotations | **Fixed** |
| Structured outputs | **Fixed** |
| Deterministic organization | **Fixed** |
| Audit logging | **Fixed** |
| Distributed rate limiting | **Fixed** |
| Token-binding code | **Implemented** |
| Invalid token-binding config fallback | **Fixed** |
| Company Knowledge URL | **Fixed** |
| OAuth consent route | **Added** |
| AI-session RLS | **Added but incomplete** |
| Custom access-token hook | **Documented only** |
| Live audience binding | **Not yet enforced in production** |
| Consent helper API usage | **Bug** |
| Already-consented redirect | **Bug** |
| Scope parsing | **Bug** |
| Storage AI restriction | **Missing** |
| SECURITY DEFINER RPC restriction | **Missing** |
| Live ChatGPT OAuth | **Still required** |
| Live Claude OAuth | **Still required** |

---

# 17. P0 checklist before public launch

## OAuth consent

- [ ] Pass `authorizationId` directly to Supabase OAuth methods.
- [ ] Handle already-authorized redirect.
- [ ] Read `scope` correctly.
- [ ] Display requested scopes.
- [ ] Test approve.
- [ ] Test deny.
- [ ] Test repeat authorization.

## Token issuance

- [ ] Deploy Custom Access Token Hook.
- [ ] Add MCP audience.
- [ ] Add `ai_agent` or equivalent claim.
- [ ] Verify ChatGPT token.
- [ ] Verify Claude token.

## Token binding

- [ ] Confirm issuer.
- [ ] Confirm expiry.
- [ ] Confirm audience/resource.
- [ ] Confirm OAuth client ID.
- [ ] Switch production from `observe` to `enforce`.

## Database restrictions

- [ ] Verify AI-session RLS is active.
- [ ] Export real live policies.
- [ ] Verify all protected tables have RLS enabled.
- [ ] Deny MCP writes.

## Storage

- [ ] Add AI-session Storage restrictions.
- [ ] Deny MCP INSERT.
- [ ] Deny MCP UPDATE.
- [ ] Deny MCP DELETE.
- [ ] Decide whether MCP SELECT is allowed.

## RPCs

- [ ] Inventory authenticated `SECURITY DEFINER` functions.
- [ ] Block write RPCs for MCP sessions.
- [ ] Block sensitive read RPCs for MCP sessions.
- [ ] Add tests for direct RPC misuse.

---

# 18. P1 checklist before broad rollout

- [ ] Add `partial` indicator to bounded risk scans.
- [ ] Improve filtered search pagination.
- [ ] Improve renewal filtering at DB level.
- [ ] Add live-model routing evaluation.
- [ ] Tune rate limits from telemetry.
- [ ] Clean source archives.
- [ ] Run clean `npm ci`.
- [ ] Run full automated tests.
- [ ] Run live tenant-isolation tests.
- [ ] Add alerting for auth/binding failures.

---

# 19. Abuse tests to run with a real MCP OAuth token

After the Custom Access Token Hook and RLS restrictions are deployed, take a real pre-production ChatGPT/Claude OAuth token and try to bypass the MCP Worker.

All of these should fail where not explicitly allowed.

## Direct REST writes

Try:

```text
PATCH /rest/v1/clients
POST /rest/v1/tasks
DELETE /rest/v1/client_notes
```

Expected:

```text
FORBIDDEN
```

---

## Sensitive reads

Try:

```text
GET /rest/v1/client_notes
GET /rest/v1/contacts
GET /rest/v1/integration_credentials
```

Expected:

```text
FORBIDDEN
```

unless explicitly approved.

---

## Storage

Try:

```text
upload object
replace object
delete object
```

Expected:

```text
FORBIDDEN
```

for MCP sessions.

---

## RPCs

Try:

```text
POST /rest/v1/rpc/open_dm
POST /rest/v1/rpc/toggle_chat_reaction
POST /rest/v1/rpc/set_chat_message_pinned
```

Expected:

```text
FORBIDDEN
```

for MCP sessions.

---

# 20. Recommended final architecture

```text
                         ChatGPT / Claude
                                |
                                | OAuth
                                v
                     Supabase OAuth Server
                                |
                                v
                   Scalyo /oauth/consent
                                |
                                v
                    MCP-specific OAuth JWT
                                |
                   +------------+-------------+
                   |                          |
                   | aud = Scalyo MCP         |
                   | ai_agent = true          |
                   | client_id = host         |
                   +------------+-------------+
                                |
                                v
                    Cloudflare MCP Worker
                                |
                   verifies token binding
                                |
                                v
                         Scalyo MCP tools
                                |
                     anon key + user JWT
                                |
                                v
                            Supabase
               +----------------+----------------+
               |                |                |
               v                v                v
           PostgreSQL         Storage          RPCs
               |                |                |
               +----------------+----------------+
                                |
                        AI-session controls
                                |
               +----------------+----------------+
               |                                 |
               v                                 v
        normal website JWT                MCP/AI OAuth JWT
        normal permissions                restricted access
```

This is the target trust model.

---

# 21. Final release verdict

Current recommendation:

```text
Internal development      YES
Pre-production            YES
Live ChatGPT OAuth test   AFTER consent fixes
Live Claude OAuth test    AFTER consent fixes
Public production         NOT YET
```

The core MCP Worker is good.

Do **not** redesign the tool server.

The remaining important work is:

```text
1. Fix OAuth consent implementation.
2. Deploy the real Custom Access Token Hook.
3. Verify AI-session RLS using real tokens.
4. Restrict Supabase Storage.
5. Restrict SECURITY DEFINER RPCs.
6. Enforce token binding.
7. Run direct abuse tests.
8. Run live ChatGPT and Claude tests.
```

After items 1–5 are complete and verified in pre-production, the overall security model should be close to production-grade.

---

# 22. Final recommendation

The project has moved from:

```text
"Missing MCP implementation"
```

to:

```text
"Strong MCP Worker with remaining OAuth and credential-boundary hardening"
```

The main architectural decision remains correct:

```text
one standards-compliant remote MCP server
+
Supabase OAuth
+
user-scoped database access
+
RLS
+
strict read-only v1 tools
```

The final hardening step is to ensure that the **OAuth credential itself** is as restricted as the MCP tool surface.

That means protecting not only:

```text
public tables
```

but also:

```text
Storage
SECURITY DEFINER RPCs
OAuth claims
consent behavior
```

Once those controls are in place and live ChatGPT/Claude tests pass, Scalyo should be in a strong position for a secure public MCP launch.
