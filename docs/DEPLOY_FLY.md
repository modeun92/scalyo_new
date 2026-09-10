# Deploying Scalyo on Fly.io — migration plan

> **Status: proposal. Nothing in this document is implemented.**
> The live deployment is still Cloudflare Pages + Pages Functions, as described in
> [ARCHITECTURE.md](ARCHITECTURE.md) and [DEVELOPMENT.md](DEVELOPMENT.md). This file is the
> plan for moving to Fly.io with GitHub Actions, the inventory of what actually breaks, and
> the runbook for the cutover. Read it end to end before writing the first line — §1 is a
> **legal** gate with a 30-day clock on it, and it is not optional.

---

## 0. Executive summary

| | |
|---|---|
| **Feasible?** | Yes. The back end is already Web-standard `Request`/`Response`; only four Cloudflare-specific surfaces are used. |
| **Hard blocker** | The DPA promises customers **30 days' notice** before a sub-processor change. Cloudflare is a named sub-processor in FR/EN/KO. The notice must go out before the cutover, not after. |
| **Biggest engineering task** | A ~200-line Node adapter that re-implements Cloudflare's file-based routing for `functions/api/**`. The 28 endpoint files themselves need **zero** changes. |
| **Biggest regression risk** | Loss of the global edge CDN for the static site. Mitigated by keeping Cloudflare in front of Fly as a pure proxy (Option A below). |
| **Cost** | Cloudflare Pages is free at this scale. Fly is roughly **$10–20/month** for two always-on `shared-cpu-1x` 512 MB apps (prod + pre-prod). |
| **Realistic duration** | ~4–6 working days of engineering, plus the 30-day legal notice running in parallel. |

---

## 1. Blocker before any code: the sub-processor notice

This is not a formality and it gates the cutover date.

`src/i18n/dpa.js` names the sub-processors in all three languages:

```
dpa_s7_sub2: 'Cloudflare Inc. — CDN, frontend and serverless backend (EU network) — Transit data'
dpa_s7_footer: 'Scalyo will notify the Customer of any sub-processor change with 30 days' notice.'
dpa_s8_body:  'US transfers (Cloudflare, Stripe) are governed by the EU-US Data Privacy Framework and SCCs.'
```

`src/i18n/legal.js` repeats it in the legal notice and the privacy policy, again × 3 locales.

**Therefore:**

1. **Send the 30-day notice to every customer** before the cutover. Start this clock on day 1 — it is the long pole, and everything below can be built while it runs.
2. Check that **Fly.io Inc.** (a US company) has an SCC-backed DPA you can sign, and whether it is EU-US Data Privacy Framework certified. Record the answer; `dpa_s8_body` has to be accurate.
3. Update `dpa.js` (`dpa_s7_sub2`, `dpa_s8_body`) and `legal.js` in **FR, EN and KO**, and regenerate the DPA PDF if one is served.
4. Update [BUSINESS.md](BUSINESS.md) — the CLAUDE.md maintenance rule requires it for any change to the DPA or privacy content.

> ⚠️ **`dpa.js` and `legal.js` have no i18n parity check at all** — `check-i18n.mjs` loads only
> `fr/en/ko.js`. That blind spot is how `legal.js` once accumulated 28 duplicate `fr` keys.
> Diff the three locales **by hand** after editing, or this edit silently lands in one language.

If Cloudflare is kept as a DNS/CDN proxy (Option A), it stays a sub-processor and only needs
its description narrowed from "CDN, frontend and serverless backend" to "CDN and DNS".
Fly.io is still an **addition**, so the 30-day notice is required either way.

---

## 2. What actually has to change

Everything that is Cloudflare-shaped, and nothing else.

