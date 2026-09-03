<template>
  <Teleport to="body">
    <Transition name="cm-fade">
      <div v-if="modal.isOpen" class="cm-root" @keydown.esc="modal.close()">
        <div class="cm-overlay" @click="modal.close()" />

        <div v-if="client" class="cm-window" :style="windowStyle" role="dialog" aria-modal="true">
          <!-- Barre de titre = poignée de déplacement -->
          <div class="cm-titlebar" @pointerdown="startDrag">
            <div class="cm-title">
              <span class="cm-avatar" :style="{ background: statusColor }">{{ (form.name || '?')[0] }}</span>
              <span class="cm-name">{{ form.name || t('cd_untitled') }}</span>
              <span class="cm-badge" :class="'st-' + effectiveStatus">{{ statusLabel }}</span>
            </div>
            <button class="cm-close" @click="modal.close()" :title="t('cancel')">✕</button>
          </div>

          <div class="cm-body">
            <!-- ── Infos éditables (tout modifiable, ici, tout de suite) ── -->
            <div class="cm-grid">
              <label class="cm-f cm-f-wide"><span>{{ t('port_field_name') }}</span>
                <input v-model="form.name" class="cm-i" /></label>
              <label class="cm-f"><span>{{ t('port_field_industry') }}</span>
                <!-- FICHE-SECTEUR (29/08) : une valeur stockée hors liste (import, autre langue)
                     ne matchait aucune option → select VIDE alors que la donnée existe.
                     Option dynamique = la valeur s'affiche telle quelle, reclassable. -->
                <select v-model="form.industry" class="cm-i"><option value="">—</option>
                  <option v-if="form.industry && !industries.includes(form.industry)" :value="form.industry">{{ form.industry }}</option>
                  <option v-for="i in industries" :key="i" :value="i">{{ i }}</option></select></label>
              <label class="cm-f"><span>{{ t('port_field_status') }}</span>
                <select v-model="form.status" class="cm-i">
                  <option value="healthy">{{ t('status_healthy') }}</option>
                  <option value="watch">{{ t('status_watch') }}</option>
                  <option value="critical">{{ t('status_critical') }}</option></select></label>
              <label class="cm-f"><span>{{ t('cd_health') }} (0-10)</span>
                <input v-model.number="form.health" type="number" min="0" max="10" class="cm-i" /></label>
              <label class="cm-f"><span>NPS</span>
                <input v-model.number="form.nps" type="number" min="-100" max="100" class="cm-i" /></label>
              <!-- CURRENCY-FORMAT : symbole de la devise du COMPTE (plus de « € » en dur), montant par le formateur unique -->
              <label class="cm-f"><span>{{ t('cd_arr') }} ({{ currencySymbol() }})</span>
                <input v-model.number="form.arr" type="number" min="0" class="cm-i" /></label>
              <label class="cm-f"><span>{{ t('cd_mrr') }} ({{ currencySymbol() }})</span>
                <input v-model.number="form.mrr" type="number" min="0" class="cm-i" /></label>
              <div class="cm-f"><span>{{ t('port_ca_signed') }}</span>
                <div class="cm-i cm-ro">{{ fmtCurrency(signedAmount) }}</div></div>
              <label class="cm-f"><span>{{ t('cd_renewal') }}</span>
                <input v-model="form.renewalDate" type="date" class="cm-i" /></label>
              <label class="cm-f"><span>{{ t('cd_csm') }}</span>
                <select v-model="form.csmId" class="cm-i"><option value="">{{ t('cd_no_csm') }}</option>
                  <option v-for="m in team.assignableMembers" :key="m.id" :value="m.id">{{ m.name }}</option></select></label>
            </div>

            <!-- ── Métriques mensuelles (client_metrics — contrat 22/07) ── -->
            <div class="cm-section">
              <div class="cm-section-head">
                <h3>{{ t('cmet_title') }}</h3>
                <button class="cm-mini" @click="showMetricAdd = !showMetricAdd">＋ {{ t('cmet_add') }}</button>
              </div>
              <div v-if="showMetricAdd" class="cm-metric-form">
                <!-- P10 penser CSM : recherche directe (39 KPIs), suivis en tête, focus valeur après choix -->
                <div class="cm-kpi-combo">
                  <input v-model="kpiSearch" class="cm-i" :placeholder="t('cmet_pick')"
                    @focus="kpiListOpen = true" @input="kpiListOpen = true; metricDraft.kpiId = ''"
                    @keydown.esc="kpiListOpen = false" @blur="closeKpiListSoon" />
                  <div v-if="kpiListOpen" class="cm-kpi-list">
                    <button v-for="k in filteredManualKpis" :key="k.id" class="cm-kpi-opt" @mousedown.prevent="pickKpi(k)">
                      <span v-if="isTracked(k.id)" class="cm-kpi-tracked">●</span>
                      <span class="cm-kpi-opt-label">{{ metricLabel(k.id) }}</span>
                      <span class="cm-kpi-unit">{{ k.unit }}</span>
                    </button>
                    <div v-if="!filteredManualKpis.length" class="cm-muted cm-kpi-none">—</div>
                  </div>
                </div>
                <input v-model="metricDraft.month" type="month" :max="curMonth" class="cm-i" />
                <input ref="valueInput" v-model="metricDraft.value" type="number" step="any" class="cm-i cm-metric-val"
                  :placeholder="t('cmet_value')" @keydown.enter="submitMetric" />
                <button class="btn-primary cm-note-btn" :disabled="!canSaveMetric || savingMetric" @click="submitMetric">
                  {{ savingMetric ? '…' : t('cd_note_add') }}
                </button>
              </div>
              <div v-if="!trackedKpis.length" class="cm-muted">{{ t('cmet_empty') }}</div>
              <div v-for="tk in trackedKpis" :key="tk.kpiId" class="cm-metric">
                <button class="cm-metric-row" @click="toggleMetric(tk.kpiId)">
                  <span class="cm-metric-chev">{{ metricOpen[tk.kpiId] ? '▾' : '▸' }}</span>
                  <span class="cm-metric-label">{{ metricLabel(tk.kpiId) }}</span>
                  <span class="cm-metric-last">{{ fmtKpiValue(tk.last.value, kpiFormat(tk.kpiId)) }}<em> · {{ fmtMonth(tk.last.period) }}</em></span>
                </button>
                <div v-if="metricOpen[tk.kpiId]" class="cm-metric-hist">
                  <div v-for="p in tk.points.slice().reverse()" :key="p.id" class="cm-metric-pt">
                    <span class="cm-metric-month">{{ fmtMonth(p.period) }}</span>
                    <span>{{ fmtKpiValue(p.value, kpiFormat(tk.kpiId)) }}</span>
                    <button class="cm-x" @click="removeMetric(p)" :title="t('cancel')">🗑️</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- ── Interlocuteurs ── -->
            <div class="cm-section">
              <div class="cm-section-head">
                <h3>{{ t('port_contacts_title') }}</h3>
                <button class="cm-mini" @click="addContact">＋ {{ t('port_contact_add') }}</button>
              </div>
              <p v-if="!form.contacts.length" class="cm-muted">{{ t('port_contacts_empty') }}</p>
              <div v-for="(ct, i) in form.contacts" :key="i" class="cm-contact">
                <input v-model="ct.name" :placeholder="t('port_field_contact_name')" class="cm-i" />
                <input v-model="ct.role" :placeholder="t('port_field_contact_role')" class="cm-i" />
                <input v-model="ct.email" :placeholder="t('port_field_contact_email')" class="cm-i" />
                <button class="cm-x" @click="form.contacts.splice(i, 1)" :title="t('cancel')">✕</button>
              </div>
            </div>

            <!-- ── Notes libres (FB-03 v2) — call / email / réunion / note ── -->
            <div class="cm-section">
              <h3>{{ t('cd_notes') }}</h3>
              <div class="cm-note-add">
                <select v-model="noteKind" class="cm-i cm-note-kind">
                  <option value="note">📝 {{ t('cd_kind_note') }}</option>
                  <option value="call">📞 {{ t('cd_kind_call') }}</option>
                  <option value="email">✉️ {{ t('cd_kind_email') }}</option>
                  <option value="meeting">🤝 {{ t('cd_kind_meeting') }}</option>
                </select>
                <textarea v-model="noteDraft" class="cm-i cm-note-text" rows="2"
                  :placeholder="t('cd_note_placeholder')" @keydown.ctrl.enter="submitNote" @keydown.meta.enter="submitNote" />
                <button class="btn-primary cm-note-btn" :disabled="!noteDraft.trim() || savingNote" @click="submitNote">
                  {{ savingNote ? '…' : t('cd_note_add') }}
                </button>
              </div>
              <div v-if="!notes.length" class="cm-muted">{{ t('cd_notes_empty') }}</div>
              <div v-for="n in notes" :key="n.id" class="cm-note">
                <span class="cm-note-icon">{{ kindIcon(n.kind) }}</span>
                <div class="cm-note-main">
                  <div class="cm-note-content">{{ n.content }}</div>
                  <div class="cm-note-meta">{{ n.author_name || '—' }} · {{ fmtDate(n.created_at) }}</div>
                </div>
                <button class="cm-x" @click="removeNote(n.id)" :title="t('cancel')">🗑️</button>
              </div>
            </div>

            <!-- ── Créer & historiser (copil / tâche liés à ce client) ── -->
            <div class="cm-section">
              <h3>{{ t('cd_add_title') }}</h3>
              <div class="cm-add-row">
                <button class="cm-add-btn" :disabled="addingCopil" @click="addCopil">
                  <span class="cm-note-icon">📊</span>{{ addingCopil ? t('cd_opening') : t('cd_add_copil') }}
                </button>
                <button class="cm-add-btn" :class="{ active: showTaskInput }" @click="showTaskInput = !showTaskInput">
                  <span class="cm-note-icon">📝</span>{{ t('cd_add_task') }}
                </button>
                <button class="cm-add-btn" @click="goCreate('/app/quotes')">
                  <span class="cm-note-icon">📄</span>{{ t('cd_add_quote') }}
                </button>
                <button class="cm-add-btn" @click="goCreate('/app/tasks/planning')">
                  <span class="cm-note-icon">📅</span>{{ t('cd_add_event') }}
                </button>
                <button class="cm-add-btn" @click="goCreate('/app/playbooks')">
                  <span class="cm-note-icon">📋</span>{{ t('cd_add_playbook') }}
                </button>
              </div>
              <div v-if="showTaskInput" class="cm-task-add">
                <input v-model="taskDraft" class="cm-i" :placeholder="t('cd_task_placeholder')"
                  @keydown.enter="addQuickTask" />
                <button class="btn-primary cm-note-btn" :disabled="!taskDraft.trim() || savingTask" @click="addQuickTask">
                  {{ savingTask ? '…' : t('cd_note_add') }}
                </button>
              </div>
            </div>

            <!-- ── Historique dérivé (tâches / planning / playbooks / copils) ── -->
            <div class="cm-section">
              <h3>{{ t('cd_timeline') }}</h3>
              <div v-if="!timeline.length" class="cm-muted">{{ t('cd_tl_empty') }}</div>
              <router-link v-for="(e, i) in timeline" :key="i" :to="e.to" class="cm-tl" @click="modal.close()">
                <span class="cm-note-icon">{{ e.icon }}</span>
                <span class="cm-tl-label">{{ e.label }}</span>
                <span class="cm-tl-date">{{ e.date ? fmtDate(e.date) : '—' }}</span>
              </router-link>
            </div>
          </div>

          <div class="cm-footer">
            <span v-if="saved" class="cm-saved">✓ {{ t('cd_saved') }}</span>
            <button class="btn-outline" @click="modal.close()">{{ t('cancel') }}</button>
            <button class="btn-primary" @click="saveClient">{{ t('save') }}</button>
          </div>
        </div>

        <!-- Client introuvable -->
        <div v-else class="cm-window cm-window--sm" :style="windowStyle" role="dialog">
          <div class="cm-titlebar"><span class="cm-name">{{ t('cd_not_found') }}</span>
            <button class="cm-close" @click="modal.close()">✕</button></div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useClientModalStore } from '@/stores/clientModal'
