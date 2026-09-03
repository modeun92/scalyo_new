import { callAI } from '../_services/ai.service.js'
import { getCoachPrompt } from '../_prompts/coach.prompts.js'
import { buildRichContext, getUserIdFromJwt } from '../_services/context.service.js'
import { extractAuth } from '../_services/auth.service.js'

export async function handle(env, body, request) {
  const { token } = extractAuth(request)
  const userId = getUserIdFromJwt(token)
  // LYO-CONTEXT (D2): the single source is the server. The old `|| body.context` was
  // dead code (askScalyoAI spread the context at the root of the body — body.context
  // never existed) and ctx.summary was never empty. body.message is passed for
  // the CITED ACCOUNT block (real data of the account named in the question).
  const ctx = await buildRichContext(env, userId, token, body.message)
  const systemPrompt = getCoachPrompt(body.lang, ctx.summary)

  const messages = [
    ...(body.history || []).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: body.message },
  ]
  const response = await callAI(env, { systemPrompt, messages })
  return { response }
}