| Cloudflare surface | Used where | Replacement | Difficulty |
|---|---|---|---|
| File-based routing `functions/api/**` | 28 endpoint files | Node adapter, §4.2 | **Medium — the real work** |
| `_middleware.js` + `context.next()` | CORS on every `/api/*` | Adapter runs it as a wrapper | Low |
| `context.env` | 12 files, via `getConfig(env)` | Pass `process.env` | Trivial |
| `context.waitUntil()` | `ai.js:83`, `email.js:123` | Fire-and-forget with a `.catch` | Trivial |
| `context.params` (`[id].js`) | `members/[id].js`, `invitations/[id].js` | Route matcher extracts them | Low |
| `public/_headers` | `X-Robots-Tag`, asset cache | Header rules in the static server | Low |
| `public/_redirects` | 2 × 302 | Route in the static server | Trivial |
| Static hosting + SPA fallback | `dist/` | `serveStatic` + `index.html` fallback | Low |
| Global edge CDN | Everything | Cloudflare proxy in front, or Fly regions | See §3 |

**What does *not* change**, and must not be touched in this migration:

- `crypto.subtle` (AES-GCM, PBKDF2) — a Web Crypto global in Node 20+. Works as-is.
- `Response.json()`, `Request`, `Headers`, `fetch` — all global in Node 20+.
- Every handler signature (`onRequestGet(context)`, `onRequestPost(context)`, …).
- Supabase, Stripe, Resend, Mistral — all plain HTTPS from the server. Unaffected.
- The database, RLS, and the migration protocol. **Deploys must never run migrations** — the
  pre-prod-then-explicit-go protocol in [DEVELOPMENT.md](DEVELOPMENT.md) stays manual.

---

## 3. Three shapes, and which to pick

### Option A — Fly hosts everything, Cloudflare stays in front as a proxy ✅ recommended

DNS stays at Cloudflare with the orange cloud on; Cloudflare proxies to the Fly app.

- Keeps the global edge CDN for `dist/`. **This matters here**: the product is natively
  trilingual with real SEO landing pages at `/`, `/en` and `/ko`. Serving a Korean visitor
  from Paris alone costs ~250 ms of RTT on every asset.
- Keeps Cloudflare's DDoS protection and TLS termination.
- Cloudflare stays a sub-processor, so its DPA entry is narrowed rather than removed.
- Cost: Fly compute only.
- Caveat: two vendors in the path. Cache rules must not cache `/api/*`, and
  `X-Robots-Tag` must survive the proxy (it does — Cloudflare passes origin headers through).

### Option B — Fly only

DNS moves to Fly (or any registrar), Cloudflare removed entirely.

- Cleanest sub-processor story: remove Cloudflare, add Fly.
- **Loses the edge CDN.** Mitigate with `flyctl regions add nrt cdg iad` and `min_machines_running`
  per region — which multiplies the cost, and multiplies the in-memory rate limiter (§7).
- Pick this only if simplifying the vendor list is worth more than the SEO/latency cost.

### Option C — Fly for `/api/*` only, Cloudflare Pages keeps the static site

- Smallest blast radius; the static/SEO/`_headers` half of the work disappears.
- But: two deploy systems, two CI pipelines, and a permanent cross-origin hop that makes
  `_middleware.js`'s CORS list load-bearing rather than defensive.
- Reasonable as a **staging step** — ship the API to Fly first, move static later.

The rest of this document assumes **Option A**, and notes where C differs.

---

## 4. Target architecture

```
                     Cloudflare DNS + CDN (proxy)
                                 │
                                 ▼
                    Fly.io app  scalyo-app  (region: cdg — Paris)
                    ┌──────────────────────────────────────────┐
                    │  Node 22, single process, port 8080      │
                    │                                          │
                    │  server/index.js                         │
                    │    ├── /api/*  → functions adapter ──────┼──► functions/api/** (unchanged)
                    │    └── /*      → static (dist/)          │
                    │            ├── real file if it exists    │  (SEO: /en, /ko, /blog/<slug>)
                    │            └── else dist/index.html      │  (SPA fallback)
                    └──────────────────────────────────────────┘
                                 │
        ┌────────────────────────┼──────────────────────┬─────────────┐
        ▼                        ▼                      ▼             ▼
   Supabase (EU)            Mistral (EU)             Stripe        Resend
```

Two Fly apps: `scalyo-app` (production) and `scalyo-preprod`. They **cannot share an image** —
see §6.

