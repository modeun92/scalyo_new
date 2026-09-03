# Scalyo — Security configuration

## AI provider

Mistral (Paris, EU) — GDPR compliant.
No other provider is configured. Data never leaves the EU.

### Required env vars (Cloudflare Dashboard)

| Variable | Source | Usage |
|---|---|---|
| MISTRAL_API_KEY | console.mistral.ai | AI provider |
| AI_MODEL | (optional) | Overrides the model (default: mistral-medium-latest) |
| SUPABASE_JWT_SECRET | Supabase Dashboard | Auth verification |
| STRIPE_WEBHOOK_SECRET | Stripe Dashboard | Webhook verification |
| SUPABASE_SERVICE_ROLE_KEY | Supabase Dashboard | Admin operations |

### PUBLIC keys

- SUPABASE_URL: public URL of the Supabase project
- SUPABASE_ANON_KEY: public Supabase key (access restricted by RLS)

Both are read from the environment (`_config/index.js` throws when they are missing —
there is no hard-coded fallback to the production project; see ENV-FALLBACK-PROD).

## Rules

1. Never a secret key in the source code
2. Never a secret key in logs or error messages
3. RLS enabled on every user table
4. ES256 auth (never HMAC)
5. AI consent required before any data processing
6. HTTPS enforced through Cloudflare
7. AI data hosted exclusively in the EU (Mistral, Paris)
