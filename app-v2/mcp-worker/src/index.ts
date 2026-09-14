// Scalyo MCP Worker — entry point.
//
// Routes:
//   GET  /health                                  liveness, no auth
//   GET  /.well-known/oauth-protected-resource    RFC 9728 discovery, no auth
//   *    /mcp                                     MCP Streamable HTTP, bearer required
//
// MCP-STATELESS (14/09/2026): createMcpHandler, not McpAgent. McpAgent is deprecated and
// feature-frozen as of Agents SDK v0.20.0, and it required a Durable Object per session.
// Nothing here needs per-session state — every tool call is a fresh authenticated read —
// so the stateless handler is both the supported path and one less billable primitive.
//
// The handler is built PER REQUEST because the authenticated Scalyo context is closed
// over by the tool implementations. createMcpHandler already demands a factory so that
// concurrent requests get isolated server instances; this extends the same isolation to
// the user identity, which is what makes it impossible for one request's tools to read
// another request's token.

import { McpServer } from '@modelcontextprotocol/server'
import { createMcpHandler } from 'agents/mcp/server'

import { getConfig, requireRateLimiters, type Env } from './env'
import { ScalyoMcpError, toSafePayload, internalDetailOf } from './errors'
import { audit } from './audit/mcp-audit'
import { extractBearerToken, verifyAccessToken } from './auth/verify-token'
import { resolveUserContext } from './auth/user-context'
import { protectedResourceMetadata, unauthorizedResponse, canonicalResourceUrl } from './auth/protected-resource'
import { createUserScopedSupabaseClient } from './supabase/user-client'
import { registerScalyoTools } from './tools/index'

const MCP_ROUTE = '/mcp'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

