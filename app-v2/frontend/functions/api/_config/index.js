// === SCALYO — Centralized configuration ===
// AI provider: Mistral (Paris, EU) — GDPR compliant
// Secret keys in Cloudflare env vars only.
//
// ENV-FALLBACK-PROD (Lot 6): NO more fallback constant pointing at the
// production project. A pre-prod deprived of SUPABASE_URL silently failed over to
// the PRODUCTION database. We now fail loudly, as
// src/lib/supabase.js L10-12 and functions/api/_utils/supabase.js L7 already do.

function required(env, name) {
  const value = env && env[name]
  if (!value) {
    throw new Error(
      'Missing required environment variable: ' + name +
      ' — Cloudflare Pages > Settings > Variables (Production AND Preview).'
    )
  }
  return value
}

export function getConfig(env) {
  return {
    aiModel: env.AI_MODEL || 'mistral-small-latest',
    maxTokens: parseInt(env.AI_MAX_TOKENS || '2048', 10),
    mistralApiKey: env.MISTRAL_API_KEY || '',
    supabaseUrl: required(env, 'SUPABASE_URL'),
    supabaseAnonKey: required(env, 'SUPABASE_ANON_KEY'),
    supabaseJwtSecret: env.SUPABASE_JWT_SECRET || '',
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
    stripeSecretKey: env.STRIPE_SECRET_KEY || '',
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
    resendApiKey: env.RESEND_API_KEY || '',
    // Emergency AI fallback (outside the EU) — only called if Mistral goes down,
    // with an anonymized prompt. Empty = fallback disabled (original behaviour).
    deepseekApiKey: env.DEEPSEEK_API_KEY || '',
    deepseekModel: env.DEEPSEEK_MODEL || 'deepseek-chat',
  }
}

export function getApiKey(config) {
  return config.mistralApiKey
}
