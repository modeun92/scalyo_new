# MCP — open questions from the second review

**Raised:** 14/09/2026
**Source:** [`SCALYO_MCP_SECOND_REVIEW_AND_PRODUCTION_READINESS.md`](../SCALYO_MCP_SECOND_REVIEW_AND_PRODUCTION_READINESS.md)
**Status of the rest of that review:** implemented — see the change summary at the bottom.
**Why the two P0 items here were not simply fixed:** [MCP_WHY_NOT_IMPLEMENTED.md](MCP_WHY_NOT_IMPLEMENTED.md).

These five items could not be settled from the repository. Each needs either an
observation against a live Supabase project, a product decision, or a database change
whose blast radius reaches the website. Each says what is blocked, what I would do, and
what I need in order to do it.

---

## Q1 — Does Supabase's OAuth server actually bind the token to the MCP resource?

**Blocker 1 in the review. Half-implemented; the other half is unknowable from here.**

### What is done

`src/auth/verify-token.ts` now validates issuer, expiry, audience/resource (RFC 8707) and
an OAuth-client allowlist, with a full test suite. `canonicalResourceUrl()` guarantees the
advertised and validated resource are the same string. `MCP_TOKEN_BINDING` chooses whether
a failed verdict is audited (`observe`) or acted on (`enforce`).

### What is not

**I do not know what a Supabase-OAuth-issued access token puts in `aud`.** The repository
contains no sample token and no Supabase project I can query. Three outcomes are possible:

| If the token carries… | Then |
|---|---|
| `aud` (or `resource`) = `https://mcp.scalyo.app/mcp` | flip production to `enforce`. Done. |
| `aud` = `"authenticated"`, plus a distinguishable `client_id` | the audience check can never pass. Bind on `client_id` instead: fill `MCP_ALLOWED_OAUTH_CLIENTS` with the ChatGPT and Claude client ids, and drop `audience_mismatch` from the enforced set. Weaker — it identifies the *client*, not the *resource* — but real. |
| `aud` = `"authenticated"` and no `client_id` either | there is nothing to bind to, and no amount of Worker code fixes it. The options are a Supabase Auth Hook adding a custom claim at issuance, or accepting that any valid Scalyo token reaches MCP and saying so in the risk register. |

### What I need

From a **pre-production** ChatGPT connection and a **pre-production** Claude connection,
the `mcp.auth.binding` audit line each one produces:

```
event = "mcp.auth.binding"  →  mode, bound, bindingReasons, claimedAudience, oauthClientId
```

Pre-prod already ships in `enforce`, so if the binding does not hold the connection fails
there — which is the point. Production ships in `observe` so that a wrong guess here cannot
take every customer connector offline at once.

**Do not flip production to `enforce` before those two lines exist.**

---

## Q2 — Restricting the OAuth token at the database level

**Blocker 2 in the review. Not implemented: it is a database change, not a Worker change.**

### The problem, stated precisely

The MCP Worker is read-only. The *token* is not. The same access token, pointed straight at
`https://<project>.supabase.co/rest/v1/clients`, gets whatever normal RLS grants that user —
which today includes `UPDATE`, and includes the tables MCP deliberately withholds
(`client_notes`, contacts, Oxygen rows). So MCP's read-only, privacy-minimised surface is a
property of **this Worker**, not of the credential it holds. Anyone who can complete the
OAuth consent flow can also just use the token directly.

Whether that is a real escalation depends on who the attacker is:

- **the user themselves** — no escalation at all. They can already do those things in the
  Scalyo UI. The token grants them nothing new.
- **the AI host, or anything that reaches the token inside it** — a genuine escalation. The
  user consented to "view my portfolio" and handed over a credential that can also write.

The second reading is the one that matters for a consent screen that promises "it cannot
modify customers".

### The shape of the fix

RLS policies that can tell an AI/OAuth session from a normal website session, and refuse
writes and sensitive tables for the former. Sketch, **not a migration** — the claim name is
a guess and the policy names are certainly wrong for this schema:

```sql
-- Is the current request an MCP/OAuth session rather than the website?
create or replace function public.is_ai_session() returns boolean
language sql stable as $$
  select coalesce(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'client_id') is not null,
    false
  );
$$;

-- Every write policy gains: and not public.is_ai_session()
-- Every sensitive-table select policy gains the same.
```

### The four things I cannot decide

1. **Which claim actually identifies an MCP session.** Same unknown as Q1. If
   OAuth-issued tokens carry `client_id` and session tokens do not, `is_ai_session()` is
   trivial. If they do not, this needs a Supabase Auth Hook stamping a custom claim, which
   is a change to *authentication for the whole product*, not just MCP.
2. **The blast radius.** **28 of the 35 tables the code touches have no write policy
   anywhere in this repository** (counted in
   [MCP_WHY_NOT_IMPLEMENTED.md](MCP_WHY_NOT_IMPLEMENTED.md) §1) — they were created in the
   dashboard, matching `CLAUDE.md`'s note that only 8 of 35 have a `CREATE TABLE` here.
   Adding a clause to a policy means rewriting it, which means knowing its current `USING`
   and `WITH CHECK` expressions; for 28 tables I would be inventing them. A rewrite that is
   too permissive is a cross-tenant hole introduced by a security fix; one that stops
   matching breaks the **website's** writes — silently, because a PostgREST `UPDATE`
   matching zero rows returns 204 with `error = null` (`D-14`).
