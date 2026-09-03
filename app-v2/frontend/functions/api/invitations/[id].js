// DELETE /api/invitations/[id] — Révoquer une invitation en attente + libérer le siège
// Contrat Chantier C (9/07) : le geste inverse du modèle GitHub (inviter = facturer).
// Fail-closed : si Stripe échoue, l'invitation reste pending (jamais de siège libéré
// non répercuté sur la facture). Retrait sans crédit, proration_behavior: 'none' (D3).
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

    // Invitation de la même org uniquement (sinon 404, pas de fuite d'existence)
    const invitation = await db.selectOne('invitations', 'id=eq.' + invId + '&organization_id=eq.' + membership.organization_id)
    if (!invitation) return errorResponse(404, 'Invitation not found')
    // §3 : révocable si pending (même expirée par date — lazy) ou expired.
    // accepted → le siège est occupé par un membre (passer par le retrait de membre) ; revoked → déjà fait.
    if (invitation.status !== 'pending' && invitation.status !== 'expired') {
      return errorResponse(409, 'Invitation cannot be revoked (status: ' + invitation.status + ')')
    }

    if (invitation.role !== 'viewer') {
      // Siège consommé : recalcul depuis la vérité (membres + pending non-viewer, celle-ci exclue)
      const org = await db.selectOne('organizations', 'id=eq.' + membership.organization_id)
      const members = await db.select('organization_members', 'organization_id=eq.' + membership.organization_id)
      const pending = await db.select('invitations', 'organization_id=eq.' + membership.organization_id + '&status=eq.pending')
      const committed = members.filter(m => m.role !== 'viewer').length
        + pending.filter(i => i.role !== 'viewer' && i.id !== invitation.id).length
      const newQty = Math.max(1, committed)
      // Stripe AVANT l'écriture DB (fail-closed) — pas de crédit, effet fin de mois
      if (org?.stripe_subscription_id) {
        const billed = await setSubscriptionQuantity(env.STRIPE_SECRET_KEY, org.stripe_subscription_id, newQty, 'none')
        // CF-502-MASQUE : Cloudflare remplace le corps des 5xx d'une Pages Function
        // par sa page HTML — le message n'atteignait jamais le client. 409 type.
        if (!billed.ok) return errorCode(409, 'billing_update_failed', { billing_error: billed.error })
      }
      await db.update('invitations', 'id=eq.' + invitation.id, { status: 'revoked' })
      await db.update('organizations', 'id=eq.' + membership.organization_id, { seats_paid: newQty })
    } else {
      // Viewer : aucun siège facturé, révocation simple
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
