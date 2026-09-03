# Audit — mock, hard-coded and "pretending to work" code

**Scope:** the whole snapshot (`app-v2/frontend/src`, `app-v2/frontend/functions`,
`supabase/`). **Date:** 2026-09-03.

**What counts as a finding.** Code that is presented — to a user, a caller or a reader —
as doing something it does not actually do. Four kinds:

- **Fabricated data**: a default value invented where the real one is missing, which then
  flows into a decision, an aggregate or an alert.
- **Dead scaffolding**: a declared capability with no implementation behind it.
- **False signal**: a success, a status or a metric returned without verifying anything.
- **Orphan surface**: complete UI or backend wired to nothing.

Legitimate marketing mockups (`components/landing/LandingMockup*.vue`) are **not**
findings — they are labelled `mock-*`, live only on the public landing page, and never
touch application data. They are listed once in §6 for completeness.

**Result: 24 findings.** 4 critical, 7 high, 8 medium, 5 low.

---

## Severity summary

| # | Finding | Severity |
|---|---|---|
| 1 | GDPR deletion misses 18 real tables and targets 9 non-existent ones | **Critical** |
| 2 | GDPR deletion reports success without checking any response status | **Critical** |
| 3 | Hard-coded **production** Supabase URL fallback in two endpoints | **Critical** |
| 4 | `/api/coach` bypasses rate limit, plan gating and quota | **Critical** |
| 5 | Missing NPS fabricated as `0` → false churn alert on every client | High |
| 6 | Missing health fabricated as `5` → every unscored client counted as "watch" | High |
| 7 | Burnout alert fires for every team member (`null < 55` is true) | High |
| 8 | `send-welcome-email` edge function is called but does not exist | High |
| 9 | Automated playbooks (Elite) have no automated template and no tables | High |
| 10 | `scalyo-api` (dedicated API) queries a table proven not to exist | High |
| 11 | `/api/health` returns `ok` without checking anything | High |
| 12 | Email quota and overage rate declared, never enforced | Medium |
| 13 | 18 of 22 plan feature flags are never read by any code path | Medium |
| 14 | AI quotas declared for 10 modules, enforced for 2 | Medium |
| 15 | `AUDIT_CONFIG` — a full audit spec with no implementation | Medium |
| 16 | OKR module (Elite) persists to `localStorage` only | Medium |
| 17 | Masterclass progress and Tools links are `localStorage` only | Medium |
| 18 | Entire Integrations surface is orphaned (4 components + 1 view) | Medium |
| 19 | Import wizard components (5) are orphaned | Medium |
| 20 | Rate limiting resets on every Worker cold start | Medium |
| 21 | `avgHealth` / `avgNps` return `0` for an empty portfolio | Low |
| 22 | `clearAllStores` wipes mostly obsolete `localStorage` keys | Low |
| 23 | `_future/*` — two complete rule engines nothing imports | Low |
| 24 | `RecursiveSubtask.vue` orphaned | Low |

---

## 1. Critical

### 1.1 GDPR erasure deletes the wrong tables

**File:** `functions/api/account/delete.js:36-49`

The endpoint is documented as *"Deletes ALL user data across all Supabase tables"*. It
iterates a hard-coded list of 20 table names. Cross-checking that list against the tables
the application actually writes:

**Nine names in the list are never used by the application** (and none is created by any
migration in this snapshot):

```
ai_usage · client_contacts · client_tasks · email_drafts · kpi_reports
kpi_entries · user_notifications · playbook_steps · roadmap_items · user_wellbeing
```

**Eighteen tables the application really writes are absent from the list:**

```
ai_conversations · alpha_feedback · chat_channels · chat_channel_members
client_metrics · copils · organizations · organization_members
oxygen_checkins · oxygen_daily · oxygen_recoveries · planning_events
projects · quotes · roadmaps · sent_emails · user_profiles · profiles*
```

\* `profiles` is deleted, but separately and by `id`, not in the loop.

The three Oxygen tables are the most serious omission: they hold the well-being data the
product treats as legally sensitive, and an erasure request leaves all of it in place.
`copils`, `quotes`, `client_metrics`, `planning_events` and the chat tables also survive.

**Why it looks like it works:** every `DELETE` against a non-existent table returns a
4xx that the loop records and ignores, and the endpoint still answers
`{ deleted: true, tables: 21 }`. The count is the number of *attempts*, not of successes.

**Fix:** derive the list from the schema, delete in FK-safe order, and fail loudly on any
non-2xx.

---

### 1.2 GDPR erasure reports success it never verified

**File:** `functions/api/account/delete.js:52-83`

