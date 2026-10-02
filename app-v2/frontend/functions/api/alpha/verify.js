// POST /api/alpha/verify — Validate promo/alpha code against promo_codes table
// Returns 200 { valid: true, plan, maxSeats, validDays } or 403

import { jsonResponse, errorResponse } from '../_utils/response.js'
import { t } from '../_i18n/translate.js'

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
    // PROMO-STATUS (03/10/2026): "is this code still usable" is decided by ONE SQL function,
    // promo_code_lookup (20260927130000), which the signup redemption (redeem_promo_code) runs too.
    // This route used to filter the table itself — first on status=active, then on activated_at —
    // and the day the two tests differed, the screen accepted codes the signup then refused.
    const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/promo_code_lookup`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ p_code: normalizedCode }),
    })

    if (!resp.ok) {
      return errorResponse(500, t('server_error', lang))
    }

    const promo = await resp.json()

    if (!promo) {
      return errorResponse(403, t('alpha_code_invalid', lang))
    }

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
