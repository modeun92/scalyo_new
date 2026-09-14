// Structured MCP audit events -> Workers Logs (observability is enabled in wrangler.jsonc).
//
// MCP-AUDIT (14/09/2026): one JSON line per event, never prose. These lines are the only
// evidence available after the fact that an external AI client did or did not read a
// given organization's data, and they are what the "forbidden cross-tenant attempts"
// alert counts.
//
// NEVER logged: the access token, any Authorization header, any row payload. An audit
// line records that 12 clients were returned, never which ones — a log pipeline is not
// an approved location for customer data (GDPR minimization, same rule as
// context.service.js D3).

export type McpAuditEvent =
  | 'mcp.auth.success'
  | 'mcp.auth.failure'
  | 'mcp.auth.binding'
  | 'mcp.tool.started'
  | 'mcp.tool.completed'
  | 'mcp.tool.denied'
  | 'mcp.tool.rate_limited'
  | 'mcp.request.rejected'

export interface McpAuditFields {
  requestId: string
  userId?: string | null
  organizationId?: string | null
  role?: string | null
  oauthClientId?: string | null
  tool?: string
  success?: boolean
  durationMs?: number
  resultCount?: number
  errorCode?: string
  /** Free-text detail for failures. Must already be safe to store. */
  detail?: string
  // --- mcp.auth.binding only (MCP-RESOURCE-BINDING). None of these is the token itself:
  // `claimedAudience` is the token's aud/resource claim, which is a public identifier of
  // THIS server, not a credential.
  mode?: string
  bound?: boolean
  bindingReasons?: string[]
  claimedAudience?: string[]
}

export function audit(event: McpAuditEvent, fields: McpAuditFields): void {
  // console.log is the Workers Logs ingestion path. JSON.stringify keeps the line
  // queryable in the dashboard instead of regex-parsed.
  console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...fields }))
}

export function now(): number {
  return Date.now()
}
