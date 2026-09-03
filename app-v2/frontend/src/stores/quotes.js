import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { withWrite } from '@/lib/supabaseWrite'
import { useAuthStore } from '@/stores/auth'

// D-08 (feedback from Lidia 20/07): quotes in the database + org-wide RLS (shared cross-CSM).
// Replaces QuotesView's localStorage. One-off import of the old local quotes at
// first load (keeps the localStorage copy so nothing is lost in the move to the database).
export const useQuoteStore = defineStore('quotes', () => {
  const quotes = ref([])
  const loading = ref(false)
  const lastError = ref(null)

  function dbToQuote(r) {
    return {
      id: r.id, clientId: r.client_id || '', title: r.title || '', company: r.company || '',
      amount: Number(r.amount) || 0, tax: Number(r.tax) || 0, status: r.status || 'draft',
      notes: r.notes || '', country: r.country || 'FR', currency: r.currency || '€',
      createdAt: (r.created_at || '').slice(0, 10)
    }
  }
  function quoteToDb(q) {
    const auth = useAuthStore()
    return {
      user_id: auth.user?.id || null,
      organization_id: auth.profile?.organization_id ?? null,
      client_id: q.clientId || null, title: q.title || '', company: q.company || '',
      amount: q.amount || 0, tax: q.tax || 0, status: q.status || 'draft',
      notes: q.notes || '', country: q.country || 'FR', currency: q.currency || '€'
    }
  }

  async function loadQuotes() {
    loading.value = true
    try {
      const { data, error } = await supabase.from('quotes').select('*').order('created_at', { ascending: false })
      if (error) { console.error('quotes.loadQuotes failed:', error.message); return }
      quotes.value = (data || []).map(dbToQuote)
      await migrateLocalOnce()
    } catch (e) {
      console.error('quotes.loadQuotes failed:', e.message || e)
    } finally {
      loading.value = false
    }
  }

  async function addQuote(quote) {
    lastError.value = null
    const { data, error } = await withWrite(() => supabase.from('quotes').insert([quoteToDb(quote)]).select().single(), { label: 'quotes.addQuote' })
    if (error) { lastError.value = error.message || String(error); console.error('quotes.addQuote failed:', lastError.value); return { error } }
    if (data) quotes.value.unshift(dbToQuote(data))
    return { success: true }
  }

  async function updateQuote(id, patch) {
    lastError.value = null
    const { error } = await withWrite(() => supabase.from('quotes').update(patch).eq('id', id), { label: 'quotes.updateQuote' })
    if (error) { lastError.value = error.message || String(error); console.error('quotes.updateQuote failed:', lastError.value); return { error } }
    const idx = quotes.value.findIndex(q => q.id === id)
    if (idx > -1) quotes.value[idx] = { ...quotes.value[idx], ...dbToQuote({ ...quoteToDb(quotes.value[idx]), ...patch, id, created_at: quotes.value[idx].createdAt }) }
    return { success: true }
  }

  async function deleteQuote(id) {
    lastError.value = null
    const { error } = await withWrite(() => supabase.from('quotes').delete().eq('id', id), { label: 'quotes.deleteQuote' })
    if (error) { lastError.value = error.message || String(error); console.error('quotes.deleteQuote failed:', lastError.value); return { error } }
    quotes.value = quotes.value.filter(q => q.id !== id)
    return { success: true }
  }

  function quotesForClient(clientId) {
    return quotes.value.filter(q => q.clientId === clientId)
  }

  // Signed revenue (계약 금액): sum of a client's WON quotes, excluding tax. Derived (never
  // stored) → always correct, self-correcting if a status changes. Distinct from ARR.
  function wonAmountForClient(clientId) {
    return quotes.value
      .filter(q => q.clientId === clientId && q.status === 'won')
      .reduce((s, q) => s + (Number(q.amount) || 0), 0)
  }

  // Auto KPIs batch (contract 22/07, R21): derived org-wide from the quotes in the database.
  // Total revenue = Σ pre-tax of WON quotes (same definition as the signed revenue per client).
  const wonTotal = computed(() =>
    quotes.value.filter(q => q.status === 'won').reduce((s, q) => s + (Number(q.amount) || 0), 0))
  // Pipeline = Σ pre-tax of open quotes (draft + sent)
  const pipelineTotal = computed(() =>
    quotes.value.filter(q => q.status === 'draft' || q.status === 'sent').reduce((s, q) => s + (Number(q.amount) || 0), 0))
  // Win rate = won / (won + lost) × 100 — no closed quote → null ("—")
  const winRate = computed(() => {
    const won = quotes.value.filter(q => q.status === 'won').length
    const lost = quotes.value.filter(q => q.status === 'lost').length
    if (!won && !lost) return null
    return parseFloat(((won / (won + lost)) * 100).toFixed(1))
  })

  // One-off import of the inherited localStorage quotes → database (once per device)
  async function migrateLocalOnce() {
    try {
      if (localStorage.getItem('scalyo_quotes_migrated_v1')) return
      const legacy = JSON.parse(localStorage.getItem('scalyo_quotes') || '[]')
      if (!Array.isArray(legacy) || !legacy.length) { localStorage.setItem('scalyo_quotes_migrated_v1', '1'); return }
      for (const q of legacy) {
        const { data } = await withWrite(() => supabase.from('quotes').insert([quoteToDb(q)]).select().single(), { label: 'quotes.migrateLocal' })
        if (data) quotes.value.unshift(dbToQuote(data))
      }
      localStorage.setItem('scalyo_quotes_migrated_v1', '1')
      console.log('[quotes] imported', legacy.length, 'legacy quote(s) from localStorage')
    } catch (e) { console.error('quotes.migrateLocalOnce failed:', e.message || e) }
  }

  return { quotes, loading, lastError, loadQuotes, addQuote, updateQuote, deleteQuote, quotesForClient, wonAmountForClient, wonTotal, pipelineTotal, winRate }
}, { persist: false })
