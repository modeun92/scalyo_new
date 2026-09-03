import { callAI } from '../_services/ai.service.js'
import { getPlaybookPrompt } from '../_prompts/playbook.prompts.js'
import { buildRichContext, getUserIdFromJwt } from '../_services/context.service.js'
import { extractAuth } from '../_services/auth.service.js'

export async function handle(env, body, request) {
  const { token } = extractAuth(request)
  const userId = getUserIdFromJwt(token)
  const ctx = await buildRichContext(env, userId, token)
  const systemPrompt = getPlaybookPrompt(body.lang, ctx.summary)

  const messages = [
    ...(body.history || []).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: body.message || 'Suggere des playbooks.' },
  ]
  const response = await callAI(env, { systemPrompt, messages })
  return { response }
}
