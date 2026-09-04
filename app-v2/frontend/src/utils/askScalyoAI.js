// === SCALYO — Centralized helper for AI calls ===
// POST /api/ai with automatic Supabase auth

import { supabase } from '@/lib/supabase'
import { i18n } from '@/i18n'
import { baseLanguage } from '@/i18n/regional'

const ENDPOINTS = {}
const AI_ENDPOINT = '/api/ai'

/**
 * Calls the Scalyo AI back end
 * @param {Object} params
 * @param {string} params.module - AI module
 * @param {string} params.message - User message
 * @param {Array} [params.history] - Conversation history [{role, content}]
 * @param {Object} [params.context] - Additional context
 * @param {string} [params.lang] - Locale, bare or regional ('fr', 'fr-CA'). Defaults to the app locale.
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
  // REGIONAL-I18N (04/09): callers pass the APP locale, which now carries a country ('fr-CA').
  // The two halves go to two different places, and mixing them up breaks one side or the other:
  //   · body.lang is the AI PROMPT language — ai.js compares it to 'en' / 'ko' literally, so a
  //     regional tag there would fall through to "Reponds en francais" for a UK user;
  //   · Accept-Language carries the FULL locale, because that is what the server renders its own
  //     error strings with (functions/api/_i18n/translate.js resolves 'en-GB' → the en-GB pack).
  // extractLang() on the server still reads this header with startsWith, so 'fr-CA' → 'fr' there.
  const appLocale = lang || i18n.global.locale.value || 'fr'
  body.lang = baseLanguage(appLocale)

  const endpoint = ENDPOINTS[module] || AI_ENDPOINT

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      'Accept-Language': appLocale,
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
