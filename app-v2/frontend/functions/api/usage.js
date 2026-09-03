import { getConfig } from './_config/index.js'
import { getPlan } from './_config/plans.js'
import { extractLang, extractAuth, verifyJwt } from './_services/auth.service.js'
import { jsonOk, jsonError } from './_utils/response.js'

export async function onRequestGet(context) {
  const config = getConfig(context.env)
  const lang = extractLang(context.request)
  const { token } = extractAuth(context.request)
  const jwt = await verifyJwt(token, config)
  if (!jwt.valid) return jsonError('unauthorized', 401, lang)

  const profileResp = await fetch(
    config.supabaseUrl + '/rest/v1/profiles?id=eq.' + jwt.userId + '&select=plan',
    { headers: { 'apikey': config.supabaseAnonKey, 'Authorization': 'Bearer ' + token } }
  )
  const profiles = await profileResp.json()
  const planId = profiles[0]?.plan || 'starter'
  const planConfig = getPlan(planId)

  const today = new Date().toISOString().split('T')[0]
  const usageResp = await fetch(
    config.supabaseUrl + '/rest/v1/ai_usage?user_id=eq.' + jwt.userId
      + '&created_at=gte.' + today + 'T00:00:00Z&select=module',
    { headers: { 'apikey': config.supabaseAnonKey, 'Authorization': 'Bearer ' + token } }
  )
  const rawUsage = await usageResp.json()
  const usageData = Array.isArray(rawUsage) ? rawUsage : []

  const counts = {}
  for (const msg of usageData) {
    counts[msg.module] = (counts[msg.module] || 0) + 1
  }

  const modules = {}
  for (const mod of planConfig.modules) {
    const raw = planConfig.quotas[mod]
    const unlimited = raw === -1 // enterprise (CR-2)
    const quota = unlimited ? null : (raw || 0)
    const used = counts[mod] || 0
    modules[mod] = { quota, used, remaining: unlimited ? null : Math.max(0, quota - used), unlimited }
  }

  return jsonOk({ plan: planId, modules })
}
