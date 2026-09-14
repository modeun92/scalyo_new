// Server-derived tenant context. Nothing here comes from tool arguments.
//
// MCP-TENANT-SERVER-SIDE (14/09/2026): userId comes from the verified token and
// organizationId/role come from profiles + organization_members read under the user's
// own RLS (see MCP-ORG-DETERMINISTIC below for which wins). A
// tool that accepted `organization_id` as an input would let an MCP caller simply ask for
// another company's portfolio — and an AI client will happily pass whatever a prompt tells
// it to. The tool schemas therefore contain no user_id, organization_id or role field, and
// this module is the only source of those values.
//
// Fails CLOSED: no membership row means no organization context, and every tool that
// needs one refuses. A user with no membership is not "a user who sees everything".
//
// MCP-ORG-DETERMINISTIC (14/09/2026): the organization comes from profiles.organization_id
// — the SAME canonical source the app uses (stores/auth.js fetchOrg reads
// profile.organization_id). It used to be `organization_members limit 1`, which is
// whichever row Postgres felt like returning: with two memberships the MCP answer for
// "my portfolio" could differ between two calls a second apart, and the user would have
// no way to tell which company they had just been shown. A membership row for that
// organization is then required as the second, independent check, and an inconsistency
// between the two sources is refused rather than resolved by guessing.

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
   * How organizationId was decided — 'profile' (canonical), 'sole_membership' (profile
   * had none and exactly one membership existed), or null when there is no context.
   * Audited, never returned to the model.
   */
  organizationSource: 'profile' | 'sole_membership' | null
  /** Per-request correlation id, present on every audit line and every safe error. */
  requestId: string
}

const MEMBER_COLUMNS = 'organization_id,role'
const MEMBER_ALLOWED_COLUMNS = ['user_id', 'organization_id', 'role', 'joined_at'] as const

const PROFILE_COLUMNS = 'id,organization_id,org_role'
const PROFILE_ALLOWED_COLUMNS = ['id', 'organization_id', 'org_role'] as const

/** Enough rows to SEE an ambiguity. Bounded, because this runs on every request. */
const MEMBERSHIP_SCAN_LIMIT = 20

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
  const [profiles, memberships] = await Promise.all([
    db.select<{ organization_id: string | null; org_role: string | null }>('profiles', {
      columns: PROFILE_COLUMNS,
      filters: [{ column: 'id', op: 'eq', value: user.userId }],
      allowedColumns: PROFILE_ALLOWED_COLUMNS,
      limit: 1,
    }),
    db.select<{ organization_id: string | null; role: string | null }>('organization_members', {
      columns: MEMBER_COLUMNS,
      // The filter is belt-and-braces: RLS on organization_members already restricts the
      // row set. Both layers, per the gap plan's defence-in-depth requirement.
      filters: [{ column: 'user_id', op: 'eq', value: user.userId }],
      allowedColumns: MEMBER_ALLOWED_COLUMNS,
      limit: MEMBERSHIP_SCAN_LIMIT,
    }),
  ])

  const canonicalOrgId = profiles[0]?.organization_id || null
  const base = {
    userId: user.userId,
    email: user.email,
    oauthClientId: user.oauthClientId,
    requestId,
  }

  if (canonicalOrgId) {
    const match = memberships.find((m) => m.organization_id === canonicalOrgId)
    if (!match && memberships.length > 0) {
      // profiles says one company, organization_members says only others. Resolving that
      // by picking either side would be inventing a tenant. Refuse.
      throw new ScalyoMcpError(
        'FORBIDDEN',
        'user ' + user.userId + ' profile organization ' + canonicalOrgId + ' has no matching membership row'
      )
    }
    return {
      ...base,
      organizationId: canonicalOrgId,
      // No membership row at all is the legacy owner shape (the row was never written);
      // profiles.org_role is then the app's own answer, so MCP gives the same one.
      role: normalizeRole(match?.role) ?? normalizeRole(profiles[0]?.org_role),
      organizationSource: 'profile',
    }
  }

  // No canonical organization on the profile. One membership is unambiguous; several are
  // not, and "the first row returned" is not an answer (MCP-ORG-DETERMINISTIC).
  if (memberships.length > 1) {
    throw new ScalyoMcpError(
      'FORBIDDEN',
      'user ' + user.userId + ' has ' + memberships.length + ' memberships and no profiles.organization_id'
    )
  }

  const sole = memberships[0]
  return {
    ...base,
    organizationId: sole?.organization_id || null,
    role: normalizeRole(sole?.role),
    organizationSource: sole?.organization_id ? 'sole_membership' : null,
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
