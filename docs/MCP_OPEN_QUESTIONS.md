# MCP — open questions

**Raised:** 14/09/2026 (second review) · **Last updated:** 14/09/2026 (fifth report)
**Reviews:** [second](reviews/SCALYO_MCP_02nd_REVIEW_AND_PRODUCTION_READINESS.md) ·
[third](reviews/SCALYO_MCP_03rd_REVIEW_AND_FINAL_FIX_LIST.md) ·
[answers](reviews/SCALYO_MCP_OPEN_QUESTIONS_ANSWERS.md) ·
[fourth](reviews/SCALYO_MCP_04th_REVIEW_AND_LAUNCH_CHECKLIST.md) ·
[fifth](reviews/SCALYO_MCP_05th_STATE_AND_PREPROD_REPORT.md)
**Why the two P0s waited:** [MCP_WHY_NOT_IMPLEMENTED.md](MCP_WHY_NOT_IMPLEMENTED.md) (superseded)

## Status

Everything designable from this repository is built. What remains needs a live Supabase
project or a product decision — verification, not design.

| | Question | Decision | State |
|---|---|---|---|
| Q1 | resource binding | Supabase does **not** bind by default — add a Custom Access Token Hook | hook **drafted, not applied**; Worker side done |
| Q2 | AI-token DB restrictions | **yes, before public launch** | tables + **Storage** + **SECURITY DEFINER RPCs**; inert until the hook is live |
| Q3 | `search` / `fetch` | remove **unless** ChatGPT Company Knowledge is a launch requirement | **open — the only undecided item** |
| Q4 | consent UI | **Scalyo owns it** | **built**; three P0 bugs from the fourth review fixed |
| Q5 | tool-selection evals | cases in repo; live model run nightly/pre-release | **built**; live run never executed |
| Q6 | scale past 200 accounts | *new from the fourth review* | honesty shipped (`partial`), completeness is a product call |
| Q7 | nothing has met a real Postgres or a real token | *new from the fifth report* | a process question: who runs the pre-prod sequence, and when |

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

**Answered: yes, and before public launch** — the credential is the security boundary, not
the tool list.

**Built, in two migrations:**

| Migration | Covers |
|---|---|
| `20260914120000_mcp_ai_session_restrictions.sql` | `public` tables — no INSERT/UPDATE/DELETE on all 35, no SELECT on 15 sensitive ones |
| `20260914130000_mcp_rpc_and_storage_restrictions.sql` | `storage.objects` (all four verbs), six `SECURITY DEFINER` RPCs, and `mcp_security_check()` as a release gate |

### What unblocked the first one

I had said this could not be written here: adding `and not is_ai_session()` to a policy
means **rewriting** it, and 28 of 35 tables have no policy definition in the repository.
That was right about *replacing* policies, and it missed the technique the answers doc
names — **restrictive** policies are ANDed with the existing permissive set:

```
final access = (any permissive policy passes) AND (every restrictive policy passes)
```

So the 28 unknown policies are never read, rewritten or touched.

### What the fourth review added

Table policies were not the whole boundary. Two doors stayed open, both reachable with the
same token by calling Supabase directly and skipping the Worker:

- **Storage.** `storage.objects` has its own policies. A token that could not update a
  client row could still upload, overwrite or delete a COPIL media file. All four verbs are
  now denied, `SELECT` included, because v1 MCP has no storage tool — adding a read back is
  one policy drop; discovering an AI client read COPIL media is an incident.
- **`SECURITY DEFINER` RPCs.** They run with the *owner's* privileges, so a restrictive
  policy on the table they write does not stop them — that is what `SECURITY DEFINER`
  means. `POST /rest/v1/rpc/open_dm` would have created a chat channel for an AI session.

Six RPCs are guarded by **rename-and-wrap**: the original becomes `<name>_unguarded` and a
same-signature wrapper takes the public name, calling `mcp_guard()` first. The original body
is never retyped, so the migration cannot silently revert the concurrency fix in
`toggle_chat_reaction` or the `n >= 5` legal threshold in `oxygen_team_aggregate` — either
of which would be worse than the gap being closed. `EXECUTE` on each `_unguarded` twin is
revoked from `authenticated`; without that revoke the guard is decoration, because
`/rest/v1/rpc/open_dm_unguarded` would still answer.

### The gate, hardened (fifth report §7–§8)

`mcp_security_check()` originally asked only whether *some* `mcp_no_*` policy existed on a
table — so `mcp_no_insert_clients` present with `update`/`delete` missing would have read as
protected. It now checks every expected policy **by name**, all four Storage policies
individually, plus list drift and `*_unguarded` originals still executable. It is also no
longer executable by `authenticated`: it enumerates exactly which controls are missing,
which is a map of the holes for anyone holding a user token.

### Still inert, on purpose

Everything keys off `is_mcp_session()`, which reads the `ai_agent` claim that exists only
once the Q1 hook is deployed. **A deployed migration is not a deployed control.** The
Worker's `aiAgent` audit field says which state you are in.

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

