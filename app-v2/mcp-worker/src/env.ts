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
  /** Canonical protected-resource identifier, e.g. https://mcp.scalyo.app/mcp. */
  MCP_RESOURCE_URL?: string
  /** 'enforce' rejects a token not bound to MCP_RESOURCE_URL; 'observe' only audits it. */
  MCP_TOKEN_BINDING?: string
  /** Comma-separated OAuth client_id allowlist. Empty means every registered client. */
  MCP_ALLOWED_OAUTH_CLIENTS?: string
  MCP_RATE_LIMIT_IP: RateLimiter
  MCP_RATE_LIMIT_USER: RateLimiter
  MCP_RATE_LIMIT_HEAVY: RateLimiter
  // SERVICE-ROLE-ABSENT (14/09/2026): SUPABASE_SERVICE_ROLE_KEY is deliberately NOT
  // declared here and must never be bound to this Worker. A service-role query bypasses
  // RLS; one forgotten organization filter in one tool then becomes a cross-tenant leak
  // to an external AI client. The secret being absent from the binding is the control —
  // a code review rule alone would not survive the next contributor.
}

/**
 * MCP-TOKEN-BINDING (14/09/2026): how hard the resource binding is enforced.
 *
 *   observe — the binding is checked and every failure is audited, but the request is
 *             served. This is the ONLY safe default: if Supabase's OAuth server does not
 *             yet put the MCP resource in `aud`/`resource`, an `enforce` default would
 *             401 every connector on the first deploy and look like an outage.
 *   enforce — a token not bound to this resource is rejected as UNAUTHENTICATED.
 *
 * The flip to `enforce` is a deliberate step: run pre-prod in `enforce` first, read the
 * `mcp.auth.binding` audit lines from a real ChatGPT and a real Claude connection, and
 * only then set it in production. See docs/MCP_SERVER.md.
 */
export type TokenBindingMode = 'observe' | 'enforce'

export interface ScalyoMcpConfig {
  supabaseUrl: string
  supabaseAnonKey: string
  environment: string
  enabled: boolean
  /**
   * The canonical resource identifier this Worker protects (RFC 8707 / RFC 9728).
   * Null means "derive it from the request origin", which is right for `wrangler dev`
   * and wrong for production — production sets MCP_RESOURCE_URL explicitly so that a
   * request arriving on some other hostname cannot redefine what a token is bound to.
   */
  resourceUrl: string | null
  tokenBinding: TokenBindingMode
  /** Empty = any client registered with Supabase. Non-empty = strict allowlist. */
  allowedOauthClients: readonly string[]
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

/** Trailing slashes removed so `…/mcp` and `…/mcp/` compare equal. */
export function normalizeResourceUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

export function getConfig(env: Env): ScalyoMcpConfig {
  const supabaseUrl = required(env, 'SUPABASE_URL').replace(/\/+$/, '')
  const rawResource = (env.MCP_RESOURCE_URL || '').trim()
  const binding = (env.MCP_TOKEN_BINDING || 'observe').trim().toLowerCase()

  return {
    supabaseUrl,
    supabaseAnonKey: required(env, 'SUPABASE_ANON_KEY'),
    environment: env.SCALYO_MCP_ENV || 'unknown',
    enabled: (env.MCP_ENABLED || 'on') !== 'off',
    resourceUrl: rawResource ? normalizeResourceUrl(rawResource) : null,
    // An unrecognised value is NOT treated as 'enforce': a typo in a var must not take
    // the connector offline. It is treated as 'observe' and the mismatch shows up in the
    // audit lines, which is the loud-but-serving failure we want here.
    tokenBinding: binding === 'enforce' ? 'enforce' : 'observe',
    allowedOauthClients: (env.MCP_ALLOWED_OAUTH_CLIENTS || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
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
