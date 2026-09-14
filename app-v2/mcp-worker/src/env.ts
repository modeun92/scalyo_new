// Typed environment + fail-loud config for the MCP Worker.
//
// ENV-FALLBACK-PROD (inherited from functions/api/_config/index.js): NO fallback
// constant may point at the production Supabase project. A pre-prod deprived of
// SUPABASE_URL once silently failed over to the PRODUCTION database. We fail loudly
// instead — and on this Worker that matters more than on the website, because the
// caller here is an external AI client, not a logged-in browser.

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

export interface Env {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SCALYO_MCP_ENV: string
  MCP_ENABLED: string
  MCP_RATE_LIMIT_IP: RateLimiter
  MCP_RATE_LIMIT_USER: RateLimiter
  MCP_RATE_LIMIT_HEAVY: RateLimiter
  // SERVICE-ROLE-ABSENT (14/09/2026): SUPABASE_SERVICE_ROLE_KEY is deliberately NOT
  // declared here and must never be bound to this Worker. A service-role query bypasses
  // RLS; one forgotten organization filter in one tool then becomes a cross-tenant leak
  // to an external AI client. The secret being absent from the binding is the control —
  // a code review rule alone would not survive the next contributor.
}

export interface ScalyoMcpConfig {
  supabaseUrl: string
  supabaseAnonKey: string
  environment: string
  enabled: boolean
}

function required(env: Env, name: 'SUPABASE_URL' | 'SUPABASE_ANON_KEY'): string {
  const value = env?.[name]
  if (!value) {
    throw new Error(
      'Missing required environment variable: ' + name +
      ' — set it with `wrangler secret put ' + name + ' --env <preprod|production>`.'
    )
  }
  return value
}

export function getConfig(env: Env): ScalyoMcpConfig {
  const supabaseUrl = required(env, 'SUPABASE_URL').replace(/\/+$/, '')
  return {
    supabaseUrl,
    supabaseAnonKey: required(env, 'SUPABASE_ANON_KEY'),
    environment: env.SCALYO_MCP_ENV || 'unknown',
    enabled: (env.MCP_ENABLED || 'on') !== 'off',
  }
}

// The rate-limit bindings are declared in wrangler.jsonc, so a real deploy always has
// them. If one is missing the deploy is misconfigured and we FAIL CLOSED rather than
// serve an unlimited public endpoint (Fix C of the gap plan: the in-memory Map must
// never be the only control).
export function requireRateLimiters(env: Env): void {
  for (const name of ['MCP_RATE_LIMIT_IP', 'MCP_RATE_LIMIT_USER', 'MCP_RATE_LIMIT_HEAVY'] as const) {
    if (!env[name] || typeof env[name].limit !== 'function') {
      throw new Error('Missing rate limit binding: ' + name + ' — check wrangler.jsonc `ratelimits`.')
    }
  }
}