### 4.1 Static serving is not a plain SPA fallback

`npm run build` runs `vite build` **then** `scripts/build-blog.js`, which writes real HTML
files with their own head tags:

```
dist/index.html              ← FR landing, FAQPage JSON-LD injected
dist/en/index.html           ← EN landing, its own head
dist/ko/index.html           ← KO landing, its own head
dist/blog/index.html
dist/blog/<slug>/index.html
dist/sitemap.xml
```

`/en`, `/ko` and `/blog` are **also** vue-router routes (`router/index.js:16-17,96`). The
static file is what a crawler and the first paint get; Vue takes over after hydration.

**The rule the static server must implement, in this order:**

1. Path matches a `_redirects` rule → 302.
2. `dist/<path>` is a file → serve it.
3. `dist/<path>/index.html` exists → serve it. ← **this is what keeps `/en`, `/ko`, `/blog/<slug>` SEO-correct**
4. Otherwise → `dist/index.html` with **200** (never 404 — vue-router owns the path).

Getting step 3 wrong silently degrades the whole multilingual SEO effort, and nothing in the
test suite would catch it. Add a smoke test (§8).

### 4.2 The functions adapter — the one piece of real engineering

Re-implements Cloudflare Pages' file routing so the 28 handler files stay byte-identical.

**Rules to reproduce** (from the Pages Functions spec, as used by this repo):

| File | Route |
|---|---|
| `functions/api/health.js` | `/api/health` |
| `functions/api/email.js` | `/api/email` |
| `functions/api/email/config.js` | `/api/email/config` |
| `functions/api/members/[id].js` | `/api/members/:id` |
| `functions/api/_*/**` | **never a route** — shared code |
| `functions/api/_middleware.js` | wraps every `/api/*` |

Note `email.js` *and* `email/config.js` both exist, as do `members.js`/`members/[id].js` and
`invite.js`/`invite/accept.js`. **Static routes must be matched before dynamic ones.**

`server/functions-router.js` (sketch — this is the shape, not a finished file):

```js
// FLY-ADAPTER (2026-XX-XX): re-implements Cloudflare Pages file routing on Node.
// The 28 handlers under functions/api/ are NOT modified: they already speak
// Web-standard Request/Response. Only the context object is synthesized here.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const METHOD_EXPORT = {
  GET: 'onRequestGet', POST: 'onRequestPost', PUT: 'onRequestPut',
  PATCH: 'onRequestPatch', DELETE: 'onRequestDelete', HEAD: 'onRequestGet',
}

// Walk functions/api/, skipping every _-prefixed segment (shared code, never a route).
function collect(dir, prefix = '/api', out = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('_')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) { collect(full, `${prefix}/${name}`, out); continue }
    if (!name.endsWith('.js')) continue
    const base = name.slice(0, -3)
    const path = base === 'index' ? prefix : `${prefix}/${base}`
    // [id] -> a named parameter. [[rest]] is unused in this repo.
    const segments = path.split('/').map(s =>
      s.startsWith('[') ? { param: s.replace(/[[\]]/g, '') } : { literal: s })
    out.push({ file: full, segments, dynamic: segments.some(s => s.param) })
  }
  return out
}

// Static before dynamic, longest first: /api/email must not be eaten by /api/[x].
const routes = collect(FUNCTIONS_API_DIR)
  .sort((a, b) => (a.dynamic - b.dynamic) || (b.segments.length - a.segments.length))

function match(pathname) {
  const parts = pathname.replace(/\/$/, '').split('/')
  for (const r of routes) {
    if (r.segments.length !== parts.length) continue
    const params = {}
    let ok = true
    for (let i = 0; i < parts.length; i++) {
      const s = r.segments[i]
      if (s.param) params[s.param] = decodeURIComponent(parts[i])
      else if (s.literal !== parts[i]) { ok = false; break }
    }
    if (ok) return { route: r, params }
  }
  return null
}

// The context Cloudflare passes in. env is process.env; waitUntil is fire-and-forget
// (on Fly the process outlives the response, so this is MORE reliable than on Workers,
// as long as the machine is not allowed to auto-stop — see fly.toml).
function makeContext(request, params, next) {
  return {
    request, env: process.env, params, data: {}, next,
    waitUntil: (p) => { Promise.resolve(p).catch(e => console.error('waitUntil:', e)) },
  }
}

export async function handleApi(request) {
  const url = new URL(request.url)
  const hit = match(url.pathname)

  const dispatch = async () => {
    if (!hit) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
    const mod = await import(pathToFileURL(hit.route.file).href)   // cached by the ESM loader
    const fn = mod[METHOD_EXPORT[request.method]] || mod.onRequest
    if (!fn) return new Response(null, { status: 405 })
    return fn(makeContext(request, hit.params, dispatch))
  }

  // _middleware.js owns CORS and the preflight; it calls context.next().
  const mw = await import(MIDDLEWARE_URL)
  return mw.onRequest(makeContext(request, hit?.params ?? {}, dispatch))
}
```

