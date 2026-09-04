# Front end

Root: `app-v2/frontend/`. Vue 3 with `<script setup>`, Pinia stores, vue-router,
vue-i18n, built by Vite 8. The `@` alias points at `src/`.

## Bootstrap

`src/main.js` applies the persisted theme (`localStorage.scalyo_theme`) **before**
mounting — otherwise `data-theme` was only set by the Settings screen and dark mode
dropped on every reload. `'auto'` or an absent value sets no attribute and lets
`prefers-color-scheme` decide.

`src/lib/supabase.js` creates the Supabase client. Two hard-won constraints live there:

- Every env value is `.trim()`-ed. A trailing newline in a build secret used to travel
  into the bundle and produce `apikey+%0A` in the Realtime WSS query string — a silent
  `close 1006` while REST and auth stayed fine (browsers normalize HTTP headers).
- **No `lock` option, ever.** The lockless default of `auth-js >= 2.10x` is the supported
  path. Any non-null lock — even a no-op — re-enables the legacy
  `_acquireLock`/`pendingInLock` queue, which deadlocks when an `onAuthStateChange`
  callback makes a Supabase call during `TOKEN_REFRESHED`. That was the G9-13 freeze:
  per-tab, total, only recoverable by reload.

The corollary is a rule respected across the app: **`onAuthStateChange` callbacks are
synchronous**. `fetchProfile` is deferred out of the notification cycle with
`setTimeout(0)`, fire-and-forget.

## Routing

`src/router/index.js`. Public routes (`/`, `/en`, `/ko`, `/login`, `/register`, `/blog`,
`/cgu`, `/privacy`, `/dpa`, `/support`, `/join`, `/reset-password*`) sit next to the
authenticated shell at `/app`, which renders `layouts/AppLayout.vue`.

### Guard order (`beforeEach`)

1. Initialize auth if a `sb-*` token exists in `localStorage`; otherwise send
   `requiresAuth` routes straight to `login`.
2. `requiresAuth` + unauthenticated → `login`.
3. `meta.guest` + authenticated → `paywall` if payment is needed, else `dashboard`.
4. Profile loaded but onboarding incomplete → `onboarding` (and the inverse guard: a
   completed onboarding can never re-enter it).
5. `meta.requiredModule` not in the plan → `paywall?reason=upgrade&module=…`.
6. Trial expired → `paywall`.

`/join` deliberately carries **neither** `meta.guest` nor `requiresAuth`: an already
logged-in user must be able to reach the acceptance screen (the guard used to bounce
them to the dashboard and lose the URL token), and an invitee without an account must be
able to reach it too.

### Titles and meta (`afterEach`)

On the three landing URLs, title/description come from `src/i18n/landing.js` — the same
source as the static `<head>` produced at build time. Everywhere else the title is
resolved through `i18n.global.t` from a `TITLE_KEYS` map (`rt_*` keys × 3 languages), and
`<html lang>` follows the application locale.

`NotFound` sets `robots: noindex, follow`. This is deliberate: the Cloudflare Pages SPA
fallback answers 200 with the landing HTML for any unknown URL, so Search Console had
discovered phantom URLs. Serving a real 404 would mean rewriting production routing; the
`noindex` is enough because Googlebot executes the JS.

## State (Pinia)

| Store | Responsibility |
|---|---|
| `auth` | Session, profile, organization, plan, trial/beta access, invitation replay |
| `profile` | Extended user profile (role, seniority, sector) |
| `app` | Global UI state |
| `clients` | Client portfolio, health aggregates, auto KPIs, paginated loading |
| `clientMetrics` | Monthly manual KPI measurements per client |
| `clientNotes` | Free-form timestamped notes on a client (org-wide) |
| `clientModal` | Which client record pop-up is open |
| `createPrefill` | One-shot "create X for this client" intent relay between modules |
| `tasks` | Tasks, projects, completion/velocity statistics |
| `playbooks` | Retention playbooks; activation materializes real dated tasks |
| `kpis` | COPIL decks: blocks, sequenced write queue, image upload |
| `snapshots` | Daily KPI snapshots used for variation badges |
| `quotes` | Quotes (database-backed, org-wide), signed revenue and pipeline |
| `countryLaws` | Per-country billing rules (tax rate, currency) |
| `roadmap` | Roadmaps and milestones |
| `emailStudio` | Templates, sending, Resend org status |
| `integrations` | Third-party integrations (module currently hidden) |
| `chat` | Channels, DMs, realtime + polling fallback, unread badges |
| `notifications` | Generated alerts, locale-agnostic payloads |
| `team` | Members, seats, per-CSM statistics |
| `oxygen*` | The Oxygen loop — see [MODULES.md](MODULES.md) |
| `wellbeing` | Nova panel only (the check-in half died in Oxygen Lot 3a) |
| `aiHistory` | Persisted AI conversations |
| `resources` | Resource library structure (all text lives in `*-content.js`) |

### Store conventions

- **`withWrite`** (`src/lib/supabaseWrite.js`) wraps every mutation: it adds a timeout,
  toasts on failure, and returns `{ success }` / `{ error }`. A `✓` on screen is only
  allowed after an OK response.
- **Optimistic writes are reverted** when the write fails, for structural gestures
  (add / delete / reorder). Field *edits* are not reverted — the user's typing stays on
  screen and `withWrite` has already toasted.
- **No `t()` inside a store.** Stores return i18n keys and params; views render them.
  This keeps notification text, playbook step titles and recommendations locale-agnostic.
