# Scalyo MCP — Current State Report, Remaining Fixes, and Pre-Production Checklist

**Repository reviewed:** latest `scalyo_new.zip`  
**Review date:** 2026-09-14  
**Based on:** latest MCP code, migration changes, consent-flow changes, and `MCP_OPEN_QUESTIONS.md`

---

# 1. Executive summary

The Scalyo MCP implementation is now in a strong state.

Most of the design and code-level issues from the earlier MCP reviews have been addressed.

The core MCP Worker is now well designed and the remaining work is mainly:

```text
live Supabase verification
OAuth claim verification
real migration execution
real ChatGPT / Claude OAuth testing
release-gate hardening
```

Current assessment:

| Area | Status |
|---|---|
| MCP Worker architecture | **Very good** |
| Tool design | **Very good** |
| User-scoped Supabase access | **Very good** |
| Tool annotations | **Fixed** |
| Structured tool outputs | **Fixed** |
| Organization context | **Fixed** |
| Distributed rate limiting | **Good** |
| Audit logging | **Good** |
| OAuth consent implementation | **Fixed in code, still needs live verification** |
| AI-session table restrictions | **Implemented, needs real Postgres validation** |
| Storage restrictions | **Implemented, needs role/owner validation in pre-prod** |
| SECURITY DEFINER RPC restrictions | **Implemented, needs real Postgres validation** |
| Token-binding Worker code | **Implemented** |
| Custom Access Token Hook | **Drafted, not yet deployed** |
| Live ChatGPT test | **Not yet done** |
| Live Claude test | **Not yet done** |
| Public production readiness | **Close, but not yet** |

Approximate readiness:

```text
MCP Worker code           ~9/10
Security design           ~8.5/10
End-to-end production     ~8/10
```

---

# 2. What is good now

## 2.1 Dedicated MCP Worker

Scalyo now has a proper dedicated MCP Worker.

Recommended architecture:

```text
ChatGPT / Claude
        |
        | MCP
        v
https://mcp.scalyo.app/mcp
        |
        v
Cloudflare MCP Worker
        |
        v
Supabase
```

This remains a strong design because MCP is isolated from the normal website backend.

Benefits:

```text
independent deploy
independent rollback
dedicated secrets
dedicated rate limits
dedicated audit logs
separate kill switch
lower website risk
```

---

## 2.2 User-scoped Supabase access

The MCP Worker uses:

```text
SUPABASE_ANON_KEY
+
Authorization: Bearer <user OAuth token>
```

instead of the service-role key for normal MCP data reads.

That means normal Supabase RLS remains active.

This is correct.

---

## 2.3 Safe database client

The MCP Supabase helper is now appropriately defensive.

It includes:

```text
explicit column allowlists
no select=*
bounded result sets
allowed operators only
allowed columns only
no raw PostgREST filters from the caller
no raw SQL
no arbitrary RPC exposure
```

This should remain unchanged.

---

## 2.4 Good MCP tool design

The business tools are focused on real Customer Success goals:

```text
get_portfolio_summary
search_clients
get_client_overview
get_at_risk_clients
get_upcoming_renewals
get_my_tasks
```

This is much better than exposing generic database operations.

---

## 2.5 Tool metadata is now correct

The tools now contain appropriate MCP metadata such as:

```typescript
readOnlyHint: true
destructiveHint: false
idempotentHint: true
openWorldHint: false
```

The tools also have:

```text
titles
descriptions
input schemas
output schemas
```

This is good for both ChatGPT and Claude.

---

## 2.6 Structured outputs are now correct

The tools use:

```text
structuredContent
content
outputSchema
```

instead of only stringified JSON.

This is the correct direction.

---

## 2.7 Deterministic organization selection

The MCP no longer relies on arbitrary:

```text
organization_members LIMIT 1
```

behavior.

It now follows a deterministic organization context based on the user's canonical organization and membership verification.

This issue is fixed.

---

## 2.8 Rate limiting is now layered

The current approach is sensible:

```text
higher shared-IP threshold
+
per-user limit
+
heavy-tool limit
```

This is much better for ChatGPT/Claude traffic, where multiple users may come through shared provider infrastructure.

---

## 2.9 Audit logging is good

The MCP now tracks useful security metadata such as:

```text
request ID
user ID
organization ID
OAuth client ID
tool name
result
duration
binding result
rate-limit result
```

while avoiding logging:

```text
access tokens
refresh tokens
service-role keys
full customer records
```

Good.

---

## 2.10 OAuth consent flow has been corrected in code

The previously identified consent problems have now been addressed:

```text
authorization id passed correctly
already-authorized redirect handled
scope string parsed correctly
```

The consent page is now conceptually correct.

It still needs real live verification against Supabase.

---

## 2.11 Company Knowledge URL bug is fixed

The result URL is now:

```text
https://scalyo.app/app/clients/<id>
```

which matches the Vue application route.

This issue is fixed.

---

## 2.12 Golden-prompt evaluation set exists

The repository now has a tool-selection evaluation dataset and deterministic integrity tests.

This is good because it prevents:

```text
tool rename drift
forbidden write-tool introduction
eval cases referencing non-existent tools
```

A live-model run is still separate.

---

# 3. AI-session table restrictions are implemented correctly in design

The first MCP restriction migration uses restrictive policies instead of rewriting unknown existing permissive policies.

That is the right technique.

Conceptually:

```text
existing permissive RLS
        AND
new MCP restrictive policy
```

This avoids modifying the current website permission expressions.

The design is much safer than replacing unknown live policies.

---

# 4. Storage restrictions are now included

The newer migration now also considers:

```text
storage.objects
```

rather than only `public` tables.

That closes an important path where an OAuth token could otherwise bypass the MCP Worker and use the Supabase Storage API directly.

The intended MCP v1 behavior is:

```text
Storage SELECT  -> denied
Storage INSERT  -> denied
Storage UPDATE  -> denied
Storage DELETE  -> denied
```

because MCP v1 has no Storage tools.

That is a sensible default.

---

# 5. SECURITY DEFINER RPC protection is now included

The project now handles authenticated `SECURITY DEFINER` RPCs.

This is important because table-level restrictive RLS is not sufficient to protect against privileged RPC functions.

The rename-and-wrap strategy is a good design:

```text
original function
    -> renamed to *_unguarded

public function name
    -> wrapper
    -> calls mcp_guard()
    -> calls original implementation
```

Also important:

```text
EXECUTE revoked on *_unguarded
```

for ordinary authenticated callers.

This prevents bypassing the wrapper directly.

This is a strong design.

---

# 6. What is deliberately not done yet

These items are reasonably left for a live pre-production environment.

## 6.1 Migration SQL not executed against real Postgres

The migration is large and includes:

```text
dynamic SQL
RLS policies
Storage policies
function renames
SECURITY DEFINER wrappers
GRANT / REVOKE
release checks
rollback logic
```

Static review is useful, but it cannot prove the migration works.

The repository correctly includes:

```text
pre-flight queries
verification queries
rollback guidance
```

This is acceptable.

The migration must be tested against real pre-production Postgres.

---

## 6.2 Storage policy creation may require stronger ownership privileges

Supabase Storage tables can require the proper owner/privileged role for policy creation.

The migration currently handles failure by warning rather than pretending success.

That is reasonable as long as the release verification catches the missing policy.

---

## 6.3 Consent helper has no automated frontend test

The frontend currently has no test runner.

Therefore the OAuth consent helper is not covered by automated frontend tests.

That limitation is now documented.

This is acceptable for now because the OAuth flow requires live integration testing anyway.

A full frontend test stack does not need to be introduced solely for this helper before pre-production.

---

# 7. One important fix still recommended before trusting the release gate

The current:

```sql
public.mcp_security_check()
```

is a good idea, but its policy checks should be stricter.

## Problem

If it only checks:

```text
policyname LIKE 'mcp_no_%'
```

then this broken state could still appear protected:

