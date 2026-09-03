// === SCALYO — Reusable AI composable ===
// Manages the reactive state (loading, error, response) for every AI module

import { ref, readonly } from 'vue'
import { askScalyoAI } from '@/utils/askScalyoAI'

/**
 * Vue 3 composable for AI interactions
 * @param {string} moduleName - Name of the AI module (coach, nova, copil, etc.)
 * @returns {Object} Reactive state + methods
 */
export function useAI(moduleName) {
  const loading = ref(false)
  const error = ref(null)
  const response = ref(null)
  const history = ref([])

  let abortController = null

  /**
   * Sends a message to the AI module
   * @param {string} message - User message
   * @param {Object} [options]
   * @param {Object} [options.context] - Contextual data (client, KPIs, etc.)
   * @param {string} [options.lang] - Forced language
   * @param {boolean} [options.keepHistory] - Keep the history (default: true for coach, false otherwise)
   * @returns {Promise<Object>} AI response
   */
  async function send(message, options = {}) {
    if (abortController) {
      abortController.abort()
    }
    abortController = new AbortController()

    loading.value = true
    error.value = null

    const keepHistory = options.keepHistory ?? moduleName === 'coach'

    try {
      const result = await askScalyoAI({
        module: moduleName,
        message,
        history: keepHistory ? history.value : [],
        context: options.context || {},
        lang: options.lang,
        signal: abortController.signal,
      })

      response.value = result

      if (keepHistory) {
        history.value.push(
          { role: 'user', content: message },
          { role: 'assistant', content: result.reply || result.content || JSON.stringify(result) },
        )
        if (history.value.length > 20) {
          history.value = history.value.slice(-20)
        }
      }

      return result
    } catch (e) {
      if (e.name === 'AbortError') return null
      error.value = e.message || 'Erreur IA'
      throw e
    } finally {
      loading.value = false
      abortController = null
    }
  }

  function cancel() {
    if (abortController) {
      abortController.abort()
      abortController = null
      loading.value = false
    }
  }

  function reset() {
    cancel()
    response.value = null
    error.value = null
    history.value = []
  }

  return {
    loading: readonly(loading),
    error: readonly(error),
    response: readonly(response),
    history: readonly(history),
    send,
    cancel,
    reset,
  }
}