/** Client IP for the pre-auth limiter. Absent header means one shared bucket, which is stricter, not looser. */
function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || 'unknown'
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const requestId = crypto.randomUUID()
    const url = new URL(request.url)

    let config
    try {
      config = getConfig(env)
      requireRateLimiters(env)
    } catch (error) {
      // Misconfiguration must be loud and must not serve traffic (ENV-FALLBACK-PROD).
      audit('mcp.request.rejected', { requestId, errorCode: 'INTERNAL_ERROR', detail: internalDetailOf(error) })
      return jsonResponse({ error: 'INTERNAL_ERROR', message: 'Scalyo MCP is not configured.', requestId }, 500)
    }

    // ---------------------------------------------------------------- open routes

    if (url.pathname === '/health') {
      return jsonResponse({ status: 'ok', service: 'scalyo-mcp', environment: config.environment, enabled: config.enabled })
    }

    // Both spellings: RFC 9728 says the metadata for resource https://host/mcp lives at
    // /.well-known/oauth-protected-resource/mcp, but clients differ on whether they
    // append the resource path. Serving both removes a whole class of "connector cannot
    // authenticate" reports.
    if (url.pathname === '/.well-known/oauth-protected-resource' || url.pathname === '/.well-known/oauth-protected-resource/mcp') {
      return jsonResponse(protectedResourceMetadata(config, canonicalResourceUrl(config, request.url, MCP_ROUTE)))
    }

    if (url.pathname !== MCP_ROUTE) {
      return jsonResponse({ error: 'NOT_FOUND', message: 'Unknown path. The MCP endpoint is ' + MCP_ROUTE + '.', requestId }, 404)
    }

    // MCP-KILL-SWITCH: the incident lever. MCP can be taken offline without redeploying
    // the website, which is the whole point of it being a separate Worker.
    if (!config.enabled) {
      audit('mcp.request.rejected', { requestId, errorCode: 'FORBIDDEN', detail: 'MCP_ENABLED=off' })
      return jsonResponse({ error: 'FORBIDDEN', message: 'The Scalyo MCP endpoint is temporarily disabled.', requestId }, 503)
    }

    // ---------------------------------------------------------------- pre-auth limit

    // Applied BEFORE token verification: verifyAccessToken costs a round trip to Supabase
    // Auth, so an unauthenticated flood would otherwise be a free amplification attack
    // against our own auth service.
    const ipLimit = await env.MCP_RATE_LIMIT_IP.limit({ key: 'ip:' + clientIp(request) })
    if (!ipLimit.success) {
      audit('mcp.tool.rate_limited', { requestId, errorCode: 'RATE_LIMITED', detail: 'pre-auth ip limit' })
      return jsonResponse(toSafePayload(new ScalyoMcpError('RATE_LIMITED'), requestId), 429)
    }

    // ---------------------------------------------------------------- authenticate

    const token = extractBearerToken(request)
    if (!token) {
      // The 401 carries WWW-Authenticate with resource_metadata — this is the response
      // that starts the OAuth flow in Claude and ChatGPT, not an error to be avoided.
      audit('mcp.auth.failure', { requestId, errorCode: 'UNAUTHENTICATED', detail: 'no bearer token' })
      return unauthorizedResponse(config, request, toSafePayload(new ScalyoMcpError('UNAUTHENTICATED'), requestId))
    }

    let context
    let db
    try {
      const user = await verifyAccessToken(config, token, canonicalResourceUrl(config, request.url, MCP_ROUTE))

      // MCP-RESOURCE-BINDING: in 'observe' the request is served, but the verdict is on
      // the record. These lines are the evidence for the flip to 'enforce' — they say
      // what a real ChatGPT and a real Claude token actually claim as their audience.
      audit('mcp.auth.binding', {
        requestId,
        userId: user.userId,
        oauthClientId: user.oauthClientId,
        mode: config.tokenBinding,
        bound: user.binding.bound,
        bindingReasons: user.binding.reasons,
        claimedAudience: user.binding.claimedAudience,
        // Whether the Supabase access-token hook is stamping ai_agent yet. Until this is
        // true in pre-prod, the RLS restrictions keyed on is_mcp_session() are inert.
        aiAgent: user.binding.aiAgentClaim,
      })

      const userLimit = await env.MCP_RATE_LIMIT_USER.limit({ key: 'user:' + user.userId })
      if (!userLimit.success) throw new ScalyoMcpError('RATE_LIMITED', 'user limit for ' + user.userId)

      db = createUserScopedSupabaseClient(config, token)
      context = await resolveUserContext(config, db, user, requestId)

      audit('mcp.auth.success', {
        requestId,
        userId: context.userId,
        organizationId: context.organizationId,
        role: context.role,
        oauthClientId: context.oauthClientId,
        detail: 'org source: ' + (context.organizationSource || 'none'),
      })
    } catch (error) {
      const known = error instanceof ScalyoMcpError ? error : new ScalyoMcpError('INTERNAL_ERROR')
      audit('mcp.auth.failure', { requestId, errorCode: known.code, detail: internalDetailOf(error) })
      if (known.code === 'UNAUTHENTICATED') {
        return unauthorizedResponse(config, request, toSafePayload(known, requestId))
      }
      return jsonResponse(toSafePayload(known, requestId), known.httpStatus)
    }

    // ---------------------------------------------------------------- serve MCP

    const handler = createMcpHandler(
      () => {
        const server = new McpServer({ name: 'scalyo', version: '1.0.0' })
        registerScalyoTools(server, { context, db, env, environment: config.environment })
        return server
      },
      {
        route: MCP_ROUTE,
        // ORIGIN-POLICY: browser Origin validation stays ON. MCP HTTP servers are required
        // to validate it, and `allowedOriginHostnames: "*"` would disable the handler's
        // rejection of malformed and opaque origins as well. Non-browser MCP clients send
        // no Origin header and are unaffected.
        allowedHostnames: ['mcp.scalyo.app', 'mcp-preprod.scalyo.app', 'localhost'],
        allowedOriginHostnames: ['claude.ai', 'chatgpt.com', 'localhost'],
      }
    )

    try {
      return await handler(request, env, ctx)
    } catch (error) {
      audit('mcp.request.rejected', {
        requestId,
        userId: context.userId,
        organizationId: context.organizationId,
        errorCode: 'INTERNAL_ERROR',
        detail: internalDetailOf(error),
      })
      return jsonResponse(toSafePayload(error, requestId), 500)
    }
  },
} satisfies ExportedHandler<Env>