```js
const r = await fetch(supabaseUrl + '/rest/v1/' + table + '?user_id=eq.' + uid, {
  method: 'DELETE', headers
})
results.push({ table, status: r.status })      // recorded, never checked
...
return Response.json({ deleted: true, tables: results.length, details: results })
```

`r.status` is stored but never tested. The profile deletion and the auth-user deletion are
wrapped in `try/catch` blocks that push `status: 200` **without inspecting the response at
all** — a 403 from the Admin API is recorded as a success.

`deleted: true` is therefore a constant. This is the exact failure mode the codebase's own
`D-14` doctrine forbids ("never a false success"), applied to the one operation where a
false success is a regulatory incident.

---

### 1.3 Hard-coded production database URL

**Files:** `functions/api/account/delete.js:9`, `functions/api/account/export.js:8`

```js
const supabaseUrl = env.SUPABASE_URL || 'https://hcqninmpmzpqjtedyjyj.supabase.co'
```

That literal is the **production** project ref. The repository documents this exact bug
class as fixed — `ENV-FALLBACK-PROD (Lot 6)` comments in `subscribe.js`,
`integrations/connect.js` and `integrations/callback.js` say *"no more hard-coded fallback
to the PRODUCTION database"*, and `_config/index.js` throws when `SUPABASE_URL` is absent.

**These two endpoints were missed.** They are also the two most destructive endpoints in
the codebase. A pre-prod or preview deployment missing `SUPABASE_URL` will authenticate
against production, resolve a production user id, and **delete that user's production
data** — while every other endpoint in the same deployment fails loudly.

Both files bypass `getConfig()` entirely and read `env` directly, which is how they
escaped the fix.

---

### 1.4 `/api/coach` bypasses every gate

**File:** `functions/api/coach.js`

`/api/ai` runs nine ordered steps: auth → rate limit → key check → validation → **plan
gating** → **quota** → module → provider → usage log.

`/api/coach` runs three: auth → key check → module handler.

No rate limit, no `isModuleAllowed`, no `checkQuota`, no `logUsage`. A Starter user — or
any authenticated user whose plan has expired — can call it without limit, and the calls
are never recorded, so `/api/usage` under-reports.

The front end does not call it (verified: no `api/coach` reference in `src/`), which is
why the drift went unnoticed. It remains a live, deployed, publicly routable endpoint.

**Fix:** delete it, or route it through `ai.js`'s pipeline.

---

## 2. High — fabricated data reaching decisions

### 2.1 A missing NPS becomes `0`, which triggers a churn alert

**Files:** `stores/clients.js:174,187` · `stores/notifications.js:160`

```js
// dbToClient
nps: r.nps || 0
```
```js
// alert rule
if (typeof client.nps === 'number' && client.nps < 20) → "NPS bas" alert
```

A client whose `nps` column is `NULL` is mapped to `0`. `0` **is** a number, so the
`typeof` guard passes, and `0 < 20` fires. **Every client that has never been surveyed
generates a permanent "low NPS — below the critical threshold" alert.**

The comment two lines above shows the author was aware of exactly this class of bug for
the *health* field ("Score alone… a manually entered status is not one") but the NPS
branch was not given the same treatment.

Knock-on effects: `avgNps` averages the fabricated zeros; `oxygenLoad`'s C4 component
counts `nps_drop` alerts, so a portfolio of unscored clients inflates the CSM's computed
workload; the AI context receives the same false alerts.

**Fix:** `nps: r.nps ?? null`, and guard the rule with `client.nps !== null`.

---

### 2.2 A missing health score becomes `5`, i.e. "watch"

**Files:** `stores/clients.js:174,187` · `lib/health.js`

```js
health: toHealthNumber(r.health) ?? 5
```

`toHealthNumber` is carefully written to return `null` for a missing value — and the
caller immediately replaces that `null` with `5`. Verified consequence:

```
client with NULL health → defaulted to 5 → healthStatus(5, null) === 'watch'
```

So an unscored account is silently classified **"watch"**, counted in `watchCount`,
coloured amber in the portfolio, included in `avgHealth`, and shown to the AI as a real
measurement. `5` is also written back to the database on the next save, so the fabricated
value becomes permanent.

The inline comment defends the `?? 5` on the grounds that `|| 5` mishandled a real `0` —
correct, but it fixes the falsy-zero bug while preserving the invention. `lib/health.js`
already handles `null` correctly everywhere downstream.

**Fix:** propagate `null`; the rendering layer already prints `—` for it.

---

### 2.3 The burnout alert fires for every team member

