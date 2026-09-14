# MCP — open questions from the second review

**Raised:** 14/09/2026
**Answered:** 14/09/2026 by [`SCALYO_MCP_OPEN_QUESTIONS_ANSWERS.md`](reviews/SCALYO_MCP_OPEN_QUESTIONS_ANSWERS.md)
**Source:** [`SCALYO_MCP_SECOND_REVIEW_AND_PRODUCTION_READINESS.md`](reviews/SCALYO_MCP_SECOND_REVIEW_AND_PRODUCTION_READINESS.md),
[`SCALYO_MCP_THIRD_REVIEW_AND_FINAL_FIX_LIST.md`](reviews/SCALYO_MCP_THIRD_REVIEW_AND_FINAL_FIX_LIST.md)

## Status

All five have decisions. Four are built; what is left is live verification, not design.

| | Question | Decision | State |
|---|---|---|---|
| Q1 | resource binding | Supabase does **not** bind by default — add a Custom Access Token Hook | hook **drafted, not applied** ([MCP_ACCESS_TOKEN_HOOK.md](MCP_ACCESS_TOKEN_HOOK.md)); Worker side done |
| Q2 | AI-token DB restrictions | **yes, before public launch** — not deferred to the first write tool | migration **written** (`20260914120000`), inert until the hook is live |
| Q3 | `search` / `fetch` | remove **unless** ChatGPT Company Knowledge is a launch requirement | **still open — the only undecided item.** Kept, URL bug fixed, comment clarified |
| Q4 | consent UI | **Scalyo owns it**, Supabase owns the OAuth backend | **built** — `/oauth/consent` ([MCP_CONSENT_PAGE.md](MCP_CONSENT_PAGE.md)) |
| Q5 | tool-selection evals | cases in the repo; live model runs nightly/pre-release, not per commit | **built** — `test/evals/golden-prompts.json` + integrity test |

The two blockers that were previously "cannot be done from this repository" are now done.
What changed is explained in each section below — in Q2's case, because the answer pointed
at a technique that removed the blocker, not because the earlier reasoning was ignored.

---

## Q1 — Does Supabase's OAuth server bind the token to the MCP resource?

**Answered: no, not by default.** Supabase OAuth access tokens carry `aud: "authenticated"`
and a `client_id`, not a resource-specific audience.

**Decision:** add a Supabase **Custom Access Token Hook** that stamps
`aud = https://mcp.scalyo.app/mcp` and `ai_agent: true` onto OAuth-issued tokens, leaving
website session tokens untouched. Then enforce.

**Built:** the Worker half — issuer, expiry, audience/resource, client allowlist, and now
the `ai_agent` observation (`MCP-AI-CLAIM`), audited on every request as
`event = "mcp.auth.binding" → aiAgent`.

**Not applied:** the hook itself, drafted in
[MCP_ACCESS_TOKEN_HOOK.md](MCP_ACCESS_TOKEN_HOOK.md). It runs on **every token issuance in
the project**, website logins included, and its safety rests on one assumption this
repository cannot check: that `client_id` is present on OAuth tokens and absent on session
tokens. If that is inverted, the hook rewrites the `aud` of every login in the product.
The doc gives the two queries that settle it.

**Remaining:** run those two checks, deploy the hook to pre-prod, confirm
`aiAgent: true` and `bound: true` from a real ChatGPT and a real Claude connection, then
flip production to `enforce`. Production stays `observe` until then — but note an
unrecognised value is now a hard startup error rather than a silent `observe`
(`MCP-BINDING-MODE-STRICT`, third review §10).

---

## Q2 — Restricting the OAuth token at the database level

**Answered: yes, and before public launch** — explicitly not deferred until the first write
tool, because the credential is the security boundary, not the tool list.

**Built:** `supabase/migrations/20260914120000_mcp_ai_session_restrictions.sql`.

### What unblocked it

I previously said this could not be written from here: adding `and not is_ai_session()` to
a policy means **rewriting** that policy, and 28 of 35 tables have no policy definition in
the repository. That reasoning was correct about *replacing* policies — and it missed the
technique the answer names:

> Where practical, use **restrictive** policies that narrow access rather than replacing
> existing permissive policies.

PostgreSQL ANDs restrictive policies with the permissive set:

```
final access = (any permissive policy passes) AND (every restrictive policy passes)
```

So the existing 28 unknown policies are never read, never touched, never rewritten. The
blocker was real for the approach I was considering; it does not apply to this one.

### Why the migration is safe to apply

For a normal website session `public.is_mcp_session()` is false, so `not is_mcp_session()`
is true, so every restrictive policy passes and behaviour is **identical to today**. Only a
JWT carrying `ai_agent: true` is affected. `service_role` bypasses RLS entirely, so the
Pages API functions are unaffected.

It denies INSERT/UPDATE/DELETE on all 35 tables, and SELECT on 15 sensitive ones
(`client_notes`, `ai_conversations`, `org_integrations`, `oxygen_*`, `api_keys`, …) while
leaving `clients`, `tasks`, `profiles`, `organization_members`, `organizations` and
`client_metrics` readable — which is exactly what the MCP tools need.

