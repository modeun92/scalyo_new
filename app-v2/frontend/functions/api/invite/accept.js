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

    // 5. D2① — membership of ANOTHER organization: explicit refusal, zero writes.
    //    uq_org_member covers the PAIR (organization_id, user_id): the database
    //    allows multiple memberships. Single-org only exists in profiles.
    const memberships = await db.select('organization_members', 'user_id=eq.' + user.id)
    const profile = await db.selectOne('profiles', 'id=eq.' + user.id)
    const currentOrgId =
      (profile && profile.organization_id) ||
      (Array.isArray(memberships) && memberships.length ? memberships[0].organization_id : null)
    if (currentOrgId) {
      let currentOrgName = null
      try {
        const currentOrg = await db.selectOne('organizations', 'id=eq.' + currentOrgId)
        currentOrgName = currentOrg ? currentOrg.name : null
      } catch (_) { /* name unavailable: the refusal still stands */ }
      return errorCode(409, 'already_member_other_org', { current_organization: currentOrgName })
    }

    // 6. Member insertion. The enforce_org_seat_limit trigger may raise.
    try {
      await db.insert('organization_members', {
        organization_id: invitation.organization_id,
        user_id: user.id,
        role: invitation.role,
      })
    } catch (insertErr) {
      const msg = String((insertErr && insertErr.message) || '')
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
      console.error('invite/accept — insert organization_members:', msg)
      return errorCode(500, 'server_error')
    }

    // 7. Profile — SETS a missing organization, never an overwrite:
    //    the "belongs elsewhere" case exited at step 5.
    await db.update('profiles', 'id=eq.' + user.id, {
      organization_id: invitation.organization_id,
      org_role: invitation.role || 'member',
    })

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
