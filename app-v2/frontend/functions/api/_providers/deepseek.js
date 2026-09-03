// === SCALYO — DeepSeek AI Provider (fallback de secours UNIQUEMENT) ===
// ⚠️ NON hébergé UE. N'est appelé QUE si Mistral (principal, EU/RGPD) tombe en
// panne totale, et UNIQUEMENT avec un prompt anonymisé (voir _services/anonymize.js).
// Aucune donnée personnelle ne doit atteindre ce fournisseur. E5 : jamais nommé dans le front.
// API OpenAI-compatible.

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions'

export async function callDeepSeek({ apiKey, model, maxTokens, systemPrompt, messages }) {
  const body = {
    model: model || 'deepseek-chat',
    max_tokens: maxTokens || 2048,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25000)

  let response
  try {
    response = await fetch(DEEPSEEK_API_URL, {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify(body),
    })
  } catch (e) {
    clearTimeout(timeout)
    if (e.name === 'AbortError') throw new Error('DEEPSEEK_TIMEOUT')
    throw e
  }
  clearTimeout(timeout)

  if (!response.ok) {
    const err = await response.text()
    console.error('DeepSeek error:', response.status, err)
    throw new Error('DEEPSEEK_ERROR: ' + response.status)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}
