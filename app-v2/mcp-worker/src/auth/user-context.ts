// Server-derived tenant context. Nothing here comes from tool arguments.
//
// MCP-TENANT-SERVER-SIDE (14/09/2026): userId comes from the verified token and
// organizationId/role come from organization_members read under the user's own RLS. A
// tool that accepted `organization_id` as an input would let an MCP caller simply ask for
// another company's portfolio — and an AI client will happily pass whatever a prompt tells
// it to. The tool schemas therefore contain no user_id, organization_id or role field, and
// this module is the only source of those values.
//
// Fails CLOSED: no membership row means no organization context, and every tool that
// needs one refuses. A user with no membership is not "a user who sees everything".

import type { ScalyoMcpConfig } from '../env'
import { ScalyoMcpError } from '../errors'
import type { UserSupabaseClient } from '../supabase/user-client'
import type { VerifiedUser } from './verify-token'

export type ScalyoRole = 'owner' | 'admin' | 'member' | 'viewer'

export interface ScalyoUserContext {
  userId: string
  email: string | null
  organizationId: string | null
  role: ScalyoRole | null
  oauthClientId: string | null
  /** Per-request correlation id, present on every audit line and every safe error. */
  requestId: string
}

const MEMBER_COLUMNS = 'organization_id,role'
const MEMBER_ALLOWED_COLUMNS = ['user_id', 'organization_id', 'role', 'joined_at'] as const

const KNOWN_ROLES: readonly string[] = ['owner', 'admin', 'member', 'viewer']

export async function resolveUserContext(
  _config: ScalyoMcpConfig,
  db: UserSupabaseClient,
  user: VerifiedUser,
  requestId: string
): Promise<ScalyoUserContext> {
  const rows = await db.select<{ organization_id: string | null; role: string | null }>('organization_members', {
    columns: MEMBER_COLUMNS,
    // The filter is belt-and-braces: RLS on organization_members already restricts the
    // row set. Both layers, per the gap plan's defence-in-depth requirement.
    filters: [{ column: 'user_id', op: 'eq', value: user.userId }],
    allowedColumns: MEMBER_ALLOWED_COLUMNS,
    limit: 1,
  })

  const membership = rows[0]
  const rawRole = membership?.role
  // An unrecognised role string is treated as no role, not as a permissive default.
  const role = rawRole && KNOWN_ROLES.includes(rawRole) ? (rawRole as ScalyoRole) : null

  return {
    userId: user.userId,
    email: user.email,
    organizationId: membership?.organization_id || null,
    role,
    oauthClientId: user.oauthClientId,
    requestId,
  }
}

/**
 * Guard for tools that read organization-scoped data.
 *
 * Note this does NOT re-filter queries by organizationId — `clients` is org-wide SELECT
 * under RLS since FB-05 (migration 20260720230000) and RLS is the boundary. This guard
 * exists so a user with no membership gets a clean FORBIDDEN instead of a silently empty
 * portfolio that reads as "you have no clients".
 */
export function requireOrganization(context: ScalyoUserContext): string {
  if (!context.organizationId) {
    throw new ScalyoMcpError('FORBIDDEN', 'user ' + context.userId + ' has no organization membership')
  }
  return context.organizationId
}
