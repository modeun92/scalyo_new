# Product modules

Every module below maps to a folder in `src/views/` plus its stores and components. The
sidebar (`src/layouts/AppLayout.vue`) groups them into Performance, Projects, Team and
Tools sections; an item whose module is outside the current plan is greyed out with a
padlock and routes to the upgrade paywall.

## Portfolio and client record

**Views** `PortfolioView`, `ClientDetailView` · **Components** `portfolio/*`,
`clients/ClientModal.vue` · **Stores** `clients`, `clientNotes`, `clientMetrics`,
`clientModal`, `createPrefill`

The portfolio is the centre of the product: accounts with ARR, health score, lifecycle
(prospect / client), renewal date, contacts and an assigned CSM.

- The **client record is a modal pop-up**, mounted once in `AppLayout` and openable from
  anywhere (dashboard, portfolio, manager). It is draggable by its title bar.
  `/app/clients/:id` is a deep link that opens the pop-up over the portfolio, so a URL
  stays shareable in a meeting or in Slack.
- The record holds everything in one place: editable fields, monthly KPI entry, free-form
  notes (call / email / meeting / note), quick creation of a linked COPIL or task, and a
  derived timeline (tasks, planning, playbooks, copils, quotes, alerts).
- **Create & log**: "Quote", "Event" and "Playbook" record the client in the
  `createPrefill` store, navigate to the target module, which consumes the intent **once**
  on mount and opens its form with the client pre-selected. The created object carries
  `client_id`, so it comes back into this history.
- **CSV import** (`components/import/*`) resolves a CSM name to `csm_id` with an exact,
  case- and whitespace-insensitive match; homonyms are never resolved at random and an
  unknown name imports the row **unassigned** with a visible report.
- Import number parsing is strict on purpose. `Number('124 500,00')` is `NaN`, and the
  old code silently fell back to `0` — an ARR of €124,500 was imported as 0 and
  propagated into the portfolio ARR, the KPIs and the health score. Now the value is
  normalized (currency symbols, every kind of space, Swiss apostrophes, French decimal
  commas) and, if it stays unintelligible, it is **not imported and is reported**.

## Dashboard, Satisfaction and Manager

**Views** `DashboardView`, `SatisfactionView`, `ManagerView`, `WorkloadView`

- The dashboard mixes **auto** KPIs derived from real data (ARR, MRR, revenue, pipeline,
  win rate, new clients, renewals at 30 days, CSM load) with **manual** KPIs aggregated
  from the monthly measurements entered on client records. There is no overlap: the
  catalog marks each KPI `auto` or `manual`.
- Every counter uses the same base: `clientsOnly` — prospects are excluded, because a
  prospect has no measured health. Getting this wrong once made a donut divide 352
  segments by a total of 353.
- Satisfaction shows the health distribution, the average out of 10 and the declining
  accounts. Manager shows per-CSM statistics; the "managed ARR" is derived from the
  clients store by `csm_id`.
- **No invented metric.** When there is no real source, the value is `null` and the UI
  renders `—`. This applies to team well-being (confidential), workload (not measured)
  and any unassigned CSM.

## Smart Matrix (tasks)

**Views** `views/tasks/{Stats,Planning,Projects,Kanban,Priorities,Team,Settings}View.vue`
· **Store** `tasks` · **AI module** `matrix`

An Eisenhower-style task system: statistics, a calendar and Gantt planning view,
projects, a Kanban, a priority matrix, a team view and settings.

- **Statistics are honest**: below 3 completed tasks there is no basis for prediction, so
  velocity, remaining weeks and the end date return `null` and the view shows a "not
  enough data" state. The real components (completion, delays, blockers) are still shown.
- **Planning** distinguishes an *instant* from a *calendar date* (see
  [FRONTEND.md](FRONTEND.md)); a recurring event materializes its occurrences (daily 60 d,
  weekly 26 wk, monthly 12 mo) linked by a `series_id`, and deleting offers "this
  occurrence" or "the whole series".
- **Gantt** draws real `start → end` bars clipped to the visible window, renders tasks
  without a project in an "unclassified" group, and counts unplaceable tasks in a banner
  rather than hiding them.
- Partial task updates are **partial-safe**: a field absent from the input is not sent.
  The old code sent empty defaults for title/description/status/priority/assignee/tags/
  subtasks on every write, which corrupted rows on every Kanban drag.

## COPIL / KPIs — steering-committee decks

**Views** `KpisView`, `views/kpis/{KpisBuilder,KpisPreview,KpisPresent}.vue` ·
**Components** `kpis/SlideBlock.vue`, `kpis/MetricWizard.vue` · **Store** `kpis` ·
**Utils** `copilFormat.js`, `pptxExport.js`, `smartVisual.js` · **AI module** `copil`

