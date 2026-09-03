import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { withWrite } from '@/lib/supabaseWrite'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { healthStatus, toHealthNumber } from '@/lib/health'
import { useAuthStore } from './auth'

async function getCurrentUserId() {
  try { const { data: { user } } = await supabase.auth.getUser(); return user?.id } catch (err) { if (window.Sentry) window.Sentry.captureException(err); return null }
}

// CR-Portfolio : normalise l'array contacts (jsonb). Garantit exactement un
// is_primary dès qu'il y a ≥1 contact ; conserve les anciens formats {name,email,role}.
function normalizeContacts(list) {
  const arr = Array.isArray(list) ? list.filter(c => c && (c.name || '').trim()) : []
  const mapped = arr.map(c => ({
    name: (c.name || '').trim(),
    role: (c.role || '').trim(),
    email: (c.email || '').trim(),
    phone: (c.phone || '').trim(),
    is_primary: !!c.is_primary,
  }))
  if (mapped.length) {
    const firstPrimary = mapped.findIndex(c => c.is_primary)
    mapped.forEach((c, i) => { c.is_primary = i === (firstPrimary === -1 ? 0 : firstPrimary) })
  }
  return mapped
}

function primaryContact(c) {
  const list = Array.isArray(c.contacts) ? c.contacts : []
  return list.find(x => x.is_primary) || list[0] || null
}

const PIPELINE_STAGES = ['new', 'contacted', 'qualified', 'won', 'lost']

