// === SCALYO — Mistral AI Provider (EU-hosted, Paris) ===
// GDPR-compliant: no data leaves the EU.
// Switch: AI_PROVIDER=mistral + MISTRAL_API_KEY in Cloudflare.

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions'

export async function callMistral({ apiKey, model, maxTokens, systemPrompt, messages }) {
  const body = {
    model: model || 'mistral-large-latest',
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
  response = await fetch(MISTRAL_API_URL, {
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
    if (e.name === 'AbortError') throw new Error('MISTRAL_TIMEOUT')
    throw e
  }
  clearTimeout(timeout)

  if (!response.ok) {
    const err = await response.text()
    console.error('Mistral error:', response.status, err)
    throw new Error('MISTRAL_ERROR: ' + response.status)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}