import { useClientNotesStore } from '@/stores/clientNotes'
import { useClientStore } from '@/stores/clients'
import { useTeamStore } from '@/stores/team'
import { useTaskStore } from '@/stores/tasks'
import { useKpiStore } from '@/stores/kpis'
import { usePlaybookStore } from '@/stores/playbooks'
import { useNotificationStore } from '@/stores/notifications'
import { useQuoteStore } from '@/stores/quotes'
import { useCreatePrefillStore } from '@/stores/createPrefill'
import { useClientMetricsStore, currentMonth } from '@/stores/clientMetrics'
import { KPI_CATALOG } from '@/data/kpiCatalog'
import { supabase } from '@/lib/supabase'
import { fmtDate, fmtKpiValue, fmtMonth, fmtCurrency, currencySymbol } from '@/lib/formatters'
import { notifTitle } from '@/lib/notifText'

const { t, locale } = useI18n({ useScope: 'global' })
const router = useRouter()
const modal = useClientModalStore()
const notesStore = useClientNotesStore()
const clients = useClientStore()
const team = useTeamStore()
const notifStore = useNotificationStore()
const quoteStore = useQuoteStore()
const prefill = useCreatePrefillStore()
const tasksStore = useTaskStore()
const kpis = useKpiStore()
const playbooks = usePlaybookStore()

