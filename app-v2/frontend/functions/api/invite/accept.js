// POST /api/invite/accept — Accept invitation and join org
// Lot 6 — CONTRAT INVITATIONS (31/08/2026) : D1① refus dur si l'email visé
// n'est pas celui du compte connecté ; D2① refus explicite si le compte
// appartient déjà à une autre organisation. JAMAIS d'écrasement implicite de
// profiles.organization_id (INVITE-ANY-USER).
// Erreurs typées par code machine : le front traduit (FR/EN/KO). Le message
// d'exception ne sort plus vers le client.
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

    // 1. Invitation — lue SANS filtre de statut, pour distinguer « introuvable »
    //    de « révoquée / déjà acceptée » (contrat §3 cas 8).
    const invitation = await db.selectOne('invitations', 'token=eq.' + tokenParam)
    if (!invitation) return errorCode(404, 'invitation_not_found')
    if (invitation.status !== 'pending') {
      return errorCode(404, 'invitation_not_valid', { status: invitation.status })
    }
    if (new Date(invitation.expires_at) < new Date()) {
      await db.update('invitations', 'id=eq.' + invitation.id, { status: 'expired' })
      return errorCode(410, 'invitation_expired')
    }

    // 2. Identité du porteur.
    const user = await getAuthUser(request, env)
    if (!user) return errorCode(401, 'auth_required')

    // 3. D1① — l'invitation est-elle adressée à CE compte ?
    //    Insensible à la casse et aux espaces : les invitations antérieures à
    //    invite.js L23 (trim+toLowerCase) ne sont pas garanties normalisées.
    const invitedEmail = normalizeEmail(invitation.email)
    const currentEmail = normalizeEmail(user.email)
    if (!invitedEmail || !currentEmail || invitedEmail !== currentEmail) {
      return errorCode(403, 'email_mismatch', {
        invited_email: invitation.email,
        current_email: user.email || null,
      })
    }

    // 4. Cas 5 — déjà membre de CETTE organisation : 200 idempotent.
    //    Aucune écriture destructrice, aucune violation de uq_org_member.
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

    // 5. D2① — appartenance à une AUTRE organisation : refus explicite, zéro écriture.
    //    uq_org_member porte sur le COUPLE (organization_id, user_id) : la base
    //    autorise l'appartenance multiple. Le mono-org n'existe que dans profiles.
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
      } catch (_) { /* nom indisponible : le refus reste valable */ }
      return errorCode(409, 'already_member_other_org', { current_organization: currentOrgName })
    }

    // 6. Insertion du membre. Le trigger enforce_org_seat_limit peut lever.
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
        // Course entre deux acceptations : traiter comme idempotent.
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

    // 7. Profil — POSE d'une organisation absente, jamais un écrasement :
    //    le cas « appartient ailleurs » est sorti à l'étape 5.
    await db.update('profiles', 'id=eq.' + user.id, {
      organization_id: invitation.organization_id,
      org_role: invitation.role || 'member',
    })

    // NB : pas de colonne activated_at sur invitations (baseline 20260624131657 L577)
    await db.update('invitations', 'id=eq.' + invitation.id, { status: 'accepted' })

    // Journal — ne doit jamais faire échouer une acceptation réussie.
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
