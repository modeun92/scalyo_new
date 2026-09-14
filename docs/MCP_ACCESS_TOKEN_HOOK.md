# The Supabase Custom Access Token Hook for MCP

**Written:** 14/09/2026
**Answers:** Q1 and the claim half of Q2 in [MCP_OPEN_QUESTIONS.md](MCP_OPEN_QUESTIONS.md)
**Depended on by:** `supabase/migrations/20260914120000_mcp_ai_session_restrictions.sql`
and `mcp-worker/src/auth/verify-token.ts` `checkTokenBinding()`

> **This is a proposal, not a deployed hook, and not a migration.** It is the one piece of
> the MCP security model that cannot be written safely from this repository — see
> "Why this is not applied" below. Everything that *depends* on it is already shipped and
> is currently **inert**, which is the intended order.

---

## What it is for

Two things, and they are the last two open items in the MCP trust model:

| Need | Claim | Consumed by |
|---|---|---|
| prove a token was issued **for MCP**, not just by Scalyo | `aud` = the MCP resource | `checkTokenBinding()` in the Worker |
| let the **database** tell an AI session from a website session | `ai_agent: true` | `public.is_mcp_session()` in RLS |

Confirmed by the answers document: Supabase OAuth access tokens carry `aud: "authenticated"`
and a `client_id` by default — **not** a resource-specific audience. So neither guarantee
exists without a hook.

Target token:

```json
{
  "sub": "…",
  "iss": "https://<project>.supabase.co/auth/v1",
  "aud": "https://mcp.scalyo.app/mcp",
  "client_id": "<the ChatGPT or Claude OAuth client>",
  "ai_agent": true,
  "exp": 1789…
}
```

---

## The hook

```sql
-- PROPOSAL. Do not apply without reading "Why this is not applied".
--
-- Stamps the MCP audience and the ai_agent marker onto tokens issued through the OAuth
-- server, and leaves ordinary website session tokens EXACTLY as they are.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims   jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  client   text  := claims ->> 'client_id';
begin
  -- The whole safety of this hook is this one condition. A token with no client_id is a
  -- normal browser session: return the event untouched, byte for byte.
  if client is null then
    return event;
  end if;

  claims := jsonb_set(claims, '{aud}',      to_jsonb('https://mcp.scalyo.app/mcp'::text), true);
  claims := jsonb_set(claims, '{ai_agent}', to_jsonb(true),                               true);

  return jsonb_set(event, '{claims}', claims, true);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
```

Then: Supabase dashboard → Authentication → Hooks → Custom Access Token → select this
function. **Pre-production only**, until §"Rollout" below is complete.

---

## Why this is not applied

Three unknowns, each of which turns a wrong guess into an outage rather than a bug.

### 1. Changing `aud` can break authentication itself

`aud` is not a free-form field. GoTrue and PostgREST both look at it, and some Supabase
configurations validate it. The hook above only rewrites `aud` when `client_id` is present
— that is what keeps website sessions safe — but **whether `client_id` is actually present
on OAuth-issued tokens and absent on session tokens is precisely the thing this repository
cannot verify.** If that assumption is inverted, this hook rewrites the `aud` of every
login in the product.

The check, before enabling the hook, on a pre-prod project:

```sql
-- as a normal signed-in user
select auth.jwt() ->> 'client_id';   -- expect NULL
```

and the same reading taken from an MCP token — the Worker already logs it:

```
event = "mcp.auth.binding"  →  oauthClientId   (expect: non-null for a connector)
```

If `oauthClientId` is null on a real ChatGPT connection, the discriminator is wrong and
this hook must not be enabled as written.

### 2. The hook's input shape is version-specific

`event` is documented as carrying `claims`, `user_id` and authentication metadata, but the
OAuth `resource` request parameter is **not** a documented hook input. So the audience is
hard-coded above rather than echoed from the request. That is fine while this Supabase
OAuth server exists only for MCP. The moment it is used for a second API, hard-coding the
MCP audience would stamp the wrong audience on that API's tokens — at which point this
needs a `client_id → audience` map instead:

```sql
-- if the OAuth server is ever shared with a non-MCP integration
claims := jsonb_set(claims, '{aud}', to_jsonb(
  case client
    when '<mcp-chatgpt-client-id>' then 'https://mcp.scalyo.app/mcp'
    when '<mcp-claude-client-id>'  then 'https://mcp.scalyo.app/mcp'
    else claims ->> 'aud'
  end::text), true);
```

### 3. It is a change to authentication for the whole product

An access token hook runs on **every token issuance in the project**, website logins
included. It is the highest-blast-radius change in this whole MCP effort, and it is the one
piece with no automated test possible from here.

---

## Rollout

Order matters. Each step is verifiable before the next.

1. **Read the current claims.** Run the two checks in §1 above. Confirm `client_id`
   discriminates. *If it does not, stop and revisit — nothing below is valid.*
2. **Deploy the hook to pre-production only.**
3. **Confirm website sessions are untouched.** Sign in to pre-prod as a normal user:
   `select auth.jwt() ->> 'aud'` must still be `authenticated`, and
   `public.is_mcp_session()` must be `false`. Create and edit a client.
4. **Connect ChatGPT and Claude to pre-prod** and read the Worker audit line:
   ```
   event = "mcp.auth.binding"  →  bound: true, aiAgent: true,
                                  claimedAudience: ["https://mcp-preprod.scalyo.app/mcp"]
   ```
   Pre-prod runs `MCP_TOKEN_BINDING=enforce`, so if the audience is wrong the connection
   fails there — which is the point of it failing there.
5. **Apply `20260914120000_mcp_ai_session_restrictions.sql` to pre-production** and run its
   §4 verification, especially 4.3 (the website still writes) and 4.4 (direct REST misuse
   with an MCP token is refused).
6. **Production**, on an explicit go: hook, then migration, then
   `MCP_TOKEN_BINDING=enforce`, in that order. Enforcing before the hook is live would
   reject every connector.
7. **Only then** may the consent screen say "it cannot modify your customers" — see
   [MCP_CONSENT_PAGE.md](MCP_CONSENT_PAGE.md).

---

## Note on the audience for pre-production

`MCP_RESOURCE_URL` differs per environment (`mcp-preprod.scalyo.app` vs
`mcp.scalyo.app`), so a single hard-coded audience in the hook cannot be right for both if
one Supabase project serves both. Either use one Supabase project per environment (which
is what `SCALYO_TEST_*` in the isolation tests already assumes), or make the audience a
`client_id`-keyed map as in §2 above. Do not "solve" it by relaxing the Worker's audience
check to accept both — that would make a pre-prod token valid against production.