const client = computed(() => clients.clients.find(c => c.id === modal.clientId) || null)
const industries = computed(() => t('port_industries').split(','))
const effectiveStatus = computed(() => client.value ? clients.getEffectiveStatus({ ...client.value, ...form }) : 'healthy')
const statusLabel = computed(() => t('status_' + effectiveStatus.value))
const statusColor = computed(() => effectiveStatus.value === 'healthy' ? '#10b981' : effectiveStatus.value === 'watch' ? '#f59e0b' : '#ef4444')
// CA signée (계약 금액) : somme des devis gagnés du client (lecture seule ; devis chargés à l'ouverture)
const signedAmount = computed(() => client.value ? quoteStore.wonAmountForClient(client.value.id) : 0)

// ── Formulaire éditable (miroir du contrat de save de PortfolioView) ──
const form = reactive({
  name: '', industry: '', status: 'healthy', health: 5, nps: 0, arr: 0, mrr: 0,
  renewalDate: '', csmId: '', churnRisk: 0, lifecycle: 'client', pipeline_stage: null, contacts: []
})
const saved = ref(false)

function hydrate(c) {
  if (!c) return
  Object.assign(form, {
    name: c.name, industry: c.industry || '', status: c.status || 'healthy',
    health: c.health ?? 5, nps: c.nps ?? 0, arr: c.arr ?? 0, mrr: c.mrr ?? 0,
    renewalDate: c.renewalDate || '', csmId: c.csmId || '', churnRisk: c.churnRisk ?? c.churn_risk ?? 0,
    lifecycle: c.lifecycle || 'client', pipeline_stage: c.pipeline_stage || null,
    contacts: (Array.isArray(c.contacts) ? c.contacts : []).map(x => ({
      name: x.name || '', role: x.role || '', email: x.email || '', phone: x.phone || '', is_primary: !!x.is_primary
    }))
  })
  saved.value = false
}
function addContact() {
  const first = form.contacts.length === 0
  form.contacts.push({ name: '', role: '', email: '', phone: '', is_primary: first })
}
function saveClient() {
  const data = {
    name: form.name, industry: form.industry, arr: form.arr,
    mrr: form.mrr || Math.round((form.arr || 0) / 12), health: form.health, nps: form.nps,
    status: form.status, csmId: form.csmId, csm: team.memberName(form.csmId) || '',
    renewalDate: form.renewalDate, churnRisk: form.churnRisk,
    logo: form.status === 'healthy' ? '🟢' : form.status === 'watch' ? '🟡' : '🔴',
    lifecycle: form.lifecycle, pipeline_stage: form.pipeline_stage, contacts: form.contacts
  }
  clients.updateClient({ id: client.value.id, ...data })
  saved.value = true
  setTimeout(() => { saved.value = false }, 2500)
}

