// === SCALYO — Email Send via Resend (org-level config) ===
// POST /api/email
// Elite plan only. Key stored per-org in org_email_config (not env var).

import { getConfig } from './_config/index.js'
import { isModuleAllowed } from './_config/plans.js'
import { extractLang, extractAuth, verifyJwt } from './_services/auth.service.js'
import { createSupabaseClient } from './_utils/supabase.js'
import { decryptToken } from './_config/crypto.js'
import { jsonOk, jsonError } from './_utils/response.js'

export async function onRequestPost(context) {
  const config = getConfig(context.env)
  const lang = extractLang(context.request)

  try {
    const { token } = extractAuth(context.request)
    const jwt = await verifyJwt(token, config)
    if (!jwt.valid) return jsonError('unauthorized', 401, lang)

    // Check plan
    const profileResp = await fetch(
      config.supabaseUrl + '/rest/v1/profiles?id=eq.' + jwt.userId + '&select=plan',
      {
        headers: {
          'apikey': config.supabaseAnonKey,
          'Authorization': 'Bearer ' + token
        }
      }
    )
    const profiles = await profileResp.json()
    const planId = profiles[0]?.plan || 'starter'

    if (!isModuleAllowed(planId, 'email')) {
      return jsonError('module_not_allowed', 403, lang)
    }

    // CR-8 (C-04/C-05) : lecture de la config org côté SERVEUR (service_role).
    // Owner direct, sinon membre de l'org avec can_send_email=true → config de l'owner.
    const db = createSupabaseClient(context.env)
    let configRow = await db.selectOne(
      'org_email_config',
      'owner_id=eq.' + jwt.userId + '&select=resend_api_key,sender_domain,sender_name'
    )
    if (!configRow) {
      const callerProfile = await db.selectOne('profiles', 'id=eq.' + jwt.userId + '&select=organization_id')
      if (callerProfile?.organization_id) {
        const member = await db.selectOne(
          'organization_members',
          'organization_id=eq.' + callerProfile.organization_id + '&user_id=eq.' + jwt.userId + '&select=can_send_email'
        )
        if (member?.can_send_email) {
          const org = await db.selectOne('organizations', 'id=eq.' + callerProfile.organization_id + '&select=owner_id')
          if (org?.owner_id) {
            configRow = await db.selectOne(
              'org_email_config',
              'owner_id=eq.' + org.owner_id + '&select=resend_api_key,sender_domain,sender_name'
            )
          }
        }
      }
    }
    if (!configRow) {
      return jsonError('email_not_configured', 400, lang)
    }

    // Clé chiffrée AES-256-GCM en base (migration CR-8) — déchiffrement serveur uniquement
    const resendKey = await decryptToken(configRow.resend_api_key, context.env.ENCRYPTION_KEY)
    if (!resendKey) {
      console.error('email.js: decrypt failed (encryption_key_missing or invalid ciphertext)')
      return jsonError('email_not_configured', 400, lang)
    }

    // Parse request body
    let body
    try {
      body = await context.request.json()
    } catch {
      return jsonError('invalid_request', 400, lang)
    }

    const { to, subject, html, replyTo } = body
    if (!to || !subject || !html) {
      return jsonError('invalid_request', 400, lang)
    }

    // Build sender
    const senderName = configRow?.sender_name || ''
    const senderDomain = configRow?.sender_domain || ''
    let fromAddress = 'Scalyo <contact@scalyo.app>'
    if (senderDomain) {
      const localName = senderName || 'CS Team'
      fromAddress = localName + ' <noreply@' + senderDomain + '>'
    } else if (body.from_name) {
      fromAddress = body.from_name + ' via Scalyo <contact@scalyo.app>'
    }

    // Send via Resend
    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + resendKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        reply_to: replyTo || undefined,
      }),
    })

    if (!resendResp.ok) {
      const err = await resendResp.text()
      console.error('Resend error:', resendResp.status, err)
      return jsonError('email_send_failed', 502, lang)
    }

    const resendData = await resendResp.json()

    // Log in sent_emails
    context.waitUntil(
      fetch(config.supabaseUrl + '/rest/v1/sent_emails', {
        method: 'POST',
        headers: {
          'apikey': config.supabaseAnonKey,
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          user_id: jwt.userId,
          recipient: Array.isArray(to) ? to.join(', ') : to,
          subject,
          resend_id: resendData.id || null,
        }),
      })
    )

    return jsonOk({ sent: true, id: resendData.id })
  } catch (err) {
    console.error('email.js crash:', err?.message || err)
    return jsonError('server_error', 500, lang)
  }
}
