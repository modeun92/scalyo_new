// DELETE /api/members/[id] — Remove a member from the organization. [id] is the member's LOGIN id
// (STAGE2-WRITES, 04/10/2026): the organization_members row id it used to be goes with that table.
// SEAT-RM (02/09/2026) — the Workstream C doctrine applies here: Stripe BEFORE
// any write, fail-closed. Never a seat freed in the database that is not freed
// on the invoice. Removal without credit, proration_behavior 'none' (effect at renewal).
import { jsonResponse, errorCode } from '../_utils/response.js'
import { createSupabaseClient, getAuthUser, getUserMembership, isReadOnlyMembership } from '../_utils/supabase.js'
import { setSubscriptionQuantity } from '../_utils/stripe.js'
import { canPerform, isRoleAbove } from '../_config/plans.config.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
    // JOB-STATUS-READ (04/10/2026): a read-only account removes nobody.
    if (isReadOnlyMembership(membership)) return errorCode(403, 'read_only')
    if (!canPerform(membership.role, 'canRevoke')) return errorCode(403, 'permission_denied')

    // Member of the same org only (otherwise 404, no existence leak). Read from core_v2 like the
    // caller's own membership; a malformed id is a 404 too, not a database error.
    if (!UUID.test(targetId)) return errorCode(404, 'member_not_found')
    const targetMembership = await getUserMembership(db, targetId)
    if (!targetMembership || targetMembership.organization_id !== membership.organization_id) {
      return errorCode(404, 'member_not_found')
    }
    const target = { user_id: targetId, role: targetMembership.role }

    if (target.user_id === user.id) return errorCode(400, 'cannot_remove_self')
    if (target.role === 'owner') return errorCode(403, 'cannot_remove_owner')
    if (!isRoleAbove(membership.role, target.role) && membership.role !== 'owner') {
      return errorCode(403, 'insufficient_role')
    }

    // ---- Billing BEFORE the write (fail-closed, Workstream C doctrine) ----
    // The viewer role does not consume a seat: nothing to decrement.
    let newQty = null
    let org = null
    if (target.role !== 'viewer') {
      org = await db.selectOne('organizations', 'id=eq.' + membership.organization_id)
      // SEAT-AT-ACCEPT (03/10/2026): billed seats = non-viewer MEMBERS who have not left, an
      // INACTIVE one included (core_v2_billable_seats); a pending invitation is billed only once
      // accepted, so it is not counted here. The target is still in the database at this point:
      // one less than the count.
      const billable = await db.rpc('core_v2_billable_seats', { p_org: membership.organization_id })
      newQty = Math.max(1, Number(billable) - 1)

      if (org && org.stripe_subscription_id) {
        const billed = await setSubscriptionQuantity(
          env.STRIPE_SECRET_KEY, org.stripe_subscription_id, newQty, 'none')
        // CF-502-MASQUE: never a 5xx here. Cloudflare would replace the body with its
        // own HTML page and the client would read nothing. Typed as 409, translated on the front end.
        if (!billed.ok) return errorCode(409, 'billing_update_failed', { billing_error: billed.error })
      }
    }

    // ---- Writes, only after Stripe's agreement ----
    // STAGE2-WRITES (04/10/2026): ONE transaction (core_v2_remove_member, 20261004120000) — the
    // membership, the person's own organization back (OWN-ORG, 27/09/2026) and seats_paid. Three
    // round trips could stop between two of them and leave a removed member with no organization.
    // Stripe has already been decremented: if the database refuses, the invoice is put back to the
    // count that is really there, so a member who stayed is never left unbilled.
    let removed = null
    try {
      removed = await db.rpc('core_v2_remove_member', { p_org: membership.organization_id, p_user: target.user_id, p_seats_paid: newQty })
    } catch (removeErr) {
      console.error('members/[id] core_v2_remove_member:', (removeErr && removeErr.message) || removeErr)
    }
    if (!removed || removed.ok !== true) {
      if (newQty !== null && org && org.stripe_subscription_id) {
        try {
          const billable = await db.rpc('core_v2_billable_seats', { p_org: membership.organization_id })
          const back = await setSubscriptionQuantity(env.STRIPE_SECRET_KEY, org.stripe_subscription_id, Math.max(1, Number(billable)), 'none')
          if (!back.ok) console.error('members/[id] — Stripe NOT restored after a refused removal, org ' + membership.organization_id + ':', back.error)
        } catch (backErr) {
          console.error('members/[id] — Stripe restore:', (backErr && backErr.message) || backErr)
        }
      }
      if (removed && removed.code === 'not_found') return errorCode(404, 'member_not_found')
      return errorCode(500, 'server_error')
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
