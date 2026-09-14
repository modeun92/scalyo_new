// Safe error mapping for MCP responses.
//
// MCP-ERR-OPAQUE (14/09/2026): the client on the other end of this Worker is an AI
// agent that will read, summarise and sometimes repeat whatever we return. A PostgREST
// error body names tables, columns and constraints; a stack trace names file paths.
// Neither may leave the Worker. The detail goes to the log with the requestId, the
// caller gets a category and that id.
//
// NOT_FOUND wording is deliberately ambiguous about existence: answering "no such
// client" for one UUID and "forbidden" for another turns get_client_overview into a
// cross-tenant existence oracle.

export type ScalyoErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_ARGUMENT'
  | 'RATE_LIMITED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INTERNAL_ERROR'

const SAFE_MESSAGE: Record<ScalyoErrorCode, string> = {
  UNAUTHENTICATED: 'Not signed in to Scalyo, or the access token has expired or been revoked.',
  FORBIDDEN: 'This Scalyo account is not allowed to perform that action.',
  NOT_FOUND: 'The requested record is not available to this account.',
  INVALID_ARGUMENT: 'The request arguments were rejected.',
  RATE_LIMITED: 'Too many Scalyo requests. Wait a minute and try again.',
  UPSTREAM_UNAVAILABLE: 'Scalyo could not reach its database. No data was returned; this is not an empty result.',
  INTERNAL_ERROR: 'Scalyo could not complete the request.',
}

const HTTP_STATUS: Record<ScalyoErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_ARGUMENT: 400,
  RATE_LIMITED: 429,
  UPSTREAM_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
}

export class ScalyoMcpError extends Error {
  readonly code: ScalyoErrorCode
  /** Never returned to the caller — logged against the requestId only. */
  readonly internalDetail: string | undefined

  constructor(code: ScalyoErrorCode, internalDetail?: string) {
    super(SAFE_MESSAGE[code])
    this.name = 'ScalyoMcpError'
    this.code = code
    this.internalDetail = internalDetail
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code]
  }
}

export function toSafePayload(error: unknown, requestId: string): { error: ScalyoErrorCode; message: string; requestId: string } {
  const known = error instanceof ScalyoMcpError ? error : new ScalyoMcpError('INTERNAL_ERROR')
  return { error: known.code, message: known.message, requestId }
}

/** Detail for the log. Truncated: an upstream body can be arbitrarily long. */
export function internalDetailOf(error: unknown): string {
  if (error instanceof ScalyoMcpError) return error.internalDetail ? error.internalDetail.slice(0, 1000) : error.code
  if (error instanceof Error) return (error.stack || error.message).slice(0, 1000)
  return String(error).slice(0, 1000)
}
