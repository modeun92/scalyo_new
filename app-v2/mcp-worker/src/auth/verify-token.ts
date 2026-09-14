// Bearer token extraction and validation.
//
// MCP-AUTH (14/09/2026): validation goes through Supabase Auth (/auth/v1/user), the same
// call functions/api/_services/auth.service.js verifyJwt() already makes. Local signature
// verification is deliberately NOT used: a locally-verified JWT still looks valid after
// the user has revoked the AI connection or been removed from the organization, and a
// revoked connection that keeps working is the single worst failure mode for a
// customer-facing AI integration. One network hop per request buys real revocation.
//
// The token may be either a normal Supabase session token or one issued by the Supabase
// OAuth 2.1 server to an MCP client. Both are standard Supabase JWTs, so both validate
// here and both carry the identity RLS needs.
//
// MCP-RESOURCE-BINDING (14/09/2026): /auth/v1/user proves "this is a live Scalyo user
// token". It does NOT prove "this token was issued for https://mcp.scalyo.app/mcp".
// Those are different guarantees, and without the second one a token minted for any
// other purpose in the same Supabase project is accepted by an endpoint reachable by an
// external AI client. checkTokenBinding() is that second guarantee: issuer, expiry,
// audience/resource (RFC 8707) and the OAuth-client allowlist.
//
// The binding decision is separated from the decision to REJECT precisely because it can
// be wrong in a way that takes every connector offline. config.tokenBinding chooses:
// 'observe' audits the verdict, 'enforce' acts on it. See env.ts.

import type { ScalyoMcpConfig } from '../env'
import { normalizeResourceUrl } from '../env'
import { ScalyoMcpError } from '../errors'

export interface VerifiedUser {
  userId: string
  email: string | null
  /** The OAuth client that was issued this token, when it came from the OAuth server. */
  oauthClientId: string | null
  /** The resource-binding verdict, always computed, acted on only in `enforce`. */
  binding: TokenBindingResult
}

/** Claims we read. Everything else in the JWT is deliberately ignored. */
export interface TokenClaims {
  iss?: unknown
  aud?: unknown
  exp?: unknown
  client_id?: unknown
  /** RFC 8707 resource indicator, when the authorization server echoes it into the token. */
  resource?: unknown
}

export interface TokenBindingResult {
  /** True when every applicable check passed. */
  bound: boolean
  /** Stable machine tokens, e.g. ['audience_mismatch']. Empty when bound. */
  reasons: string[]
  /** What the token claimed as its audience/resource, for the audit line. Never the token. */
  claimedAudience: string[]
}

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization') || ''
  // Case-insensitive scheme, exactly one space, non-empty credential.
  const match = /^Bearer[ ]+(.+)$/i.exec(header.trim())
  const token = match?.[1]?.trim()
  return token ? token : null
}

/**
 * Decodes the JWT payload without trusting it for authorization.
 *
 * MCP-CLAIM-UNTRUSTED: this is decode, not verify. These claims gate the binding checks
 * and fill audit lines; the identity always comes from /auth/v1/user, which is what makes
 * a forged payload here worthless. Never derive userId from this. A token that lies about
 * its audience only ever makes itself MORE likely to be rejected, never less.
 */
export function decodeTokenClaims(token: string): TokenClaims | null {
  try {
    const segment = token.split('.')[1]
    if (!segment) return null
    const json = atob(segment.replace(/-/g, '+').replace(/_/g, '/'))
    const payload = JSON.parse(json) as unknown
    return payload && typeof payload === 'object' ? (payload as TokenClaims) : null
  } catch {
    return null
  }
}

/** `aud` is a string or an array of strings; `resource` is a single URI. Both are candidates. */
function audienceValues(claims: TokenClaims): string[] {
  const out: string[] = []
  const aud = claims.aud
  if (typeof aud === 'string') out.push(aud)
  else if (Array.isArray(aud)) for (const v of aud) if (typeof v === 'string') out.push(v)
  if (typeof claims.resource === 'string') out.push(claims.resource)
  return out
}

/**
 * Is this token bound to the resource this Worker protects, and to a recognised client?
 *
 * `expectedResource` null means the resource identifier is not pinned (development), so
 * the audience check is skipped rather than guessed — pinning it to whatever hostname the
 * request happened to arrive on would make the check trivially satisfiable.
 */
export function checkTokenBinding(
  config: ScalyoMcpConfig,
  claims: TokenClaims | null,
  expectedResource: string | null,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): TokenBindingResult {
  const reasons: string[] = []

  if (!claims) {
    return { bound: false, reasons: ['unparseable_token'], claimedAudience: [] }
  }

  const expectedIssuer = config.supabaseUrl + '/auth/v1'
  if (typeof claims.iss !== 'string' || normalizeResourceUrl(claims.iss) !== normalizeResourceUrl(expectedIssuer)) {
    reasons.push('issuer_mismatch')
  }

  // Supabase already refuses an expired token at /auth/v1/user; this catches the case
  // where it is checked before that call and keeps the failure reason specific.
  if (typeof claims.exp === 'number' && claims.exp <= nowSeconds) {
    reasons.push('expired')
  }

  const claimedAudience = audienceValues(claims)
  if (expectedResource) {
    const wanted = normalizeResourceUrl(expectedResource)
    const matches = claimedAudience.some((value) => normalizeResourceUrl(value) === wanted)
    // A normal Scalyo website session token carries aud="authenticated" and lands here.
    // That is the whole point: it is a valid user token that was NOT issued for MCP.
    if (!matches) reasons.push('audience_mismatch')
  }

  if (config.allowedOauthClients.length > 0) {
    const clientId = typeof claims.client_id === 'string' ? claims.client_id : null
    if (!clientId || !config.allowedOauthClients.includes(clientId)) reasons.push('client_not_allowed')
  }

  return { bound: reasons.length === 0, reasons, claimedAudience }
}

export async function verifyAccessToken(
  config: ScalyoMcpConfig,
  token: string,
  expectedResource: string | null = config.resourceUrl
): Promise<VerifiedUser> {
  if (!token) throw new ScalyoMcpError('UNAUTHENTICATED', 'empty bearer token')

  const claims = decodeTokenClaims(token)
  const binding = checkTokenBinding(config, claims, expectedResource)

  // Enforced BEFORE the network hop: a wrong-audience token must not cost us a round trip
  // to Supabase Auth, or rejecting it becomes its own amplification vector.
  if (config.tokenBinding === 'enforce' && !binding.bound) {
    throw new ScalyoMcpError('UNAUTHENTICATED', 'token not bound to this resource: ' + binding.reasons.join(','))
  }

  let response: Response
  try {
    response = await fetch(config.supabaseUrl + '/auth/v1/user', {
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: 'Bearer ' + token,
      },
    })
  } catch (cause) {
    // Auth unreachable is NOT "invalid token" — failing closed here is right, but the
    // audit line must not claim the caller presented a bad credential.
    throw new ScalyoMcpError('UPSTREAM_UNAVAILABLE', 'auth/v1/user unreachable: ' + String(cause))
  }

  if (!response.ok) throw new ScalyoMcpError('UNAUTHENTICATED', 'auth/v1/user returned ' + response.status)

  const user = (await response.json()) as { id?: string; email?: string }
  if (!user?.id) throw new ScalyoMcpError('UNAUTHENTICATED', 'auth/v1/user returned no id')

  return {
    userId: user.id,
    email: user.email || null,
    oauthClientId: claims && typeof claims.client_id === 'string' ? claims.client_id : null,
    binding,
  }
}
