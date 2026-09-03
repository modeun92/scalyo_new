// === SCALYO — Helper centralise pour appels IA ===
// POST /api/ai avec auth Supabase automatique

import { supabase } from '@/lib/supabase'

const ENDPOINTS = {}
const AI_ENDPOINT = '/api/ai'

/**
 * Appelle le backend IA Scalyo
 * @param {Object} params
 * @param {string} params.module - Module IA
 * @param {string} params.message - Message utilisateur
 * @param {Array} [params.history] - Historique conversation [{role, content}]
 * @param {Object} [params.context] - Contexte additionnel
 * @param {string} [params.lang] - Langue (fr, en, ko)
 * @param {AbortSignal} [params.signal] - Signal pour annulation
 * @returns {Promise<Object>} Reponse IA
 */
export async function askScalyoAI({ module, message, history = [], context = {}, lang, signal }) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  if (!token) {
    throw new Error('NOT_AUTHENTICATED')
  }

  const body = {
    module,
    message,
    history,
    ...context,
  }
  if (lang) body.lang = lang

  const endpoint = ENDPOINTS[module] || AI_ENDPOINT

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      'Accept-Language': lang || navigator.language?.substring(0, 2) || 'fr',
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const error = new Error(errorData.error || 'AI_REQUEST_FAILED')
    error.status = response.status
    error.data = errorData
    throw error
  }

  return response.json()
}
