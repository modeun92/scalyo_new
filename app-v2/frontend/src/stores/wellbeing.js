import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { askScalyoAI } from '@/utils/askScalyoAI'

// ─── Wellbeing → NOVA panel only (OXYGEN Lot 3a, contract 28/07/2026) ───
// The check-in/entries panel (mood, score, load, weekEntries, saveEntry,
// micro-actions) is DEAD as of Lot 3a: replaced by the Oxygen check-in
// (stores/oxygenCheckins — a single system, zero duplication). The
// wellbeing_entries table is NEVER written to again; its fate (history,
// deprecation) = Lot 5 contract (Lyo).
// R21: the context sent to Nova no longer carries ANY invented value —
// the old defaults (mood 'normal', score 70, load 70) would have lied to
// Nova as soon as nothing fed them any more. Lyo will receive the real Oxygen
// context in Lot 5 (read-only).

export const useWellbeingStore = defineStore('wellbeing', () => {
  const authStore = useAuthStore()

  // --- State (Nova) ---
  const novaMessages = ref([])
  const novaLoading = ref(false)
  const loaded = ref(false)

  // --- Getters ---
  const userId = computed(() => authStore.user?.id)
  const lastSessionSummary = computed(() => {
    const assistantMsgs = novaMessages.value.filter(m => m.role === 'assistant')
    if (!assistantMsgs.length) return null
    const last = assistantMsgs[assistantMsgs.length - 1]
    return last.content.substring(0, 200)
  })

  // --- Nova Chat (persisted) ---
  async function loadNovaHistory() {
    if (!userId.value) return
    try {
      const { data, error } = await supabase
        .from('ai_messages')
        .select('id, role, content, created_at')
        .eq('user_id', userId.value)
        .eq('module', 'wellbeing')
        .order('created_at', { ascending: true })
        .limit(50)
      if (error) throw error
      novaMessages.value = (data || []).map(m => ({
        id: m.id, role: m.role, content: m.content
      }))
    } catch (e) { console.error('[Wellbeing] loadNovaHistory:', e) }
  }

  async function sendNova(message, lang) {
    if (!message?.trim() || novaLoading.value) return
    const userMsg = { id: Date.now(), role: 'user', content: message.trim() }
    novaMessages.value.push(userMsg)
    novaLoading.value = true

    // Persist user message
    try {
      await supabase.from('ai_messages').insert({
        user_id: userId.value, module: 'wellbeing',
        role: 'user', content: userMsg.content
      })
    } catch (e) { /* non-blocking */ }

    try {
      const result = await askScalyoAI({
        module: 'wellbeing',
        message: userMsg.content,
        // R21 (Lot 3a): no more invented mood/score/load — empty context
        // until the real Oxygen context is injected (Lot 5).
        context: {},
        history: novaMessages.value.slice(-10).map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant', content: m.content
        })),
        lang: lang || 'fr',
      })
      const reply = result.response || result.reply || result.content || ''
      const assistantMsg = { id: Date.now() + 1, role: 'assistant', content: reply }
      novaMessages.value.push(assistantMsg)

      // Persist assistant message
      try {
        await supabase.from('ai_messages').insert({
          user_id: userId.value, module: 'wellbeing',
          role: 'assistant', content: reply
        })
      } catch (e) { /* non-blocking */ }
    } catch {
      novaMessages.value.push({
        id: Date.now() + 1, role: 'assistant', content: '__error__'
      })
    }
    novaLoading.value = false
  }

  async function clearNovaHistory() {
    if (!userId.value) return
    try {
      const { error } = await supabase
        .from('ai_messages')
        .delete()
        .eq('user_id', userId.value)
        .eq('module', 'wellbeing')
      if (error) throw error
      novaMessages.value = []
    } catch (e) { console.error('[Wellbeing] clearHistory:', e) }
  }

  // --- Init ---
  async function init() {
    if (loaded.value) return
    await loadNovaHistory()
    loaded.value = true
  }

  return {
    novaMessages, novaLoading, loaded, lastSessionSummary,
    init, sendNova, loadNovaHistory, clearNovaHistory,
  }
})