// ── Notes ──
const noteDraft = ref('')
const noteKind = ref('note')
const savingNote = ref(false)
const notes = computed(() => notesStore.notesFor(modal.clientId))
function kindIcon(k) { return k === 'call' ? '📞' : k === 'email' ? '✉️' : k === 'meeting' ? '🤝' : '📝' }
async function submitNote() {
  if (!noteDraft.value.trim() || savingNote.value) return
  savingNote.value = true
  const res = await notesStore.addNote(modal.clientId, { content: noteDraft.value, kind: noteKind.value })
  savingNote.value = false
  if (res?.success) { noteDraft.value = ''; noteKind.value = 'note' }
}
async function removeNote(id) { await notesStore.deleteNote(modal.clientId, id) }

// ── Métriques mensuelles (contrat 22/07) : saisie des KPIs manuels du catalogue ──
// Un point / (kpi, mois) — re-saisir le même mois corrige (upsert). Les KPIs 'auto'
// (ARR, MRR, churn…) ne sont JAMAIS proposés ici : ils se calculent des données réelles.
const metricsStore = useClientMetricsStore()
const showMetricAdd = ref(false)
const savingMetric = ref(false)
const metricOpen = reactive({})
const curMonth = currentMonth()
const metricDraft = reactive({ kpiId: '', month: curMonth, value: '' })
const KPI_BY_ID = Object.fromEntries(KPI_CATALOG.map(k => [k.id, k]))
const manualKpis = KPI_CATALOG.filter(k => k.source === 'manual')
const trackedKpis = computed(() => metricsStore.trackedFor(modal.clientId))

