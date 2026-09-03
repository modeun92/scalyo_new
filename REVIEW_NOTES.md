# Scalyo — code applicatif pour revue (snapshot `b6984fa`, 03/09/2026)

Extrait du dépôt `Stratimaagency/scalyo`, branche `main` (= production). Ce zip contient **le code applicatif uniquement** : ni `node_modules`, ni build (`dist`/`.vite`), ni `.env`, ni les notes de session du dépôt.

## Stack
- **Front** : Vue 3 + Pinia + vue-i18n, build Vite. Racine : `app-v2/frontend/`.
  - `src/` — vues, stores Pinia, composants, i18n (FR/EN/KO), utilitaires.
  - `functions/api/` — **Cloudflare Pages Functions** (backend serverless : Stripe, intégrations OAuth, comptes, e-mail). Les secrets (service_role, Stripe, Resend) sont lus depuis `env` au runtime, jamais en dur.
- **Supabase** : `supabase/migrations/` (schéma + RLS) et `supabase/functions/` (Edge Functions : webhooks Stripe, envoi e-mail, run-playbooks).
- **Déploiement** : Cloudflare Pages (front) via GitHub Actions ; deux environnements Supabase (préprod / prod).

## Points d'entrée conseillés pour la revue
- Sécurité des données : `supabase/migrations/` (politiques RLS `user_id = auth.uid()`), et `functions/api/_utils/supabase.js` / `_config/`.
- Logique métier récente (module COPIL — comité de pilotage) : `src/stores/kpis.js` (file d'écriture par entité, débounce, flush), `src/utils/pptxExport.js`, `src/utils/copilFormat.js`, `src/components/kpis/`, `src/views/kpis/`.
- i18n : `src/i18n/{fr,en,ko}.js` (aucune chaîne FR en dur attendue dans le produit).

## Notes d'hygiène connues (transparence)
- **Fichiers doublons macOS** committés dans le dépôt (`App 2.vue`, `main 2.js`, `package 2.json`, `vite.config 2.js`, `kpiCatalog 2.js`, etc.) — artefacts de copie Finder, **retirés de ce zip** mais encore présents dans le dépôt : à supprimer (`git rm`).
- `app-v2/frontend/.env.production` est committé (il ne contient que l'URL Supabase et la clé **anon**, publiques — mais mieux vaut ne pas versionner de fichier `.env`). Retiré de ce zip.
- Racine du dépôt encombrée de notes de session (`_session/`, `_to_delete/`, nombreux `.md`) — non applicatif, exclu de ce zip.

## Sécurité — vérifié avant export
Scan du code suivi par git : **aucun secret réel en dur** (service_role, Stripe `sk_/whsec_`, Resend `re_`). Seuls présents : la clé Supabase **anon** (publique) et des placeholders de traduction.