**Files:** `stores/notifications.js:191` · `stores/team.js:77`

```js
if (member.wellbeingScore < 55 || member.workload > 85) { … "Alerte burnout" … }
```

`team.members` sets `wellbeingScore: null, workload: null` by design — the `B-09` rule
records that no real source exists for either. In JavaScript:

```
null < 55  →  0 < 55  →  true
```

Verified in-repo. The alert therefore fires for **every member, always**, and renders
`bien-être null/100` in the body. The payload stores `wellbeing: null`, so even the record
of *why* it fired is empty.

The same file's `calcBurnoutRisk` in `team.js:52` does this correctly:

```js
if (typeof wl !== 'number' || typeof wb !== 'number') return null
```

The notification generator simply never received the same guard. This is the single
clearest violation of the codebase's own `R21` doctrine.

---

### 2.4 `send-welcome-email` does not exist

**File:** `stores/auth.js:257`

```js
fetch(SUPABASE_URL + '/functions/v1/send-welcome-email', { … }).catch(() => {})
```

No such Edge Function exists. The deployed set is `run-playbooks`, `scalyo-api`,
`scalyo-webhook`, `send-email`, `stripe-webhook`, `test-resend-key`, `track-open`.

The call is fire-and-forget with `.catch(() => {})`, so the 404 is swallowed in silence.
**No welcome email has ever been sent**, and nothing in the product reports that.

---

### 2.5 Automated playbooks: an Elite feature with no automation

**Files:** `stores/playbooks.js:21-95` · `supabase/functions/run-playbooks/index.ts`

`playbooksAutoIA` is an Elite differentiator in the plan config. In the code:

- All six templates are declared `auto: false`. There is not a single automated template.
- The `run-playbooks` Edge Function reads `playbook_rules` and `playbook_executions`.
  **Neither table is created by any migration in this snapshot**, and neither appears
  anywhere else in the codebase.
- Nothing invokes `run-playbooks` — no cron declaration, no front-end call, no other
  function.

The function would fail on its first query even if it were invoked. Playbooks in this
product are manual only; the automated tier is scaffolding.

---

### 2.6 The dedicated API queries a table that does not exist

**File:** `supabase/functions/scalyo-api/index.ts:80,86`

```ts
supabase.from('team_members').select('*')…
supabase.from('team_members').insert([…])…
```

`team_members` is **proven not to exist**: migration
`20260705230000_secrets_and_org_rls.sql:3` documents fixing a different bug caused by
exactly this — *"its non-owner branch referenced team_members, a non-existent table
(42P01)"*. The real table is `organization_members`.

The same function also reads `api_keys`, which no migration creates. So the "dedicated
API" (an Enterprise feature) cannot authenticate a request, and its team endpoints would
return 42P01 if it could. The front-end UI for managing those keys is orphaned (§4.1).

---

### 2.7 The health check checks nothing

**File:** `functions/api/health.js`

```js
export async function onRequestGet() {
  return Response.json({ status: 'ok', timestamp: new Date().toISOString() })
}
```

It returns `ok` unconditionally. It does not touch Supabase, Stripe, Resend or the AI
provider. A monitor pointed at this endpoint reports green while the database is
unreachable — which is the opposite of what a health endpoint is for.

---

## 3. Medium — declared but unenforced

### 3.1 Email quota and overage are decorative

**File:** `components/email-studio/emailTemplates.js:5-6`

```js
export const EMAIL_FREE_QUOTA = 3000
export const EMAIL_OVERAGE_RATE = 1.5 // €/1000 beyond the quota
```

**Neither constant is imported anywhere.** `/api/email` checks the plan module and sends.
There is no counter, no cap and no overage billing in the repository. Two exported numbers
describe a commercial policy that no code implements.

### 3.2 Eighteen of twenty-two feature flags are never read

**File:** `config/plans.config.js` (and its back-end copy)

Only four keys are ever consulted: `advancedDashboardKpis` (3 views), `aiEmailStudio`
(1 view), `unlimitedViewers` (`canAddViewer`, `getAvailableRolesForInvite`). The other
eighteen — including `ssoSaml`, `dedicatedApi`, `prioritySupport`, `complianceAudit`,
`tailoredOnboarding`, `manualPlaybooks`, `okrTracker`, `productRoadmap`, `csvImport`,
`healthChat`, `smartMatrix`, `wellbeing` — are declared per plan and read by nothing.

Gating that *is* real happens through `PLANS[plan].modules`, a separate mechanism. The
`features` map is a specification document living in a config file.

### 3.3 AI quotas: 10 declared, 2 enforced

