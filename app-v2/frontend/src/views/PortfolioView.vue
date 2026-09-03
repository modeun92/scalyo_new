<template>
  <div class="portfolio">
    <!-- B-12 : quota clients atteint -->
    <div v-if="quotaNotice" class="quota-notice" style="display:flex;align-items:center;gap:12px;padding:10px 14px;margin-bottom:12px;background:#fff4e5;border:1px solid #ffcc80;border-radius:8px;color:#8a5a00;font-size:0.9rem;">
      <span>{{ quotaNotice }}</span>
      <button type="button" @click="quotaNotice = ''" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#8a5a00;font-size:1rem;">✕</button>
    </div>

    <!-- HOTFIX CAP-1000 : garde-fou MAX_ROWS dépassé → la liste est partielle et on le DIT (jamais silencieux, R21) -->
    <div v-if="clients.truncated" class="quota-notice" style="display:flex;align-items:center;gap:12px;padding:10px 14px;margin-bottom:12px;background:#fff4e5;border:1px solid #ffcc80;border-radius:8px;color:#8a5a00;font-size:0.9rem;">
      <span>{{ t('port_partial_list', { loaded: clients.clients.length, total: clients.totalRows }) }}</span>
    </div>

    <!-- TEAM-METRICS (D3) : CSM inconnus à l'import → lignes importées NON assignées + remontée visible -->
    <div v-if="csmNotice" class="quota-notice" style="display:flex;align-items:center;gap:12px;padding:10px 14px;margin-bottom:12px;background:#fff4e5;border:1px solid #ffcc80;border-radius:8px;color:#8a5a00;font-size:0.9rem;">
      <span>{{ csmNotice }}</span>
      <button type="button" @click="csmNotice = ''" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#8a5a00;font-size:1rem;">✕</button>
    </div>

    <!-- IMPORT PANEL -->
    <div v-if="showImport && canImport" class="import-context">
      <span class="ic-label">{{ t('port_import_as') }}</span>
      <div class="ic-toggle">
        <button type="button" class="ic-btn" :class="{ active: importLifecycle === 'client' }" @click="importLifecycle = 'client'">{{ t('port_lifecycle_client') }}</button>
        <button type="button" class="ic-btn" :class="{ active: importLifecycle === 'prospect' }" @click="importLifecycle = 'prospect'">{{ t('port_lifecycle_prospect') }}</button>
      </div>
    </div>
    <StandardImport v-if="showImport && canImport" :fields="clientFields" :on-import="handleBulkImport" />

    <!-- HEADER -->
    <div class="port-header">
      <h1>💼 {{ t('port_title') }}</h1>
      <div class="port-actions">
        <button v-if="canImport" class="btn-outline" @click="toggleImport">{{ t('import_btn_clients') }}</button>
        <button class="btn-outline" @click="exportCsv">{{ t('port_export') }}</button>
        <div v-if="resetStep === 0">
          <button class="btn-danger-outline" @click="resetStep = 1">{{ t('port_reset_all') }}</button>
        </div>
        <div v-else-if="resetStep === 1" class="reset-confirm">
          <span class="reset-msg">{{ t('port_reset_step1') }}</span>
          <button class="btn-danger-outline" @click="resetStep = 2">{{ t('port_reset_confirm') }}</button>
          <button class="btn-outline" @click="resetStep = 0">{{ t('sm_reset_cancel') }}</button>
        </div>
        <div v-else-if="resetStep === 2" class="reset-confirm">
          <span class="reset-msg warn">{{ t('port_reset_step2') }}</span>
          <button class="btn-danger" @click="doResetAll">{{ t('port_reset_confirm') }}</button>
          <button class="btn-outline" @click="resetStep = 0">{{ t('sm_reset_cancel') }}</button>
        </div>
        <button class="btn-primary" @click="openCreate">{{ activeLifecycle === 'prospects' ? t('port_add_prospect') : t('port_add') }}</button>
      </div>
    </div>

    <!-- LIFECYCLE TABS -->
    <div class="lc-tabs">
      <button v-for="lt in lifecycleTabs" :key="lt.key" class="lc-tab" :class="{ active: activeLifecycle === lt.key }" @click="switchLifecycle(lt.key)">
        <span class="lc-tab-ico">{{ lt.icon }}</span>{{ t(lt.label) }} <span class="lc-tab-count">{{ lt.count }}</span>
      </button>
    </div>

    <!-- KPI CARDS -->
    <div v-if="activeLifecycle === 'clients'" class="port-kpis">
      <div class="pkpi"><span class="pkpi-icon">📊</span><div><span class="pkpi-value">{{ clients.clientsCount }}</span><span class="pkpi-label">{{ t('port_accounts') }}</span></div></div>
      <div class="pkpi"><span class="pkpi-icon">💰</span><div><span class="pkpi-value">{{ fmtCurrency(clients.totalArr, { compact: true }) }}</span><span class="pkpi-label">{{ t('port_arr_total') }}</span></div></div>
      <div class="pkpi"><span class="pkpi-icon">💚</span><div><span class="pkpi-value">{{ fmtHealth(clients.avgHealth, { average: true }) }}</span><span class="pkpi-label">{{ t('port_health_avg') }}</span></div></div>
      <div class="pkpi warn"><span class="pkpi-icon">🔴</span><div><span class="pkpi-value">{{ clients.criticalCount }}</span><span class="pkpi-label">{{ t('port_critical') }}</span></div></div>
    </div>
    <div v-else class="port-kpis">
      <div class="pkpi"><span class="pkpi-icon">🎯</span><div><span class="pkpi-value">{{ clients.prospectsCount }}</span><span class="pkpi-label">{{ t('port_lifecycle_prospects') }}</span></div></div>
      <div class="pkpi"><span class="pkpi-icon">✅</span><div><span class="pkpi-value">{{ clients.pipelineByStage.qualified.length }}</span><span class="pkpi-label">{{ t('port_stage_qualified') }}</span></div></div>
      <div class="pkpi"><span class="pkpi-icon">🏆</span><div><span class="pkpi-value">{{ clients.pipelineByStage.won.length }}</span><span class="pkpi-label">{{ t('port_stage_won') }}</span></div></div>
      <div class="pkpi"><span class="pkpi-icon">🌱</span><div><span class="pkpi-value">{{ clients.pipelineByStage.new.length }}</span><span class="pkpi-label">{{ t('port_stage_new') }}</span></div></div>
    </div>

    <!-- SEARCH & FILTERS -->
    <div class="port-toolbar">
      <div class="search-box">
        <span class="si">🔍</span>
        <input v-model="search" :placeholder="t('port_search')" />
      </div>
      <div class="filter-tabs">
        <button v-for="f in filterList" :key="f.key" class="ftab" :class="{ active: activeFilter === f.key }" @click="activeFilter = f.key">
          {{ t(f.label) }} <span class="fc">{{ f.count }}</span>
        </button>
      </div>
    </div>

    <!-- TABLE -->
    <PortfolioTable v-if="filtered.length" :clients="filtered" @edit="openEdit" @delete="doDelete" @open="openDetail" />

    <!-- EMPTY -->
    <EmptyState v-else icon="👥" title-key="empty_clients_title" desc-key="empty_clients_desc" cta-key="empty_clients_cta" :cta-action="openCreate" />

    <!-- SLIDE-OVER -->
    <PortfolioForm
      :open="slideOpen"
      :edit-id="editId"
      :form="form"
      :industries="industries"
      :members="team.assignableMembers"
      @close="slideOpen = false"
      @save="save"
    />
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useClientModalStore } from '@/stores/clientModal'
import { useI18n } from 'vue-i18n'
import { useClientStore } from '@/stores/clients'
import { useQuoteStore } from '@/stores/quotes'
import { useTeamStore } from '@/stores/team'
import { useAuthStore } from '@/stores/auth'
import { getMaxClients } from '@/config/plans.config.js'
import { isModuleAllowed } from '@/utils/planGating.js'
import PortfolioTable from '@/components/portfolio/PortfolioTable.vue'
import PortfolioForm from '@/components/portfolio/PortfolioForm.vue'
import { fmtCurrency, fmtHealth } from '@/lib/formatters'
import EmptyState from '@/components/EmptyState.vue'
import StandardImport from '@/components/import/StandardImport.vue'
import { clientFields } from '@/config/importFields.js'
import '@/assets/portfolio.css'