export const useClientStore = defineStore('clients', () => {
  const clients = ref([])
  const loading = ref(false)
  const lastError = ref(null)
  // HOTFIX CAP-1000 : total exact en base (count) + drapeau de troncature (garde-fou MAX_ROWS)
  const totalRows = ref(null)
  const truncated = ref(false)

  // HEALTH-SCALE (25/08) : seuils et statut effectif = lib/health (source unique, /10).
  // Conservé ici comme point d'accès store pour les consommateurs existants.
  function getEffectiveStatus(c) {
    return healthStatus(c?.health, c?.status)
  }

  // ─── Segmentation cycle de vie (D1/D2) ──────────────────────────────────────
  const isProspect = (c) => c.lifecycle === 'prospect'
  const clientsOnly = computed(() => clients.value.filter(c => c.lifecycle !== 'prospect'))
  const prospectsOnly = computed(() => clients.value.filter(c => c.lifecycle === 'prospect'))
  const clientsCount = computed(() => clientsOnly.value.length)
  const prospectsCount = computed(() => prospectsOnly.value.length)
  const pipelineByStage = computed(() => {
    const map = { new: [], contacted: [], qualified: [], won: [], lost: [] }
    for (const p of prospectsOnly.value) {
      const s = PIPELINE_STAGES.includes(p.pipeline_stage) ? p.pipeline_stage : 'new'
      map[s].push(p)
    }
    return map
  })

  // KPIs calculés sur les CLIENTS actifs uniquement (les prospects n'ont pas d'ARR réalisé)
  const totalArr = computed(() => clientsOnly.value.reduce((s, c) => s + (c.arr || 0), 0))
  const totalMrr = computed(() => clientsOnly.value.reduce((s, c) => s + (c.mrr || 0), 0))

  // Lot KPIs auto (contrat 22/07, R21) : dérivés des données réelles, jamais saisis.
  // Nouveaux clients sur la période glissante (suit le sélecteur 7/30/90 j du dashboard)
  function getNewClients(periodDays = 30) {
    const periodStart = new Date(Date.now() - periodDays * 86400000)
    return clientsOnly.value.filter(c => c.created_at && new Date(c.created_at) >= periodStart).length
  }

  // Charge par CSM : uniquement sur les clients ASSIGNÉS (csm_id posé, B-04).
  // Aucun client assigné → null (le dashboard rend « — », jamais un chiffre inventé).
  const csmLoadStats = computed(() => {
    const assigned = clientsOnly.value.filter(c => c.csmId)
    const csmCount = new Set(assigned.map(c => c.csmId)).size
    if (!csmCount) return { accountsPerCsm: null, arrPerCsm: null }
    return {
      accountsPerCsm: parseFloat((assigned.length / csmCount).toFixed(1)),
      arrPerCsm: Math.round(assigned.reduce((s, c) => s + (c.arr || 0), 0) / csmCount),
    }
  })
  const avgHealth = computed(() => {
    if (!clientsOnly.value.length) return 0
    return parseFloat((clientsOnly.value.reduce((s, c) => s + (c.health || 0), 0) / clientsOnly.value.length).toFixed(1))
  })
  const avgNps = computed(() => {
    if (!clientsOnly.value.length) return 0
    return Math.round(clientsOnly.value.reduce((s, c) => s + (c.nps || 0), 0) / clientsOnly.value.length)
  })

  // Real Churn Rate: clients lost in period / clients at start of period x 100
  function getChurnRate(periodDays = 30) {
    if (!clientsOnly.value.length) return 0
    const periodStart = new Date(Date.now() - periodDays * 86400000)
    const churnedInPeriod = clientsOnly.value.filter(c => c.churned_at && new Date(c.churned_at) >= periodStart).length
    const existedAtStart = clientsOnly.value.filter(c => new Date(c.created_at || 0) < periodStart).length
    if (existedAtStart <= 0) return 0
    return parseFloat(((churnedInPeriod / existedAtStart) * 100).toFixed(1))
  }

  // Real NRR: current ARR of beginning cohort / beginning ARR x 100
  function getNrr(beginningArr, periodDays = 30) {
    if (!beginningArr || beginningArr <= 0) return null
    const periodStart = new Date(Date.now() - periodDays * 86400000)
    const cohortCurrentArr = clientsOnly.value
      .filter(c => new Date(c.created_at || 0) < periodStart)
      .reduce((s, c) => s + (c.arr || 0), 0)
    return parseFloat(((cohortCurrentArr / beginningArr) * 100).toFixed(1))
  }

  // B-05 : renouvellements réels à 30 jours (renewal_date saisie sur la fiche client)
  // — un calcul de dates sur donnée réelle, jamais un chiffre inventé (R21)
  const renewalsNext30 = computed(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0)
    const limit = new Date(now.getTime() + 30 * 86400000)
    return clientsOnly.value.filter(c => {
      if (!c.renewalDate) return false
      const d = new Date(c.renewalDate)
      return !Number.isNaN(d.getTime()) && d >= now && d <= limit
    }).length
  })

  const criticalCount = computed(() => clientsOnly.value.filter(c => getEffectiveStatus(c) === 'critical').length)
  const watchCount = computed(() => clientsOnly.value.filter(c => getEffectiveStatus(c) === 'watch').length)
  const healthyCount = computed(() => clientsOnly.value.filter(c => getEffectiveStatus(c) === 'healthy').length)
  const arrAtRisk = computed(() => clientsOnly.value.filter(c => getEffectiveStatus(c) === 'critical').reduce((s, c) => s + (c.arr || 0), 0))
  const activeCount = computed(() => clientsOnly.value.filter(c => getEffectiveStatus(c) !== 'critical').length)

  async function loadClients() {
    loading.value = true; lastError.value = null
    try {
      // HOTFIX CAP-1000 (CL-1000) : pagination complète — PostgREST cape à 1000
      // lignes SANS erreur. Tri STABLE exigé (created_at desc, id desc : un
      // import batch partage le même created_at). count exact → compteurs vrais.
      const { rows, total, truncated: cut } = await fetchAllRows(() =>
        supabase.from('clients').select('*', { count: 'exact' })
          .order('created_at', { ascending: false }).order('id', { ascending: false })
      )
      // dédup par id (insert concurrent entre deux pages) + swap ATOMIQUE — jamais d'état partiel
      const seen = new Set()
      clients.value = rows.filter(r => !seen.has(r.id) && seen.add(r.id)).map(dbToClient)
      totalRows.value = total
      truncated.value = cut
      if (cut && window.Sentry) window.Sentry.captureMessage(`loadClients truncated: ${clients.value.length}/${total}`)
    } catch (err) { lastError.value = err.message || 'Failed to load'; if (window.Sentry) window.Sentry.captureException(err) } finally { loading.value = false }
  }
  async function addClient(client) {
    lastError.value = null
    try { const _row = await clientToDb(client); const { data, error } = await withWrite(() => supabase.from('clients').insert([_row]).select().single(), { label: 'clients.add' }); if (error) throw error; if (data) clients.value.unshift(dbToClient(data)); return data } catch (err) { lastError.value = err.message; if (window.Sentry) window.Sentry.captureException(err); return null }
  }
  async function updateClient(client) {
    lastError.value = null
    /* B-05b : merge local en app-shape — l'ancien dbToClient({...app}) perdait renewalDate/csmId jusqu'au reload */
    try { const _row = await clientToDb(client); const { error } = await withWrite(() => supabase.from('clients').update(_row).eq('id', client.id), { label: 'clients.update' }); if (error) throw error; const idx = clients.value.findIndex(c => c.id === client.id); if (idx > -1) clients.value[idx] = { ...clients.value[idx], ...client, contacts: normalizeContacts(client.contacts ?? clients.value[idx].contacts) } } catch (err) { lastError.value = err.message; if (window.Sentry) window.Sentry.captureException(err) }
  }
  async function deleteClient(id) {
    lastError.value = null
    try { const { error } = await withWrite(() => supabase.from('clients').delete().eq('id', id), { label: 'clients.delete' }); if (error) throw error; clients.value = clients.value.filter(c => c.id !== id) } catch (err) { lastError.value = err.message; if (window.Sentry) window.Sentry.captureException(err) }
  }
  async function resetAll() {
    lastError.value = null
    try { const { error } = await withWrite(() => supabase.from('clients').delete().neq('id', '00000000-0000-0000-0000-000000000000'), { label: 'clients.resetAll' }); if (error) throw error; clients.value = [] } catch (err) { lastError.value = err.message; if (window.Sentry) window.Sentry.captureException(err) }
  }

  function dbToClient(r) {
    // HEALTH-SCALE : un score 0 réel restait 5 avec `|| 5` (0 est falsy) ; null/''/invalide → 5 inchangé
    return { id: r.id, name: r.name, industry: r.industry || '', arr: r.arr || 0, mrr: r.mrr || 0, health: toHealthNumber(r.health) ?? 5, nps: r.nps || 0, status: r.status || 'healthy', csm: r.csm || '', csmId: r.csm_id || '', churn_risk: r.churn_risk || 0, renewalDate: r.renewal_date || '', contacts: normalizeContacts(r.contacts), logo: r.logo || '', notes: r.notes || '', lifecycle: r.lifecycle === 'prospect' ? 'prospect' : 'client', pipeline_stage: PIPELINE_STAGES.includes(r.pipeline_stage) ? r.pipeline_stage : null, created_at: r.created_at || null, churned_at: r.churned_at || null }
  }
  async function clientToDb(c) {
    const user_id = await getCurrentUserId()
    if (!user_id) throw new Error('User not authenticated')
    // CR-9 (B-19) : organization_id posé à l'insert/update — active clients_org_manage
    const organization_id = useAuthStore().profile?.organization_id ?? null
    let lifecycle = c.lifecycle === 'prospect' ? 'prospect' : 'client'
    let pipeline_stage = PIPELINE_STAGES.includes(c.pipeline_stage) ? c.pipeline_stage : null
    // D2 — conversion automatique : un prospect « Gagné » devient client
    if (lifecycle === 'prospect' && pipeline_stage === 'won') lifecycle = 'client'
    // un client n'a pas d'étape de pipeline
    if (lifecycle === 'client' && pipeline_stage !== 'won') pipeline_stage = null
    return { user_id, organization_id, name: c.name, industry: c.industry || '', arr: c.arr || 0, mrr: c.mrr || 0, health: toHealthNumber(c.health) ?? 5, nps: c.nps || 0, status: c.status || 'healthy', csm: c.csm || '', csm_id: c.csmId || null, churn_risk: c.churn_risk ?? c.churnRisk ?? 0, renewal_date: c.renewalDate || null, contacts: normalizeContacts(c.contacts), logo: c.logo || '', notes: c.notes || '', lifecycle, pipeline_stage, churned_at: c.churned_at || null, updated_at: new Date().toISOString() }
  }

  return {
    clients, loading, lastError, totalRows, truncated, totalArr, totalMrr, avgHealth, avgNps,
    renewalsNext30, getNewClients, csmLoadStats,
    criticalCount, watchCount, healthyCount, arrAtRisk, activeCount,
    isProspect, clientsOnly, prospectsOnly, clientsCount, prospectsCount, pipelineByStage, primaryContact,
    getEffectiveStatus, getChurnRate, getNrr,
    loadClients, addClient, updateClient, deleteClient, resetAll,
  }
})