**Files:** `functions/api/_config/plans.js:7-12` · `_services/quota.service.js:6`

`QUOTAS` declares per-plan limits for ten modules. `QUOTA_MODULES = ['coach', 'nova']`,
and both `checkQuota` and `logUsage` return early for anything else. The eight other
numbers are never compared to anything and generate no `ai_usage` rows.

`/api/usage` then reports `used: 0` for those eight modules regardless of real traffic —
a metered-looking dashboard over unmetered usage.

### 3.4 `AUDIT_CONFIG` has no implementation

**File:** `config/plans.config.js:20`

```js
export const AUDIT_CONFIG = { enabled: true, visibleToAllMembers: true,
  retentionDays: null, trackedEntities: [11 entities], trackedActions: [6 actions] }
```

`enabled: true` is a claim. Grepping the entire repository for `AUDIT_CONFIG`,
`audit_log`, `auditLog` or `trackedActions` returns **only this declaration**. No audit
table, no write path, no viewer. `complianceAudit` is sold on the Enterprise plan.

### 3.5 OKR — an Elite module stored in the browser

**File:** `views/OkrView.vue:117-121`

```js
const okrs = ref(loadData('scalyo_okrs', []))
watch(okrs, val => saveData('scalyo_okrs', val), { deep: true })
```

`localStorage` only. No table, no store, no RLS, no `supabase` import in the file. OKRs are
therefore per-browser: invisible to colleagues, lost on cache clear, absent from the GDPR
export, and **wiped by `logout()`** — `clearAllStores` removes `scalyo_okrs` (§5.2).

`okr` is gated as an Elite module and `okrs` has a full read/write permission matrix in
every role definition, implying shared team data. It is not shared.

### 3.6 Masterclass progress and Tools links are browser-local

**Files:** `views/resources/MasterclassView.vue:261,376,380` ·
`views/resources/ToolsView.vue:64,70,76`

`scalyo_mc_progress`, `scalyo_mc_notes`, `scalyo_my_links` — all `localStorage`. Course
completion and personal exercise notes do not survive a device change and are absent from
the data export. The five Resources views contain **zero** `supabase` references; the
content itself is a 764-line hard-coded array in `stores/resources.js` (acceptable — it is
static editorial content — but nothing there is user data that persists).

### 3.7 Rate limiting is best-effort only

**File:** `_services/rate-limit.service.js:4`

```js
// In-memory store — resets when Worker cold-starts (acceptable for rate limiting)
const store = new Map()
```

The comment is honest, but the consequence is worth stating: Cloudflare runs many isolates
concurrently and recycles them aggressively, so the effective limit is *10 requests per
minute per isolate*, not per user. It is a courtesy throttle presented as a limit.

---

## 4. Medium — orphaned surfaces

Ten Vue files are referenced by nothing outside themselves (verified by cross-referencing
every identifier against the whole `src/` corpus).

### 4.1 The Integrations surface (4 files)

```
views/IntegrationsView.vue
components/integrations/IntegApiTab.vue
components/integrations/IntegCreateKeyModal.vue
components/integrations/IntegWebhookTab.vue
```

`IntegrationsView` is not imported by the router — `/app/integrations` redirects to the
dashboard — and it does not import the three `Integ*` components either. They form a
complete API-key and webhook management UI, rendering key prefixes, scopes, "never used"
badges and `curl` examples, connected to nothing. The `api_keys` table they describe does
not exist (§2.6).

This is documented as deliberately dormant ("code kept dormant"), which is fair — but the
three child components are orphaned even *within* the dormant feature.

### 4.2 The import wizard (5 files)

```
components/import/ImportDropZone.vue      ImportMappingPanel.vue
ImportModulePicker.vue                    ImportPreview.vue    ImportSuccess.vue
```

A complete multi-step import wizard (drop zone → module picker → column mapping →
preview → success). The live import path is the single-file `StandardImport.vue`. These
five are the superseded AI-import flow, left in the tree after the route was retired.

### 4.3 `components/RecursiveSubtask.vue`

A recursive subtask renderer imported by nothing.

---

## 5. Low

### 5.1 Empty-portfolio averages return `0`

**File:** `stores/clients.js:89-96`

```js
const avgHealth = computed(() => { if (!clientsOnly.value.length) return 0; … })
const avgNps    = computed(() => { if (!clientsOnly.value.length) return 0; … })
```

An empty portfolio has *no* average, and `R21` says that should be `null` rendering as
`—`. Returning `0` renders "0/10" — the worst possible health — for an account that simply
has no clients yet. Every sibling computed in the same file (`csmLoadStats`,
`renewalsNext30`) correctly returns `null`.