**Answered: Scalyo's.** Supabase owns the OAuth mechanics; the page the user reads is ours.
That corrects `protected-resource.ts`, which treated the consent screen as Supabase's — and
the original gap plan had said "Build a Scalyo consent screen" from the start.

**Built:** `/oauth/consent` — `OAuthConsentView.vue`, `lib/oauthConsent.js`, 26 i18n keys in
FR/EN/KO. See [MCP_CONSENT_PAGE.md](MCP_CONSENT_PAGE.md).

**Three P0 bugs the fourth review caught, now fixed.** All three would have surfaced only at
the first live authorization — the most expensive possible moment, because the user is
mid-grant and sees only that Scalyo is broken:

1. the Supabase methods take the authorization id as a **bare string**, not
   `{ authorization_id }`;
2. an **already-authorized** response (no `authorization_id` in the payload) must redirect
   immediately, not render a second consent form whose Allow button has nothing to approve;
3. OAuth **`scope` is one space-delimited string**, not an array — read as an array it was
   always empty, so the screen listed no requested scopes and the user approved an
   unspecified grant. Scopes are now shown verbatim as protocol tokens (untranslated,
   rule 4).

**Remaining:** verify the three method names against the installed client; point the
Supabase OAuth server's redirect at this route; run the checklist, which now includes a
**repeat-authorization** case.

`app-v2/frontend` has no test runner, so none of this is covered by an automated test — it
is review plus the live checklist. That is worth knowing when judging how much confidence
to place in it.

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

## Q6 — New: scale beyond 200 accounts (fourth review §11)

Not security, not blocking, but now visible rather than silent.

`get_at_risk_clients`, `search_clients` and `get_upcoming_renewals` rank or filter **in the
Worker**, because effective health status, risk and prospect-exclusion cannot be expressed
as PostgREST filters. They scan at most 200 rows; beyond that, matching accounts are never
fetched.

All three now return `partial: true` with a `partialNote`, alongside the existing
`truncated`. Both matter and they are different statements:

| Flag | Means |
|---|---|
| `truncated` | more matched than the caller's `limit` asked for |
| `partial` | the scan ceiling was hit — matches may exist that were never fetched |

Conflating them is how a model tells a customer "you have 3 at-risk accounts" when the 4th
merely sat past the scan window.

**The open question:** at what customer size does this stop being acceptable, and which fix
is wanted — a server-side aggregate RPC, cursor pagination, or a database-side
effective-status column? One customer with 250 accounts already gets a flagged-but-
incomplete answer to *"which customers need my attention?"*, the most-used question in the
product.

Honesty is shipped. Completeness is a product decision about scale.

---

## Q7 — New: nothing here has met a real Postgres or a real token

The fifth report's own framing, and it is the right one: *"the final confidence must come
from the real Supabase and connector environment rather than additional speculative code
changes."*

What is written but never executed:

| Artefact | Never run against |
|---|---|
| `20260914120000` + `20260914130000` | a real Postgres — dynamic SQL, policy creation, function renames, wrappers, grants |
| `mcp_security_check()` | a real schema |
| the access-token hook | any Supabase project |
| `lib/oauthConsent.js` | a real Supabase OAuth server (and the frontend has no test runner) |
| the golden-prompt set | a real model |
| `test/tenant-isolation.test.ts` | pre-prod — it **skips** without credentials, and a skipped run is not a pass |

This is not a defect list. It is the honest boundary of what a repository can prove about
itself, and the reason the fifth report says **"do not invent fixes for these locally"**.

**The open question is a process one:** who runs the pre-production sequence, and when? Until
someone does, the security model's status is "designed and reviewed", not "working" — and
the difference is invisible from inside the code.

---

## What is still needed from a live environment

Nothing below can be settled from this repository. In order:

1. **Read the real claims.** `select auth.jwt() ->> 'client_id'` for a website session
   (expect null), and the `oauthClientId` audit field for a connector (expect non-null).
   Gates Q1 and Q2 — if `client_id` does not discriminate, the hook as drafted is wrong and
   nothing downstream of it is valid.
2. **Deploy the access-token hook to pre-prod.** Confirm `aiAgent: true` and `bound: true`
   in `event = "mcp.auth.binding"` from a real ChatGPT and a real Claude connection.
3. **Apply both migrations to pre-prod**, then `select * from public.mcp_security_check();`
   — expect zero rows. Run the abuse tests (fourth review §19): direct REST writes,
   sensitive reads, a Storage upload, and `POST /rest/v1/rpc/open_dm`. Exercise the
   **website's** write paths too — the table migration touches 35 tables.
4. **Verify the three Supabase consent method names** against the installed
   `@supabase/supabase-js` ([MCP_CONSENT_PAGE.md](MCP_CONSENT_PAGE.md)).
5. **Answer Q3**: is ChatGPT Company Knowledge a launch requirement?
6. Only then: `MCP_TOKEN_BINDING=enforce`, and flip `RESTRICTIONS_DEPLOYED` so the consent
   screen may state its "it cannot…" promises.