// ── Recherche KPI (P10 penser CSM) : filtre direct, suivis de CE client en tête ──
const kpiSearch = ref('')
const kpiListOpen = ref(false)
const valueInput = ref(null)
function normTxt(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') }
const trackedIds = computed(() => new Set(trackedKpis.value.map(x => x.kpiId)))
function isTracked(id) { return trackedIds.value.has(id) }
const filteredManualKpis = computed(() => {
  const q = normTxt(kpiSearch.value)
  let list = manualKpis
  if (q) list = list.filter(k => normTxt(metricLabel(k.id)).includes(q) || k.id.includes(q))
  // le geste récurrent d'abord : les KPIs déjà suivis de ce client en tête
  return [...list].sort((a, b) => (isTracked(b.id) ? 1 : 0) - (isTracked(a.id) ? 1 : 0)).slice(0, 12)
})
function pickKpi(k) {
  metricDraft.kpiId = k.id
  kpiSearch.value = metricLabel(k.id)
  kpiListOpen.value = false
  valueInput.value?.focus()
}
function closeKpiListSoon() { setTimeout(() => { kpiListOpen.value = false }, 150) }
const canSaveMetric = computed(() =>
  metricDraft.kpiId && metricDraft.month && metricDraft.value !== '' && !Number.isNaN(Number(metricDraft.value)))
function kpiFormat(id) { return KPI_BY_ID[id]?.format || 'number' }
function metricLabel(id) {
  const k = KPI_BY_ID[id]
  if (!k) return id
  return locale.value === 'en' ? (k.labelEN || k.label) : locale.value === 'ko' ? (k.labelKO || k.label) : k.label
}
function toggleMetric(id) { metricOpen[id] = !metricOpen[id] }
async function submitMetric() {
  if (!canSaveMetric.value || savingMetric.value || !client.value) return
  savingMetric.value = true
  const kpiId = metricDraft.kpiId
  const res = await metricsStore.upsertMetric({
    clientId: client.value.id, kpiId, month: metricDraft.month, value: metricDraft.value,
  })
  savingMetric.value = false
  if (res?.success) { metricDraft.value = ''; metricOpen[kpiId] = true }
}
async function removeMetric(p) { await metricsStore.deleteMetric(p.id) }

// ── Créer & historiser (copil / tâche liés à ce client) ──
// Un copil créé ici part avec client_id → il remonte dans la timeline (kpis.copils
// filtrés par clientId) ET dans la liste des copils du client. On ouvre ensuite le
// builder pour le remplir. La tâche rapide s'insère (dbToTask) et apparaît aussitôt.
const addingCopil = ref(false)
async function addCopil() {
  if (addingCopil.value || !client.value) return
  addingCopil.value = true
  const name = form.name || client.value.name
  const id = await kpis.createCopil({ clientId: client.value.id, clientName: name, title: t('cd_new_copil_title', { name }) })
  addingCopil.value = false
  if (id) { modal.close(); router.push('/app/kpis/' + id) }
}

const showTaskInput = ref(false)
const taskDraft = ref('')
const savingTask = ref(false)
async function addQuickTask() {
  if (!taskDraft.value.trim() || savingTask.value || !client.value) return
  savingTask.value = true
  const res = await tasksStore.addTask({ title: taskDraft.value.trim(), clientId: client.value.id, status: 'todo' })
  savingTask.value = false
  if (res) { taskDraft.value = ''; showTaskInput.value = false }
}

// Devis / Événement / Playbook : formulaires riches qui vivent dans leur module.
// On pose l'intention (client) dans le store prefill, on ferme la fiche et on
// navigue ; le module consomme au montage → client pré-sélectionné + form ouvert.
// L'objet créé part avec client_id → il remonte ensuite dans cet historique.
function goCreate(path) {
  if (!client.value) return
  prefill.set(client.value.id, form.name || client.value.name)
  modal.close()
  router.push(path)
}

// ── Planning (état local à PlanningView → lecture ciblée) ──
const planningEvents = ref([])
async function loadPlanning(id) {
  planningEvents.value = []
  if (!id) return
  try {
    const { data, error } = await supabase.from('planning_events')
      .select('id,title,start_at').eq('client_id', id).order('start_at', { ascending: false }).limit(50)
    if (error) { console.error('[client-modal] planning load failed:', error.message); return }
    planningEvents.value = data || []
  } catch (e) { console.error('[client-modal] planning load failed:', e.message || e) }
}

// ── Timeline dérivée (contrat R23 D3) ──
const timeline = computed(() => {
  const id = modal.clientId
  const out = []
  for (const tk of tasksStore.tasks.filter(x => x.clientId === id)) {
    out.push({ date: tk.createdAt?.slice(0, 10) || tk.startDate || '', icon: '📝', to: '/app/tasks', label: t('cd_tl_task_created', { title: tk.title }) })
    if (tk.finished || tk.status === 'done') out.push({ date: tk.endDate || tk.dueDate || '', icon: '✅', to: '/app/tasks', label: t('cd_tl_task_done', { title: tk.title }) })
  }
  for (const ev of planningEvents.value) out.push({ date: (ev.start_at || '').slice(0, 10), icon: '📅', to: '/app/tasks/planning', label: t('cd_tl_event', { title: ev.title }) })
  for (const pb of playbooks.playbooks.filter(x => (x.clientId ?? x.client_id) === id)) {
    const name = t('pb_template_' + (pb.templateKey ?? pb.template_key ?? ''))
    const started = pb.startedAt ?? pb.started_at, completed = pb.completedAt ?? pb.completed_at
    if (started) out.push({ date: started.slice(0, 10), icon: pb.icon || '📋', to: '/app/playbooks', label: t('cd_tl_pb_started', { name }) })
    if (completed) out.push({ date: completed.slice(0, 10), icon: '🏁', to: '/app/playbooks', label: t('cd_tl_pb_done', { name }) })
  }
  for (const cp of kpis.copils.filter(x => x.clientId === id)) out.push({ date: (cp.createdAt || '').slice(0, 10), icon: '📊', to: '/app/kpis', label: t('cd_tl_copil', { title: cp.title }) })
  // Devis (base, store quotes) — clientId + status + createdAt
  for (const q of quoteStore.quotesForClient(id)) out.push({ date: (q.createdAt || '').slice(0, 10), icon: '📄', to: '/app/quotes', label: t('cd_tl_quote', { title: q.title || '—', status: t('qt_filter_' + (q.status || 'draft')) }) })
  // Projets liés — dérivés des tâches du client (pas de client_id direct sur projects)
  const projByClient = {}
  for (const tk of tasksStore.tasks.filter(x => x.clientId === id && x.projectId)) {
    const d = tk.createdAt?.slice(0, 10) || ''
    if (!projByClient[tk.projectId] || d > projByClient[tk.projectId]) projByClient[tk.projectId] = d
  }
  for (const [pid, d] of Object.entries(projByClient)) {
    const proj = tasksStore.projects.find(p => p.id === pid)
    if (proj) out.push({ date: d, icon: '📁', to: '/app/tasks', label: t('cd_tl_project', { name: proj.name || proj.title }) })
  }
  // Situations / tickets = alertes notifiées sur ce client (churn, renouvellement, erreurs…)
  for (const n of notifStore.notifications.filter(x => x.target_id === id)) out.push({ date: (n.created_at || '').slice(0, 10), icon: '🔔', to: '/app/dashboard', label: t('cd_tl_alert', { title: notifTitle(n, t) }) })
  return out.filter(e => e.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 80)
})

// Devis chargés une fois à l'ouverture (store en base)
function loadQuotesForClient() { if (!quoteStore.quotes.length) quoteStore.loadQuotes() }

// ── Déplacement de la fenêtre (poignée = barre de titre) ──
const pos = reactive({ x: 0, y: 0 })
const windowStyle = computed(() => ({ transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }))
let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0
function startDrag(e) {
  if (e.target.closest('.cm-close')) return
  dragging = true; sx = e.clientX; sy = e.clientY; ox = pos.x; oy = pos.y
  window.addEventListener('pointermove', onDrag)
  window.addEventListener('pointerup', endDrag)
}
function onDrag(e) { if (dragging) { pos.x = ox + (e.clientX - sx); pos.y = oy + (e.clientY - sy) } }
function endDrag() { dragging = false; window.removeEventListener('pointermove', onDrag); window.removeEventListener('pointerup', endDrag) }

// À chaque ouverture OU changement de client (ouvrir B alors que A est affiché) :
// recentrer, ré-hydrater le formulaire, recharger notes + planning. On surveille
// isOpen ET clientId — sinon le form garderait les valeurs de A (risque d'écrire A sur B).
watch(() => [modal.isOpen, modal.clientId], ([open]) => {
  document.body.style.overflow = open ? 'hidden' : ''
  if (open && modal.clientId) {
    pos.x = 0; pos.y = 0
    showTaskInput.value = false; taskDraft.value = ''
    hydrate(client.value)
    notesStore.loadNotes(modal.clientId)
    loadPlanning(modal.clientId)
    loadQuotesForClient()
    metricsStore.loadAll()
    showMetricAdd.value = false
    metricDraft.kpiId = ''; metricDraft.month = currentMonth(); metricDraft.value = ''
    kpiSearch.value = ''; kpiListOpen.value = false
  }
})
</script>

<style scoped>
.cm-root { position: fixed; inset: 0; z-index: 10050; }
.cm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35); }
.cm-window { position: fixed; top: 50%; left: 50%; width: min(760px, 94vw); max-height: 88vh;
  background: var(--card-bg, var(--bg-card)); border: 1px solid var(--border); border-radius: 16px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.28); display: flex; flex-direction: column; overflow: hidden; }
