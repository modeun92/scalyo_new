// OAuth 2.0 Protected Resource Metadata (RFC 9728) + the 401 challenge.
//
// MCP-DISCOVERY (14/09/2026): this is what makes Scalyo installable as a connector rather
// than a token the user has to paste. Claude and ChatGPT both do the same dance:
//
//   1. POST /mcp with no credential
//   2. read the 401's WWW-Authenticate, follow resource_metadata
//   3. read authorization_servers from that document
//   4. discover Supabase's endpoints, register dynamically, run the OAuth flow
//   5. retry /mcp with the issued token
//
// Scalyo is the RESOURCE server only. Supabase is the AUTHORIZATION server — it owns the
// login, the consent screen, dynamic client registration and revocation. That is why this
// Worker has no /authorize route, no KV namespace and no workers-oauth-provider: building
// our own consent UI here would duplicate an OAuth 2.1 server Supabase already operates
// against the same user table.
//
// Omitting step 2 is the usual reason a hand-built MCP server "works with a pasted token"
// but cannot be installed as a connector.

import type { ScalyoMcpConfig } from '../env'

/** Supabase's issuer for OAuth-issued tokens: <project>.supabase.co/auth/v1 */
export function authorizationServerIssuer(config: ScalyoMcpConfig): string {
  return config.supabaseUrl + '/auth/v1'
}

export function protectedResourceMetadata(config: ScalyoMcpConfig, resourceUrl: string) {
  return {
    resource: resourceUrl,
    authorization_servers: [authorizationServerIssuer(config)],
    bearer_methods_supported: ['header'],
    scopes_supported: ['openid', 'email', 'profile'],
    resource_name: 'Scalyo',
    resource_documentation: 'https://scalyo.app',
  }
}

/**
 * The 401 every unauthenticated MCP request gets. The `resource_metadata` parameter is
 * the load-bearing part — without it a client cannot find the authorization server and
 * simply reports that the connector failed to authenticate.
 */
export function unauthorizedResponse(config: ScalyoMcpConfig, request: Request, body: unknown): Response {
  const metadataUrl = new URL('/.well-known/oauth-protected-resource', request.url).toString()
  return new Response(JSON.stringify(body), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate':
        'Bearer realm="Scalyo", resource_metadata="' + metadataUrl + '", error="invalid_token"',
      'Cache-Control': 'no-store',
    },
  })
}
