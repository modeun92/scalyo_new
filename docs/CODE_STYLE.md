# Code style and engineering doctrine

The rules below are not aspirational — each one is enforced in the code and most of them
exist because the opposite shipped once and caused a visible incident. The tags in
parentheses (`R21`, `D-14`, `CAP-1000`, …) are the ones used in the source comments.

## Language policy

**Code is written in English.** That covers comments, developer-facing log messages,
identifiers, CSS class names, file names and internal keys.

**French stays where it is product content**, and must not be translated:

| Kind | Where |
|---|---|
| UI strings | `src/i18n/fr.js`, `src/i18n/fr-content.js`, `landing.js`, `legal.js`, `dpa.js` — **including the KPI library labels** (`kpilib_<id>` / `kpilibcat_<id>`), which used to be a `label`/`labelEN`/`labelKO` table inside the catalog file and were therefore invisible to `check-i18n.mjs` |
| AI system prompts | `functions/api/_prompts/*`, the inlined wellbeing prompt in `_modules/index.js` and `ai.js` |
| Email template bodies | `src/i18n/*-content.js`, and the `[Entreprise]` / `[ENTREPRISE]` substitution tokens |
| Email/notification fallbacks | the hard-coded FR `title` / `body` in `stores/notifications.js`, kept as legacy fallbacks behind the locale-agnostic payload |
| Public French pages | `public/presse/`, the FR blog articles, the FR landing at `/` |
| Persisted enum values | `oxygen_recoveries.kind = 'cloture'`, `email_templates.category` (`renouvellement`, `suivi`, `risque`, `relance`, `negociation`, `prospection`), CSV import aliases in `src/config/importFields.js` |
| Public asset and URL slugs | `og-reduire-churn-saas.png`, `scalyo-portefeuille-health-scores.webp`, `/presse/`, `reduire-churn-saas.md` — renaming these would break live SEO URLs |

The persisted values and the public slugs are the important carve-outs: renaming them is
a data migration or an SEO change, not a refactor.

## R21 — never invent a value

If there is no real data, the value is `null` and the UI renders `—`. This is the single
most repeated rule in the code base.

- No check-in today → the Oxygen index is `null`, not 0.
- Fewer than 3 completed tasks → velocity, remaining weeks and the projected end date are
  `null`; the view shows a "not enough data" state. The old code invented 0.5 tasks/week
  out of nothing.
- No assigned client → the CSM load is `null`, not 0.
- No real team well-being source → `null`, never a plausible-looking 75.
- A failed portfolio read → an **empty** AI context ("no data loaded"), never `"0 clients"`.
- `0` is a real value. Never write `value || fallback` on a numeric field — a genuine
  health score of 0 used to become 5 because 0 is falsy.

## D-14 / D-15 — never a false success

A `✓` on screen is only allowed after an OK response from Supabase.

- Every mutation goes through `withWrite` (timeout + toast) and returns
  `{ success }` / `{ error }`.
- Destructured `error` values are **always** tested. A silently swallowed `updErr` once
  produced a "completed" playbook that was never written.
- Optimistic **structural** changes (add / delete / reorder) are reverted on failure.
- Optimistic **field edits** are not reverted: the user's typing stays on screen, the
  toast has already fired, and the next keystroke resends everything.
- A slide-over or panel only closes when the write actually succeeded.
- A local state change happens **after** the confirmed write, never before it.
- REST-SPA rule: after a write that matters, re-read. The local state comes from the
  re-read, not from the 200 alone.

## Single source of truth

Duplication is treated as a defect. The current single sources:

| Concern | Module |
|---|---|
| Plans, roles, modules, feature flags | `config/plans.config.js` (front) ⟷ `functions/api/_config/plans.config.js` (back) — **manual sync, change both** |
| Prices | `functions/api/_config/prices.js` |
| Stripe links | `src/config/stripeLinks.js` |
| Health scale, thresholds, effective status | `src/lib/health.js` ⟷ mirrored in `_services/context.service.js` — **parity mandatory** |
| Money, dates, KPI values, day keys | `src/lib/formatters.js` |
| COPIL deck rendering (numbers, quotes, fonts) | `src/utils/copilFormat.js` |
| Landing copy and SEO metadata | `src/i18n/landing.js` — never copied into `scripts/build-blog.js` |
| Markdown → sanitized HTML | `src/utils/sanitize.js` |
| Seat count | `GET /api/members` |
| Paginated full reads | `src/lib/fetchAllRows.js` |

