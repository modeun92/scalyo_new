import { callAI } from '../_services/ai.service.js'
import { getNotifPrompt } from '../_prompts/notif.prompts.js'
import { buildRichContext, getUserIdFromJwt } from '../_services/context.service.js'
import { extractAuth } from '../_services/auth.service.js'

export async function handle(env, body, request) {
  const { token } = extractAuth(request)
  const userId = getUserIdFromJwt(token)
  const ctx = await buildRichContext(env, userId, token)
  const systemPrompt = getNotifPrompt(body.lang, ctx.summary)

  const messages = [
    ...(body.history || []).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: body.message || 'Enrichis mes alertes.' },
  ]
  const response = await callAI(env, { systemPrompt, messages })
  return { response }
}