const { t } = useI18n({ useScope: 'global' })
const clientModal = useClientModalStore()
const clients = useClientStore()
const team = useTeamStore()
const auth = useAuthStore()
const route = useRoute()
const quoteStore = useQuoteStore()

// B-12 / GATE-01 : gating quota clients + import CSV (plan effectif jamais nul)
const canImport = computed(() => isModuleAllowed(auth.effectivePlan, 'import'))
const clientLimit = computed(() => getMaxClients(auth.effectivePlan))
const atClientLimit = computed(() => clientLimit.value !== null && clients.clientsCount >= clientLimit.value)
const quotaNotice = ref('')

const search = ref('')
const activeFilter = ref('all')
const activeLifecycle = ref('clients')
const slideOpen = ref(false)
const editId = ref(null)
const resetStep = ref(0)
const showImport = ref(false)
const importLifecycle = ref('client')

function toggleImport() {
  showImport.value = !showImport.value
  if (showImport.value) importLifecycle.value = activeLifecycle.value === 'prospects' ? 'prospect' : 'client'
}

// Bug import (21/07) : le quick-action « Import » du dashboard route ici avec ?import=1.
// L'ancien /app/import était redirigé vers le dashboard (lien mort). On ouvre le panneau
// d'import directement — si le plan l'autorise (canImport), sinon on reste sur le portfolio.
onMounted(() => {
  // CA signée (계약 금액) : charge les devis pour la somme des gagnés par client (PortfolioTable)
  quoteStore.loadQuotes()
  if (route.query.import && canImport.value) {
    showImport.value = true
    importLifecycle.value = activeLifecycle.value === 'prospects' ? 'prospect' : 'client'
  }
})