## C2 / C6 — no `t()` in a store

Stores return **i18n keys and params**; views render them. This keeps notification text,
playbook step titles, task recommendations and Oxygen labels locale-agnostic, and it is
what allows a notification generated in French to be read in Korean.

Outside a component, i18n is reached through `i18n.global`, never `useI18n()`.

## CAP-1000 — PostgREST truncation

PostgREST caps every response at 1000 rows **without raising an error**.

- Reads that must be complete go through `fetchAllRows` with `count: 'exact'` and a
  **stable** sort. A batch insert shares one `created_at` (Postgres transactional
  `now()`), so a secondary sort on `id` is mandatory.
- Past a safety ceiling the helper cuts and **says so** (`truncated` + the exact total);
  it is never silent.
- Writes never use an unbounded `.in('id', […])`: past ~1000 ids the URL blows up and the
  call fails silently. Bulk writes use a **server-side filter** with the same scope.
- Generation that depends on a dedup read is **fail-closed**: a failed or truncated read
  generates nothing.

## Time zones

- A **calendar date** is compared and keyed in local time. `localDateKey()` produces a
  local `YYYY-MM-DD`; `toISOString().slice(0,10)` is forbidden for this because it yields
  the UTC day (D-1 between 00:00 and 02:00 Paris).
- An **instant** is stored as a UTC ISO string. A `datetime-local` string is local time
  and is converted on write; a date-only (all-day) string is never converted; an invalid
  string writes nothing.
- Getting this wrong shifted the entire Gantt by one column while the *labels* stayed
  correct, so "Today" pointed at the wrong day.

## NO-CONFIRM — no native `confirm()`

Confirmation happens in the product, through the shared `ConfirmDialog`. A native
`confirm()` is forbidden: besides being off-brand, it blocks automated evidence capture.
Focus starts on *Cancel*.

## Partial updates must be partial-safe

A field absent from the input is not sent. Building a full payload with empty defaults on
every write corrupted rows on every Kanban drag, and the damage was invisible locally
until the next reload. Insert defaults live in the `add*` functions, not in the mapper.

## Guards against writing garbage

- **Anti-empty guard (B-10b)**: never overwrite a healthy row with an empty or incomplete
  payload. Normalize the payload the way REST will (`JSON.stringify` drops `undefined`),
  log it on every call, and return early if it is empty.
- **Column-level guard**: if a value is not loaded yet, omit its column so the `UPDATE`
  keeps the stored value, rather than sending `null`.
- **Boot order matters**: load histories *before* the day's upsert, or the boot writes a
  `null` index over a real one.

## Async auth

Never `await` a Supabase call inside an `onAuthStateChange` callback. The client waits for
callbacks during a token refresh, so a call there re-enters the client and deadlocks.
Defer with `setTimeout(0)`, fire-and-forget, and log errors.

## Error contracts

Pages Functions return a **stable machine code**, plus the details the front end needs to
compose a message. Translation happens on the client, which knows the user's language.
Exception messages never reach the client.

Cloudflare replaces the body of a 5xx from a Pages Function with its own HTML page, so
endpoints deliberately return a typed **409** where a 502 would be natural.

## Dead code

Zero dead code is an explicit goal. Removed features take their CSS, their i18n keys and
their imports with them; what is kept dormant on purpose (Integrations, `_future/*`) says
so in a comment.

## Comment style

Comments in this code base are unusually dense, and that is deliberate. The convention is:

```js
// TAG (date): what the rule is.
// Why the obvious alternative is wrong, with the symptom it produced.
```

The tag is a stable handle (`R21`, `D-14`, `CAP-1000`, `TZ-PLANNING`, `HEALTH-SCALE`,
`COPIL-RACE`, `SEO-I18N`, `PAYWALL-MEMBER`, …) that appears at every site governed by the
same rule, so grepping the tag finds the whole family. Keep the tag when you edit the
line, and keep the symptom — it is the reason the rule survives.
