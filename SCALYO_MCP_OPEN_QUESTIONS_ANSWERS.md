# Scalyo MCP — Answers to Open Questions

**Source questions:** `MCP_OPEN_QUESTIONS.md`  
**Answered:** 2026-09-14  
**Purpose:** Resolve the five remaining MCP questions and provide clear implementation decisions for Scalyo.

---

# 1. Q1 — Does Supabase OAuth bind the access token to the MCP resource?

## Decision

**Not by default.**

Supabase OAuth access tokens normally use:

```json
{
  "aud": "authenticated",
  "client_id": "..."
}
```

rather than:

```json
{
  "aud": "https://mcp.scalyo.app/mcp"
}
```

Therefore, the current MCP Worker-side `audience/resource` validation logic is useful, but the default Supabase-issued token will not automatically satisfy a resource-specific audience check.

---

## Recommended solution

Use a **Supabase Custom Access Token Hook** for MCP OAuth-issued tokens.

The goal is to issue an access token that is distinguishable as an MCP/AI token and bound to the Scalyo MCP resource.

Conceptually:

```json
{
  "aud": "https://mcp.scalyo.app/mcp",
  "client_id": "...",
  "ai_agent": true
}
```

This gives Scalyo two useful security signals:

```text
aud
    -> proves the token is intended for Scalyo MCP

client_id / ai_agent
    -> lets RLS identify an AI/OAuth session
```

---

## Important limitation

Supabase's documented Custom Access Token Hook receives JWT claims and authentication information, but the OAuth `resource` request parameter is not currently documented as a direct hook input.

Therefore, the simplest safe design is:

```text
If Scalyo's Supabase OAuth server is being used specifically for the MCP integration:

OAuth-issued token
    -> MCP audience
```

If the same Supabase OAuth server is later used for unrelated third-party APIs, use an explicit:

```text
client_id -> allowed audience
```

mapping instead.

---

## Production mode

Keep production in:

```text
MCP_TOKEN_BINDING=observe
```

until live pre-production connections from both ChatGPT and Claude have been tested.

Then verify:

```text
issuer
expiry
audience/resource
client_id
```

and switch production to:

```text
MCP_TOKEN_BINDING=enforce
```

Do **not** use `client_id` alone as the final resource-binding solution unless there is no stronger option.

---

# 2. Q2 — Should OAuth tokens be restricted at the database level?

## Decision

**Yes. Implement this before public launch.**

Do not wait until Scalyo adds MCP write tools.

---

## Why

The MCP Worker is read-only, but the OAuth credential itself may still have the same Supabase permissions as a normal authenticated website session.

Current risk:

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

If normal RLS allows:

```text
UPDATE
INSERT
DELETE
client_notes
contacts
other private data
```

then the credential is more powerful than the MCP interface.

That means Scalyo could claim:

```text
"ChatGPT cannot modify customers"
```

while the OAuth token itself could potentially perform writes directly against Supabase.

That mismatch should be removed before public launch.

---

## Recommended design

Make MCP/OAuth sessions distinguishable in JWT claims.

For example:

```json
{
  "ai_agent": true,
  "client_id": "..."
}
```

Then add a helper such as:

```sql
create or replace function public.is_mcp_session()
returns boolean
language sql
stable
as $$
    select coalesce(
        (auth.jwt() ->> 'ai_agent')::boolean,
        false
    );
$$;
```

Then distinguish:

```text
Normal Scalyo web session
    -> normal Scalyo permissions

AI/MCP OAuth session
    -> approved read-only subset
```

---

## Do not rewrite unknown policies blindly

Before creating the migration, export the real live policies:

```sql
select *
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

The repository does not contain every live RLS policy.

Therefore, the migration must be written against the actual Supabase project state.

Do **not** invent replacement policies based only on reconstructed schema files.

---

## Recommended v1 policy

For MCP/AI tokens:

```text
Allowed:
- SELECT explicitly approved customer-success data

Denied:
- INSERT
- UPDATE
- DELETE
- client notes unless explicitly approved
- contacts unless explicitly approved
- billing secrets
- integration secrets
- OAuth credentials
- email credentials
- admin-only data
- Oxygen individual data unless explicitly approved
```

Where practical, use restrictive policies that narrow access rather than replacing existing permissive policies.

---

## Decision on launch timing

The open question asked whether this could be delayed until the first write tool.

My recommendation:

**No. Do it before public ChatGPT/Claude launch.**

The reason is that the OAuth credential itself is the security boundary, not only the MCP tool list.

---

# 3. Q3 — Keep or remove generic `search` / `fetch` tools?

## Decision

**Remove them unless ChatGPT Company Knowledge is an explicit launch requirement.**

They are not required for a normal MCP integration.

---

## For ordinary ChatGPT / Claude use

The six focused Scalyo tools are enough:

```text
get_portfolio_summary
search_clients
get_client_overview
get_at_risk_clients
get_upcoming_renewals
get_my_tasks
```

These are clearer and more domain-specific.

They also reduce tool-selection ambiguity.

---

## Keep `search` / `fetch` only if

Scalyo specifically wants:

```text
ChatGPT Company Knowledge
```

support.

In that case, keep the standard search/fetch compatibility layer and implement the current OpenAI contract exactly.

---

## Claude

Claude does not require the generic pair.

It can connect directly to the remote MCP server and use the focused Scalyo tools.

---

## Recommendation

If Company Knowledge is not a launch requirement:

```text
remove:
search
fetch
registerChatGptCompatibilityTools
related tests
related documentation rows
```

If Company Knowledge is required:

```text
keep them
fix the result URLs
verify the current OpenAI contract before publication
```

---

# 4. Q4 — Who owns the OAuth consent screen?

## Decision

**Scalyo owns the consent UI.**

Supabase owns the OAuth backend mechanics, but not the user-facing authorization page.

---

## Correct architecture

```text
ChatGPT / Claude
       |
       v