A deck builder for client steering committees, with a presentation mode and a native
PowerPoint export.

- The **deck language** (`copils.lang`, chosen on the cover) is distinct from the
  interface language: a French-speaking CSM can prepare a Korean COPIL. It drives number
  separators, quotation marks, the PowerPoint font (Malgun Gothic for Korean) and the
  `lang` attribute of the runs. `copilFormat.js` is the single source of that rendering.
- A brand-new chart carries **no figures**. Labels are localized examples; values are
  empty. A COPIL never presents a value nobody entered, and a chart with no value is
  neither presented nor exported.
- **Write queue.** The builder writes on every keystroke, so a per-COPIL queue keeps one
  write in flight at a time and coalesces the pending payloads. Without it, concurrent
  PATCHes arrived out of order and the last response to *arrive* won — a truncated title
  landing in the database under a "✓ Saved". A failure is retried once, then abandoned:
  the toast has fired, the input is still on screen, the next keystroke resends
  everything. Leaving the page flushes the queue.
- **Malformed blocks never crash the render.** At load time each block's `data` is rebuilt
  key by key from `BLOCK_DEFAULTS[type]`; an unknown type yields empty data and a neutral
  render. Nothing is written back — the sane version is only persisted on the next user
  save.
- **Images** are uploaded to the private `copil-media` bucket; the block stores the path
  and a 1-hour signed URL is resolved at read time. The PPTX export embeds them as base64;
  an unrecoverable image yields an empty frame plus its caption and a "partial export"
  toast — never a crash.
- The **metric wizard** can pre-fill a block from a client's real monthly measurements
  (last 12 months); ≥ 2 points forces a line chart, 1 point a KPI card.

## Playbooks

**View** `PlaybooksView` · **Components** `playbooks/*` · **Store** `playbooks` ·
**AI module** `playbook` · **Edge function** `run-playbooks`

Retention playbooks whose steps are concrete actions with an embedded timing and an exit
criterion.

On activation each step becomes a **real dated task linked to the client** (`due` =
activation + `day`), visible in the Kanban, the planning and the priority matrix — where
the work actually happens. The step's guide (Goal / Method / Pitfall / Exit) goes into the
task description. Tasks are created first; if the playbook insert then fails, they are
rolled back, so there are no silent orphans. Checking a step syncs the linked task
(playbook → task only, deliberately, for v1). Abandoning a plan removes its *undone*
tasks and keeps the done ones as real history.

## Oxygen — the CSM well-being loop

**View** `OxygenView` · **Components** `oxygen/{OxygenPulse,OxygenCheckinForm,OxygenClosing,OxygenSky,OxygenTeamPanel}.vue`,
`oxygen/skyBubble.js` · **Stores** `oxygenCheckins`, `oxygenDaily`, `oxygenLoad`,
`oxygenEngine`, `oxygenPrefs`, `oxygenRecoveries`, `oxygenTeam`

A private daily loop: a 10-second check-in, an objective workload score, an end-of-day
"Closing", and a monthly generative constellation.

**Formulas** (frozen, `oxygenEngine.js`):

```
daily_feeling = average(energy, mood, 6 − felt_load)                → 1..5
index         = 0.6 × (feeling × 20) + 0.4 × (100 − load_score)     → 1 decimal
no check-in for the day → index = null, NEVER invented
```

The **objective load** is a pure read of the existing stores — no query of its own:
critical accounts × 20 (cap 40), renewals within 30 d × 10 (cap 30), overdue tasks × 5
(cap 15), churn/NPS alerts within 7 d × 5 (cap 10), active playbooks × 2.5 (cap 5).

**The Closing** is a full-screen overlay without a route — a state, not a page, so it
leaves nothing in the navigation history. It is escapable at any moment (Esc, ✕, "skip"),
and an escaped Closing **writes nothing** and does not consume the day. Four steps: real
progress → one word → 90 s of cyclic-sighing breathing → "tomorrow is ready". A single
write happens at the very end. Toasts are queued (a local do-not-disturb) for the
duration and replayed afterwards — never lost. `prefers-reduced-motion` falls back to a
static bubble.

**The Sky** draws one bubble per closed day of the calendar month. Each bubble is
deterministic: `seed = user_id:date` through `mulberry32`, so the same input always
produces the same bubble. Its inputs are all *persisted* values — hue from the check-in
energy, depth from the day's load, texture from the Closing's progress count. `Math.random`
would break determinism and is forbidden. A day without a Closing (missed or off) is the
same neutral space: the Sky does not judge. Titles carry only a localized date, so no raw
data is readable in the SVG.

