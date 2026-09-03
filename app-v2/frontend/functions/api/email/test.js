// === SCALYO — Resend key test on the SERVER side (CR-8: E-08) ===
// POST /api/email/test → { valid }
// The browser never calls api.resend.com any more: the key (supplied or stored)
// is tested here and appears in no response.

import { extractLang, extractAuth, verifyJwt } from '../_services/auth.service.js'
import { getConfig } from '../_config/index.js'
import { createSupabaseClient } from '../_utils/supabase.js'
import { decryptToken } from '../_config/crypto.js'
import { jsonOk, jsonError } from '../_utils/response.js'

const KEY_FORMAT = /^re_[A-Za-z0-9_-]{10,}$/

export async function onRequestPost(context) {
  const lang = extractLang(context.request)
  try {
    const config = getConfig(context.env)
    const { token } = extractAuth(context.request)
    const jwt = await verifyJwt(token, config)
    if (!jwt.valid) return jsonError('unauthorized', 401, lang)

    let body
    try { body = await context.request.json() } catch { body = {} }
    let key = (body.api_key || '').trim()

    if (key) {
      if (!KEY_FORMAT.test(key)) return jsonError('invalid_key_format', 400, lang)
    } else {
      // No key supplied: test the caller's stored key (owner)
      const db = createSupabaseClient(context.env)
      const row = await db.selectOne('org_email_config', 'owner_id=eq.' + jwt.userId + '&select=resend_api_key')
      if (!row) return jsonError('email_not_configured', 400, lang)
      key = await decryptToken(row.resend_api_key, context.env.ENCRYPTION_KEY)
      if (!key) return jsonError('email_not_configured', 400, lang)
    }

    const r = await fetch('https://api.resend.com/api-keys', {
      headers: { 'Authorization': 'Bearer ' + key },
    })
    return jsonOk({ valid: r.ok })
  } catch (err) {
    console.error('email/test crash:', err?.message || err)
    return jsonError('server_error', 500, lang)
  }
}
