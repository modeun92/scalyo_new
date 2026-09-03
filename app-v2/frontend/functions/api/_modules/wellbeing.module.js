import { callAI } from '../_services/ai.service.js'
import { getWellbeingPrompt } from '../_prompts/wellbeing.prompts.js'

export async function handle(env, body) {
  const ctx = body.context ? JSON.stringify(body.context) : ''

  const systemPrompt = getWellbeingPrompt(body.lang, ctx)

  const messages = [
    ...(body.history || []).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: body.message },
  ]

  const response = await callAI(env, { systemPrompt, messages })
  return { response }
}
