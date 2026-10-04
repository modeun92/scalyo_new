// POST /api/invite/accept — Accept invitation and join org
// Lot 6 — INVITATIONS CONTRACT (31/08/2026): D1① hard refusal if the targeted email
// is not the one of the logged-in account; D2① explicit refusal if the account
// already belongs to another organization. NEVER an implicit overwrite of
// profiles.organization_id (INVITE-ANY-USER).
// Errors typed by machine code: the front end translates (FR/EN/KO). The exception
// message no longer reaches the client.
import { jsonResponse, errorCode } from '../_utils/response.js'
import { createSupabaseClient, getAuthUser, getUserMembership } from '../_utils/supabase.js'
import { setSubscriptionQuantity } from '../_utils/stripe.js'
import { canAddSeat } from '../_config/plans.config.js'

const normalizeEmail = (v) => String(v || '').trim().toLowerCase()

// STAGE2-WRITES (04/10/2026): both counts come from core_v2 (20261004120000). They differ on purpose:
// the plan ceiling counts the seats HELD (an INACTIVE worker holds none — JOB-STATUS), the invoice the
// members who have not left (an INACTIVE one is still billed, an open decision).
const billableSeats = async (db, orgId) => Number(await db.rpc('core_v2_billable_seats', { p_org: orgId }))
const heldSeats = async (db, orgId) => Number(await db.rpc('core_v2_seats_held', { p_org: orgId }))

// SEAT-AT-ACCEPT: sets the billed seats to the members as they are NOW, recounted rather than
// incremented or restored — two acceptances in the same second both read N members and both
// bill N+1, and only a recount after the inserts bills N+2. create_prorations both ways: a seat
// given back because the acceptance did not happen nets out the charge just made for it.
async function syncSeats(db, env, org) {
  const qty = Math.max(1, await billableSeats(db, org.id))
  if (org.stripe_subscription_id) {
    const billed = await setSubscriptionQuantity(env.STRIPE_SECRET_KEY, org.stripe_subscription_id, qty, 'create_prorations')
    if (!billed.ok) {
      console.error('invite/accept — SEAT-AT-ACCEPT sync failed, org ' + org.id + ' should bill ' + qty + ':', billed.error)
      return
    }
  }
  await db.update('organizations', 'id=eq.' + org.id, { seats_paid: qty })
}

export async function onRequestPost(context) {
  const { request, env } = context
  // SEAT-AT-ACCEPT: armed once a seat has been billed for this acceptance (step 5).
  let resyncSeats = async () => {}
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
    //    No destructive write, no uq_org_member violation. Membership read from core_v2.
    const current = await getUserMembership(db, user.id)
    const existingHere = current && current.organization_id === invitation.organization_id ? current : null
    if (existingHere) {
      await db.update('invitations', 'id=eq.' + invitation.id, { status: 'accepted' })
      return jsonResponse({
        success: true,
        already_member: true,
        organization_id: invitation.organization_id,
        role: existingHere.role,
      })
    }

    // 5. SEAT-AT-ACCEPT (03/10/2026): the seat is billed HERE, not when the invitation was sent.
    //    Stripe before the membership — never a member on an unbilled seat. seats_paid follows
    //    before the insert too: enforce_org_seat_limit fires on that insert and its body lives
    //    only in the dashboard, so it may be reading seats_paid. The plan ceiling is checked
    //    first, so a full team is refused without a charge to give back. SEAT-CEILING (03/10/2026):
    //    this count and the insert are two round trips apart, so two acceptances in the same second
    //    both pass it; trg_seat_ceiling (20261003110000) checks again inside the insert, with the
    //    organization row locked, and the loser gets 409 seat_limit_reached below.
    if ((invitation.role || 'member') !== 'viewer') {
      const org = await db.selectOne('organizations', 'id=eq.' + invitation.organization_id)
      if (!org) return errorCode(404, 'invitation_not_valid')
      if (!canAddSeat(org.plan, await heldSeats(db, org.id))) return errorCode(409, 'seat_limit_reached')
      const seats = await billableSeats(db, org.id)
      if (org.stripe_subscription_id) {
        const billed = await setSubscriptionQuantity(env.STRIPE_SECRET_KEY, org.stripe_subscription_id, seats + 1, 'create_prorations')
        // CF-502-MASQUE: typed as 409, never a 5xx whose body Cloudflare would replace.
        if (!billed.ok) return errorCode(409, 'billing_failed', { billing_error: billed.error })
      }
      // From here on every exit re-syncs, success or not: a recount gives the seat back when no
      // membership was made, and bills an overlapping acceptance when one was.
      resyncSeats = () => syncSeats(db, env, org)
        .catch(e => console.error('invite/accept — SEAT-AT-ACCEPT resync:', (e && e.message) || e))
      await db.update('organizations', 'id=eq.' + org.id, { seats_paid: seats + 1 })
    }

    // 6–7. OWN-ORG (27/09/2026): every account has an organization of its own from signup, so
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
      await resyncSeats()
      // The enforce_org_seat_limit trigger raises inside the call; everything rolled back.
      if (/SEAT_LIMIT_REACHED/i.test(msg) || /seat limit/i.test(msg)) {
        return errorCode(409, 'seat_limit_reached')
      }
      if (/uq_org_member/i.test(msg) || /duplicate key/i.test(msg)) {
        // Race between two acceptances: treat as idempotent. The winner's membership is in the
        // recount just made, so its seat stays billed.
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
      await resyncSeats()
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

    // Usually a no-op (setSubscriptionQuantity skips an unchanged quantity). The person is in
    // either way — a failure is logged and the next seat change bills the right number.
    await resyncSeats()

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
    await resyncSeats()
    return errorCode(500, 'server_error')
  }
}
