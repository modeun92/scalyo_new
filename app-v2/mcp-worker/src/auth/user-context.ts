// Server-derived tenant context. Nothing here comes from tool arguments.
//
// MCP-TENANT-SERVER-SIDE (14/09/2026): userId comes from the verified token and
// organizationId/role come from the database under the user's own RLS. A tool that accepted
// `organization_id` as an input would let an MCP caller simply ask for another company's
// portfolio — and an AI client will happily pass whatever a prompt tells it to. The tool schemas
// therefore contain no user_id, organization_id or role field, and this module is the only source
// of those values.
//
// Fails CLOSED: no organization means no organization context, and every tool that needs one
// refuses. A user with no organization is not "a user who sees everything".
//
// CORE-V2-ME (04/10/2026): the organization and the role come from core_v2_me() (20261004100000) —
// profiles and organization_members are being retired (stage 2), and the app reads the same function
// (stores/auth.js), so MCP and the screen cannot answer differently. organizationId is the OLD
// organization uuid, the one the kept tables (clients, tasks) and their RLS still hold.
//
// MCP-ORG-DETERMINISTIC (14/09/2026), now held by the schema: the context used to read
// `organization_members limit 1` — whichever row Postgres returned — so with two memberships "my
// portfolio" could answer for a different company between two calls; profiles.organization_id was
// then made the canonical source, cross-checked against the memberships, and any disagreement refused.
// In core_v2 a person works in ONE organization (uq_organization_worker_person), so there is nothing
// to choose between and nothing to refuse. A worker who has left (ENDED) gets no organization.

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
  /**
   * How organizationId was decided — 'core_v2' (core_v2_me), or null when there is no context.
   * Audited, never returned to the model.
   */
  organizationSource: 'core_v2' | null
  /** Per-request correlation id, present on every audit line and every safe error. */
  requestId: string
}

/** What resolveUserContext reads from core_v2_me(); the rest of its answer is not needed here. */
interface CoreV2Me {
  organization: { id: string | null } | null
  role: string | null
}

const KNOWN_ROLES: readonly string[] = ['owner', 'admin', 'member', 'viewer']

/** An unrecognised role string is treated as no role, never as a permissive default. */
function normalizeRole(value: unknown): ScalyoRole | null {
  return typeof value === 'string' && KNOWN_ROLES.includes(value) ? (value as ScalyoRole) : null
}

export async function resolveUserContext(
  _config: ScalyoMcpConfig,
  db: UserSupabaseClient,
  user: VerifiedUser,
  requestId: string
): Promise<ScalyoUserContext> {
  const me = await db.rpc<CoreV2Me | null>('core_v2_me')
  const organizationId = me?.organization?.id || null
  return {
    userId: user.userId,
    email: user.email,
    oauthClientId: user.oauthClientId,
    requestId,
    organizationId,
    role: organizationId ? normalizeRole(me?.role) : null,
    organizationSource: organizationId ? 'core_v2' : null,
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