3. **Which tables are "sensitive" is a legal call, not a technical one.** The review's list
   (`client_notes`, contacts, billing, integration secrets, Oxygen) matches what
   `clients.service.ts` already withholds, but Oxygen in particular is described in
   `CLAUDE.md` as *legally* self-only — extending a DENY there is a legal decision.
4. **Whether it is worth it before launch at all**, given the "user themselves" reading
   above. A defensible alternative is to ship read-only v1 without it and treat it as a
   hard prerequisite for the first **write** tool, when the escalation stops being
   theoretical.

### What I need

A decision on (4) first. If it is "do it before launch", then: confirmation of the claim
from Q1, plus a dump of the live policies (`select * from pg_policies where schemaname =
'public'`) so a migration can be written against what actually exists rather than against
`SCHEMA_FROM_CODE.sql`, which is explicitly reconstructed and marked inferred.

---

## Q3 — Keep or remove the generic `search` / `fetch` tools?

**A product decision. Kept, unchanged, pending an answer.**

The review (§7) suggests removing them: they overlap `search_clients` and
`get_client_overview`, and two tools that can answer the same question make a model's
choice less deterministic.

The counter-argument is in the code comment that introduced them: ChatGPT's connector
surface expects exactly this `search` + `fetch` pair, and without them Scalyo may not
install cleanly as a ChatGPT connector at all. They add no data access — both go through
the same RLS-scoped client and the same column allowlists as the business tools.

So the question is really: **is ChatGPT connector installation a launch requirement?**

| If ChatGPT is a launch target | If Claude-first | 
|---|---|
| keep them, and verify the exact contract against OpenAI's current connector documentation before publication — it has changed before | delete both, along with `registerChatGptCompatibilityTools`, its tests and the doc rows; six focused tools select more reliably |

I did not remove them, because deleting a working ChatGPT integration path on my own
reading of a "consider" is a bigger mistake than carrying two extra tools.

---

## Q4 — The OAuth consent screen: whose is it, and what does it say?

**Verification task. Nothing in this repository can confirm it.**

`src/auth/protected-resource.ts` is explicit that **Supabase is the authorization server**
and Scalyo is only the resource server: Supabase owns the login, the consent screen,
dynamic client registration and revocation. This Worker has no `/authorize` route by
design.

The review (§10) asks for a Scalyo-hosted consent page at `https://scalyo.app/oauth/consent`
that names the requesting client and lists what it may and may not do. Those two pictures
disagree, and the disagreement matters:

- if Supabase's own consent screen is used, its wording is whatever Supabase renders —
  Scalyo cannot promise "it cannot modify customers" on a screen it does not control, and
  in any case that promise is not currently true at the database level (Q2);
- if a Scalyo-hosted consent page is required, that is a front-end feature that does not
  exist in this repository, and it needs the Supabase OAuth server configured to redirect
  to it.

Also unverified, because they live in the Supabase dashboard rather than in code: dynamic
client registration being enabled, the revoke/disconnect path working end to end, and
whether a revoked connection actually stops working (the Worker's one-network-hop-per-
request design exists precisely to make revocation immediate — that property is worth
testing, not assuming).

**What I need:** confirmation of which consent screen is in play, and — if it is Supabase's —
whether its wording can carry the four "it cannot…" lines the review specifies. If it
cannot, either the consent copy or Q2 has to give.

---

## Q5 — Tool-selection evaluation

**Agreed and not built.** The review (§14) is right that protocol tests prove the tools
work while proving nothing about whether a model *picks* the right one. Titles,
annotations and output schemas — all added in this change — are exactly the inputs that
influence that choice, so there is now something to evaluate.

This needs a golden-prompt set run against real models ("Which customers need my
attention?" → `get_at_risk_clients`; "What's the weather tomorrow?" → no Scalyo tool;
"Delete Acme." → no matching tool exists), which means live model calls in CI.

**What I need:** whether that belongs in this repository's test suite at all, given it
costs model calls and is non-deterministic, or whether it should be a manual pre-release
checklist item in `docs/MCP_SERVER.md`.

---

## What was implemented in the same change

Everything else from the review that lives in `app-v2/mcp-worker`:

| Review item | Where |
|---|---|
| §3 resource/audience validation | `src/auth/verify-token.ts` `checkTokenBinding()`; `src/auth/protected-resource.ts` `canonicalResourceUrl()`; `test/token-binding.test.ts` |
| §5 tool titles and read-only annotations | `src/tools/index.ts` — `title` + `READ_ONLY` on all nine tools |
| §6 `outputSchema` and `structuredContent` | `src/tools/index.ts` — a zod output schema per tool, both result forms, compact text fallback |
| §11 deterministic organization context | `src/auth/user-context.ts` — `profiles.organization_id` canonical, cross-checked; refuses to guess |
| §12 provider-aware pre-auth rate limit | `wrangler.jsonc` — IP limit 60 → 600/min |
| §13 reduced `get_server_status` output | `src/tools/index.ts` — email and role only; no internal ids |

`npm run typecheck` and `npm test` pass (86 tests; the 9 live tenant-isolation tests skip
without pre-prod credentials, which is not a pass — see
[MCP_SERVER.md](MCP_SERVER.md#before-every-deploy)).