```text
mcp_no_insert_clients     exists
mcp_no_update_clients     missing
mcp_no_delete_clients     missing
```

The release gate could incorrectly treat the table as protected.

---

## Required improvement

Verify every expected policy individually.

For each public table that should be write-protected, verify:

```text
mcp_no_insert_<table>
mcp_no_update_<table>
mcp_no_delete_<table>
```

For sensitive tables, also verify:

```text
mcp_no_select_<table>
```

---

## Storage verification

Also verify all four Storage policies individually:

```text
mcp_no_storage_select
mcp_no_storage_insert
mcp_no_storage_update
mcp_no_storage_delete
```

Do not only verify that some policy matching:

```text
mcp_no_%
```

exists.

---

# 8. Consider restricting access to `mcp_security_check()`

The release diagnostic function does not appear to need to be executable by ordinary authenticated users.

Recommended:

```text
do not grant EXECUTE to authenticated
```

unless the application explicitly needs it.

Prefer keeping it for:

```text
admin
migration
release verification
```

only.

This reduces unnecessary information exposure.

---

# 9. Custom Access Token Hook is still the main live dependency

The repository contains the design for the hook, but it is not automatically deployed.

The desired MCP OAuth token is conceptually:

```json
{
  "aud": "https://mcp.scalyo.app/mcp",
  "client_id": "...",
  "ai_agent": true
}
```

The Worker and RLS logic depend on this.

Until the hook is actually deployed and verified:

```text
AI-session restrictions may remain inactive
```

because:

```text
is_mcp_session()
```

depends on the AI claim.

---

# 10. Required live check before deploying the hook

Verify that:

```text
normal website session:
client_id is absent/null

OAuth connector token:
client_id is present
```

This distinction is critical.

If that assumption is wrong, the hook design must be changed before deployment.

Do not deploy the hook blindly.

---

# 11. Token binding should stay in observe until live verification

The current approach is correct:

```text
pre-prod:
enforce

production:
observe
```

until real ChatGPT and Claude OAuth tokens have been inspected.

After verifying:

```text
issuer
expiration
audience/resource
client_id
ai_agent
```

switch production to:

```text
MCP_TOKEN_BINDING=enforce
```

---

# 12. RLS-disabled tables must block release

If an MCP-protected table has:

```text
relrowsecurity = false
```

then any restrictive policy is ineffective.

Therefore the final pre-production release gate should fail if any protected table has RLS disabled.

This should be treated as:

```text
release blocker
```

not only a warning.

---

# 13. Scale beyond 200 accounts is now honest but still incomplete

The current tools now expose:

```text
partial: true
```

when their bounded Worker-side scan limit is reached.

That is good.

It prevents the model from presenting an incomplete result as complete.

The difference is:

```text
truncated
    -> more matches existed than requested limit

partial
    -> not all candidate rows were scanned
```

This is an important distinction.

---

## Still open

At larger customer sizes, completeness needs a product decision.

Possible future solutions:

```text
server-side aggregate RPC
cursor pagination
database-side effective status
materialized effective health
```

This is not a current security blocker.

---

# 14. `search` / `fetch` remains the only real product decision

The generic tools are useful only if Scalyo wants:

```text
ChatGPT Company Knowledge
```

at launch.

If yes:

```text
keep search
keep fetch
verify current OpenAI Company Knowledge contract
```

If no:

```text
remove search
remove fetch
remove ChatGPT compatibility registration
remove related tests/docs
```

The six focused business tools are enough for normal ChatGPT and Claude MCP use.

---

# 15. `get_server_status` remains optional

This tool is still useful during:

```text
development
beta
support
OAuth diagnostics
```

Keep it through beta.

Consider removing it after production stabilizes if it no longer provides operational value.

---

# 16. Root `.mcp.json` should remain

The root `.mcp.json` is developer tooling for Cloudflare MCP services.

It is not the Scalyo customer-facing MCP server.

Keep both:

```text
/.mcp.json
    -> developer tooling

/app-v2/mcp-worker
    -> customer MCP server
```

---

