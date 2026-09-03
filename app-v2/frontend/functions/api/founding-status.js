// GET /api/founding-status — places founding restantes (sur 10)
import { jsonResponse, errorResponse } from './_utils/response.js'
import { createSupabaseClient } from './_utils/supabase.js'

const FOUNDING_TOTAL = 10

export async function onRequestGet(context) {
  const { env } = context
  try {
    const db = createSupabaseClient(env)
    const foundingOrgs = await db.select('organizations', 'is_founding=eq.true')
    const used = foundingOrgs.length
    const remaining = Math.max(0, FOUNDING_TOTAL - used)
    return jsonResponse({ used, total: FOUNDING_TOTAL, remaining })
  } catch (err) {
    return errorResponse(500, err.message || 'Server error')
  }
}