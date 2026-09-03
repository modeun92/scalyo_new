// POST /api/invite — Send team invitation
// Modèle GitHub (chantier B) : inviter un rôle non-viewer accorde le siège ET le facture
// immédiatement (Stripe quantity +1, prorata). seats_paid = membres + invitations pending.
import { jsonResponse, errorResponse, errorCode } from './_utils/response.js'
import { createSupabaseClient, getAuthUser, getUserMembership } from './_utils/supabase.js'
import { setSubscriptionQuantity } from './_utils/stripe.js'
import { canPerform, canAddSeat, canAddViewer, getAvailableRolesForInvite, ORG_SETTINGS } from './_config/plans.config.js'
import { t } from './_i18n/messages.js'

// Echappement HTML des valeurs interpolees dans le corps de l'email
// (org.name est saisi par l'utilisateur).
const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const user = await getAuthUser(request, env)
    if (!user) return errorResponse(401, t('unauthorized'))
    const db = createSupabaseClient(env)
    const membership = await getUserMembership(db, user.id)
    if (!membership) return errorResponse(403, 'No organization')
    if (!canPerform(membership.role, 'canInvite')) return errorResponse(403, 'Permission denied')

    const body = await request.json()
    const { email, role = 'member' } = body
    if (!email || typeof email !== 'string') return errorResponse(400, 'Email required')
    const normalizedEmail = email.trim().toLowerCase()

    const org = await db.selectOne('organizations', 'id=eq.' + membership.organization_id)
    if (!org) return errorResponse(404, 'Organization not found')

    const allowedRoles = getAvailableRolesForInvite(org.plan)
    if (!allowedRoles.includes(role)) return errorResponse(400, 'Invalid role for this plan')

    // Sièges engagés = membres non-viewer + invitations pending non-viewer (modèle GitHub)
    const existing = await db.select('organization_members', 'organization_id=eq.' + org.id)
    const pending = await db.select('invitations', 'organization_id=eq.' + org.id + '&status=eq.pending')
    const seatsCommitted = existing.filter(m => m.role !== 'viewer').length
      + pending.filter(i => i.role !== 'viewer').length

    // Quota de sièges (plafond du forfait) pour les rôles consommant un siège
    if (role !== 'viewer') {
      if (!canAddSeat(org.plan, seatsCommitted)) return errorResponse(403, 'Seat limit reached')
    } else if (!canAddViewer(org.plan)) {
      return errorResponse(403, 'Viewers not available on this plan')
    }

    // Pas d'invitation pending déjà existante pour cet email
    if (pending.some(i => (i.email || '').toLowerCase() === normalizedEmail)) {
      return errorResponse(409, 'Invitation already pending for this email')
    }

    // Expiration explicite (config = source unique ; expires_at n'était pas posé → défaut DB 7j)
    const expiresAt = new Date(Date.now() + ORG_SETTINGS.invitationExpiryDays * 86400000).toISOString()

    // Créer l'invitation
    const [invitation] = await db.insert('invitations', {
      organization_id: org.id,
      invited_by: user.id,
      email: normalizedEmail,
      role: role,
      expires_at: expiresAt,
    })

    // Facturer le siège (rôle consommant un siège uniquement) — modèle GitHub.
    // Rollback de l'invitation si Stripe échoue, pour ne jamais accorder un siège non facturé.
    if (role !== 'viewer') {
      const newQty = seatsCommitted + 1
      if (org.stripe_subscription_id) {
        const billed = await setSubscriptionQuantity(env.STRIPE_SECRET_KEY, org.stripe_subscription_id, newQty, 'create_prorations')
        if (!billed.ok) {
          await db.remove('invitations', 'id=eq.' + invitation.id)
          // CF-502-MASQUE : le 502 etait avale par Cloudflare (page HTML), le
          // message applicatif n'arrivait jamais a l'ecran. 409 type.
          return errorCode(409, 'billing_failed', { billing_error: billed.error })
        }
      }
      // seats_paid = sièges engagés (même en essai sans abonnement : compteur des sièges commandés)
      await db.update('organizations', 'id=eq.' + org.id, { seats_paid: newQty })
    }

    // Envoi de l'email d'invitation via Resend.
    // email_sent est renvoyé au client : plus jamais de faux succès silencieux (INV-EMAIL).
    let emailSent = false
    if (env.RESEND_API_KEY) {
      try {
        // URL dérivée de l'origine de la requête : env-aware (préprod → preprod.scalyo.app)
        const joinUrl = new URL(request.url).origin + '/join?token=' + invitation.token
        // D4-1 : langue de l'email = locale de l'invitant (profiles.locale), repli 'fr'.
        let mailLang = 'fr'
        try {
          const inviterProfile = await db.selectOne('profiles', 'id=eq.' + user.id)
          if (inviterProfile && ['fr', 'en', 'ko'].includes(inviterProfile.locale)) mailLang = inviterProfile.locale
        } catch (_) { /* repli 'fr' */ }
        const mailResp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + env.RESEND_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Scalyo <noreply@scalyo.app>',
            to: [normalizedEmail],
            subject: t('invite_mail_subject', mailLang, { org: org.name }),
            html: [
              '<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:40px 20px">',
              '<h2 style="color:#111827;margin-bottom:8px">' + esc(t('invite_mail_heading', mailLang, { org: org.name })) + '</h2>',
              '<p style="color:#6b7280;font-size:15px;line-height:1.6">' + esc(t('invite_mail_body', mailLang, { role: t('invite_role_' + role, mailLang) })) + '</p>',
              '<a href="' + joinUrl + '" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:20px 0">' + esc(t('invite_mail_cta', mailLang)) + '</a>',
              '<p style="color:#9ca3af;font-size:13px">' + esc(t('invite_mail_expiry', mailLang, { days: ORG_SETTINGS.invitationExpiryDays })) + '</p>',
              '</div>'
            ].join('')
          })
        })
        emailSent = mailResp.ok
        if (!mailResp.ok) console.error('Invitation email error: Resend HTTP ' + mailResp.status)
      } catch (emailErr) {
        console.error('Invitation email error:', emailErr.message)
      }
    }

    return jsonResponse({ invitation: { id: invitation.id, email: invitation.email, role: invitation.role, token: invitation.token, status: invitation.status, expires_at: invitation.expires_at }, email_sent: emailSent })
  } catch (err) {
    return errorResponse(500, err.message || 'Server error')
  }
}
