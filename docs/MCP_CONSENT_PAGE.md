# The Scalyo OAuth consent page

**Written:** 14/09/2026
**Answers:** Q4 in [MCP_OPEN_QUESTIONS.md](MCP_OPEN_QUESTIONS.md)
**Route:** `/oauth/consent` — `src/views/OAuthConsentView.vue`, `src/lib/oauthConsent.js`

## The decision, and the correction it makes

**Scalyo owns the consent UI. Supabase owns the OAuth backend.**

That reverses what `mcp-worker/src/auth/protected-resource.ts` used to assert — that
Supabase owns the consent screen too, and that a Scalyo-hosted page would duplicate it.
The split is finer than that:

| Supabase (authorization server) | Scalyo (this page) |
|---|---|
| authorization codes, PKCE, tokens, refresh | the screen the user actually reads |
| dynamic client registration | naming the requesting application |
| revocation | stating what the grant does and does not allow |

The sentence *"it cannot modify your customers"* is a claim about Scalyo's data model.
It is not Supabase's to make, and it is not something a generic consent screen can say.

## The flow

```
ChatGPT / Claude
     |  authorization request
     v
Supabase authorize endpoint
     |  redirects the user, carrying authorization_id
     v
https://scalyo.app/oauth/consent?authorization_id=…
     |  the user reads, then Allow / Cancel
     v
approveAuthorization() / denyAuthorization()
     |  returns a redirect URL
     v
Supabase issues the code  ->  the AI client
```

## Two decisions worth keeping

### The route has neither `meta.guest` nor `meta.requiresAuth`

Same reasoning as `/join` (`INV-GUEST`), and it is not a style choice:

- `meta.guest` bounces an already-signed-in user to the dashboard — and the
  `authorization_id` dies with the bounce;
- `meta.requiresAuth` redirects to `{ name: 'login' }`, which **drops the query string** —
  and the `authorization_id` exists only in that query.

The view handles the signed-out case and links to `/login?redirect=<full path>`, which
`LoginView` already honours with an open-redirect guard (internal paths only).

### The "it cannot…" list is behind a flag, and it is currently OFF

`RESTRICTIONS_DEPLOYED = false` in the view. The four "cannot" lines are claims about the
**token**, not about the MCP tool list, and until both of these are live they are false:

1. `supabase/migrations/20260914120000_mcp_ai_session_restrictions.sql` applied, and
2. the access-token hook stamping `ai_agent` ([MCP_ACCESS_TOKEN_HOOK.md](MCP_ACCESS_TOKEN_HOOK.md)).

Without them the credential can still write through Supabase REST. A consent screen is a
commitment to the user; printing a promise the system does not keep is worse than printing
nothing. Flip the constant in the same change that confirms §4.4 of the migration passes.

The "can" list is true today — it describes exactly what the six read-only tools return.

## Verifying the client API

**This is the part that could not be verified when the page was written.** The frontend has
no `node_modules` in this snapshot, and Supabase's authorization-server client methods are
recent. Every call is therefore isolated in `src/lib/oauthConsent.js`
(`OAUTH-CONSENT-SURFACE`), which expects:

```js
supabase.auth.oauth.getAuthorizationDetails({ authorization_id })
supabase.auth.oauth.approveAuthorization({ authorization_id })
supabase.auth.oauth.denyAuthorization({ authorization_id })
```

Before enabling this route in production:

```sh
cd app-v2/frontend && npm install
node -e "const {createClient}=require('@supabase/supabase-js');
         console.log(Object.keys(createClient('https://x.supabase.co','k').auth.oauth||{}))"
```

If the names differ, correct them in `oauthConsent.js` — three bound-method lookups, one
file. If the namespace does not exist at all, `isOAuthConsentSupported()` returns false and
the page renders an explicit "authorization unavailable" screen rather than an Allow button
that does nothing. **It never silently succeeds**: on a grant screen, a swallowed error
that still looks like consent is the D-14/D-15 failure with the highest possible cost.

Also confirm in the Supabase dashboard that the OAuth server is configured to redirect to
`https://scalyo.app/oauth/consent` (and the pre-prod equivalent). Without that redirect the
page is never reached and Supabase renders its own screen instead.

## Test checklist (pre-production, both hosts)

- [ ] authorization starts from ChatGPT, and from Claude
- [ ] signed-out user lands on login and returns to the consent screen **with the
      `authorization_id` intact** — this is the one that silently breaks
- [ ] already-signed-in user reaches the screen directly (not the dashboard)
- [ ] the requesting client is named correctly; an unknown client renders as
      "an unidentified application", never an invented name (R21)
- [ ] Allow completes the flow and the connector works
- [ ] Cancel returns the user and grants nothing
- [ ] a revoked connection stops working — the Worker pays a `/auth/v1/user` hop on every
      request specifically to make revocation immediate; that property has never been
      exercised against a live project
- [ ] expired and wrong-resource tokens are rejected (pre-prod runs `enforce`)
- [ ] the page renders correctly in FR, EN and KO

## Not built

A **connected-AI-apps settings page** (list connections, revoke from inside Scalyo). The
review lists it under P2/distribution. Revocation itself is Supabase's, and today the user
revokes from the AI host. `oauth_consent_revoke_hint` currently points at Scalyo settings —
**when that screen is built, verify the wording matches where the control actually is.**