Supabase OAuth authorize endpoint
       |
       v
Scalyo authorization URL
       |
       v
https://scalyo.app/oauth/consent
       |
       v
User approves or denies
       |
       v
Supabase issues code/token
```

---

## Scalyo frontend responsibilities

The consent page should use the Supabase OAuth APIs such as:

```text
getAuthorizationDetails(...)
approveAuthorization(...)
denyAuthorization(...)
```

It should:

```text
show the requesting application
show requested access
preserve authorization_id
allow approval
allow denial
```

---

## Recommended consent text

After Q2 is implemented, the page can truthfully say something like:

```text
Connect ChatGPT to Scalyo

ChatGPT is requesting permission to:

✓ View customer portfolio information
✓ View customer health and risk information
✓ View upcoming renewals
✓ View your tasks

It cannot:

✗ Modify customer records
✗ Send email
✗ View private notes
✗ Change billing

[Cancel] [Allow]
```

Equivalent wording can be used for Claude.

---

## Important warning

Do not show the:

```text
"It cannot modify..."
```

promises until the database-level OAuth restrictions from Q2 are implemented.

Otherwise the MCP tool surface may be read-only while the OAuth credential itself is still writable.

---

## OAuth scopes

Do not rely on OAuth scopes such as:

```text
clients:read
tasks:read
```

unless Scalyo builds its own custom permission model.

Supabase's normal OAuth scopes do not automatically control database rows.

Database authorization remains an RLS responsibility.

---

# 5. Q5 — Where should tool-selection evaluations live?

## Decision

Keep the evaluation cases in the repository, but **do not run live-model calls on every normal commit**.

Use two testing layers.

---

## Layer 1 — deterministic CI

Run these on every relevant change:

```text
tool schemas
tool annotations
structured results
authentication
token binding
tenant isolation
input validation
RLS/security tests
```

These should remain stable and deterministic.

---

## Layer 2 — model-selection evaluation

Store a version-controlled golden-prompt set.

Suggested location:

```text
app-v2/mcp-worker/test/evals/golden-prompts.json
```

Example cases:

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
    -> no destructive Scalyo tool
```

```text
"Send an email to Acme."
    -> no send-email Scalyo tool
```

---

## When to run live-model evaluations

Recommended:

```text
nightly
pre-release
before major tool-schema changes
before public plugin/connector publication
```

Do not require live LLM evaluation on every commit because it is:

```text
non-deterministic
cost-bearing
dependent on host/model changes
```

Use a success threshold instead of exact byte-for-byte behavior.

Example:

```text
expected tool-routing accuracy >= 95%
```

---

## Manual host testing is still required

Also keep a small manual pre-release checklist in:

```text
docs/MCP_SERVER.md
```

Test the actual integration in:

```text
ChatGPT
Claude
```

because host-level orchestration may differ from raw model API behavior.

---

# 6. Final answers summary

| Question | Final decision |
|---|---|
| Q1 — resource binding | **Default Supabase OAuth is not enough. Add a Custom Access Token Hook, issue an MCP-specific audience, then enforce binding.** |
| Q2 — DB restrictions | **Implement OAuth/AI-aware RLS before public launch.** |
| Q3 — `search` / `fetch` | **Remove unless Company Knowledge is an explicit launch feature.** |
| Q4 — consent UI | **Scalyo must build the consent page. Supabase runs the OAuth backend.** |
| Q5 — tool evals | **Store cases in repo; run live-model evals nightly/pre-release and do manual ChatGPT/Claude smoke tests.** |

---

# 7. Recommended implementation order

Do the remaining work in this order:

1. Export the real pre-production RLS policies.
2. Implement a Supabase Custom Access Token Hook.
3. Add an MCP-specific audience.
4. Add an `ai_agent` or equivalent claim.
5. Update MCP token validation to enforce the expected audience.
6. Add AI/OAuth-aware restrictive RLS policies.
7. Verify direct Supabase REST misuse fails with an MCP OAuth token.
8. Build `/oauth/consent`.
9. Test approve/deny/revoke.
10. Run live ChatGPT OAuth flow.
11. Run live Claude OAuth flow.
12. Switch production token binding from `observe` to `enforce`.
13. Remove `search`/`fetch` unless Company Knowledge is required.
14. Add golden-prompt model evaluations.
15. Run final tenant-isolation and security tests.
16. Only then proceed with public ChatGPT/Claude distribution.

---

# 8. Final recommendation

The open questions no longer need to remain unresolved except for live-environment verification.

The preferred final architecture is:

```text
ChatGPT / Claude
       |
       | OAuth
       v
Supabase Authorization Server
       |
       | redirects user
       v
Scalyo /oauth/consent
       |
       v
Supabase issues MCP-specific JWT
       |
       | aud = Scalyo MCP
       | ai_agent = true
       v
Scalyo MCP Worker
       |
       | verifies issuer / expiry / audience / client
       v
Supabase REST
       |
       | anon key + user JWT
       v
RLS
       |
       +-----------------------------+
       |                             |
       v                             v
normal web JWT                 MCP/AI OAuth JWT
normal permissions             approved read-only subset
```

This gives Scalyo a clean trust model:

```text
OAuth says who the user and client are.
MCP validates that the token belongs to the MCP resource.
RLS controls what that token can actually do.
The consent screen accurately describes those permissions.
```

That is the architecture recommended for the public read-only v1 launch.