### 5.2 `clearAllStores` wipes mostly obsolete keys

**File:** `stores/auth.js:91-94`

Eleven `localStorage` keys are removed on login and logout. Nine of them
(`scalyo_clients`, `scalyo_tasks`, `scalyo_team`, `scalyo_projects`, `scalyo_kpis`,
`scalyo_playbooks`, `scalyo_snapshots`, `scalyo_roadmap`, `scalyo_quotes`) are leftovers
from before those modules moved to the database — nothing writes them any more.

Two are live and this is where it matters: `scalyo_okrs` (§3.5) and
`scalyo_dashboard_kpis`. **Logging out silently destroys the user's OKRs**, because the
cleanup routine treats a still-live storage key as legacy debris.

### 5.3 `_future/` — two complete engines nothing imports

```
_future/proactive-agent.config.js      (declarative alert rule engine)
_future/autonomous-actions.config.js   (declarative action executor)
```

Both are fully written, self-documented as "NOT wired into the app", and imported by
nothing. `proactive-agent.config.js:125` queries `team_members` — the non-existent table
from §2.6 — so it would fail if it were wired.

Being explicitly labelled makes these acceptable; they are listed for inventory only.

---

## 6. Not findings (checked and cleared)

- **`components/landing/LandingMockup*.vue`** — hard-coded ARR, health scores and chat
  transcripts. These are marketing mockups on the public landing page, prefixed `mock-*`,
  reading only i18n strings. Correct use of fake data.
- **`stores/resources.js`** — 764 lines of hard-coded structure. This is static editorial
  content keyed to i18n, not user data. Correct.
- **`Math.random()`** in `ScalyoLogo.vue` (SVG gradient id) and in the two `uid()` helpers
  — id generation, not data. `skyBubble.js` explicitly forbids it for determinism and
  uses a seeded PRNG instead. Correct.
- **`setTimeout` calls** — audited all 21. Every one is a UI affordance (flash a ✓, hide
  controls, debounce a close) or a documented timeout guard. **None simulates work.**
- **`stores/wellbeing.js`** — the dead half of the module was properly removed and its
  invented defaults (`mood 'normal'`, `score 70`, `load 70`) deleted rather than kept.
  This is the model fix for §2.1–2.3.
- **Edge Functions `send-email`, `track-open`, `test-resend-key`, `scalyo-webhook`** —
  unreferenced from the app, but they are webhook/pixel targets invoked by external
  systems or by each other (`send-email` embeds the `track-open` pixel). Not orphans.

---

## 7. Recommended order of work

1. **§1.3** — remove the two production URL fallbacks. One-line change, worst blast radius.
2. **§1.1 + §1.2** — rewrite `account/delete.js`: correct table list, FK order, real status
   checks, and a truthful response. Regulatory exposure.
3. **§1.4** — delete `/api/coach` or route it through the `ai.js` pipeline.
4. **§2.1 + §2.2 + §2.3** — stop fabricating `nps: 0`, `health: 5`, and guard the burnout
   rule. These three are one afternoon and they remove every false alert in the product.
5. **§5.2** — remove `scalyo_okrs` from `clearAllStores` before anyone loses data, then
   move OKRs to the database (§3.5).
6. **§2.4** — either ship `send-welcome-email` or delete the call.
7. Decide, product-side, what §3.1–3.4 and §2.5–2.6 should become: implemented, or removed
   from the plan configuration so the code stops advertising them.

---

## Appendix — how the audit was run

- Marker sweep: `TODO|FIXME|XXX|HACK|mock|fake|dummy|stub|hardcod|for now|simulate|not implemented`.
- `Math.random` and `setTimeout(_, ≥100ms)` sweeps, each hit classified manually.
- Orphan detection: every `.vue` basename counted across the whole `src/` corpus, excluding
  its own file.
- Table reality check: every `.from('…')` in `src/`, every table in the Edge Functions and
  in `account/delete.js`, cross-referenced against `CREATE TABLE` and every policy target
  in `supabase/migrations/` and `app-v2/frontend/supabase/migrations/`.
- Endpoint reality check: every `/api/*` literal in `src/` against the route files on disk;
  every Edge Function name against its callers.
- Constant reality check: every exported constant in `config/` and `plans.config.js`
  grepped for importers.
- Coercion checks (`null < 55`, `0 < 20`, `healthStatus(5, null)`) executed in `node` rather
  than reasoned about.

Nothing in this report is inferred from comments or documentation; each finding names the
file and line that produces the behaviour.
