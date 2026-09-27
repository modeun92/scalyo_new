// POST /api/invite/accept — Accept invitation and join org
// Lot 6 — INVITATIONS CONTRACT (31/08/2026): D1① hard refusal if the targeted email
// is not the one of the logged-in account; D2① explicit refusal if the account
// already belongs to another organization. NEVER an implicit overwrite of
// profiles.organization_id (INVITE-ANY-USER).
// Errors typed by machine code: the front end translates (FR/EN/KO). The exception
// message no longer reaches the client.
import { jsonResponse, errorCode } from '../_utils/response.js'
import { createSupabaseClient, getAuthUser } from '../_utils/supabase.js'

const normalizeEmail = (v) => String(v || '').trim().toLowerCase()

export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const body = await request.json().catch(() => ({}))
    const token = body && body.token
    if (!token || typeof token !== 'string') return errorCode(400, 'token_required')
    const tokenParam = encodeURIComponent(token)

    const db = createSupabaseClient(env)

    // 1. Invitation — read WITHOUT a status filter, to distinguish "not found"
    //    from "revoked / already accepted" (contract §3 case 8).
    const invitation = await db.selectOne('invitations', 'token=eq.' + tokenParam)
    if (!invitation) return errorCode(404, 'invitation_not_found')
    if (invitation.status !== 'pending') {
      return errorCode(404, 'invitation_not_valid', { status: invitation.status })
    }
    if (new Date(invitation.expires_at) < new Date()) {
      await db.update('invitations', 'id=eq.' + invitation.id, { status: 'expired' })
      return errorCode(410, 'invitation_expired')
    }

    // 2. Identity of the bearer.
    const user = await getAuthUser(request, env)
    if (!user) return errorCode(401, 'auth_required')

    // 3. D1① — is the invitation addressed to THIS account?
    //    Case- and whitespace-insensitive: invitations predating
    //    invite.js L23 (trim+toLowerCase) are not guaranteed to be normalized.
    const invitedEmail = normalizeEmail(invitation.email)
    const currentEmail = normalizeEmail(user.email)
    if (!invitedEmail || !currentEmail || invitedEmail !== currentEmail) {
      return errorCode(403, 'email_mismatch', {
        invited_email: invitation.email,
        current_email: user.email || null,
      })
    }

    // 4. Case 5 — already a member of THIS organization: idempotent 200.
    //    No destructive write, no uq_org_member violation.
    const existingHere = await db.selectOne(
      'organization_members',
      'organization_id=eq.' + invitation.organization_id + '&user_id=eq.' + user.id
    )
    if (existingHere) {
      await db.update('invitations', 'id=eq.' + invitation.id, { status: 'accepted' })
      return jsonResponse({
        success: true,
        already_member: true,
        organization_id: invitation.organization_id,
        role: existingHere.role,
      })
    }

    // 5–7. OWN-ORG (27/09/2026): every account has an organization of its own from signup, so
    //    "already in an organization" is now the normal case. switch_to_invited_organization
    //    (20260927130000) decides and writes in ONE transaction: an EMPTY own organization is
    //    deleted and the account joins this one; an own organization that holds anything, or
    //    membership of somebody else's, is refused with zero writes — never an implicit overwrite
    //    of profiles.organization_id (INVITE-ANY-USER). Done as separate REST calls, a seat-limit
    //    refusal after the release would have left the account with no organization at all.
    let switched
    try {
      switched = await db.rpc('switch_to_invited_organization', {
        p_user: user.id,
        p_org: invitation.organization_id,
        p_role: invitation.role || 'member',
      })
    } catch (switchErr) {
      const msg = String((switchErr && switchErr.message) || '')
      // The enforce_org_seat_limit trigger raises inside the call; everything rolled back.
      if (/SEAT_LIMIT_REACHED/i.test(msg) || /seat limit/i.test(msg)) {
        return errorCode(409, 'seat_limit_reached')
      }
      if (/uq_org_member/i.test(msg) || /duplicate key/i.test(msg)) {
        // Race between two acceptances: treat as idempotent.
        await db.update('invitations', 'id=eq.' + invitation.id, { status: 'accepted' })
        return jsonResponse({
          success: true,
          already_member: true,
          organization_id: invitation.organization_id,
          role: invitation.role,
        })
      }
      console.error('invite/accept — switch_to_invited_organization:', msg)
      return errorCode(500, 'server_error')
    }
    if (!switched || switched.ok !== true) {
      const code = (switched && switched.code) || 'server_error'
      if (code === 'already_member_other_org' || code === 'own_organization_not_empty') {
        return errorCode(409, code, {
          current_organization: (switched && switched.current_organization) || null,
          reason: (switched && switched.reason) || null,
        })
      }
      console.error('invite/accept — switch refused:', code)
      return errorCode(500, 'server_error')
    }

    // NB: there is no activated_at column on invitations (baseline 20260624131657 L577)
    await db.update('invitations', 'id=eq.' + invitation.id, { status: 'accepted' })

    // Log — must never make a successful acceptance fail.
    try {
      await db.insert('activity_log', {
        organization_id: invitation.organization_id,
        user_id: user.id,
        action: 'create',
        entity_type: 'team',
        entity_id: user.id,
        changes: {
          role: { old: null, new: invitation.role },
          email: { old: null, new: invitation.email },
        },
      })
    } catch (logErr) {
      console.error('invite/accept — activity_log:', (logErr && logErr.message) || logErr)
    }

    return jsonResponse({
      success: true,
      organization_id: invitation.organization_id,
      role: invitation.role,
    })
  } catch (err) {
    console.error('invite/accept — unexpected:', (err && err.message) || err)
    return errorCode(500, 'server_error')
  }
}
