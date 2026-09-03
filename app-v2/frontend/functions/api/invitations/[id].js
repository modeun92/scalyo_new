// DELETE /api/invitations/[id] — Revoke a pending invitation + free the seat
// Workstream C contract (9/07): the inverse gesture of the GitHub model (invite = bill).
// Fail-closed: if Stripe fails, the invitation stays pending (never a freed seat
// that is not reflected on the invoice). Removal without credit, proration_behavior: 'none' (D3).
import { jsonResponse, errorResponse, errorCode } from '../_utils/response.js'
import { createSupabaseClient, getAuthUser, getUserMembership } from '../_utils/supabase.js'
import { setSubscriptionQuantity } from '../_utils/stripe.js'
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
    if (!canPerform(membership.role, 'canRevoke')) return errorResponse(403, 'Permission denied')

    // Invitation of the same org only (otherwise 404, no existence leak)
    const invitation = await db.selectOne('invitations', 'id=eq.' + invId + '&organization_id=eq.' + membership.organization_id)
    if (!invitation) return errorResponse(404, 'Invitation not found')
    // §3: revocable if pending (even expired by date — lazy) or expired.
    // accepted → the seat is taken by a member (go through member removal); revoked → already done.
    if (invitation.status !== 'pending' && invitation.status !== 'expired') {
      return errorResponse(409, 'Invitation cannot be revoked (status: ' + invitation.status + ')')
    }

    if (invitation.role !== 'viewer') {
      // Consumed seat: recomputed from the truth (members + non-viewer pending, this one excluded)
      const org = await db.selectOne('organizations', 'id=eq.' + membership.organization_id)
      const members = await db.select('organization_members', 'organization_id=eq.' + membership.organization_id)
      const pending = await db.select('invitations', 'organization_id=eq.' + membership.organization_id + '&status=eq.pending')
      const committed = members.filter(m => m.role !== 'viewer').length
        + pending.filter(i => i.role !== 'viewer' && i.id !== invitation.id).length
      const newQty = Math.max(1, committed)
      // Stripe BEFORE the DB write (fail-closed) — no credit, effect at end of month
      if (org?.stripe_subscription_id) {
        const billed = await setSubscriptionQuantity(env.STRIPE_SECRET_KEY, org.stripe_subscription_id, newQty, 'none')
        // CF-502-MASQUE: Cloudflare replaces the body of a Pages Function's 5xx
        // with its own HTML page — the message never reached the client. Typed as 409.
        if (!billed.ok) return errorCode(409, 'billing_update_failed', { billing_error: billed.error })
      }
      await db.update('invitations', 'id=eq.' + invitation.id, { status: 'revoked' })
      await db.update('organizations', 'id=eq.' + membership.organization_id, { seats_paid: newQty })
    } else {
      // Viewer: no billed seat, plain revocation
      await db.update('invitations', 'id=eq.' + invitation.id, { status: 'revoked' })
    }

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
