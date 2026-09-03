import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { withWrite } from '@/lib/supabaseWrite'
import { useAuthStore } from '@/stores/auth'

// FB-03 v2 (feedback Lidia 20/07) : notes libres horodatées sur la fiche client
// (call reçu, échange, info à retenir). Table client_notes, RLS org-wide :
// tout CSM de l'équipe lit ET ajoute (continuité quand le CSM assigné est absent).
export const useClientNotesStore = defineStore('clientNotes', () => {
  // Cache par client : { [clientId]: Note[] }
  const byClient = ref({})
  const loading = ref(false)

  async function loadNotes(clientId) {
    if (!clientId) return
    loading.value = true
    try {
      const { data, error } = await supabase
        .from('client_notes')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) { console.error('clientNotes.loadNotes failed:', error.message); return }
      byClient.value = { ...byClient.value, [clientId]: data || [] }
    } catch (e) {
      console.error('clientNotes.loadNotes failed:', e.message || e)
    } finally {
      loading.value = false
    }
  }

  function notesFor(clientId) {
    return byClient.value[clientId] || []
  }

  async function addNote(clientId, { content, kind = 'note' }) {
    const auth = useAuthStore()
    const trimmed = (content || '').trim()
    if (!clientId || !trimmed) return { error: 'empty' }
    const author_id = auth.user?.id || null
    const organization_id = auth.profile?.organization_id ?? null
    if (!author_id) return { error: 'not_authenticated' }
    const payload = {
      client_id: clientId,
      organization_id,
      author_id,
      author_name: auth.fullName || auth.user?.email || '',
      kind: ['note', 'call', 'email', 'meeting'].includes(kind) ? kind : 'note',
      content: trimmed,
    }
    const { data, error } = await withWrite(
      () => supabase.from('client_notes').insert([payload]).select(),
      { label: 'clientNotes.addNote' }
    )
    if (error) { console.error('clientNotes.addNote failed:', error.message || error); return { error } }
    if (data && data.length) {
      const list = byClient.value[clientId] || []
      byClient.value = { ...byClient.value, [clientId]: [data[0], ...list] }
    }
    return { success: true }
  }

  async function deleteNote(clientId, noteId) {
    const { error } = await withWrite(
      () => supabase.from('client_notes').delete().eq('id', noteId),
      { label: 'clientNotes.deleteNote' }
    )
    if (error) { console.error('clientNotes.deleteNote failed:', error.message || error); return { error } }
    const list = (byClient.value[clientId] || []).filter(n => n.id !== noteId)
    byClient.value = { ...byClient.value, [clientId]: list }
    return { success: true }
  }

  return { byClient, loading, loadNotes, notesFor, addNote, deleteNote }
}, { persist: false })
