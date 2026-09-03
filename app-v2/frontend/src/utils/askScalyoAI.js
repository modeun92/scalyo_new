// === SCALYO — Centralized helper for AI calls ===
// POST /api/ai with automatic Supabase auth

import { supabase } from '@/lib/supabase'

const ENDPOINTS = {}
const AI_ENDPOINT = '/api/ai'

/**
 * Calls the Scalyo AI back end
 * @param {Object} params
 * @param {string} params.module - AI module
 * @param {string} params.message - User message
 * @param {Array} [params.history] - Conversation history [{role, content}]
 * @param {Object} [params.context] - Additional context
 * @param {string} [params.lang] - Language (fr, en, ko)
 * @param {AbortSignal} [params.signal] - Signal for cancellation
 * @returns {Promise<Object>} AI response
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
