// POST /api/alpha/activate — Create org from promo code after registration
import { jsonResponse, errorResponse } from '../_utils/response.js'
import { createSupabaseClient } from '../_utils/supabase.js'
import { t } from '../_i18n/messages.js'
import { getPlan } from '../_config/plans.config.js'

export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const db = createSupabaseClient(env)
    const body = await request.json()
    const { code, userId, email, companyName, lang = 'fr' } = body

    if (!code || !userId) return errorResponse(400, t('invalid_request', lang))

    // Verify code is still active
    const normalizedCode = code.trim().toUpperCase()
    const promo = await db.selectOne('promo_codes', 'code=eq.' + encodeURIComponent(normalizedCode) + '&status=eq.active')
    if (!promo) return errorResponse(403, t('alpha_code_invalid', lang))

    // Get plan config
    const planConfig = getPlan(promo.plan)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + promo.valid_days * 24 * 60 * 60 * 1000)
    // Founding : les 10 premières entreprises sont marquées is_founding
    const foundingOrgs = await db.select('organizations', 'is_founding=eq.true')
    const isFounding = foundingOrgs.length < 10

    // Create organization
    const [org] = await db.insert('organizations', {
      name: companyName || email.split('@')[0],
      owner_id: userId,
      plan: promo.plan,
      seats_paid: promo.max_seats,
      max_clients: planConfig ? planConfig.maxClients : null,
      trial_ends_at: expiresAt.toISOString(),
      is_founding: isFounding,
    })

    // Create owner membership
    await db.insert('organization_members', {
      organization_id: org.id,
      user_id: userId,
      role: 'owner',
    })

    // Update profile
    await db.update('profiles', 'id=eq.' + userId, {
      organization_id: org.id,
      is_alpha_tester: true,
      org_role: 'owner',
    })

    // Mark promo code as used
    await db.update('promo_codes', 'id=eq.' + promo.id, {
      status: 'used',
      organization_id: org.id,
      activated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    })

    // Log activity
    await db.insert('activity_log', {
      organization_id: org.id,
      user_id: userId,
      action: 'create',
      entity_type: 'settingsOrg',
      entity_id: org.id,
      changes: { plan: { old: null, new: promo.plan }, source: { old: null, new: 'promo_code' } },
    })

    return jsonResponse({ success: true, organization_id: org.id, plan: promo.plan, expires_at: expiresAt.toISOString() })
  } catch (err) {
    return errorResponse(500, err.message || 'Server error')
  }
}
