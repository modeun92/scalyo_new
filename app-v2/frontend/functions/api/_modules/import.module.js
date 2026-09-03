import { callAI } from '../_services/ai.service.js'
import { getImportPrompt } from '../_prompts/import.prompts.js'

export async function handle(env, body) {
  const systemPrompt = getImportPrompt(body.lang)
  const userContent = body.data ? JSON.stringify({ action: body.action || 'analyze', data: body.data }) : body.message || 'Pas de donnees fournies'

  const messages = [
    ...(body.history || []).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userContent },
  ]

  const response = await callAI(env, { systemPrompt, messages })
  return { response }
}