// Import contacts (bug import 21/07) : les colonnes contactName/email/phone d'une ligne
// deviennent l'interlocuteur principal du client (le modèle stocke un tableau contacts[]).
// name || email || phone garantit un `name` non vide → survit à normalizeContacts.
var rowContacts = function (row) {
  var name = (row.contactName || '').trim()
  var email = (row.email || '').trim()
  var phone = (row.phone || '').trim()
  if (!name && !email && !phone) return []
  return [{ name: name || email || phone, role: '', email: email, phone: phone, is_primary: true }]
}

// TEAM-METRICS (D3, 29/08) : résolution nom CSM → csm_id à l'import — l'affectation clé
// sur l'id partout (Manager, Satisfaction, fiche) ; le texte seul rendait « — »/« Non assigné ».
// Match EXACT insensible casse/espaces sur les membres assignables (self inclus, G9-10) ;
// homonymes → JAMAIS de résolution au hasard ; inconnu → importé NON assigné + remontée (encart).
function normName(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ') }
function buildCsmIndex(list) {
  const idx = {}
  for (const m of list) {
    const k = normName(m.name)
    if (!k) continue
    idx[k] = Object.prototype.hasOwnProperty.call(idx, k) ? null : m
  }
  return idx
}
const csmNotice = ref('')

var handleBulkImport = async function (rows) {
  if (!canImport.value) return 0
  var lc = importLifecycle.value === 'prospect' ? 'prospect' : 'client'
  var stage = lc === 'prospect' ? 'new' : null
  var count = 0
  var errors = 0
  // Défensif : membres chargés au boot (auth L14) — recharge si le store est vide
  if (!team.members.length) { try { await team.loadMembers() } catch (e) { /* résolution best-effort */ } }
  var csmIndex = buildCsmIndex(team.assignableMembers)
  var unresolved = {}
  for (var i = 0; i < rows.length; i++) {
    // B-12 : stop si quota clients atteint (défensif — plans actuels : starter sans import, growth+ illimité)
    if (lc === 'client' && clientLimit.value !== null && clients.clientsCount >= clientLimit.value) {
      quotaNotice.value = t('gate_client_limit', { max: clientLimit.value, plan: auth.currentPlanLabel })
      break
    }
    try {
      var row = { ...rows[i], contacts: rowContacts(rows[i]), lifecycle: lc, pipeline_stage: stage }
      var rawCsm = String(rows[i].csm || '').trim()
      if (rawCsm) {
        var member = csmIndex[normName(rawCsm)]
        if (member) { row.csmId = member.id; row.csm = member.name /* nom canonique */ }
        else { unresolved[rawCsm] = (unresolved[rawCsm] || 0) + 1 }
      }
      var result = await clients.addClient(row)
      if (result) count++
      else errors++
    } catch (e) {
      errors++
    }
  }
  var unknownNames = Object.keys(unresolved)
  if (unknownNames.length) {
    var lines = unknownNames.reduce(function (s, n) { return s + unresolved[n] }, 0)
    csmNotice.value = t('port_import_csm_unknown', { count: lines, names: unknownNames.join(', ') })
  }
  if (count > 0) showImport.value = false
  return count
}

function doResetAll() { clients.resetAll(); resetStep.value = 0 }

const initForm = () => ({
  name: '', industry: 'SaaS', arr: 0, mrr: 0, health: 7, nps: 50,
  status: 'healthy', csmId: team.assignableMembers[0]?.id || '', renewalDate: '',
  churnRisk: 5, lifecycle: 'client', pipeline_stage: null, contacts: []
})

const form = reactive(initForm())
const industries = computed(() => t('port_industries').split(','))

const lifecycleTabs = computed(() => [
  { key: 'clients', label: 'port_lifecycle_clients', icon: '💼', count: clients.clientsCount },
  { key: 'prospects', label: 'port_lifecycle_prospects', icon: '🎯', count: clients.prospectsCount },
])

const baseList = computed(() => activeLifecycle.value === 'prospects' ? clients.prospectsOnly : clients.clientsOnly)

const filterList = computed(() => {
  const base = baseList.value
  const cnt = (s) => base.filter(c => clients.getEffectiveStatus(c) === s).length
  return [
    { key: 'all', label: 'port_filter_all', count: base.length },
    { key: 'critical', label: 'port_filter_critical', count: cnt('critical') },
    { key: 'watch', label: 'port_filter_watch', count: cnt('watch') },
    { key: 'healthy', label: 'port_filter_healthy', count: cnt('healthy') },
  ]
})

const filtered = computed(() => {
  let list = baseList.value
  if (activeFilter.value !== 'all') list = list.filter(c => clients.getEffectiveStatus(c) === activeFilter.value)
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(c => c.name.toLowerCase().includes(q) || (c.industry || '').toLowerCase().includes(q) || (c.csm || '').toLowerCase().includes(q))
  }
  return list
})

