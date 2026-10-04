// DELETE /api/invitations/[id] — Revoke a pending invitation + free its reserved seat
// SEAT-AT-ACCEPT (03/10/2026): a pending invitation is not billed (the seat is billed on
// acceptance), so revoking one touches neither Stripe nor seats_paid — it only gives the
// reservation back to the plan ceiling, which /api/invite and /api/members recount live.
import { jsonResponse, errorResponse } from '../_utils/response.js'
import { createSupabaseClient, getAuthUser, getUserMembership, isReadOnlyMembership } from '../_utils/supabase.js'
import { canPerform } from '../_config/plans.config.js'

export async function onRequestDelete(context) {
  const { request, env, params } = context
  try {
    const invId = params.id
    if (!invId) return errorResponse(400, 'Invitation ID required')

    const user = await getAuthUser(request, env)
    if (!user) return errorResponse(401, 'Unauthorized')
    const db = createSupabaseClient(env)
    const membership = await getUserMembership(db, user.id)
    if (!membership) return errorResponse(403, 'No organization')
    // JOB-STATUS-READ (04/10/2026): a read-only account revokes nothing.
    if (isReadOnlyMembership(membership)) return errorResponse(403, 'read_only')
    if (!canPerform(membership.role, 'canRevoke')) return errorResponse(403, 'Permission denied')

    // Invitation of the same org only (otherwise 404, no existence leak)
    const invitation = await db.selectOne('invitations', 'id=eq.' + invId + '&organization_id=eq.' + membership.organization_id)
    if (!invitation) return errorResponse(404, 'Invitation not found')
    // §3: revocable if pending (even expired by date — lazy) or expired.
    // accepted → the seat is taken by a member (go through member removal); revoked → already done.
    if (invitation.status !== 'pending' && invitation.status !== 'expired') {
      return errorResponse(409, 'Invitation cannot be revoked (status: ' + invitation.status + ')')
    }

    await db.update('invitations', 'id=eq.' + invitation.id, { status: 'revoked' })

    await db.insert('activity_log', {
      organization_id: membership.organization_id,
      user_id: user.id,
      action: 'delete',
      entity_type: 'team',
      entity_id: invitation.id,
      changes: { invitation_revoked: { email: invitation.email, role: invitation.role } },
    })

    return jsonResponse({ success: true })
  } catch (err) {
    return errorResponse(500, err.message || 'Server error')
  }
}
