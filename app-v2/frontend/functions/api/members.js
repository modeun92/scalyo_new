// GET /api/members — List org members + pending invitations
import { jsonResponse, errorResponse } from './_utils/response.js'
import { createSupabaseClient, getAuthUser, getUserMembership } from './_utils/supabase.js'
import { canPerform } from './_config/plans.config.js'
import { t } from './_i18n/translate.js'

export async function onRequestGet(context) {
  const { request, env } = context
  try {
    const user = await getAuthUser(request, env)
    if (!user) return errorResponse(401, t('unauthorized'))
    const db = createSupabaseClient(env)
    const membership = await getUserMembership(db, user.id)
    if (!membership) return errorResponse(403, 'No organization')

    const orgId = membership.organization_id
    const org = await db.selectOne('organizations', 'id=eq.' + orgId)
    const members = await db.select('organization_members', 'organization_id=eq.' + orgId)
    const invitations = await db.select('invitations', 'organization_id=eq.' + orgId + '&status=eq.pending&order=created_at.desc')

    // GitHub model: a seat is committed as soon as the invitation is sent → members + pending invitations (non-viewer)
    const seatsUsed = members.filter(m => m.role !== 'viewer').length
      + invitations.filter(i => i.role !== 'viewer').length

    // P4: invitation tokens are only exposed to the roles allowed to invite (owner/admin) —
    // a member must not be able to copy a pending invitation link (seat hijacking).
    const safeInvitations = canPerform(membership.role, 'canInvite')
      ? invitations
      : invitations.map(({ token, ...inv }) => inv)

    return jsonResponse({
      organization: { id: org.id, name: org.name, plan: org.plan, seats_paid: org.seats_paid },
      members,
      invitations: safeInvitations,
      seats: { used: seatsUsed, paid: org.seats_paid }
    })
  } catch (err) {
    return errorResponse(500, err.message || 'Server error')
  }
}
