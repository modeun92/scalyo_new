import { getConfig, getApiKey } from '../_config/index.js'
import { callMistral } from '../_providers/mistral.js'
import { callDeepSeek } from '../_providers/deepseek.js'
import { anonymizeForFallback } from './anonymize.js'

// Switches to DeepSeek ONLY on a total Mistral outage:
// timeout, network error, or server 5xx. NOT on 429 (quota) nor any other 4xx.
function isMistralOutage(err) {
  const msg = err?.message || ''
  if (msg === 'MISTRAL_TIMEOUT') return true
  const m = msg.match(/^MISTRAL_ERROR:\s*(\d+)$/)
  if (m) return parseInt(m[1], 10) >= 500
  // Raw network error (fetch rejected without a status)
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
    // DeepSeek fallback: only if Mistral is fully down AND a key is configured.
    if (!config.deepseekApiKey || !isMistralOutage(err)) throw err
    console.warn('[ai] Mistral outage → DeepSeek fallback (anonymized prompt):', err.message)
    // GDPR: anonymization is mandatory before any send outside the EU.
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