- **`fetchAllRows`** (`src/lib/fetchAllRows.js`) is mandatory for "whole dataset" reads.
  PostgREST caps every response at 1000 rows *without an error*; the helper pages with
  `.range()`, requires a stable sort (a batch insert shares one `created_at`, so a
  secondary sort on `id` is required), and reports `truncated` + the exact total rather
  than silently cutting.

## i18n

`src/i18n/index.js` composes three locales from six files: `fr.js` + `fr-content.js`,
and the `en` / `ko` equivalents. Locale is persisted in `localStorage.scalyo_locale`,
fallback `fr`.

- `landing.js` is separate: it is the single source for the marketing pages *and* for
  the static `<head>` generated at build time. Its Korean labels are indexed under the
  key `kr`, while the URL and the `hreflang` use ISO 639-1 `ko`.
- `legal.js` and `dpa.js` carry the legal surfaces.
- `scripts/check-i18n.mjs` compares the FR / EN / KO key sets. It currently reports a
  small pre-existing gap (`wb_fri`, three `chat_ch_*` keys).

Outside a component, i18n is reached through `i18n.global` — never `useI18n()`.

## Formatting — one source each

| Concern | Module | Rule |
|---|---|---|
| Money | `lib/formatters.fmtCurrency` | Currency is a property of the **account** (`user_profiles.currency`, default EUR), never of the display language. Chosen in **Settings → Preferences**; the list of offered codes is `config/currencies.js` (`SUPPORTED_CURRENCIES`), written by `stores/profile.setCurrency`. Only separators and symbol position follow the locale. Zero conversion — the symbol changes, the stored amounts do not. A quote is the exception: it follows its own billing country. |
| Health score | `lib/health` + `formatters.fmtHealth` | The score is **/10 everywhere**. Thresholds ≤ 3 critical, ≤ 6 watch, > 6 healthy. The entered status can only *worsen* the derived one ("worst of the two wins"). No local threshold, no ×10, no raw `client.status` for a colour. |
| Dates | `lib/formatters.fmtDate` / `fmtTime` | Application locale, device time zone. |
| KPI values | `lib/formatters.fmtKpiValue` | Shared by dashboard tiles, the client record and the COPIL wizard. |
| KPI unit suffix | `lib/formatters.kpiUnit` | The unit printed next to a `KPI_CATALOG` entry (`config/kpis.js`). A `format: 'currency'` KPI carries `unit: null` and takes the **account** symbol; every other KPI keeps the catalog unit (`%`, `h`). Never read `kpi.unit` directly. |
| KPI label | `t(kpi.label)` | The catalog stores an i18n **key** (`kpi_library_<id>`, `kpi_library_category_<id>`), never a translated string. No component re-implements a locale ladder. Structural fields are spelled out: `category`, `aggregation`, `source`, `format` — no abbreviations. |
| Calendar day key | `lib/formatters.localDateKey` | **Local** `YYYY-MM-DD`, never `toISOString().slice(0,10)` (that yields the UTC day: D-1 between 00:00 and 02:00 Paris). |

`Intl` formatters are cached per locale + options: building one costs ~0.1 ms and they
are called per list row (1,097 clients measured on pre-prod).

## Dates and time zones

Two kinds of value are strictly separated:

- A **calendar date** (`clients.renewal_date`, `tasks.start_date/end_date`, `copils.date`)
  is compared and keyed in local time and never converted.
- An **instant** (`planning_events`) is stored as a UTC ISO string. A `datetime-local`
  input string is *local* time, so it is converted on write; a date-only string (all-day)
  is never converted; `null` is returned for an invalid string so nothing is written.

Getting this wrong shifted the whole Gantt by one column and pointed "Today" at the
wrong day. The rules are spelled out at the top of `views/tasks/PlanningView.vue`.

## Components

- `components/base/` — BaseButton / BaseCard / BaseInput / BaseBadge / toasts.
- `ConfirmDialog.vue` — **the only confirmation mechanism**. Native `confirm()` is
  forbidden: it also blocks automated evidence capture. Focus starts on *Cancel*, so
  pressing Enter by reflex never runs a destructive action.
- `ErrorBoundary.vue` — wraps the COPIL builder blocks so one malformed block cannot
  take the whole builder down.
- `clients/ClientModal.vue` — the client record is a draggable modal pop-up openable
  from anywhere, mounted once in `AppLayout`.
- `landing/*`, `oxygen/*`, `kpis/*`, `playbooks/*`, `email-studio/*`, `chat/*`,
  `import/*`, `manager/*`, `portfolio/*`, `quotes/*`, `roadmap/*`, `satisfaction/*`,
  `settings/*` — one folder per product surface.

`AppLayout` deliberately renders route changes **synchronously**: a `<transition fade
out-in>` held the screen swap hostage to a 3-phase animation-frame fade, and a hidden tab
or a busy thread left the *previous* screen displayed (12 s observed).

## Styling

`src/assets/main.css` defines the design tokens ("night on a light background": violet
`#8B5CF6`, ink `#17112B`, soft violet shadows, a 4-colour signature gradient) plus the
light/dark theme variables. Per-surface stylesheets live next to it
(`portfolio.css`, `oxygen.css`, `satisfaction.css`, …).

Two notable rules:

- The landing page is a permanently light marketing surface, so the dark-theme global
  heading rules exclude it with `:not(:where(.landing *))` — a zero-specificity guard.
- Long lists use `content-visibility: auto` with `contain-intrinsic-size` for browser
  virtualization: zero dependency, native scrolling, off-screen rows are neither laid out
  nor painted.

The Oxygen surfaces use a deliberately calm palette with **zero red**; the only exception
is the emergency block, whose red is a safety signal.
