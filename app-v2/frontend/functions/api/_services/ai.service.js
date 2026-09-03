import { getConfig, getApiKey } from '../_config/index.js'
import { callMistral } from '../_providers/mistral.js'
import { callDeepSeek } from '../_providers/deepseek.js'
import { anonymizeForFallback } from './anonymize.js'

// Bascule DeepSeek UNIQUEMENT sur panne totale de Mistral :
// timeout, erreur réseau, ou 5xx serveur. PAS sur 429 (quota) ni autre 4xx.
function isMistralOutage(err) {
  const msg = err?.message || ''
  if (msg === 'MISTRAL_TIMEOUT') return true
  const m = msg.match(/^MISTRAL_ERROR:\s*(\d+)$/)
  if (m) return parseInt(m[1], 10) >= 500
  // Erreur réseau brute (fetch rejeté sans status)
  if (!msg.startsWith('MISTRAL_ERROR')) return true
  return false
}

export async function callAI(env, { systemPrompt, messages, maxTokens }) {
  const config = getConfig(env)
  const apiKey = getApiKey(config)
  if (!apiKey) throw new Error('NO_API_KEY')

  try {
    return await callMistral({
      apiKey,
      model: config.aiModel,
      maxTokens: maxTokens || config.maxTokens,
      systemPrompt,
      messages,
    })
  } catch (err) {
    // Fallback DeepSeek : seulement si Mistral est en panne totale ET clé configurée.
    if (!config.deepseekApiKey || !isMistralOutage(err)) throw err
    console.warn('[ai] Mistral outage → DeepSeek fallback (prompt anonymisé):', err.message)
    // RGPD : anonymisation obligatoire avant tout envoi hors UE.
    const safe = anonymizeForFallback({ systemPrompt, messages })
    return callDeepSeek({
      apiKey: config.deepseekApiKey,
      model: config.deepseekModel,
      maxTokens: maxTokens || config.maxTokens,
      systemPrompt: safe.systemPrompt,
      messages: safe.messages,
    })
  }
}
