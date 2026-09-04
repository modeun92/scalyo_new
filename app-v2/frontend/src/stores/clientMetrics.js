import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { withWrite } from '@/lib/supabaseWrite'
import { useAuthStore } from '@/stores/auth'
import { KPI_CATALOG } from '@/config/kpis'

// Manual KPIs batch (contract approved 22/07): MONTHLY measurements entered per client
// for the catalog KPIs without an automatic source (source:'manual').
// 1 data point per (client, kpi, month) — re-entering the same month = correcting it (database upsert).
// Table client_metrics, org-wide RLS following the quotes model (FB-05: the whole team reads/writes).
// Consumed by: ClientModal (entry + history), DashboardView (org aggregate),
// MetricWizard (copil curves). Zero t() here (rule C2/C6) — the views localize.

const MANUAL_IDS = new Set(KPI_CATALOG.filter(k => k.source === 'manual').map(k => k.id))
const AGG = Object.fromEntries(KPI_CATALOG.filter(k => k.source === 'manual').map(k => [k.id, k.aggregation || 'avg']))

// 'YYYY-MM' (input type=month) → 'YYYY-MM-01' (period column, 1st of the month)
export function monthToPeriod(month) {
  return /^\d{4}-\d{2}$/.test(month || '') ? month + '-01' : null
}
export function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

export const useClientMetricsStore = defineStore('clientMetrics', () => {
  const rows = ref([])          // all the org's measurements (RLS select_org)
  const loaded = ref(false)
  const loading = ref(false)
  const lastError = ref(null)

  // Volume faible (saisie humaine mensuelle) → un seul chemin de chargement org-wide.
  async function loadAll(force = false) {
    if (loaded.value && !force) return
    loading.value = true
    try {
      const { data, error } = await supabase
        .from('client_metrics')
        .select('*')
        .order('period', { ascending: true })
      if (error) { console.error('clientMetrics.loadAll failed:', error.message); return }
      rows.value = data || []
      loaded.value = true
    } catch (e) {
      console.error('clientMetrics.loadAll failed:', e.message || e)
    } finally {
      loading.value = false
    }
  }

  // Series of a KPI for a client, sorted by ascending month (copil curves / record history)
  function seriesFor(clientId, kpiId) {
    return rows.value
      .filter(r => r.client_id === clientId && r.kpi_id === kpiId)
      .sort((a, b) => String(a.period).localeCompare(String(b.period)))
  }

  // KPIs tracked for a client: [{ kpiId, points[], last }] — points ascending, last = most recent
  function trackedFor(clientId) {
    const byKpi = {}
    for (const r of rows.value) {
      if (r.client_id !== clientId) continue
      ;(byKpi[r.kpi_id] ||= []).push(r)
    }
    return Object.entries(byKpi).map(([kpiId, points]) => {
      points.sort((a, b) => String(a.period).localeCompare(String(b.period)))
      return { kpiId, points, last: points[points.length - 1] }
    }).sort((a, b) => a.kpiId.localeCompare(b.kpiId))
  }

  // Org aggregate per manual KPI: last known value (period <= current month) per
  // client, then sum or avg according to the catalog. No client filled in → no key
  // (the dashboard renders "—"). Never an 'auto' key here (double-source guard).
  const orgAggregates = computed(() => {
    const cur = currentMonth() + '-01'
    const byKpi = {}
    for (const r of rows.value) {
      if (!MANUAL_IDS.has(r.kpi_id) || String(r.period) > cur) continue
      const m = (byKpi[r.kpi_id] ||= {})
      const prev = m[r.client_id]
      if (!prev || String(r.period) > String(prev.period)) m[r.client_id] = r
    }
    const out = {}
    for (const [kpiId, byClient] of Object.entries(byKpi)) {
      const vals = Object.values(byClient).map(r => Number(r.value)).filter(v => !Number.isNaN(v))
      if (!vals.length) continue
      const sum = vals.reduce((a, b) => a + b, 0)
      out[kpiId] = AGG[kpiId] === 'sum' ? sum : parseFloat((sum / vals.length).toFixed(2))
    }
    return out
  })

  // Entry / correction: upsert on (client, kpi, month). month = 'YYYY-MM'.
  async function upsertMetric({ clientId, kpiId, month, value }) {
    lastError.value = null
    const auth = useAuthStore()
    const period = monthToPeriod(month)
    const num = Number(value)
    if (!clientId || !MANUAL_IDS.has(kpiId)) return { error: 'invalid_kpi' }   // 'auto' ones are NEVER entered by hand
    if (!period || period > currentMonth() + '-01') return { error: 'invalid_month' }
    if (Number.isNaN(num)) return { error: 'invalid_value' }
    if (!auth.user?.id) return { error: 'not_authenticated' }
    const payload = {
      client_id: clientId,
      organization_id: auth.profile?.organization_id ?? null,
      user_id: auth.user.id,
      kpi_id: kpiId,
      period,
      value: num,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await withWrite(
      () => supabase.from('client_metrics')
        .upsert([payload], { onConflict: 'client_id,kpi_id,period' })
        .select().single(),
      { label: 'clientMetrics.upsertMetric' }
    )
    if (error) { lastError.value = error.message || String(error); return { error } }
    if (data) {
      const idx = rows.value.findIndex(r =>
        r.client_id === data.client_id && r.kpi_id === data.kpi_id && String(r.period) === String(data.period))
      if (idx > -1) rows.value.splice(idx, 1, data)
      else rows.value.push(data)
    }
    return { success: true }
  }

  async function deleteMetric(id) {
    const { error } = await withWrite(
      () => supabase.from('client_metrics').delete().eq('id', id),
      { label: 'clientMetrics.deleteMetric' }
    )
    if (error) { console.error('clientMetrics.deleteMetric failed:', error.message || error); return { error } }
    rows.value = rows.value.filter(r => r.id !== id)
    return { success: true }
  }

  return { rows, loaded, loading, lastError, loadAll, seriesFor, trackedFor, orgAggregates, upsertMetric, deleteMetric }
}, { persist: false })