function switchLifecycle(key) {
  activeLifecycle.value = key
  activeFilter.value = 'all'
}

function openCreate() {
  // B-12 : quota clients (prospects non limités)
  if (activeLifecycle.value !== 'prospects' && atClientLimit.value) {
    quotaNotice.value = t('gate_client_limit', { max: clientLimit.value, plan: auth.currentPlanLabel })
    return
  }
  editId.value = null
  Object.assign(form, initForm())
  if (activeLifecycle.value === 'prospects') { form.lifecycle = 'prospect'; form.pipeline_stage = 'new' }
  slideOpen.value = true
}

function openEdit(c) {
  editId.value = c.id
  Object.assign(form, {
    name: c.name, industry: c.industry, arr: c.arr, mrr: c.mrr, health: c.health,
    nps: c.nps, status: c.status, csmId: c.csmId, renewalDate: c.renewalDate,
    churnRisk: c.churnRisk, lifecycle: c.lifecycle || 'client', pipeline_stage: c.pipeline_stage || null,
    contacts: (Array.isArray(c.contacts) ? c.contacts : []).map(x => ({ name: x.name || '', role: x.role || '', email: x.email || '', phone: x.phone || '', is_primary: !!x.is_primary }))
  })
  slideOpen.value = true
}

function save() {
  const csm = { name: team.memberName(form.csmId) }
  const data = {
    name: form.name, industry: form.industry, arr: form.arr,
    mrr: form.mrr || Math.round(form.arr / 12), health: form.health, nps: form.nps,
    status: form.status, csmId: form.csmId, csm: csm?.name || '',
    renewalDate: form.renewalDate, churnRisk: form.churnRisk,
    logo: form.status === 'healthy' ? '🟢' : form.status === 'watch' ? '🟡' : '🔴',
    lifecycle: form.lifecycle, pipeline_stage: form.pipeline_stage,
    contacts: form.contacts
  }
  if (editId.value) clients.updateClient({ id: editId.value, ...data })
  else clients.addClient(data)
  slideOpen.value = false
}

function doDelete(c) { clients.deleteClient(c.id) }

// FB-02 : clic ligne → fiche client (le crayon garde le slide-over d'édition)
function openDetail(c) { clientModal.open(c.id) }

function exportCsv() {
  const h = [t('port_field_name'), t('port_field_industry'), t('kpi_arr'), t('cd_health'),
    'NPS', t('port_field_status'), t('port_field_agent'), t('port_renewal')]
  const rows = baseList.value.map(c => [c.name, c.industry, c.arr, c.health, c.nps, c.status, c.csm, c.renewalDate])
  const csv = [h.join(','), ...rows.map(r => r.join(','))].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = 'scalyo-portfolio.csv'; a.click()
}
</script>
