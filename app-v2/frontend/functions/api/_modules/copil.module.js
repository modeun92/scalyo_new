import { callAI } from '../_services/ai.service.js'
import { getCopilPrompt } from '../_prompts/copil.prompts.js'
import { buildRichContext, getUserIdFromJwt } from '../_services/context.service.js'
import { extractAuth } from '../_services/auth.service.js'

export async function handle(env, body, request) {
  const { token } = extractAuth(request)
  const userId = getUserIdFromJwt(token)
  const ctx = await buildRichContext(env, userId, token)
  const systemPrompt = getCopilPrompt(body.lang, ctx.summary)

  const messages = [
    ...(body.history || []).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: body.message || 'Genere un rapport COPIL.' },
  ]
  const response = await callAI(env, { systemPrompt, messages })
  return { response }
}
