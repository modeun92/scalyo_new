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

## Three bugs the fourth review caught

All three would have surfaced only at the first live ChatGPT authorization — the single
most expensive moment to fail, because the user is mid-grant and sees only that Scalyo is
broken.

| Bug | Was | Now |
|---|---|---|
| argument shape (§3) | `call({ authorization_id })` | `call(authorizationId)` — the methods take a bare string |
| already authorized (§4) | rendered a second consent form whose Allow button had no pending authorization to approve | a response with no `authorization_id` returns `{ status: 'redirect' }` and the page navigates immediately |
| scope parsing (§5) | read `data.scopes` as an array → always empty, so the screen showed **no** requested scopes and the user approved an unspecified grant | `parseScopes()` splits the OAuth `scope` string (`"openid email profile"`), with the array form still accepted |

The requested scopes are now displayed verbatim, as `<code>` tokens. They are protocol
identifiers, not prose: **not translated** (rule 4) and not prettified into friendlier
wording that could misdescribe what was granted.

On the redirect path `loading` is deliberately left `true` — the page is navigating away,
and flashing the consent form for one frame on the way out is exactly the confusion the
fix removes.

---

## Verifying the client API

**This is the part that could not be verified when the page was written.** The frontend has
no `node_modules` in this snapshot, and Supabase's authorization-server client methods are
recent. Every call is therefore isolated in `src/lib/oauthConsent.js`
(`OAUTH-CONSENT-SURFACE`), which expects:

```js
supabase.auth.oauth.getAuthorizationDetails(authorizationId)   // bare string, not an object
supabase.auth.oauth.approveAuthorization(authorizationId)
supabase.auth.oauth.denyAuthorization(authorizationId)
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
- [ ] **repeat authorization**: authorize once, then start the flow again from the same
      host — the second attempt must redirect straight through, never show a second form
- [ ] the requested scopes are listed, and match what the host asked for

## Not built

A **connected-AI-apps settings page** (list connections, revoke from inside Scalyo). The
review lists it under P2/distribution. Revocation itself is Supabase's, and today the user
revokes from the AI host, which is what `oauth_consent_revoke_hint` now says. **When that
screen is built, update that key** — a consent screen must not point at a control that does
not exist, which is what the first wording did.
