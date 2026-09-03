// GET /api/invite/verify?token=xxx — Public: verify invitation token
import { jsonResponse, errorResponse } from '../_utils/response.js'
import { createSupabaseClient } from '../_utils/supabase.js'

export async function onRequestGet(context) {
  const { request, env } = context
  try {
    const url = new URL(request.url)
    const token = url.searchParams.get('token')
    if (!token) return errorResponse(400, 'Token required')

    const db = createSupabaseClient(env)
    const invitation = await db.selectOne('invitations', 'token=eq.' + token + '&status=eq.pending')
    if (!invitation) return errorResponse(404, 'Invalid or expired invitation')

    // Check expiry
    if (new Date(invitation.expires_at) < new Date()) {
      await db.update('invitations', 'id=eq.' + invitation.id, { status: 'expired' })
      return errorResponse(410, 'Invitation expired')
    }

    const org = await db.selectOne('organizations', 'id=eq.' + invitation.organization_id)

    return jsonResponse({
      valid: true,
      organization: org ? org.name : 'Unknown',
      role: invitation.role,
      email: invitation.email,
    })
  } catch (err) {
    return errorResponse(500, err.message || 'Server error')
  }
}