.cm-window--sm { width: 360px; }
.cm-titlebar { display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 14px 18px; border-bottom: 1px solid var(--border); cursor: grab; user-select: none; touch-action: none; background: var(--bg); }
.cm-titlebar:active { cursor: grabbing; }
.cm-title { display: flex; align-items: center; gap: 10px; min-width: 0; }
.cm-avatar { width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; flex-shrink: 0; }
.cm-name { font-weight: 800; font-size: 1.02rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cm-badge { font-size: 0.7rem; font-weight: 700; padding: 2px 9px; border-radius: 99px; flex-shrink: 0; }
.st-healthy { background: rgba(16,185,129,.14); color: #10b981; }
.st-watch { background: rgba(245,158,11,.14); color: #f59e0b; }
.st-critical { background: rgba(239,68,68,.14); color: #ef4444; }
.cm-close { width: 30px; height: 30px; border: none; border-radius: 8px; background: var(--bg-hover); color: var(--text-secondary); cursor: pointer; flex-shrink: 0; }
.cm-close:hover { background: var(--border); }
.cm-body { flex: 1 1 auto; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 22px; }
.cm-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.cm-ro { display: flex; align-items: center; color: var(--text-muted, #64748b); background: var(--bg, #f8fafc); font-variant-numeric: tabular-nums; }
.cm-f { display: flex; flex-direction: column; gap: 5px; font-size: 0.78rem; color: var(--text-secondary); }
.cm-f-wide { grid-column: 1 / -1; }
.cm-i { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--text); font-size: 0.9rem; width: 100%; }
.cm-section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.cm-section h3 { font-size: 0.9rem; font-weight: 700; margin: 0 0 10px; }
.cm-mini, .cm-note-btn { border: none; border-radius: 8px; padding: 6px 12px; font-size: 0.8rem; cursor: pointer; }
.cm-mini { background: var(--bg-hover); color: var(--text); }
.cm-contact { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 8px; margin-bottom: 8px; }
.cm-x { border: none; background: transparent; cursor: pointer; font-size: 0.9rem; }
.cm-note-add { display: grid; grid-template-columns: 130px 1fr auto; gap: 8px; align-items: start; margin-bottom: 14px; }
.cm-note-text { resize: vertical; font-family: inherit; }
.cm-note-btn { align-self: stretch; }
.cm-note { display: flex; gap: 10px; padding: 10px 0; border-top: 1px solid var(--border); }
.cm-note-icon { flex-shrink: 0; }
.cm-note-main { flex: 1; min-width: 0; }
.cm-note-content { font-size: 0.88rem; white-space: pre-wrap; }
.cm-note-meta { font-size: 0.74rem; color: var(--text-muted); margin-top: 3px; }
.cm-tl { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--border); text-decoration: none; color: var(--text); }
.cm-tl:hover { background: var(--bg-hover); }
.cm-tl-label { flex: 1; font-size: 0.86rem; min-width: 0; }
.cm-tl-date { font-size: 0.76rem; color: var(--text-muted); flex-shrink: 0; }
.cm-muted { font-size: 0.85rem; color: var(--text-muted); }
.cm-footer { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 14px 18px; border-top: 1px solid var(--border); background: var(--bg); }
.cm-saved { margin-right: auto; color: #10b981; font-size: 0.82rem; font-weight: 700; }
.cm-fade-enter-active, .cm-fade-leave-active { transition: opacity .2s ease; }
.cm-fade-enter-from, .cm-fade-leave-to { opacity: 0; }
.cm-add-row { display: flex; gap: 8px; flex-wrap: wrap; }
.cm-add-btn { display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--border);
  border-radius: 9px; padding: 8px 13px; background: var(--bg); color: var(--text);
  font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: background .15s, border-color .15s; }
.cm-add-btn:hover:not(:disabled) { background: var(--bg-hover); border-color: var(--primary); }
.cm-add-btn.active { border-color: var(--primary); background: var(--bg-hover); }
.cm-add-btn:disabled { opacity: .6; cursor: default; }
.cm-task-add { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin-top: 10px; }
/* ── Métriques mensuelles (lot client_metrics 22/07) ── */
.cm-metric-form { display: grid; grid-template-columns: 1fr auto 110px auto; gap: 6px; margin-bottom: 10px; }
.cm-kpi-combo { position: relative; }
.cm-kpi-list { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 30; background: var(--card-bg, var(--bg-card)); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 12px 32px rgba(0,0,0,0.14); max-height: 260px; overflow-y: auto; padding: 4px; }
.cm-kpi-opt { display: flex; align-items: center; gap: 7px; width: 100%; text-align: left; background: none; border: none; padding: 7px 9px; border-radius: 6px; font-size: 0.84rem; color: var(--text); cursor: pointer; }
.cm-kpi-opt:hover { background: var(--bg-hover); }
.cm-kpi-opt-label { flex: 1; min-width: 0; }
.cm-kpi-tracked { color: var(--purple, #7c3aed); font-size: 0.6rem; }
.cm-kpi-unit { font-size: 0.68rem; color: var(--text-muted); }
.cm-kpi-none { padding: 8px; text-align: center; }
.cm-metric { border-top: 1px solid var(--border); }
.cm-metric-row { display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: none; padding: 8px 2px; cursor: pointer; font-size: 0.86rem; color: var(--text); }
.cm-metric-chev { font-size: 0.65rem; color: var(--text-muted); width: 12px; flex-shrink: 0; }
.cm-metric-label { flex: 1; text-align: left; font-weight: 500; min-width: 0; }
.cm-metric-last { font-weight: 700; font-variant-numeric: tabular-nums; flex-shrink: 0; }
.cm-metric-last em { font-style: normal; font-weight: 400; color: var(--text-muted); font-size: 0.75rem; }
.cm-metric-hist { padding: 0 0 8px 20px; display: flex; flex-direction: column; gap: 2px; }
.cm-metric-pt { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; padding: 2px 0; }
.cm-metric-month { color: var(--text-muted); min-width: 90px; }
@media (max-width: 640px) {
  .cm-note-add { grid-template-columns: 1fr; }
  .cm-contact { grid-template-columns: 1fr 1fr; }
}
</style>