**Things that will bite if you skip them:**

- **Do not read or parse the request body in the adapter.** `stripe-webhook.js:191` calls
  `context.request.text()` itself and verifies the HMAC over the raw bytes. Any body-parsing
  middleware breaks signature verification, and it breaks *silently* — the webhook 400s and
  a paying customer stays on `starter`.
- `HEAD` maps to `onRequestGet` on Cloudflare. Keep that.
- `import()` is cached per module URL, so handlers are loaded once, not per request.
- `_middleware.js` catches thrown errors and returns a JSON 500. Keep that behaviour;
  see the CF-502 note in §7.

---

## 5. The artifacts to create

All of these live in `app-v2/frontend/` — that is the Docker build context. `supabase/` at
the repo root is deliberately **not** shipped in the image.

```
app-v2/frontend/
  Dockerfile
  .dockerignore
  fly.toml                 ← production
  fly.preprod.toml         ← pre-prod
  server/
    index.js               ← http entrypoint: /api/* then static
    functions-router.js    ← §4.2
    static.js              ← §4.1 + the _headers / _redirects rules
.github/workflows/
  ci.yml
  deploy-preprod.yml
  deploy-prod.yml
```

### 5.1 `Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1

# ── Stage 1: build ────────────────────────────────────────────────────────
# VITE_* are BUILD-TIME. They are baked into the bundle, so prod and pre-prod
# cannot share an image (see §6). All four are public-by-design values.
FROM node:22-alpine AS build
WORKDIR /app

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_STRIPE_LINK_STARTER
ARG VITE_STRIPE_LINK_GROWTH
ARG VITE_STRIPE_LINK_ELITE

COPY package*.json ./
RUN npm ci
COPY . .
# vite build + scripts/build-blog.js. build-blog FAILS THE BUILD on purpose when a
# substitution target is missing — that is the intended behaviour, do not add `|| true`.
RUN npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8080

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY functions ./functions
COPY server ./server

# Non-root. Node 22 images ship a `node` user.
USER node
EXPOSE 8080
CMD ["node", "server/index.js"]
```

> `package.json` pulls `xlsx` from a CDN tarball
> (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`). `npm ci` therefore needs network
> access at image-build time, and the build is not reproducible if that URL disappears.
> Pre-existing, not introduced here — but it will now fail *deploys*, not just local installs.
> Consider vendoring it before the cutover.

### 5.2 `fly.toml` (production)

```toml
app            = "scalyo-app"
primary_region = "cdg"          # Paris. Matches the EU residency posture (Supabase Frankfurt,
                                # Mistral EU). Do not move this to a US region casually —
                                # docs/SECURITY_AND_PRIVACY.md and the DPA both depend on it.

[build]
  dockerfile = "Dockerfile"

[env]
  PORT      = "8080"
  NODE_ENV  = "production"

[http_service]
  internal_port       = 8080
  force_https         = true
  auto_start_machines = true
  # "off" on purpose, NOT "suspend": a stopped machine cold-starts on the Stripe webhook,
  # and the rate limiter in _services/rate-limit.service.js is an in-memory Map that a
  # stop would wipe. Pre-prod may suspend; production stays warm.
  auto_stop_machines   = "off"
  min_machines_running = 1

  [http_service.concurrency]
    type       = "requests"
    soft_limit = 200
    hard_limit = 250

  [[http_service.checks]]
    path          = "/api/health"      # already exists: functions/api/health.js
    method        = "GET"
    interval      = "30s"
    timeout       = "5s"
    grace_period  = "15s"

[[vm]]
  size   = "shared-cpu-1x"
  memory = "512mb"
```

