// DELETE /api/members/[id] — Retirer un membre de l'organisation
// SEAT-RM (02/09/2026) — la doctrine du Chantier C est portee ici : Stripe AVANT
// toute ecriture, fail-closed. Jamais de siege libere en base qui ne le soit pas
// sur la facture. Retrait sans credit, proration_behavior 'none' (effet a l'echeance).
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

    // Membre de la meme org uniquement (sinon 404, pas de fuite d'existence)
    const target = await db.selectOne('organization_members',
      'id=eq.' + encodeURIComponent(targetId) + '&organization_id=eq.' + membership.organization_id)
    if (!target) return errorCode(404, 'member_not_found')

    if (target.user_id === user.id) return errorCode(400, 'cannot_remove_self')
    if (target.role === 'owner') return errorCode(403, 'cannot_remove_owner')
    if (!isRoleAbove(membership.role, target.role) && membership.role !== 'owner') {
      return errorCode(403, 'insufficient_role')
    }

    // ---- Facturation AVANT ecriture (fail-closed, doctrine Chantier C) ----
    // Le role viewer ne consomme pas de siege : rien a decrementer.
    let newQty = null
    if (target.role !== 'viewer') {
      const org = await db.selectOne('organizations', 'id=eq.' + membership.organization_id)
      const members = await db.select('organization_members', 'organization_id=eq.' + membership.organization_id)
      const pending = await db.select('invitations',
        'organization_id=eq.' + membership.organization_id + '&status=eq.pending')
      // La cible est encore en base a ce stade : on l'exclut du recompte, comme
      // invitations/[id].js exclut l'invitation qu'il revoque.
      const committed = members.filter(m => m.role !== 'viewer' && m.id !== target.id).length
        + pending.filter(i => i.role !== 'viewer').length
      newQty = Math.max(1, committed)

      if (org && org.stripe_subscription_id) {
        const billed = await setSubscriptionQuantity(
          env.STRIPE_SECRET_KEY, org.stripe_subscription_id, newQty, 'none')
        // CF-502-MASQUE : jamais de 5xx ici. Cloudflare remplacerait le corps par sa
        // page HTML et le client ne lirait rien. 409 type, traduit cote front.
        if (!billed.ok) return errorCode(409, 'billing_update_failed', { billing_error: billed.error })
      }
    }

    // ---- Ecritures, seulement apres l'accord de Stripe ----
    await db.remove('organization_members', 'id=eq.' + encodeURIComponent(targetId))
    await db.update('profiles', 'id=eq.' + target.user_id, { organization_id: null, org_role: 'member' })
    if (newQty !== null) {
      await db.update('organizations', 'id=eq.' + membership.organization_id, { seats_paid: newQty })
    }

    // Journal isole : un log qui echoue ne doit jamais faire croire que le retrait
    // a echoue — a ce stade le membre est deja parti (pattern accept.js, lot 6).
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
    // err.message ne sort plus vers le client (lot 6, accept.js).
    console.error('members/[id] server error:', (err && err.message) || err)
    return errorCode(500, 'server_error')
  }
}
