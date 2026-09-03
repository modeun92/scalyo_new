// === SCALYO — Composable IA reutilisable ===
// Gere l'etat reactif (loading, erreur, reponse) pour tous les modules IA

import { ref, readonly } from 'vue'
import { askScalyoAI } from '@/utils/askScalyoAI'

/**
 * Composable Vue 3 pour interactions IA
 * @param {string} moduleName - Nom du module IA (coach, nova, copil, etc.)
 * @returns {Object} Etat reactif + methodes
 */
export function useAI(moduleName) {
  const loading = ref(false)
  const error = ref(null)
  const response = ref(null)
  const history = ref([])

  let abortController = null

  /**
   * Envoie un message au module IA
   * @param {string} message - Message utilisateur
   * @param {Object} [options]
   * @param {Object} [options.context] - Donnees contextuelles (client, KPIs, etc.)
   * @param {string} [options.lang] - Langue forcee
   * @param {boolean} [options.keepHistory] - Garder l'historique (defaut: true pour coach, false sinon)
   * @returns {Promise<Object>} Reponse IA
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
