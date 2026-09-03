import { callAI } from '../_services/ai.service.js'
import { getCoachPrompt } from '../_prompts/coach.prompts.js'
import { buildRichContext, getUserIdFromJwt } from '../_services/context.service.js'
import { extractAuth } from '../_services/auth.service.js'

export async function handle(env, body, request) {
  const { token } = extractAuth(request)
  const userId = getUserIdFromJwt(token)
  // LYO-CONTEXT (D2) : source unique = le serveur. L'ancien `|| body.context` était
  // mort (askScalyoAI spread le contexte à la racine du body — body.context n'a
  // jamais existé) et ctx.summary n'était jamais vide. body.message est passé pour
  // le bloc COMPTE CITÉ (données réelles du compte nommé dans la question).
  const ctx = await buildRichContext(env, userId, token, body.message)
  const systemPrompt = getCoachPrompt(body.lang, ctx.summary)

  const messages = [
    ...(body.history || []).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: body.message },
  ]
  const response = await callAI(env, { systemPrompt, messages })
  return { response }
}