`fly.preprod.toml` is the same file with `app = "scalyo-preprod"`,
`auto_stop_machines = "suspend"` and `min_machines_running = 0` to keep the bill down.

---

## 6. Secrets and environment

Two categories, and conflating them is the most common way to leak a service-role key into a
browser bundle.

### 6.1 Build-time — baked into the JavaScript bundle, publicly readable

Passed as `--build-arg`. Stored as GitHub **repository variables** (not secrets — they are
public values, and treating them as secrets only makes the workflow harder to read).

| Variable | Prod | Pre-prod |
|---|---|---|
| `VITE_SUPABASE_URL` | prod project | pre-prod project |
| `VITE_SUPABASE_ANON_KEY` | prod anon | pre-prod anon |
| `VITE_STRIPE_LINK_STARTER` / `_GROWTH` / `_ELITE` | live Payment Links | `VITE_STRIPE_LINK_*_PREPROD` (test mode) |

**Consequence: prod and pre-prod need separate image builds.** You cannot promote a pre-prod
image to production — it has the test Stripe links and the wrong Supabase project baked in.
Anyone expecting a build-once-promote-everywhere pipeline needs to be told this up front.

### 6.2 Runtime — `flyctl secrets`, never in the image

```bash
flyctl secrets set -a scalyo-app \
  SUPABASE_URL=...              \
  SUPABASE_ANON_KEY=...         \
  SUPABASE_SERVICE_ROLE_KEY=... \
  SUPABASE_JWT_SECRET=...       \
  MISTRAL_API_KEY=...           \
  STRIPE_SECRET_KEY=...         \
  STRIPE_WEBHOOK_SECRET=...     \
  RESEND_API_KEY=...            \
  ENCRYPTION_KEY=...
```

