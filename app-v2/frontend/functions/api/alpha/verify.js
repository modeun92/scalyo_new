// POST /api/alpha/verify — Validate promo/alpha code against promo_codes table
// Returns 200 { valid: true, plan, maxSeats, validDays } or 403

import { jsonResponse, errorResponse } from '../_utils/response.js'
import { t } from '../_i18n/messages.js'

export async function onRequestPost(context) {
  const { request, env } = context

  const supabaseUrl = env.SUPABASE_URL
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    return errorResponse(503, t('alpha_not_configured', 'en'))
  }

  let body
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, t('invalid_request', 'en'))
  }

  const { code, lang = 'fr' } = body

  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    return errorResponse(400, t('alpha_code_required', lang))
  }

  const normalizedCode = code.trim().toUpperCase()

  try {
    const url = `${supabaseUrl}/rest/v1/promo_codes?code=eq.${encodeURIComponent(normalizedCode)}&status=eq.active&select=id,code,plan,max_seats,valid_days,status`

    const resp = await fetch(url, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Accept': 'application/json',
      },
    })

    if (!resp.ok) {
      return errorResponse(500, t('server_error', lang))
    }

    const rows = await resp.json()

    if (!rows || rows.length === 0) {
      return errorResponse(403, t('alpha_code_invalid', lang))
    }

    const promo = rows[0]

    return jsonResponse({
      valid: true,
      plan: promo.plan,
      maxSeats: promo.max_seats,
      validDays: promo.valid_days,
    })
  } catch {
    return errorResponse(500, t('server_error', lang))
  }
}
