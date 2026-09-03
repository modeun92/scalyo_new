import { callAI } from '../_services/ai.service.js'
import { getMatricePrompt } from '../_prompts/matrice.prompts.js'
import { buildRichContext, getUserIdFromJwt } from '../_services/context.service.js'
import { extractAuth } from '../_services/auth.service.js'

export async function handle(env, body, request) {
  const { token } = extractAuth(request)
  const userId = getUserIdFromJwt(token)
  const ctx = await buildRichContext(env, userId, token)
  const systemPrompt = getMatricePrompt(body.lang, ctx.summary)

  const messages = [
    ...(body.history || []).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: body.message || 'Analyse mes taches et priorise-les.' },
  ]
  const response = await callAI(env, { systemPrompt, messages })
  return { response }
}