Full list and which are mandatory: [DEVELOPMENT.md](DEVELOPMENT.md#environment-variables).

Two that are easy to miss:

- **`ENCRYPTION_KEY`** is absent from the DEVELOPMENT.md table but is required by
  `email/config.js`, `email/test.js`, `email.js` and `integrations/config.js` — it is the
  AES-GCM key for the per-organization Resend key at rest. **It must be the exact same value
  as today**, or every stored Resend key becomes undecryptable. Copy it, do not regenerate it.
- `getConfig()` **throws** on a missing `SUPABASE_URL`/`SUPABASE_ANON_KEY` — deliberately, so
  that a mis-provisioned pre-prod can never silently fail over to production
  (`ENV-FALLBACK-PROD`). A first deploy with a missing secret will therefore 500 on every
  route rather than half-work. That is correct; check `/api/health` first.

`flyctl secrets set` restarts the machines. Set them all in one command, before the first deploy.

---

## 7. Repo-specific traps this migration walks into

Ordered by how expensive they are to discover in production.

1. **`ENCRYPTION_KEY` continuity** — see above. Silent, total, and only visible when a
   customer's org email stops sending.
2. **The Stripe webhook is the single point of truth for paid access.** Its URL changes.
   Until the endpoint is re-pointed and `STRIPE_WEBHOOK_SECRET` is updated, a paying owner's
   members stay gated on `starter` (the webhook writes **both** `profiles` and
   `organizations`). Re-point it in the same window as the DNS switch, and replay a test event.
3. **The in-memory rate limiter** (`_services/rate-limit.service.js`) is a module-level `Map`.
   On Workers it reset on every cold start — weak, and documented as acceptable. On Fly it
   becomes *stronger* (a long-lived process) but **multiplies by the machine count**: N
   machines = N × 10 requests/minute. With `min_machines_running = 1` in one region the
   behaviour is closest to intended. If you ever scale out, move the counter to a Supabase
   table or accept the multiplier explicitly.
4. **`CF-502-MASQUE` becomes unnecessary but must not be removed yet.** Three endpoints
   (`invite.js`, `members/[id].js`, `invitations/[id].js`) return a typed **409** where a 502
   would be natural, because Cloudflare eats 5xx bodies from Pages Functions and replaces them
   with its own HTML. Fly passes bodies through intact. The 409 is nevertheless a **contract
   with the front end** — removing it is a separate, front-end-coordinated change, never part
   of the hosting migration.
5. **`wellbeing` is inlined twice** (`_modules/index.js` and a fallback in `ai.js`) because
   Cloudflare Pages does not reliably resolve newly added module files. Node has no such
   problem, so the duplication becomes dead weight — but again, **a separate change**. Leave
   it, and note it in the follow-up list rather than mixing it into the cutover diff.
6. **`_middleware.js` `ALLOWED_ORIGINS` is hard-coded** to `scalyo.app`, `www.scalyo.app`,
   `preprod.scalyo.app`, `scalyo-app.pages.dev` and `*.scalyo-app.pages.dev`. Add the
   `*.fly.dev` hostnames before the first browser test against Fly, or every request from the
   Fly preview URL fails CORS. Under Option A the production origins do not change.
7. **`public/_headers` disappears with Cloudflare.** Its `X-Robots-Tag: noindex, follow` on
   `/login`, `/register`, `/join*`, `/paywall`, `/payment-success`, `/reset-password*` and
   `/app/*` is deliberate SEO policy. If the Node static server does not reproduce it, the
   whole authenticated surface becomes indexable. This is the single most likely thing to be
   forgotten, because nothing visibly breaks.
8. **`.env.production` is committed** in `app-v2/frontend/` (Supabase URL + anon key only —
   both public, but it should not be versioned). Make sure `.dockerignore` excludes it so the
   build cannot accidentally prefer it over the build args.

---

## 8. GitHub Actions

Three workflows. `FLY_API_TOKEN` should be a **deploy-scoped** token per app, not a personal
org token:

```bash
flyctl tokens create deploy -a scalyo-app     # -> secret FLY_API_TOKEN_PROD
flyctl tokens create deploy -a scalyo-preprod # -> secret FLY_API_TOKEN_PREPROD
```

### 8.1 `ci.yml` — every push and PR

Runs the repo's existing gates. Nothing Fly-specific; this is worth adding **regardless** of
whether the migration happens, because none of these checks are enforced today.

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main, preprod]

defaults:
  run:
    working-directory: app-v2/frontend

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: app-v2/frontend/package-lock.json
      - run: npm ci

      # Known, accepted gap: wellbeing_fri is missing in EN and KO. The step must fail on
      # anything else, so assert the exact expected output rather than `|| true`.
      - name: i18n key parity
        run: node scripts/check-i18n.mjs

      - name: i18n value quality
        run: node scripts/check-i18n-quality.mjs

      - name: paywall computeds regression proof
        run: node scripts/proof-paywall-member.mjs

      # build-blog.js fails on purpose when a substitution target is missing — that is a
      # real signal, not flakiness.
      - name: build
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL_PREPROD }}
          VITE_SUPABASE_ANON_KEY: ${{ vars.VITE_SUPABASE_ANON_KEY_PREPROD }}
```

> `check-i18n.mjs` currently **exits 0** while printing its `❌` lines, and the known
> `wellbeing_fri` gap would make a strict exit code red on day one. Decide before wiring CI:
> either fix `wellbeing_fri` and make the script exit non-zero on any gap (preferred — it is
> the only thing that makes the gate real), or have CI grep the output against an allowlist.

### 8.2 `deploy-preprod.yml`

```yaml
name: Deploy pre-prod
on:
  push:
    branches: [preprod]
  workflow_dispatch:

concurrency:
  group: deploy-preprod
  cancel-in-progress: false     # never cancel a half-finished deploy