# 17. Pre-production checklist

## Step 1 — observe real JWT claims

For a normal website session:

```text
expect client_id == null
```

For a ChatGPT/Claude OAuth session:

```text
expect client_id != null
```

If this is not true, stop and redesign the hook.

---

## Step 2 — deploy the Custom Access Token Hook

Verify a real OAuth token contains:

```text
ai_agent = true
expected audience
OAuth client id
```

---

## Step 3 — apply both MCP security migrations

Run:

```sql
select *
from public.mcp_security_check();
```

Expected:

```text
zero rows
```

after strengthening the checker.

---

## Step 4 — run direct abuse tests

Use a real MCP OAuth token.

### REST

Attempt:

```text
PATCH clients
POST tasks
DELETE client_notes
```

Expected:

```text
denied
```

### Sensitive reads

Attempt:

```text
client_notes
contacts
integration credentials
```

Expected:

```text
denied
```

unless explicitly approved.

### Storage

Attempt:

```text
read
upload
replace
delete
```

Expected:

```text
denied
```

for v1.

### RPC

Attempt:

```text
open_dm
toggle_chat_reaction
set_chat_message_pinned
```

Expected:

```text
denied
```

for MCP/AI tokens.

---

## Step 5 — test normal website behavior

This is critical.

After the migration, verify normal Scalyo users can still:

```text
update customers
create tasks
use chat
upload media
use normal RPC features
```

The MCP restrictions must not break normal website behavior.

---

## Step 6 — test OAuth consent

Verify:

```text
first authorization
approve
deny
repeat authorization
already-authorized redirect
scope display
revocation
```

---

## Step 7 — connect real ChatGPT

Verify:

```text
OAuth completes
binding succeeds
aiAgent == true
tools list correctly
tools execute correctly
wrong-resource token is denied
```

---

## Step 8 — connect real Claude

Run the same checks.

---

## Step 9 — move production to enforcement

Only after the live tests pass:

```text
MCP_TOKEN_BINDING=enforce
```

---

## Step 10 — enable final consent wording

Only after AI restrictions are verified should the consent UI promise:

```text
"It cannot modify customers"
"It cannot view private notes"
"It cannot change billing"
```

The UI must describe reality, not only MCP tool intentions.

---

# 18. Current release judgment

```text
Internal development           YES
Static architecture review     YES
Pre-production deployment      YES
Real SQL migration validation  REQUIRED
Real OAuth verification        REQUIRED
Real ChatGPT test              REQUIRED
Real Claude test               REQUIRED
Public production              NOT YET
```

---

# 19. What to fix now

Before the live pre-production run, I recommend only a small number of code changes.

## Fix now

1. Strengthen `mcp_security_check()` to verify every required policy individually.
2. Verify all four Storage policies individually.
3. Consider removing `authenticated` EXECUTE permission from `mcp_security_check()`.
4. Ensure protected tables with RLS disabled fail the release gate.

---

## Do not invent fixes for these locally

These require the live environment:

```text
migration execution correctness
Storage owner privilege behavior
real OAuth JWT claim shape
Custom Access Token Hook behavior
ChatGPT OAuth behavior
Claude OAuth behavior
consent redirect behavior
revocation
direct Supabase abuse testing
```

Those should be verified in pre-production, not guessed from repository code.

---

# 20. Final verdict

The Scalyo MCP implementation is now in a strong position.

The core Worker no longer needs major redesign.

Most previous review findings are fixed.

The remaining uncertainty is mostly legitimate live-environment uncertainty.

The most important remaining sequence is:

```text
strengthen release gate
        ↓
inspect real OAuth claims
        ↓
deploy token hook
        ↓
apply migrations in pre-prod
        ↓
verify table / Storage / RPC restrictions
        ↓
verify normal website still works
        ↓
test OAuth consent
        ↓
test ChatGPT
        ↓
test Claude
        ↓
enable binding enforcement
        ↓
public launch
```

The current design is close to production-grade, but the final confidence must come from the real Supabase and connector environment rather than additional speculative code changes.
