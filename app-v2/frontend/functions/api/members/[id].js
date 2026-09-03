// DELETE /api/members/[id] — Remove a member from the organization
// SEAT-RM (02/09/2026) — the Workstream C doctrine applies here: Stripe BEFORE
// any write, fail-closed. Never a seat freed in the database that is not freed
// on the invoice. Removal without credit, proration_behavior 'none' (effect at renewal).
import { jsonResponse, errorCode } from '../_utils/response.js'
import { createSupabaseClient, getAuthUser, getUserMembership } from '../_utils/supabase.js'
import { setSubscriptionQuantity } from '../_utils/stripe.js'
import { canPerform, isRoleAbove } from '../_config/plans.config.js'

export async function onRequestDelete(context) {
  const { request, env, params } = context
  try {
    const targetId = params.id
    if (!targetId) return errorCode(400, 'member_id_required')

    const user = await getAuthUser(request, env)
    if (!user) return errorCode(401, 'unauthorized')
    const db = createSupabaseClient(env)
    const membership = await getUserMembership(db, user.id)
    if (!membership) return errorCode(403, 'no_organization')
    if (!canPerform(membership.role, 'canRevoke')) return errorCode(403, 'permission_denied')

    // Member of the same org only (otherwise 404, no existence leak)
    const target = await db.selectOne('organization_members',
      'id=eq.' + encodeURIComponent(targetId) + '&organization_id=eq.' + membership.organization_id)
    if (!target) return errorCode(404, 'member_not_found')

    if (target.user_id === user.id) return errorCode(400, 'cannot_remove_self')
    if (target.role === 'owner') return errorCode(403, 'cannot_remove_owner')
    if (!isRoleAbove(membership.role, target.role) && membership.role !== 'owner') {
      return errorCode(403, 'insufficient_role')
    }

    // ---- Billing BEFORE the write (fail-closed, Workstream C doctrine) ----
    // The viewer role does not consume a seat: nothing to decrement.
    let newQty = null
    if (target.role !== 'viewer') {
      const org = await db.selectOne('organizations', 'id=eq.' + membership.organization_id)
      const members = await db.select('organization_members', 'organization_id=eq.' + membership.organization_id)
      const pending = await db.select('invitations',
        'organization_id=eq.' + membership.organization_id + '&status=eq.pending')
      // The target is still in the database at this point: we exclude it from the recount, just as
      // invitations/[id].js excludes the invitation it is revoking.
      const committed = members.filter(m => m.role !== 'viewer' && m.id !== target.id).length
        + pending.filter(i => i.role !== 'viewer').length
      newQty = Math.max(1, committed)

      if (org && org.stripe_subscription_id) {
        const billed = await setSubscriptionQuantity(
          env.STRIPE_SECRET_KEY, org.stripe_subscription_id, newQty, 'none')
        // CF-502-MASQUE: never a 5xx here. Cloudflare would replace the body with its
        // own HTML page and the client would read nothing. Typed as 409, translated on the front end.
        if (!billed.ok) return errorCode(409, 'billing_update_failed', { billing_error: billed.error })
      }
    }

    // ---- Writes, only after Stripe's agreement ----
    await db.remove('organization_members', 'id=eq.' + encodeURIComponent(targetId))
    await db.update('profiles', 'id=eq.' + target.user_id, { organization_id: null, org_role: 'member' })
    if (newQty !== null) {
      await db.update('organizations', 'id=eq.' + membership.organization_id, { seats_paid: newQty })
    }

    // Isolated log: a failing log must never suggest that the removal
    // failed — at this point the member is already gone (accept.js pattern, Lot 6).
    try {
      await db.insert('activity_log', {
        organization_id: membership.organization_id,
        user_id: user.id,
        action: 'delete',
        entity_type: 'team',
        entity_id: target.user_id,
        changes: { role: { old: target.role, new: null } },
      })
    } catch (logErr) {
      console.error('members/[id] activity_log:', (logErr && logErr.message) || logErr)
    }

    return jsonResponse({ success: true, seats_paid: newQty })
  } catch (err) {
    // err.message no longer reaches the client (Lot 6, accept.js).
    console.error('members/[id] server error:', (err && err.message) || err)
    return errorCode(500, 'server_error')
  }
}