jobs:
  deploy:
    runs-on: ubuntu-latest
    needs: []
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: |
          flyctl deploy --remote-only \
            --config app-v2/frontend/fly.preprod.toml \
            --dockerfile app-v2/frontend/Dockerfile \
            --build-arg VITE_SUPABASE_URL=${{ vars.VITE_SUPABASE_URL_PREPROD }} \
            --build-arg VITE_SUPABASE_ANON_KEY=${{ vars.VITE_SUPABASE_ANON_KEY_PREPROD }} \
            --build-arg VITE_STRIPE_LINK_STARTER=${{ vars.VITE_STRIPE_LINK_STARTER_PREPROD }} \
            --build-arg VITE_STRIPE_LINK_GROWTH=${{ vars.VITE_STRIPE_LINK_GROWTH_PREPROD }} \
            --build-arg VITE_STRIPE_LINK_ELITE=${{ vars.VITE_STRIPE_LINK_ELITE_PREPROD }}
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN_PREPROD }}
```

### 8.3 `deploy-prod.yml`

Same, against `fly.toml` and the live values, with two additions:

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production      # ← GitHub Environment with required reviewers.
                                 #   Mirrors the repo's "explicit go" doctrine for anything
                                 #   that touches production.
```

and a post-deploy smoke step that is worth more than it looks:

```yaml
      - name: Smoke test
        run: |
          set -e
          BASE=https://scalyo.app
          # API is alive
          curl -fsS "$BASE/api/health" | grep -q '"status":"ok"'
          # SEO pages are real files, not the SPA fallback (§4.1 step 3)
          curl -fsS "$BASE/en/" | grep -q '<html lang="en"'
          curl -fsS "$BASE/ko/" | grep -q '<html lang="ko"'
          # noindex survived the loss of _headers (§7.7)
          curl -fsSI "$BASE/login" | grep -qi 'x-robots-tag: noindex'
          # a deep SPA route still returns 200 + index.html, not 404
          test "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/app/clients")" = 200
```

**Migrations are deliberately absent from every workflow.** They stay manual, pre-prod first,
prod on an explicit go, ordered against the front-end deploy — as
[DEVELOPMENT.md](DEVELOPMENT.md#database-work) requires. Automating them here would quietly
delete that protocol.

---

## 9. Cutover runbook

Phases 1–4 can all run while the 30-day notice clock ticks.

**Phase 1 — build (no production impact)**
1. Write `server/`, `Dockerfile`, `.dockerignore`, `fly.toml`, `fly.preprod.toml`.
2. `flyctl launch --no-deploy` for `scalyo-preprod`; set every runtime secret (§6.2), with the
   **existing** `ENCRYPTION_KEY`.
3. Add the `*.fly.dev` origins to `_middleware.js`.
4. Deploy to `scalyo-preprod`. Verify against `https://scalyo-preprod.fly.dev`.

**Phase 2 — verify on pre-prod**
- [ ] `/api/health` returns `{"status":"ok"}`
- [ ] Every one of the 28 routes resolves — including the pairs that collide under naive
      routing: `/api/email` vs `/api/email/config`, `/api/members` vs `/api/members/<uuid>`,
      `/api/invite` vs `/api/invite/accept`
- [ ] `/`, `/en/`, `/ko/`, `/blog/`, `/blog/<slug>/` serve **their own** HTML, not `index.html`
- [ ] `/app/clients` → 200 + SPA shell
- [ ] `X-Robots-Tag: noindex` on `/login`, `/app/*`, `/paywall`, `/join/*`
- [ ] `/index-landing` → 302 `/`
- [ ] Login, then leave the tab idle: the 5 h idle rule (`lib/sessionIdle.js`) is client-side
      and unaffected — confirm it still behaves, since it is easy to blame a hosting change
- [ ] Send a Stripe **test** webhook: signature verifies, `profiles` **and** `organizations`
      are both written
- [ ] Org email through the per-org Resend key — proves `ENCRYPTION_KEY` survived
- [ ] An AI call (`/api/ai`) — proves `context.waitUntil` logging works and quota is recorded
- [ ] Chat: send a message, react to a **colleague's** message (needs
      `20260909120000_chat_reactions_rpc.sql` applied on pre-prod)