### It is currently INERT, on purpose

`is_mcp_session()` reads the `ai_agent` claim, which only exists once the Q1 hook is
deployed. Until then every check returns false and the migration protects nothing. That
ordering is deliberate — the migration is safe to apply first and starts working the
moment the hook lands — but **a deployed migration is not a deployed control**. The
Worker's `aiAgent` audit field is how you tell which state you are in.

Verification, including direct-Supabase-REST misuse with an MCP token, is in §4 of the
migration; rollback is §5.

---

## Q3 — Keep or remove the generic `search` / `fetch` tools?

**The one item still genuinely open**, because both documents answer it conditionally and
neither states the condition.

> Remove them **unless ChatGPT Company Knowledge is an explicit launch requirement**.

Nobody has said whether it is. So:

**Kept**, and the two real defects fixed:

- **the URL bug** (third review §6): results linked to `https://scalyo.app/clients/<id>`,
  but the Vue route is `/app/clients/:id` — the authenticated area is mounted under
  `/app`. Every ChatGPT citation led to a 404, and because it 404s *in the user's browser*
  rather than in the tool call, nothing on our side would ever have reported it. Now
  `https://scalyo.app/app/clients/<id>`, with a regression test.
- **the comment**, which said "so the same endpoint installs cleanly in both Claude and
  ChatGPT" — misleading, since Claude needs neither. It now says plainly that these exist
  only for Company Knowledge and that deleting them is the right move if that is dropped.

**To close this:** answer one question — *is ChatGPT Company Knowledge a launch
requirement?* If no, delete `registerChatGptCompatibilityTools`, its tests, and the doc
rows; six focused tools route more reliably. If yes, verify the contract against OpenAI's
current connector documentation before publication.

---

## Q4 — The OAuth consent screen: whose is it?

**Answered: Scalyo's.** Supabase owns the OAuth backend — codes, PKCE, tokens, dynamic
client registration, revocation — but not the page the user reads. That corrects the
assumption in `protected-resource.ts`, which treated the consent screen as Supabase's too.

**Built:** `/oauth/consent` — `OAuthConsentView.vue`, `lib/oauthConsent.js`, 25 i18n keys
in FR/EN/KO. Details in [MCP_CONSENT_PAGE.md](MCP_CONSENT_PAGE.md).

Two things worth knowing before it ships:

- **The "it cannot…" list is behind `RESTRICTIONS_DEPLOYED`, currently `false`.** Those are
  claims about the *token*, and they are false until the Q1 hook and the Q2 migration are
  both live. Both reviews say the same thing: do not show those promises before the
  restrictions exist.
- **The three Supabase authorization-server calls are unverified.** The frontend has no
  `node_modules` here and these client methods are recent. They are isolated in one file,
  and if the API is absent the page shows an explicit failure rather than an Allow button
  that does nothing — on a grant screen, a swallowed error that still looks like consent is
  the worst possible D-14. [MCP_CONSENT_PAGE.md](MCP_CONSENT_PAGE.md) has the one-command
  check.

**Remaining:** verify those method names; point the Supabase OAuth server's redirect at
this route; run the approve/deny/revoke/PKCE checklist against pre-prod.

---

## Q5 — Tool-selection evaluation

**Answered:** keep the cases in the repository; do **not** run live-model calls on every
commit. Two layers.

**Built:**

- `test/evals/golden-prompts.json` — 12 cases: 7 positive (including two-step
  name→overview routing) and 5 negative (weather, general knowledge, delete, send email,
  write a note), with a 95% routing threshold.
- `test/tool-selection.test.ts` — runs on **every** CI run and calls no model. It asserts
  every `expectedTools` name is a tool that actually exists, every `forbiddenTools` name
  does **not** exist, negative cases stay negative, and every business tool has at least
  one prompt. That catches the failure that would otherwise be invisible: rename a tool and
  the eval set silently starts asserting nothing about a server that no longer exists.
- The `forbiddenTools` assertion doubles as a guard on v1's read-only promise — the day
  `add_client_note` or `send_email` is registered, that test fails and forces the eval set
  *and* the consent copy to be revisited deliberately.

**Remaining:** the live model run (nightly / pre-release / before any tool-schema change).
A passing integrity check is not a passing evaluation.

---

## What is still needed from a live environment

Nothing below can be settled from this repository:

1. `select auth.jwt() ->> 'client_id'` for a website session (expect null) and the
   `oauthClientId` audit field for a connector (expect non-null) — gates Q1 and Q2.
2. Deploy the access-token hook to pre-prod; confirm `aiAgent: true`, `bound: true`.
3. Apply the migration to pre-prod; run its §4 checks, **especially 4.3** (the website
   still writes — it touches 35 tables) and 4.4 (direct REST misuse is refused).
4. Verify the three Supabase consent-API method names.
5. Answer Q3: is ChatGPT Company Knowledge a launch requirement?
