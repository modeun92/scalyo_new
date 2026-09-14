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

import type { ScalyoMcpConfig } from '../env'
import { ScalyoMcpError } from '../errors'

export interface VerifiedUser {
  userId: string
  email: string | null
  /** The OAuth client that was issued this token, when it came from the OAuth server. */
  oauthClientId: string | null
}

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization') || ''
  // Case-insensitive scheme, exactly one space, non-empty credential.
  const match = /^Bearer[ ]+(.+)$/i.exec(header.trim())
  const token = match?.[1]?.trim()
  return token ? token : null
}

/**
 * Reads the `client_id` claim without trusting it for authorization.
 *
 * MCP-CLAIM-UNTRUSTED: this is decode, not verify. The value is used for audit lines and
 * for the OAuth-client allowlist only, and only AFTER /auth/v1/user has confirmed the
 * token is genuine. Never derive userId from here — that is what the Supabase call is for.
 */
function decodeClientIdClaim(token: string): string | null {
  try {
    const segment = token.split('.')[1]
    if (!segment) return null
    const json = atob(segment.replace(/-/g, '+').replace(/_/g, '/'))
    const payload = JSON.parse(json) as { client_id?: unknown }
    return typeof payload.client_id === 'string' ? payload.client_id : null
  } catch {
    return null
  }
}

export async function verifyAccessToken(config: ScalyoMcpConfig, token: string): Promise<VerifiedUser> {
  if (!token) throw new ScalyoMcpError('UNAUTHENTICATED', 'empty bearer token')

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
    oauthClientId: decodeClientIdClaim(token),
  }
}