**Streak** counts *worked days* only, with forgiveness: one missed day per rolling 7 days
does not break it; a second one does. Days off are user-configurable (default Sat + Sun)
through a single predicate shared by the streak and the divergence indicator.

**Team loop** (`OxygenTeamPanel`, Manager tab, growth+). Anti-compulsion by design: three
team averages plus a trend, never a ranking, never anything individual, never time-spent.
It goes exclusively through `oxygen_team_aggregate`, which is owner-only, has a literal
`n ≥ 5` threshold, and is fail-closed behind an organization flag that can only be turned
on by SQL after a legal review. The privacy contract is displayed on screen, not hidden in
a footnote.

## Coach, Nova and the AI assistant

**Views** `CoachView` · **Components** `ai/AiAssistant.vue`, `ai/AiInsightPanel.vue`,
`wellbeing/WbNovaChat.vue` · **Composable** `useAI`

Ten AI modules share one endpoint. `coach` is the Customer Success assistant, `nova` the
well-being assistant, and the rest are contextual helpers per screen (dashboard, copil,
matrix, playbook, email, notif, import). Nova refuses business questions and redirects to
Coach; it states that it is not a doctor or a therapist.

Answers are rendered through `utils/sanitize.js`: a dependency-free line-by-line markdown
renderer (headings, separators, lists, bold, inline code) followed by DOMPurify.

## Email Studio

**View** `EmailStudioView` · **Components** `email-studio/*` · **Store** `emailStudio`

Twelve default templates plus custom ones, a preview, a send modal and a history. Sending
uses the **organization's** Resend key, which is stored encrypted server-side and never
returned to the client. Status is read through an RPC so a member sees the org's real
status even though the server refuses them the configuration itself.

Template bodies are HTML, so converting them to text is structural (block tags become line
breaks) — a naive tag strip used to glue everything into one block.

## Quotes

**View** `QuotesView` · **Components** `quotes/*` · **Stores** `quotes`, `countryLaws`

Quotes live in the database and are shared across CSMs (they used to live in
`localStorage`, invisible to colleagues; the store imports the inherited local quotes
once). A quote follows the currency and tax rate of **its own** billing country, not of
the country selected today. Signed revenue per client is derived from won quotes — never
stored, so it self-corrects when a status changes.

The PDF export prints amounts with the **ISO code** rather than the symbol: jsPDF's
Helvetica renders neither ₩ nor `Intl`'s narrow/non-breaking spaces.

## Chat

**View** `ChatView` · **Components** `chat/*` · **Store** `chat`

Org channels and 1-to-1 DMs, over Supabase Realtime.

- One implementation, two surfaces: the floating panel and the `/app/chat` page render the
  same components.
- Realtime lives at the **layout** level, so the unread badge keeps working when the panel
  is closed; it is only destroyed on logout or when leaving `/app`.
- A **polling fallback** activates only when realtime is unavailable *and* the chat
  surface is visible. It is incremental (messages newer than the channel's last known
  one), so the response is empty ~99 % of the time, with a 6→30 s backoff on an inactive
  channel, and it switches itself off when realtime returns.
- An anti-storm guard stops residual `CLOSED` events — including the one caused by the
  app's own `unsubscribe` — from re-triggering reconnection logs.

## OKR and Roadmap

**Views** `OkrView`, `RoadmapView` · **Components** `roadmap/*` · **Store** `roadmap`

Elite-plan modules. OKR periods are dynamic (current year, defaulting to the *current*
quarter — the old list was hard-coded and wrong from Q3 on). Roadmap milestone keys
self-heal on the next save for decks persisted under older key names.

## Notifications

**Store** `notifications` · **Renderer** `lib/notifText.js`

Alerts are generated from real data: churn risk (a Critical score on the /10 scale),
NPS drop, renewals within 30 days, overdue tasks. Prospects **never** trigger a client
alert — churn and renewal make no sense before signing.

Rows store `type` + `payload` (a snapshot of the values at alert time); the title and body
are rendered in the **reader's** locale on the front end, so a Korean tester no longer
receives French notifications.

Generation is **fail-closed**: if the dedup read fails or is truncated, nothing is
generated. The old code, on a silent error, started from an empty existing set and
duplicated en masse.

## Resources

**Views** `views/resources/{Library,Masterclass,Guides,Tools,WellbeingResources}View.vue`
· **Store** `resources`

A Growth-plan content library. The store carries structure only — every human-readable
string lives in the `*-content.js` i18n files under `res_*` / `mc_*` keys.

## Hidden modules

- **Integrations** — beta, route redirects to the dashboard, code kept dormant.
- **AI import** — replaced by the standard import inside each module.
- `_future/proactive-agent.config.js` and `_future/autonomous-actions.config.js` are
  designed but deliberately unwired.
