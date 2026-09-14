# Scalyo — application code for review (snapshot `b6984fa`, 03/09/2026)

Extract of the `Stratimaagency/scalyo` repository, branch `main` (= production). This archive contains **the application code only**: no `node_modules`, no build output (`dist`/`.vite`), no `.env`, and none of the repository's session notes.

## Stack
- **Front end**: Vue 3 + Pinia + vue-i18n, Vite build. Root: `app-v2/frontend/`.
  - `src/` — views, Pinia stores, components, i18n (FR/EN/KO), utilities.
  - `functions/api/` — **Cloudflare Pages Functions** (serverless back end: Stripe, OAuth integrations, accounts, email). Secrets (service_role, Stripe, Resend) are read from `env` at runtime, never hard-coded.
- **Supabase**: `supabase/migrations/` (schema + RLS) and `supabase/functions/` (Edge Functions: Stripe webhooks, email sending, run-playbooks).
- **Deployment**: Cloudflare Pages (front end) through GitHub Actions; two Supabase environments (pre-prod / prod).

## Suggested entry points for the review
- Data security: `supabase/migrations/` (RLS policies `user_id = auth.uid()`), and `functions/api/_utils/supabase.js` / `_config/`.
- Recent business logic (COPIL module — steering committee): `src/stores/kpis.js` (per-entity write queue, debounce, flush), `src/utils/pptxExport.js`, `src/utils/copilFormat.js`, `src/components/kpis/`, `src/views/kpis/`.
- i18n: `src/i18n/{fr,en,ko}.js` (no hard-coded FR string expected in the product).

## Known hygiene notes (transparency)
- **Duplicate macOS files** committed in the repository (`App 2.vue`, `main 2.js`, `package 2.json`, `vite.config 2.js`, `kpiCatalog 2.js`, etc.) — Finder copy artifacts, **removed from this archive** but still present in the repository: to be deleted (`git rm`).
- `app-v2/frontend/.env.production` is committed (it only contains the Supabase URL and the **anon** key, both public — but it is still better not to version a `.env` file). Removed from this archive.
- The repository root is cluttered with session notes (`_session/`, `_to_delete/`, many `.md` files) — non-application material, excluded from this archive.

## Security — verified before export
Scan of the git-tracked code: **no real secret hard-coded** (service_role, Stripe `sk_/whsec_`, Resend `re_`). Only present: the Supabase **anon** key (public) and translation placeholders.

## Language policy of the code base (03/09/2026)
Code comments, developer-facing log messages and internal identifiers are in **English**.
French remains only where it is product content: i18n message values (`src/i18n/fr*.js`),
AI system prompts, email template bodies, the public French landing/press pages, and
persisted French enum values (e.g. `oxygen_recoveries.kind = 'cloture'`,
`email_templates.category = 'renouvellement'`). See `docs/CODE_STYLE.md`.
