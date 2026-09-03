// === SCALYO — Configuration centralisee ===
// Provider IA : Mistral (Paris, EU) — RGPD conforme
// Cles secretes dans Cloudflare env vars uniquement.
//
// ENV-FALLBACK-PROD (lot 6) : plus AUCUNE constante de repli vers le projet de
// production. Une preprod privee de SUPABASE_URL echouait silencieusement vers
// la base de PRODUCTION. On echoue desormais bruyamment, comme le fait deja
// src/lib/supabase.js L10-12 et functions/api/_utils/supabase.js L7.

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
    // Fallback IA de secours (hors UE) — appelé seulement si Mistral tombe,
    // avec prompt anonymisé. Vide = fallback désactivé (comportement d'origine).
    deepseekApiKey: env.DEEPSEEK_API_KEY || '',
    deepseekModel: env.DEEPSEEK_MODEL || 'deepseek-chat',
  }
}

export function getApiKey(config) {
  return config.mistralApiKey
}