**Phase 3 — legal (must be complete before phase 4)**
- [ ] 30-day notice sent, clock expired
- [ ] Fly.io DPA/SCCs signed and filed
- [ ] `dpa.js` + `legal.js` updated in FR **and** EN **and** KO, diffed by hand (§1)
- [ ] [BUSINESS.md](BUSINESS.md) updated

**Phase 4 — production cutover** *(low-traffic window; ~15 minutes of exposure)*
1. Deploy `scalyo-app`, still on `*.fly.dev`. Run the phase-2 checklist against it.
2. `flyctl certs add scalyo.app` / `www.scalyo.app`; wait for the certificate.
3. **Lower the Cloudflare DNS TTL to 60 s at least 24 h beforehand.**
4. Point the DNS at Fly (Option A: keep the proxy on; add a cache rule bypassing `/api/*`).
5. Update the **Stripe webhook endpoint** URL, take the new signing secret, and
   `flyctl secrets set STRIPE_WEBHOOK_SECRET=…`. Replay one event and confirm the write.
6. Update **Supabase → Authentication → URL Configuration** (site URL + redirect allow-list)
   if the origin changed. Under Option A it does not.
7. Watch `flyctl logs` and Sentry for 30 minutes. Confirm real logins, a real payment, an AI
   call and a chat message.
8. Keep the Cloudflare Pages project **deployed and reachable** for 7 days.

**Phase 5 — cleanup (a week later, separate PRs)**
- Remove the Pages project; drop `scalyo-app.pages.dev` from `ALLOWED_ORIGINS`.
- Delete `public/_headers` / `public/_redirects` once the Node equivalents are proven.
- Re-evaluate the `CF-502-MASQUE` 409s and the doubled `wellbeing` handler (§7.4, §7.5) —
  one PR each, front end coordinated.
- Update [ARCHITECTURE.md](ARCHITECTURE.md), [BACKEND_API.md](BACKEND_API.md),
  [DEVELOPMENT.md](DEVELOPMENT.md) and `CLAUDE.md`, which all still say "Cloudflare Pages
  Functions". Per the CLAUDE.md maintenance rule, this is part of the change, not follow-up.

### Rollback

At any point in phase 4, revert the DNS record. That is the whole rollback, and it is why the
Pages project stays live for a week. The two things it does **not** undo:

- the Stripe webhook endpoint — keep the old Cloudflare endpoint enabled in parallel during
  the window so both receive events;
- anything written to the database. Nothing in this migration writes to it, which is the point
  of keeping migrations out of the pipeline.

---

## 10. Open questions

1. **Option A, B or C?** (§3) Drives whether the CDN/SEO work is in scope at all.
2. **Is the loss of the free tier acceptable?** ~$10–20/month for two always-on apps.
3. **One region or several?** Multi-region fixes KO/EN latency under Option B, multiplies the
   rate limiter (§7.3) and the bill.
4. **Who sends the 30-day notice, and when does the clock start?** Everything else waits on it.
5. **Does Fly.io's DPA satisfy the commitments in `dpa_s8_body`?** Must be answered before
   that string is edited, not after.
6. **Should `check-i18n.mjs` exit non-zero?** (§8.1) It is the difference between a real CI
   gate and a decorative one.

---

## 11. What this migration explicitly does not do

Listed so nobody quietly folds them in:

- No change to any of the 28 `functions/api/**` handlers.
- No database, RLS or migration change. No migration runs from CI.
- No change to the split plan source (`profiles.plan` vs `organizations.plan`), the
  hand-synced `plans.config.js` copies, or any of the 24 findings in
  [MOCK_CODE_AUDIT.md](MOCK_CODE_AUDIT.md). They are unaffected by hosting and stay open.
- No removal of the `CF-502-MASQUE` 409s or the doubled `wellbeing` handler.
- No change to `lib/sessionIdle.js` or the 5 h idle rule — client-side, hosting-independent.

---

*Written 2026-09-09. Proposal only — the live deployment is still Cloudflare Pages.*
