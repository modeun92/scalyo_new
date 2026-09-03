import { getConfig, getApiKey } from './_config/index.js'
import { isModuleAllowed } from './_config/plans.js'
import { validateAiRequest } from './_utils/validate.js'
import { jsonOk, jsonError } from './_utils/response.js'
import { extractLang, extractAuth, verifyJwt } from './_services/auth.service.js'
import { checkRateLimit } from './_services/rate-limit.service.js'
import { checkQuota, logUsage } from './_services/quota.service.js'
import { callAI } from './_services/ai.service.js'
import { getModule } from './_modules/index.js'

async function getUserPlan(env, userId, userJwt) {
  const config = getConfig(env)
  try {
    const url = config.supabaseUrl + '/rest/v1/profiles?id=eq.' + userId + '&select=plan'
    const res = await fetch(url, {
      headers: {
        'apikey': config.supabaseAnonKey,
        'Authorization': 'Bearer ' + userJwt,
      },
    })
    if (!res.ok) return 'starter'
    const rows = await res.json()
    return rows[0]?.plan || 'starter'
  } catch {
    return 'starter'
  }
}

export async function onRequestPost(context) {
  const { request, env } = context
  const lang = extractLang(request)

  try {
    // 1. Auth — verify JWT signature
    const { token } = extractAuth(request)
    const config = getConfig(env)
    const auth = await verifyJwt(token, config)
    if (!auth.valid) return jsonError('unauthorized', 401, lang)

    // 2. Rate limit — 10 req/min/user
    const rate = checkRateLimit(auth.userId)
    if (!rate.allowed) return jsonError('rate_limited', 429, lang)

    // 3. API key check
    if (!getApiKey(config)) return jsonError('ai_not_configured', 503, lang)

    // 4. Parse + validate + sanitize
    const body = await request.json()
    body.lang = body.lang || lang
    const validation = validateAiRequest(body)
    if (!validation.valid) return jsonError(validation.reason, 400, lang)

    // 5. Plan + module access check
    const planId = await getUserPlan(env, auth.userId, token)
    if (!isModuleAllowed(planId, body.module)) {
      return jsonError('module_not_allowed', 403, lang)
    }

    // 6. Quota check
    const quota = await checkQuota(env, auth.userId, token, planId, body.module)
    if (!quota.allowed) return jsonError('quota_exceeded', 429, lang)

    // 7. Module handler
    const handler = getModule(body.module)
    if (!handler && body.module === 'wellbeing') {
    // Inline fallback — Cloudflare Pages caches module graph
    const wbPrompt = 'Tu es Nova Sante, expert en sante mentale et physique dedie aux professionnels du Customer Success. Ton : Chaleureux, rassurant, professionnel. Domaines : stress, anxiete, burnout, sommeil, nutrition, equilibre vie pro/perso. REFUS ABSOLU sur business/client/sales/CS : redirige vers Coach IA. LIMITES : pas medecin, pas psychotherapeute. FORMAT : validation emotionnelle, 2-3 techniques concretes, question douce. CONFIDENTIALITE ABSOLUE.'
    const wbMsgs = [...(body.history || []).map(m => ({ role: m.role, content: m.content })), { role: 'user', content: body.message }]
    try {
      const wbResult = await callAI(env, { systemPrompt: wbPrompt + ' ' + (body.lang === 'en' ? 'Reply in English.' : body.lang === 'ko' ? '한국어로 답변하세요.' : 'Reponds en francais.'), messages: wbMsgs })
      return jsonOk({ response: wbResult })
    } catch (e) {
      console.error('wellbeing error:', e)
      return jsonError('ai_unavailable', 503, lang)
    }
  }
  if (!handler) return jsonError('module_not_found', 400, lang)

    // 8. Execute
    const result = await handler(env, body, request)

    // 9. Log usage (non-blocking)
    context.waitUntil(logUsage(env, auth.userId, token, body.module))

    return jsonOk(result)
  } catch (e) {
    console.error('AI error:', e)
    if (e.message === 'NO_API_KEY') return jsonError('ai_not_configured', 503, lang)
    return jsonError('ai_unavailable', 502, lang)
  }
}
