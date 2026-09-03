import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

export const useAiHistoryStore = defineStore('aiHistory', () => {
  const conversations = ref([])
  const currentConversation = ref(null)

  async function loadConversations(module = 'dashboard') {
    const auth = useAuthStore()
    if (!auth.user?.id) return
    const { data, error } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('user_id', auth.user.id)
      .eq('module', module)
      .order('updated_at', { ascending: false })
    if (!error && data) conversations.value = data
  }

  async function saveConversation(id, messages) {
    const { error } = await supabase
      .from('ai_conversations')
      .update({ messages: JSON.stringify(messages), updated_at: new Date().toISOString() })
      .eq('id', id)
    if (!error) {
      const conv = conversations.value.find(c => c.id === id)
      if (conv) { conv.messages = messages; conv.updated_at = new Date().toISOString() }
    }
  }

  async function createConversation(module = 'dashboard') {
    const auth = useAuthStore()
    if (!auth.user?.id) return null
    const { data, error } = await supabase
      .from('ai_conversations')
      .insert({ user_id: auth.user.id, module, title: '', messages: [] })
      .select()
      .single()
    if (!error && data) {
      conversations.value.unshift(data)
      currentConversation.value = data
      return data
    }
    return null
  }

  async function deleteConversation(id) {
    const { error } = await supabase
      .from('ai_conversations')
      .delete()
      .eq('id', id)
    if (!error) {
      conversations.value = conversations.value.filter(c => c.id !== id)
      if (currentConversation.value?.id === id) currentConversation.value = null
    }
  }

  return { conversations, currentConversation, loadConversations, saveConversation, createConversation, deleteConversation }
})
